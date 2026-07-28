// Одна чорна діра на весь світ = один Durable Object.
// Файли сюди не потрапляють ніколи: лише розмір, розширення й підпис для дедупу.

const DAY = 864e5;
// Кидати можна будь-що: браузер бере лише file.size, тож розмір нічого не коштує.
// Справжня межа накрутки — добовий кап, він і лишається незмінним.
const MAX_FEED   = 1e11;   // 100 ГБ за один кидок
const MAX_IP_DAY = 5e11;   // 500 ГБ на добу з однієї адреси /64
// Мусить лишатись меншим за паузу між кидками в swallow() на клієнті, інакше
// перетягування кількох файлів наполовину відбивається з 429, а сторінка
// відкочує вже показану масу. Справжня межа накрутки — не тут, а в добовому капі.
const COOLDOWN   = 150;    // мс між кидками з однієї адреси
const LOG_KEEP   = 1000;
const DEDUP      = 300;    // серед скількох останніх шукати дублікат
const MAX_ITEMS  = 200;    // стеля пачки за один запит
const MAX_BODY   = 16384;  // ~80 Б на елемент × MAX_ITEMS плюс запас
const MAX_IPS    = 20000;  // стеля лічильників у памʼяті

// CORS немає навмисно: сторінка й API на одному домені, а зірочка дозволяла б
// будь-якому сайту годувати діру браузером свого відвідувача.
// no-store обовʼязково: без нього край Cloudflare кешує /state і віддає застиглу масу
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// ponytail: увесь стан — один блоб під ключем 'd'. Ліміт значення в DO — 128 КБ,
// тому лог обрізається до 1000 подій, тобто відкат сягає лише настільки назад.
// Треба глибший — перенести лог у state.storage.sql, решта коду не зміниться.

export class BlackHole {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Лічильники лімітів живуть ЛИШЕ в памʼяті. У блобі вони росли б з кожною
    // новою адресою і одного дня перевищили 128 КБ — тобто зламали б запис
    // усього стану назавжди. Втрата при перезапуску нічого не варта: скинутий
    // кулдаун нешкідливий, а під справжньою атакою обʼєкт і не засинає.
    this.ips = new Map();
    this.tCast = null;
    // Розсилка йде лише на подіях, тож на спокійній дірі сокет мовчить годинами,
    // а NAT і мобільні проксі ріжуть idle-TCP за 30–120 секунд. Клієнт про це не
    // дізнається — close не приходить — і мовчки показує вчорашню масу.
    // Пінгувати з клієнта самотужки не можна: webSocketMessage закриває сокет на
    // будь-яке вхідне. Автовідповідь обробляє платформа ще ДО нього й не будить
    // обʼєкт, тож захист «server speaks first» лишається чинним для всього решти.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    state.blockConcurrencyWhile(async () => {
      this.d = (await state.storage.get('d')) || { bytes: 0, count: 0, t: Date.now(), log: [] };
      delete this.d.ips;                      // спадок старого формату
    });
  }

  // випаровування Гокінга: -1% маси за добу. маса ∝ √байтів ⇒ байти ∝ маса²
  decay() {
    const now = Date.now();
    if (!this.d.t) { this.d.t = now; return; }
    const days = (now - this.d.t) / DAY;
    if (days > 0.01 && this.d.bytes > 0) {
      this.d.bytes *= Math.pow(0.99, days) ** 2;
      this.d.t = now;
    }
  }

  snapshot() {
    // Рекорд доби рахується тут, бо повний лог є лише тут. Клієнт бачить 20
    // останніх подій, і на живому трафіку це хвилини, а не доба — підпис
    // «рекорд доби» на них просто брехав би.
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

  // ponytail: такт розсилки росте разом із залом. При 2000 глядачів секундний
  // такт — це 2000 send/с з одного однопотокового обʼєкта, він на це не здатний.
  // Стеля 5 с: повільніше вже помітно оку.
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

  // Запис іде в самому запиті, а не відкладеним таймером. Із Hibernation API
  // обʼєкт вивантажується з памʼяті будь-коли — таймер після відповіді просто
  // не спрацює, і подія зникне. Платформа й так зливає записи одного такту
  // в один, тож економити тут не було на чому.
  async save() {
    this.d.log = this.d.log.slice(0, LOG_KEEP);
    await this.state.storage.put('d', this.d);
  }

  // ── Hibernation API: сокети переживають вивантаження обʼєкта з памʼяті ────
  // Зі звичайним accept() DO живий, поки відкритий хоч один сокет, — тобто
  // вічно, щойно проєкт злетить.
  webSocketMessage(ws) {
    // протокол односторонній. Вхідне повідомлення будить приспаний обʼєкт —
    // саме цим і б'ють, тому такий клієнт відлітає одразу.
    ws.close(1003, 'server speaks first');
  }
  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch {}
    this.broadcast();                        // решта бачить, що глядачів поменшало
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
      this.broadcast();                       // решта бачить, що глядачів побільшало
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/state') return json(this.snapshot());

    if (url.pathname === '/feed' && req.method === 'POST') {
      // Відсутність CORS-заголовків не заважає чужому сайту НАДІСЛАТИ запит —
      // вона лише не дає прочитати відповідь. POST із text/plain це «простий»
      // запит, він летить без preflight, і побічний ефект відпрацьовує.
      // Вимога application/json робить запит непростим: браузер спершу шле
      // preflight, а той падає, бо CORS ми не віддаємо. Заразом це відсікає
      // <form enctype="text/plain">, який preflight не робить взагалі.
      if (!(req.headers.get('content-type') || '').includes('application/json'))
        return json({ error: 'bad content type' }, 415);
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) return json({ error: 'nope' }, 403);

      // Заголовок мусить бути присутній: без нього Number(null) дає 0, і
      // перевірка пропускала тіло будь-якого розміру — досить не слати
      // content-length, і req.json() розбирає хоч 100 МБ сміття, палячи
      // єдиний на весь світ потік.
      const cl = req.headers.get('content-length');
      if (!cl || Number(cl) > MAX_BODY) return json({ error: 'too big' }, 413);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: 'bad body' }, 400);

      // Кинута тека — це одна дія, а не сто. Раніше клієнт проштовхував файли
      // по одному, і кулдаун у 150 мс ставив стелю ~6.6 файлів на секунду:
      // на 98 файлах більшість відбивалась 429, а людина бачила, що ніби всі
      // проковтнулись. Пачка приймається одним запитом і одним кулдауном.
      // Старий однофайловий формат теж приймається — у відкритих вкладках
      // ще крутиться попередній клієнт.
      const single = !Array.isArray(body.items);
      const items = single ? [body] : body.items;
      if (!items.length || items.length > MAX_ITEMS)
        return json({ error: 'bad batch' }, 400);

      const ip = req.headers.get('cf-connecting-ip') || '0';
      const key = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;   // IPv6 → /64
      const now = Date.now();
      let q = this.ips.get(key);
      if (q) {
        // Перевставка робить Map чергою за останнім зверненням, а не за
        // вставкою. Інакше витіснення було FIFO, і той, хто вже вперся в
        // добовий кап, скидав собі лічильник одним заходом із MAX_IPS адрес:
        // його власний запис виїжджав першим. Тепер виїжджають неактивні.
        this.ips.delete(key);
        this.ips.set(key, q);
      } else {
        if (this.ips.size >= MAX_IPS) this.ips.delete(this.ips.keys().next().value);
        this.ips.set(key, q = { t: 0, day: now, sum: 0 });
      }

      if (now - q.t < COOLDOWN) return json({ error: 'cooldown' }, 429);
      if (now - q.day > DAY) { q.day = now; q.sum = 0; }
      q.t = now;

      // Кожен елемент судиться окремо, і відмова по одному не валить решту.
      // Клієнт отримує список відхилених із причинами й знімає рівно їх —
      // раніше це було все або нічого, і на пачці читалось як «зникло само».
      const rejected = [];
      let taken = 0;
      for (const it of items) {
        const bytes = Math.floor(Number(it && it.bytes));
        const sig = Math.floor(Number(it && it.sig)) || 0;
        if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_FEED) {
          rejected.push({ sig, error: 'bytes out of range' }); continue;
        }
        if (q.sum + bytes > MAX_IP_DAY) { rejected.push({ sig, error: 'daily cap' }); continue; }
        // дедуп і проти вже поглинутого, і всередині самої пачки —
        // у теці легко трапляються дві копії того самого файлу
        if (sig && this.d.log.slice(0, DEDUP).some(x => x.s === sig)) {
          rejected.push({ sig, error: 'already swallowed' }); continue;
        }
        // імена файлів не приймаємо принципово — лише розширення
        const ext = String(it.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
        q.sum += bytes;
        this.d.bytes += bytes;
        this.d.count++;
        this.d.log.unshift({ t: now, b: bytes, e: ext, s: sig });
        taken++;
      }

      if (taken) { await this.save(); this.broadcast(); }

      // Одиночний кидок відповідає по-старому — статусом і полем error.
      // У відкритих вкладках ще крутиться попередній клієнт, який читає саме це.
      if (single && rejected.length) {
        const e = rejected[0].error;
        return json({ error: e },
          e === 'already swallowed' ? 409 : e === 'daily cap' ? 429 : 400);
      }
      return json({ ...this.snapshot(), rejected });
    }

    // накрутку тут не перемогти за визначенням — тож маємо не оборону, а відкат
    if (url.pathname === '/rollback' && req.method === 'POST') {
      if (!this.env.ADMIN_TOKEN || req.headers.get('x-admin-token') !== this.env.ADMIN_TOKEN)
        return json({ error: 'nope' }, 403);
      // Одруківка в curl не має коштувати всього логу. Без перевірки
      // Number('abc') давав NaN, а filter(x => x.t < NaN) — порожній масив:
      // маса лишалась на місці, а лог, дедуп і можливість наступного відкату
      // зникали безслідно.
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
    // /favicon.ico, /robots.txt, сканери вразливостей і решта сміття не мають
    // будити єдиний на весь світ обʼєкт. Один зайвий шлях = один зайвий RPC
    // на кожного відвідувача.
    if (!API.has(new URL(req.url).pathname)) return new Response('not found', { status: 404 });
    return env.HOLE.get(env.HOLE.idFromName('the-hole')).fetch(req);
  },
};
