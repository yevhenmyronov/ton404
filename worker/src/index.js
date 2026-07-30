// One black hole for the whole world = one Durable Object.
// Files never reach this code: only size, extension, and a dedup signature.

const DAY = 864e5;
// Anything can be thrown: the browser only reads file.size, so size costs nothing.
// The real anti-inflation boundary is the daily cap, which stays fixed.
const MAX_FEED   = 1e11;   // 100 GB per throw
const MAX_IP_DAY = 5e11;   // 500 GB per day per /64
// Must stay below the client-side pause between throws in swallow(), or
// multi-file drags bounce off with 429s and the page rolls back mass it
// already showed. The real limit is the daily cap, not this.
const COOLDOWN   = 150;    // ms between throws from one address
const LOG_KEEP   = 1000;
const DEDUP      = 300;    // how many recent events to scan for duplicates
const MAX_ITEMS  = 200;    // batch ceiling per request
const MAX_BODY   = 16384;  // ~80 B per item × MAX_ITEMS plus headroom
const MAX_IPS    = 20000;  // in-memory counter ceiling

// No CORS on purpose: page and API share one origin, and a wildcard would let
// any site feed the hole through its visitors' browsers.
// no-store is required: without it the Cloudflare edge caches /state.
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// ponytail: all state is one blob under key 'd'. DO value limit is 128 KB, so
// the log is capped at 1000 events — rollback only reaches that far back.
// Need deeper? Move the log to state.storage.sql; nothing else changes.

export class BlackHole {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Rate-limit counters live in memory ONLY. In the blob they would grow
    // with every new address and eventually exceed the 128 KB value limit —
    // breaking all state writes forever. Losing them on restart is harmless:
    // a reset cooldown costs nothing, and under a real attack the object
    // never goes to sleep anyway.
    this.ips = new Map();
    this.tCast = null;
    // Broadcasts happen only on events, so on a quiet hole a socket can sit
    // silent for hours — and NATs/mobile proxies kill idle TCP in 30-120 s.
    // The client never learns (no close arrives) and silently shows stale
    // mass. Clients can't ping on their own: webSocketMessage closes on any
    // inbound. The auto-response is handled by the platform BEFORE it, without
    // waking the object, so "server speaks first" still holds for everything else.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    state.blockConcurrencyWhile(async () => {
      this.d = (await state.storage.get('d')) || { bytes: 0, count: 0, t: Date.now(), log: [] };
      delete this.d.ips;                      // legacy of the old format
    });
  }

  // Hawking evaporation: -1% mass per day. mass ∝ √bytes ⇒ bytes ∝ mass²
  decay() {
    const now = Date.now();
    if (!this.d.t) { this.d.t = now; return; }
    const days = (now - this.d.t) / DAY;
    // The clock must advance even on an empty hole. With `bytes > 0` guarding
    // the whole block, idle time on a zeroed hole piled up unspent — and since
    // decay() runs at the top of fetch(), BEFORE the bytes land, the very next
    // request billed the first throw for that whole idle stretch. A year of
    // quiet ate 84% of it. Same hazard after any /rollback down to zero.
    if (days > 0.01) {
      if (this.d.bytes > 0) this.d.bytes *= Math.pow(0.99, days) ** 2;
      this.d.t = now;
    }
  }

  snapshot() {
    // The daily record is computed here because only this side has the full
    // log. The client sees 20 recent events — minutes of traffic, not a day —
    // so a client-side "record of the day" would simply lie.
    const dayAgo = Date.now() - DAY;
    const top = this.d.log.reduce((a, x) => x.t > dayAgo && x.b > (a ? a.b : 0) ? x : a, null);
    return {
      bytes: this.d.bytes,
      count: this.d.count,
      watching: this.state.getWebSockets().length,
      v: this.env.CF_VERSION ? this.env.CF_VERSION.id : null,
      record: top ? { ext: top.e, bytes: top.b } : null,
      recent: this.d.log.slice(0, 20).map(x => ({ ext: x.e, bytes: x.b, ts: x.t })),
    };
  }

  // ponytail: broadcast tick grows with the audience. At 2000 viewers a 1 s
  // tick means 2000 sends/s from one single-threaded object — it can't.
  // Ceiling 5 s: slower is already visible to the eye.
  broadcast() {
    if (this.tCast) return;
    const n = this.state.getWebSockets().length;
    this.tCast = setTimeout(() => {
      this.tCast = null;
      const msg = JSON.stringify(this.snapshot());
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(msg); } catch { try { ws.close(1011); } catch {} }
      }
    }, Math.min(5000, 1000 + n * 2));
  }

  // Saving happens inside the request, not on a deferred timer. With the
  // Hibernation API the object can be evicted at any moment — a post-response
  // timer just never fires and the event vanishes. The platform coalesces
  // same-tick writes anyway, so there was nothing to save by batching.
  async save() {
    this.d.log = this.d.log.slice(0, LOG_KEEP);
    await this.state.storage.put('d', this.d);
  }

  // ── Hibernation API: sockets survive the object being evicted from memory ──
  // With plain accept() the DO stays alive while any socket is open — i.e.
  // forever, the moment the project takes off.
  webSocketMessage(ws) {
    // The protocol is one-way. An inbound message wakes a sleeping object —
    // that's exactly how you'd attack it, so such a client is dropped at once.
    ws.close(1003, 'server speaks first');
  }
  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch {}
    this.broadcast();                        // others see the audience shrink
  }
  webSocketError() {
    this.broadcast();
  }

  async fetch(req) {
    const url = new URL(req.url);
    this.decay();

    if (url.pathname === '/ws') {
      if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify(this.snapshot()));
      this.broadcast();                       // others see the audience grow
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/state') return json(this.snapshot());

    if (url.pathname === '/feed' && req.method === 'POST') {
      // Absent CORS headers do NOT stop a foreign site from SENDING a request —
      // they only block reading the response. A text/plain POST is a "simple"
      // request: no preflight, side effect executes. Requiring application/json
      // makes the request non-simple (preflight fires and fails without CORS),
      // and also kills <form enctype="text/plain">, which never preflights.
      if (!(req.headers.get('content-type') || '').includes('application/json'))
        return json({ error: 'bad content type' }, 415);
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) return json({ error: 'nope' }, 403);

      // The header must be present: Number(null) is 0, which passed bodies of
      // any size — omit content-length and req.json() would parse 100 MB of
      // garbage, burning the one thread the whole world shares.
      const cl = req.headers.get('content-length');
      if (!cl || Number(cl) > MAX_BODY) return json({ error: 'too big' }, 413);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: 'bad body' }, 400);

      // A dropped folder is one action, not a hundred. The client used to push
      // files one by one, and the 150 ms cooldown capped that at ~6.6 files/s:
      // most of a 98-file folder bounced with 429 while the page looked like
      // everything was swallowed. A batch arrives as one request under one
      // cooldown. The old single-item format is still accepted — open tabs may
      // run the previous client.
      const single = !Array.isArray(body.items);
      const items = single ? [body] : body.items;
      if (!items.length || items.length > MAX_ITEMS)
        return json({ error: 'bad batch' }, 400);

      const ip = req.headers.get('cf-connecting-ip') || '0';
      const key = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;   // IPv6 → /64
      const now = Date.now();
      let q = this.ips.get(key);
      if (q) {
        // Re-insertion turns the Map into an LRU instead of FIFO. With FIFO,
        // whoever hit the daily cap could reset their own counter with one
        // sweep from MAX_IPS addresses — their entry evicted first. Now the
        // inactive get evicted instead.
        this.ips.delete(key);
        this.ips.set(key, q);
      } else {
        if (this.ips.size >= MAX_IPS) this.ips.delete(this.ips.keys().next().value);
        this.ips.set(key, q = { t: 0, day: now, sum: 0 });
      }

      if (now - q.t < COOLDOWN) return json({ error: 'cooldown' }, 429);
      if (now - q.day > DAY) { q.day = now; q.sum = 0; }
      q.t = now;

      // Every item is judged on its own; one rejection doesn't sink the rest.
      // The client gets the rejected list with reasons and rolls back exactly
      // those — it used to be all-or-nothing, which read as "it just vanished".
      const rejected = [];
      let taken = 0;
      for (const it of items) {
        const bytes = Math.floor(Number(it && it.bytes));
        const sig = Math.floor(Number(it && it.sig)) || 0;
        if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_FEED) {
          rejected.push({ sig, error: 'bytes out of range' }); continue;
        }
        if (q.sum + bytes > MAX_IP_DAY) { rejected.push({ sig, error: 'daily cap' }); continue; }
        // Dedup both against what's swallowed and inside the batch itself —
        // folders easily contain two copies of the same file.
        if (sig && this.d.log.slice(0, DEDUP).some(x => x.s === sig)) {
          rejected.push({ sig, error: 'already swallowed' }); continue;
        }
        // Filenames are refused on principle — extension only.
        const ext = String(it.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
        q.sum += bytes;
        this.d.bytes += bytes;
        this.d.count++;
        this.d.log.unshift({ t: now, b: bytes, e: ext, s: sig });
        taken++;
      }

      if (taken) { await this.save(); this.broadcast(); }

      // A single throw answers the old way — via status and an error field.
      // Open tabs may still run the previous client, which reads exactly that.
      if (single && rejected.length) {
        const e = rejected[0].error;
        return json({ error: e },
          e === 'already swallowed' ? 409 : e === 'daily cap' ? 429 : 400);
      }
      return json({ ...this.snapshot(), rejected });
    }

    // Inflation can't be defeated here by definition — so this is not a
    // defense, it's a cleanup.
    if (url.pathname === '/rollback' && req.method === 'POST') {
      if (!this.env.ADMIN_TOKEN || req.headers.get('x-admin-token') !== this.env.ADMIN_TOKEN)
        return json({ error: 'nope' }, 403);
      // A curl typo must not cost the whole log. Unchecked, Number('abc') gave
      // NaN and filter(x => x.t < NaN) an empty array: mass stayed put while
      // the log, dedup, and any future rollback vanished without a trace.
      const raw = url.searchParams.get('hours');
      const hours = raw === null ? 24 : Number(raw);
      if (!Number.isFinite(hours) || hours < 0) return json({ error: 'bad hours' }, 400);
      const cutoff = Date.now() - hours * 3600e3;
      const drop = this.d.log.filter(x => x.t >= cutoff);
      this.d.bytes = Math.max(0, this.d.bytes - drop.reduce((a, x) => a + x.b, 0));
      this.d.count = Math.max(0, this.d.count - drop.length);
      this.d.log = this.d.log.filter(x => x.t < cutoff);
      await this.save();
      this.broadcast();
      return json({ removed: drop.length, ...this.snapshot() });
    }

    return json({ error: 'not found' }, 404);
  }
}

const API = new Set(['/ws', '/state', '/feed', '/rollback']);

export default {
  fetch(req, env) {
    // /favicon.ico, /robots.txt, vulnerability scanners and other noise must
    // not wake the world's only object. One extra path = one extra RPC per visitor.
    if (!API.has(new URL(req.url).pathname)) return new Response('not found', { status: 404 });
    return env.HOLE.get(env.HOLE.idFromName('the-hole')).fetch(req);
  },
};
