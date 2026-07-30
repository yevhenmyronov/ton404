// Backend self-check: node worker/test.mjs
// The limits are all that stands between the hole and inflation, so they stay
// tested even when nobody touches the rest of the code.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { BlackHole } from './src/index.js';

// platform class; only needed so the constructor doesn't crash
globalThis.WebSocketRequestResponsePair = class {
  constructor(request, response) { this.request = request; this.response = response; }
};

// thinnest possible DurableObjectState stand-in: storage in a Map, no sockets
const fakeState = () => {
  const store = new Map();
  return {
    storage: {
      get: async k => store.get(k),
      put: async (k, v) => void store.set(k, structuredClone(v)),
    },
    // a real DO holds requests while the constructor loads state; here it's
    // just a promise the test awaits instead of the platform
    blockConcurrencyWhile(fn) { this._ready = fn(); },
    getWebSockets: () => [],
    setWebSocketAutoResponse(pair) { this._auto = pair; },
    _store: store,
  };
};

const hole = async () => {
  const st = fakeState();
  const h = new BlackHole(st, { ADMIN_TOKEN: 'secret' });
  await st._ready;
  return h;
};

// raw request without feed()'s conveniences — used to test the header checks
const raw = (h, init) => h.fetch(new Request('https://x/feed', {
  method: 'POST', headers: { 'cf-connecting-ip': '9.9.9.9', ...init.headers }, body: init.body,
}));

// content-length is set by hand: node doesn't add it, but browser fetch with
// a string body always does. The stand-in must behave like a browser.
const feed = (h, body, ip = '1.2.3.4', headers = {}) => {
  const payload = JSON.stringify(body);
  return h.fetch(new Request('https://x/feed', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'content-length': String(payload.length),
      'cf-connecting-ip': ip, ...headers,
    },
    body: payload,
  }));
};

const GB = 1024 ** 3;
let h = await hole();

// ── basic throw ───────────────────────────────────────────────────────────
let r = await feed(h, { bytes: GB, ext: 'PNG', sig: 1 });
assert.equal(r.status, 200);
assert.equal((await r.json()).bytes, GB, 'bytes were counted');
assert.equal(h.d.log[0].e, 'png', 'extension lowercased');

// ── extension sanitizing: filenames must have no way to leak through ───────
await new Promise(r => setTimeout(r, 200));   // slightly longer than COOLDOWN
await feed(h, { bytes: 1, ext: '../../Wéird Nâme.pdf', sig: 2 });
assert.match(h.d.log[0].e, /^[a-z0-9]{1,8}$/, 'extension sanitized: ' + h.d.log[0].e);

// ── cooldown is charged on every request, not just successful ones ─────────
// otherwise garbage can hammer freely: checks fail but no slot is spent
{
  const h2 = await hole();
  await feed(h2, { bytes: -1, ext: 'a', sig: 1 }, '3.3.3.3');
  assert.equal((await feed(h2, { bytes: 1, ext: 'a', sig: 2 }, '3.3.3.3')).status, 429,
    'a rejected request still spends the cooldown');
}

// ── cooldown ──────────────────────────────────────────────────────────────
assert.equal((await feed(h, { bytes: 1, ext: 'a', sig: 3 })).status, 429, 'cooldown holds');

// ── dedup by signature ────────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 200));   // slightly longer than COOLDOWN
assert.equal((await feed(h, { bytes: GB, ext: 'png', sig: 1 })).status, 409, 'same file twice');

// ── regression: cooldown must admit the client-side pace ──────────────────
// swallow() sends throws every 160 ms. The moment the cooldown outgrows that
// pause, multi-file drags half-bounce with 429 and the page rolls back mass
// it already showed. Only eyes would catch that, so a test does instead.
h = await hole();
for (const sig of [41, 42, 43]) {
  assert.equal((await feed(h, { bytes: 1, ext: 'a', sig })).status, 200,
    `throw ${sig} at the 160 ms client pace must pass`);
  await new Promise(r => setTimeout(r, 160));
}

// ── size bounds ───────────────────────────────────────────────────────────
// distinct addresses on purpose: the cooldown is now charged on every request
// that reaches the cooldown check, not just successful ones
h = await hole();
assert.equal((await feed(h, { bytes: 1e12, ext: 'a', sig: 9 }, '1.0.0.1')).status, 400, 'over MAX_FEED');
assert.equal((await feed(h, { bytes: -5,   ext: 'a', sig: 9 }, '1.0.0.2')).status, 400, 'negative size');
assert.equal((await feed(h, { bytes: 'NaN', ext: 'a', sig: 9 }, '1.0.0.3')).status, 400, 'not a number');
assert.equal(
  (await feed(h, { bytes: 1, ext: 'a', sig: 9 }, '1.1.1.1', { 'content-length': '99999' })).status,
  413, 'a bloated body never reaches JSON.parse');

// ── limits are counted per /64, not per full address: clients get a whole
//    subnet, so the limit would otherwise be dodged by rotating the last block ──
h = await hole();
const v6 = n => `2001:db8:1:2:ffff:ffff:ffff:${n}`;
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 11 }, v6(1))).status, 200);
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 12 }, v6(2))).status, 429,
  'a neighbor in the same subnet shares the limit');
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 13 }, '2001:db8:9:9::1')).status, 200,
  'a different subnet has its own limit');

// ── cross-origin feeding ──────────────────────────────────────────────────
// Missing CORS headers don't stop a foreign site from SENDING a request —
// they only block reading the response. A text/plain POST is a "simple"
// request and flies without preflight. Requiring application/json makes it
// non-simple (impossible cross-origin), and the Origin check also catches
// <form enctype="text/plain">.
h = await hole();
const payload = JSON.stringify({ bytes: 1e9, ext: 'a', sig: 77 });
assert.equal((await raw(h, {
  headers: { 'content-type': 'text/plain;charset=UTF-8', 'content-length': String(payload.length) },
  body: payload,
})).status, 415, 'text/plain is refused — otherwise preflight is bypassed');
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json', 'content-length': String(payload.length),
             origin: 'https://evil.example' },
  body: payload,
})).status, 403, 'foreign Origin is refused');
assert.equal(h.d.count, 0, 'no cross-origin request was counted');
// own origin passes
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json', 'content-length': String(payload.length),
             origin: 'https://x' },
  body: payload,
})).status, 200, 'own origin works');

// ── body without content-length ───────────────────────────────────────────
// Number(null) === 0, so omitting the header used to let req.json() parse a
// body of any size, burning the one thread the whole world shares
h = await hole();
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json' }, body: payload,
})).status, 413, 'a request without content-length is refused');

// ── ping auto-response ────────────────────────────────────────────────────
// Without it, NATs cut the socket on a quiet hole and the client never knows.
// Clients can't ping on their own: webSocketMessage closes the connection.
{
  const st = fakeState();
  const h2 = new BlackHole(st, {});
  await st._ready;
  assert.equal(st._auto.request, 'ping', 'auto-response expects ping');
  assert.equal(st._auto.response, 'pong', 'and answers pong');
  void h2;
}

// ── limits never reach the blob: the 128 KB value limit would burst one day ──
h = await hole();
await feed(h, { bytes: 1, ext: 'a', sig: 21 });
await h.save();
assert.equal(h.state._store.get('d').ips, undefined, 'no address counters on disk');

// ── batch in one request ──────────────────────────────────────────────────
// A dropped folder is one action. One-by-one didn't work: the 150 ms cooldown
// caps at ~6.6 files/s, and most of a 98-file folder bounced with 429.
h = await hole();
{
  const items = Array.from({ length: 98 }, (_, i) => ({ bytes: 1000 + i, ext: 'jpg', sig: 1000 + i }));
  const r1 = await feed(h, { items });
  assert.equal(r1.status, 200);
  const d1 = await r1.json();
  assert.equal(d1.count, 98, 'all 98 accepted in one request');
  assert.equal(d1.rejected.length, 0, 'no rejections');

  // replaying the same batch — dedup must bounce each item by name,
  // not the batch as a whole
  await new Promise(r => setTimeout(r, 200));
  const d2 = await (await feed(h, { items })).json();
  assert.equal(d2.count, 98, 'no duplicate was counted');
  assert.equal(d2.rejected.length, 98, 'all 98 returned as rejected');
  assert.equal(d2.rejected[0].error, 'already swallowed');
  assert.equal(d2.rejected[0].sig, 1000, 'rejections carry sig so the client rolls back exactly them');

  // partial rejection: one bad item doesn't sink the rest
  await new Promise(r => setTimeout(r, 200));
  const d3 = await (await feed(h, { items: [
    { bytes: 5000, ext: 'a', sig: 7001 },
    { bytes: -1,   ext: 'a', sig: 7002 },
    { bytes: 6000, ext: 'a', sig: 7003 },
  ] })).json();
  assert.equal(d3.count, 100, 'the two good items passed');
  assert.equal(d3.rejected.length, 1, 'exactly the bad one bounced');
  assert.equal(d3.rejected[0].sig, 7002);
}

// ── the old single-item format is still accepted ──────────────────────────
// open tabs may still run the previous client
h = await hole();
assert.equal((await feed(h, { bytes: 1234, ext: 'png', sig: 81 })).status, 200);
assert.equal(h.d.count, 1, 'single throw counted');

// ── batch ceiling ─────────────────────────────────────────────────────────
h = await hole();
assert.equal((await feed(h, { items: [] })).status, 400, 'empty batch refused');
assert.equal((await feed(h, {
  items: Array.from({ length: 201 }, (_, i) => ({ bytes: 1, ext: 'a', sig: i })),
})).status, 400, 'batch over the ceiling refused');

// ── counter eviction by last access, not insertion ────────────────────────
// It was FIFO: whoever hit the daily cap could reset their own counter with
// one sweep from MAX_IPS addresses — their entry evicted first.
h = await hole();
await feed(h, { bytes: 1, ext: 'a', sig: 61 }, '10.0.0.1');
await feed(h, { bytes: 1, ext: 'a', sig: 62 }, '10.0.0.2');
await new Promise(r => setTimeout(r, 200));
await feed(h, { bytes: 1, ext: 'a', sig: 63 }, '10.0.0.1');
assert.equal([...h.ips.keys()].pop(), '10.0.0.1',
  'a repeat visit moves the entry to the back of the eviction queue');

// ── daily record uses the full log, not the last 20 ───────────────────────
h = await hole();
await feed(h, { bytes: 5e6, ext: 'a', sig: 51 });
h.d.log.push({ t: Date.now() - 3600e3, b: 9e8, e: 'iso', s: 52 });   // an hour ago, biggest
h.d.log.push({ t: Date.now() - 48 * 864e5, b: 9e9, e: 'old', s: 53 }); // two days ago, outside the day
{
  const snap = h.snapshot();
  assert.equal(snap.record.bytes, 9e8, 'record is the biggest of the day, not all-time');
  assert.equal(snap.record.ext, 'iso');
}

// ── dissipation ───────────────────────────────────────────────────────────
// Mass is linear in bytes now, so -0.5% of mass is -0.5% of bytes, applied
// once. It used to be squared (bytes ∝ mass² under the old entropy law) and
// nothing here tested it, so the change would have gone through unnoticed.
{
  h = await hole();
  h.d.bytes = 1e12;
  h.d.t = Date.now() - 10 * 864e5;
  h.decay();
  assert.ok(Math.abs(h.d.bytes / (1e12 * 0.995 ** 10) - 1) < 1e-9,
    '0.5% of bytes per day, compounded once', h.d.bytes);
  // A steady inflow settles at F/(1-rate): the ceiling the season target must
  // sit under. At 0.5% that is 200x the daily inflow.
  const ceiling = 11.1 * 1024 ** 4 / 0.005;
  assert.ok(ceiling > 1.77 * 1024 ** 5, 'the ceiling must clear the season target');

  // A quiet hole must not drift: under the threshold decay is a no-op.
  h.d.bytes = 1e12;
  h.d.t = Date.now();
  h.decay();
  assert.equal(h.d.bytes, 1e12, 'no decay applied for a near-zero interval');
}

// ── rollback ──────────────────────────────────────────────────────────────
h = await hole();
await feed(h, { bytes: GB, ext: 'a', sig: 31 });
h.d.log.push({ t: Date.now() - 48 * 864e5, b: 5 * GB, e: 'old', s: 32 });   // event from two days ago
h.d.bytes += 5 * GB;
h.d.count++;

const roll = (token) => h.fetch(new Request('https://x/rollback?hours=24', {
  method: 'POST', headers: token ? { 'x-admin-token': token } : {},
}));
assert.equal((await roll()).status, 403, 'rollback is closed without a token');
assert.equal((await roll('wrong')).status, 403, 'a wrong token does not work');

// A curl typo must not cost the whole log: Number('abc') gave NaN, and
// filter(x => x.t < NaN) an empty array. Mass stayed, the log vanished.
{
  const bad = await h.fetch(new Request('https://x/rollback?hours=abc', {
    method: 'POST', headers: { 'x-admin-token': 'secret' },
  }));
  assert.equal(bad.status, 400, 'non-numeric hours refused');
  assert.equal(h.d.log.length, 2, 'log intact after the refused rollback');
}
const out = await (await roll('secret')).json();
assert.equal(out.removed, 1, 'exactly the fresh event removed');
assert.equal(out.bytes, 5 * GB, 'the two-day-old mass stays');

// ── an idle empty hole must not bill the first throw for its quiet ────────
// The clock used to stand still while bytes were 0, so idle time accumulated
// unspent. decay() runs at the top of fetch(), before the bytes land, so the
// whole backlog hit the request AFTER the first throw: a year of quiet turned
// 1 TB into 160 GB. Any /rollback down to zero re-armed it.
{
  h = await hole();
  h.d.bytes = 0;
  h.d.t = Date.now() - 365 * 864e5;          // empty and untouched for a year
  await feed(h, { bytes: 1e11, ext: 'iso', sig: 71 }, '7.7.7.7');
  await new Promise(r => setTimeout(r, 200));
  await feed(h, { bytes: 1, ext: 'a', sig: 72 }, '7.7.7.7');
  assert.ok(h.d.bytes > 0.99e11,
    'a year of empty quiet must not eat the first throw', h.d.bytes);
}

// ── the daily cap per address ─────────────────────────────────────────────
// Never had a test. The cooldown case above looks like it covers this, but both
// its requests land in the same counter through a different branch. A batch is
// the only way to cross the cap in one request: items share one cooldown and
// each is judged on its own, so the ones past the ceiling come back rejected
// while the earlier ones are still swallowed.
{
  h = await hole();
  const per = 1e11;                                   // MAX_FEED, 100 GB a throw
  const n = 6;                                        // 600 GB > the 500 GB cap
  const r = await feed(h, {
    items: Array.from({ length: n }, (_, i) => ({ bytes: per, ext: 'iso', sig: 200 + i })),
  }, '8.8.8.8');
  const body = await r.json();
  assert.equal(body.rejected.length, 1, 'exactly the throw past the cap is refused');
  assert.equal(body.rejected[0].error, 'daily cap');
  assert.equal(h.d.bytes, 5 * per, 'everything up to the cap was still swallowed');
}

// ── the two copies of DECAY must not drift ────────────────────────────────
// The rate is written twice by hand — here and in the client — and nothing
// compared them, so one side could be retuned alone and the page would quietly
// disagree with the server about how fast mass leaves.
// Both sides are read from source rather than imported: the worker must NOT
// export the constant. Workers treats every named export of the entrypoint as a
// service binding and rejects anything that is not a function or handler, so
// `export const DECAY` takes the whole site down at startup.
{
  const rate = (path, what) => {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8');
    const m = src.match(/^(?:export )?const DECAY *= *([\d.]+);/m);
    assert.ok(m, `${what} DECAY not found — did the declaration move?`);
    assert.ok(!/^export const DECAY/m.test(src) || what !== 'worker',
      'the worker must not export DECAY — Workers refuses a non-function export');
    return Number(m[1]);
  };
  assert.equal(rate('../public/index.html', 'client'), rate('./src/index.js', 'worker'),
    'client and worker DECAY must match');
}

// ── unknown paths never wake the Durable Object ───────────────────────────
const worker = (await import('./src/index.js')).default;
let woke = false;
const env = { HOLE: { idFromName: () => 0, get: () => ({ fetch: () => (woke = true, new Response()) }) } };
assert.equal((await worker.fetch(new Request('https://x/favicon.ico'), env)).status, 404);
assert.equal(woke, false, '/favicon.ico never reached the object');
await worker.fetch(new Request('https://x/state'), env);
assert.equal(woke, true, '/state did');

console.log('✓ backend checks passed');
