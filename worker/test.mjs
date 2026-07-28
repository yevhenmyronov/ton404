// Самоперевірка бекенду: node worker/test.mjs
// Ліміти — єдине, що стоїть між дірою і накруткою, тож вони мають лишатись
// перевіреними навіть коли решту коду ніхто не чіпає.
import assert from 'node:assert';
import { BlackHole } from './src/index.js';

// платформенний клас; тут потрібен лише щоб конструктор не впав
globalThis.WebSocketRequestResponsePair = class {
  constructor(request, response) { this.request = request; this.response = response; }
};

// найтонший можливий двійник DurableObjectState: сховище в Map, сокетів немає
const fakeState = () => {
  const store = new Map();
  return {
    storage: {
      get: async k => store.get(k),
      put: async (k, v) => void store.set(k, structuredClone(v)),
    },
    // справжній DO тримає запити, поки конструктор вантажить стан; тут це
    // просто промис, який тест чекає замість платформи
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

// сирий запит без зручностей feed() — саме ним перевіряються заголовки
const raw = (h, init) => h.fetch(new Request('https://x/feed', {
  method: 'POST', headers: { 'cf-connecting-ip': '9.9.9.9', ...init.headers }, body: init.body,
}));

// content-length тут проставляється руками: node його не додає, а браузерний
// fetch зі строковим тілом — завжди. Двійник має поводитись як браузер.
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

// ── базовий кидок ─────────────────────────────────────────────────────────
let r = await feed(h, { bytes: GB, ext: 'PNG', sig: 1 });
assert.equal(r.status, 200);
assert.equal((await r.json()).bytes, GB, 'байти долічилися');
assert.equal(h.d.log[0].e, 'png', 'розширення в нижньому регістрі');

// ── санітизація розширення: імена файлів не мають шансу просочитись ────────
await new Promise(r => setTimeout(r, 200));   // трохи довше за COOLDOWN
await feed(h, { bytes: 1, ext: '../../Якесь Імʼя.pdf', sig: 2 });
assert.match(h.d.log[0].e, /^[a-z0-9]{1,8}$/, 'розширення санітизоване: ' + h.d.log[0].e);

// ── кулдаун списується з кожного запиту, а не лише з успішного ────────────
// інакше сміттям можна молотити без обмежень: перевірки не проходять, а слот
// не витрачається
{
  const h2 = await hole();
  await feed(h2, { bytes: -1, ext: 'a', sig: 1 }, '3.3.3.3');
  assert.equal((await feed(h2, { bytes: 1, ext: 'a', sig: 2 }, '3.3.3.3')).status, 429,
    'відбитий запит теж витрачає кулдаун');
}

// ── кулдаун ───────────────────────────────────────────────────────────────
assert.equal((await feed(h, { bytes: 1, ext: 'a', sig: 3 })).status, 429, 'кулдаун тримає');

// ── дедуп по підпису ──────────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 200));   // трохи довше за COOLDOWN
assert.equal((await feed(h, { bytes: GB, ext: 'png', sig: 1 })).status, 409, 'той самий файл двічі');

// ── регресія: кулдаун мусить пускати клієнтський темп ─────────────────────
// swallow() шле кидки кожні 160 мс. Щойно кулдаун переросте цю паузу,
// перетягування кількох файлів наполовину відіб'ється з 429, а сторінка
// відкотить уже показану масу. Помітно це лише очима, тож хай ловить тест.
h = await hole();
for (const sig of [41, 42, 43]) {
  assert.equal((await feed(h, { bytes: 1, ext: 'a', sig })).status, 200,
    `кидок ${sig} у клієнтському темпі 160 мс має проходити`);
  await new Promise(r => setTimeout(r, 160));
}

// ── межі розміру ──────────────────────────────────────────────────────────
// адреси різні навмисно: кулдаун тепер списується з кожного запиту, що пройшов
// саму перевірку кулдауна, а не лише з успішного — інакше сміттям можна було б
// молотити скільки завгодно
h = await hole();
assert.equal((await feed(h, { bytes: 1e12, ext: 'a', sig: 9 }, '1.0.0.1')).status, 400, 'понад MAX_FEED');
assert.equal((await feed(h, { bytes: -5,   ext: 'a', sig: 9 }, '1.0.0.2')).status, 400, 'відʼємний розмір');
assert.equal((await feed(h, { bytes: 'NaN', ext: 'a', sig: 9 }, '1.0.0.3')).status, 400, 'не число');
assert.equal(
  (await feed(h, { bytes: 1, ext: 'a', sig: 9 }, '1.1.1.1', { 'content-length': '99999' })).status,
  413, 'роздуте тіло не доходить до JSON.parse');

// ── ліміти рахуються по /64, а не по повній адресі: одному клієнту роздають
//    цілу підмережу, тож інакше ліміт обходиться зміною останнього блоку ────
h = await hole();
const v6 = n => `2001:db8:1:2:ffff:ffff:ffff:${n}`;
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 11 }, v6(1))).status, 200);
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 12 }, v6(2))).status, 429,
  'сусідня адреса тієї ж підмережі ділить ліміт');
assert.equal((await feed(h, { bytes: 1e9, ext: 'a', sig: 13 }, '2001:db8:9:9::1')).status, 200,
  'інша підмережа має власний ліміт');

// ── крос-доменне годування ────────────────────────────────────────────────
// Відсутність CORS не заважає чужому сайту НАДІСЛАТИ запит — вона лише не дає
// прочитати відповідь. POST із text/plain це «простий» запит, він летить без
// preflight. Вимога application/json робить його непростим, тобто нездійсненним
// із чужого origin, а перевірка Origin ловить ще й <form enctype="text/plain">.
h = await hole();
const payload = JSON.stringify({ bytes: 1e9, ext: 'a', sig: 77 });
assert.equal((await raw(h, {
  headers: { 'content-type': 'text/plain;charset=UTF-8', 'content-length': String(payload.length) },
  body: payload,
})).status, 415, 'text/plain не приймається — інакше preflight обходиться');
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json', 'content-length': String(payload.length),
             origin: 'https://evil.example' },
  body: payload,
})).status, 403, 'чужий Origin відбивається');
assert.equal(h.d.count, 0, 'жоден крос-доменний запит не долічився');
// свій origin проходить
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json', 'content-length': String(payload.length),
             origin: 'https://x' },
  body: payload,
})).status, 200, 'власний origin працює');

// ── тіло без content-length ───────────────────────────────────────────────
// Number(null) === 0, тож раніше досить було не слати заголовок, і req.json()
// розбирав тіло будь-якого розміру, палячи єдиний на весь світ потік
h = await hole();
assert.equal((await raw(h, {
  headers: { 'content-type': 'application/json' }, body: payload,
})).status, 413, 'без content-length запит не приймається');

// ── автовідповідь на пінг ─────────────────────────────────────────────────
// Без неї сокет на спокійній дірі ріже NAT, а клієнт про це не дізнається.
// Пінгувати самотужки клієнт не може: webSocketMessage закриває зʼєднання.
{
  const st = fakeState();
  const h2 = new BlackHole(st, {});
  await st._ready;
  assert.equal(st._auto.request, 'ping', 'автовідповідь чекає ping');
  assert.equal(st._auto.response, 'pong', 'і відповідає pong');
  void h2;
}

// ── ліміти не потрапляють у блоб: інакше 128 КБ на значення колись луснуть ─
h = await hole();
await feed(h, { bytes: 1, ext: 'a', sig: 21 });
await h.save();
assert.equal(h.state._store.get('d').ips, undefined, 'лічильників адрес немає на диску');

// ── пачка одним запитом ───────────────────────────────────────────────────
// Кинута тека — одна дія. По одному не виходило: кулдаун 150 мс ставить стелю
// ~6.6 файлів на секунду, і на 98 файлах більшість відбивалась 429.
h = await hole();
{
  const items = Array.from({ length: 98 }, (_, i) => ({ bytes: 1000 + i, ext: 'jpg', sig: 1000 + i }));
  const r1 = await feed(h, { items });
  assert.equal(r1.status, 200);
  const d1 = await r1.json();
  assert.equal(d1.count, 98, 'усі 98 прийнято одним запитом');
  assert.equal(d1.rejected.length, 0, 'без відмов');

  // повтор тієї самої пачки — дедуп має відбити кожен елемент поіменно,
  // а не всю пачку цілком
  await new Promise(r => setTimeout(r, 200));
  const d2 = await (await feed(h, { items })).json();
  assert.equal(d2.count, 98, 'жоден дубль не долічився');
  assert.equal(d2.rejected.length, 98, 'усі 98 повернулись як відхилені');
  assert.equal(d2.rejected[0].error, 'already swallowed');
  assert.equal(d2.rejected[0].sig, 1000, 'відхилення підписані sig, щоб клієнт зняв рівно їх');

  // часткова відмова: один поганий елемент не валить решту
  await new Promise(r => setTimeout(r, 200));
  const d3 = await (await feed(h, { items: [
    { bytes: 5000, ext: 'a', sig: 7001 },
    { bytes: -1,   ext: 'a', sig: 7002 },
    { bytes: 6000, ext: 'a', sig: 7003 },
  ] })).json();
  assert.equal(d3.count, 100, 'два добрі елементи пройшли');
  assert.equal(d3.rejected.length, 1, 'відбито рівно поганий');
  assert.equal(d3.rejected[0].sig, 7002);
}

// ── старий однофайловий формат теж приймається ────────────────────────────
// у відкритих вкладках ще крутиться попередній клієнт
h = await hole();
assert.equal((await feed(h, { bytes: 1234, ext: 'png', sig: 81 })).status, 200);
assert.equal(h.d.count, 1, 'одиночний кидок долічився');

// ── стеля пачки ───────────────────────────────────────────────────────────
h = await hole();
assert.equal((await feed(h, { items: [] })).status, 400, 'порожня пачка відбивається');
assert.equal((await feed(h, {
  items: Array.from({ length: 201 }, (_, i) => ({ bytes: 1, ext: 'a', sig: i })),
})).status, 400, 'пачка понад стелю відбивається');

// ── витіснення лічильників за останнім зверненням, а не за вставкою ───────
// Було FIFO: той, хто вже вперся в добовий кап, скидав собі лічильник одним
// заходом із MAX_IPS адрес — його власний запис виїжджав першим.
h = await hole();
await feed(h, { bytes: 1, ext: 'a', sig: 61 }, '10.0.0.1');
await feed(h, { bytes: 1, ext: 'a', sig: 62 }, '10.0.0.2');
await new Promise(r => setTimeout(r, 200));
await feed(h, { bytes: 1, ext: 'a', sig: 63 }, '10.0.0.1');
assert.equal([...h.ips.keys()].pop(), '10.0.0.1',
  'повторне звернення переносить запис у кінець черги витіснення');

// ── рекорд доби рахується по повному логу, а не по 20 останніх ────────────
h = await hole();
await feed(h, { bytes: 5e6, ext: 'a', sig: 51 });
h.d.log.push({ t: Date.now() - 3600e3, b: 9e8, e: 'iso', s: 52 });   // година тому, найбільший
h.d.log.push({ t: Date.now() - 48 * 864e5, b: 9e9, e: 'old', s: 53 }); // позавчора, поза добою
{
  const snap = h.snapshot();
  assert.equal(snap.record.bytes, 9e8, 'рекорд — найбільший за добу, а не за весь час');
  assert.equal(snap.record.ext, 'iso');
}

// ── відкат ────────────────────────────────────────────────────────────────
h = await hole();
await feed(h, { bytes: GB, ext: 'a', sig: 31 });
h.d.log.push({ t: Date.now() - 48 * 864e5, b: 5 * GB, e: 'old', s: 32 });   // позавчорашня подія
h.d.bytes += 5 * GB;
h.d.count++;

const roll = (token) => h.fetch(new Request('https://x/rollback?hours=24', {
  method: 'POST', headers: token ? { 'x-admin-token': token } : {},
}));
assert.equal((await roll()).status, 403, 'без токена відкат закритий');
assert.equal((await roll('wrong')).status, 403, 'чужий токен не працює');

// Одруківка в curl не має коштувати всього логу: Number('abc') давав NaN, а
// filter(x => x.t < NaN) — порожній масив. Маса лишалась, лог зникав.
{
  const bad = await h.fetch(new Request('https://x/rollback?hours=abc', {
    method: 'POST', headers: { 'x-admin-token': 'secret' },
  }));
  assert.equal(bad.status, 400, 'нечислові години відбиваються');
  assert.equal(h.d.log.length, 2, 'лог на місці після відбитого відкату');
}
const out = await (await roll('secret')).json();
assert.equal(out.removed, 1, 'знято рівно свіжу подію');
assert.equal(out.bytes, 5 * GB, 'позавчорашня маса на місці');

// ── невідомі шляхи не будять Durable Object ───────────────────────────────
const worker = (await import('./src/index.js')).default;
let woke = false;
const env = { HOLE: { idFromName: () => 0, get: () => ({ fetch: () => (woke = true, new Response()) }) } };
assert.equal((await worker.fetch(new Request('https://x/favicon.ico'), env)).status, 404);
assert.equal(woke, false, '/favicon.ico не дійшов до обʼєкта');
await worker.fetch(new Request('https://x/state'), env);
assert.equal(woke, true, '/state дійшов');

console.log('✓ бекенд зійшовся');
