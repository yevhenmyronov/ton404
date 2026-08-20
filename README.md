# TON 404

A one-page site with a black hole that you feed with files.

The name follows the catalogue format real holes use (TON 618, Sgr A\*, M87\*).
TON is the actual Tonantzintla quasar catalogue; 404 is the thing that is no
longer there.

**https://nohair.dev**

<p>
  <a href="https://github.com/yevhenmyronov/ton404/actions/workflows/ci.yml"><img src="https://github.com/yevhenmyronov/ton404/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <a href="README.uk.md"><img src="https://img.shields.io/badge/README-українською-0057B7" alt="Читати українською"></a>
</p>

The old address `blackhole.mironovjm.workers.dev` still works so that links
already handed out keep resolving. The canonical one is in `<link rel="canonical">`.

Drop a file and the hole gets heavier. **18.5 GB = one Sun.** One declared
fiction (`1 byte = 10²⁰ kg`); everything else is real physics computed from that
mass. The crowd grows the hole from stellar to supermassive through thirty-one
rungs, each of which is a real object or a physical limit. There is one hole for
everyone: what somebody dropped in Argentina shows up on your screen a second
later.

---

## Files are never uploaded

This is not a privacy-policy promise, it is the architecture.

The browser reads `file.size`, takes the extension and computes a signature over
the **first 64 KB** (FNV-1a, needed only for dedup). Exactly this goes to the
server:

```json
{ "bytes": 15482000, "ext": "png", "sig": 2847362910 }
```

The filename is not among it — and the backend would not accept it even if sent.
People throw `passport_scan.jpg` and `salaries_Q3.xlsx` into the hole, and none
of those words should ever leave their device.

The consequence: the server holds **no proof** that a real file stood behind a
number. Inflation cannot be defeated here in principle, so instead of defending
against it there is a rollback — see below.

---

## Physics

TON 404 turns information into matter. That is the **only** fiction in the
project, and it is declared on the page itself in large type:

```
M = N · 10²⁰ kg                (N is bytes; this is the fiction)

r_s = 2GM/c²                   T = ℏc³/(8πGMk)
t = 5120πG²M³/ℏc⁴              L_Edd = 1.26·10³¹ · M/M☉
dτ = dt·√(1−3GM/rc²)           Δa = L·c⁶/(4G²M²)
```

Past that, nothing is fudged: the Schwarzschild radius, Hawking temperature,
evaporation time, Eddington limit, time dilation at the inner edge of the disc
and tidal stretching at the horizon are all computed with real formulas from
that mass.

The last two are worth reading together. Dilation at the ISCO is exactly 1/√2
and is the same for a hole of any weight: Schwarzschild geometry is self-similar
in r/r_s, so mass changes how long an orbit takes but never the rate. Tidal
stretching, meanwhile, falls as M⁻² — the only number here that gets *smaller*
as the hole grows, which is exactly why a supermassive hole can be crossed
intact while a stellar one tears you apart thousands of kilometres out. Over a
season it travels twelve orders of magnitude and, approaching the supermassive
rung (≈1.3·10⁴ M☉), drops below human tolerance.

The constant is chosen so that the ladder lands on real objects:

| Swallowed | Mass | Horizon radius | Shines like |
|---|---|---|---|
| 1 byte | 10²⁰ kg | 1.5·10⁻⁷ m | — |
| 1 GB | 18,000 Earth masses | **159 m** | 1,800 Suns |
| **18.5 GB** | **1 solar mass** | 2.95 km | 33,000 Suns |
| 393 GB | 21.2 solar masses — Cygnus X-1 | 62.6 km | 700,000 Suns |
| 39 TB | 2,156 solar masses | 6,371 km — Earth-sized | 7·10⁷ Suns |
| **1.77 PB** | **100,000 solar masses** | 295,000 km | 3.3·10⁹ Suns |

The headline: **18.5 GB = one Sun**.

Mass used to be derived from honest Bekenstein–Hawking entropy
(`M = m_P·√(N·ln2/4π)`), which was scientifically uncompromising — and left the
hole weighing a few grams forever, 10¹⁵ times smaller than a proton, with the
astronomical classes in the code permanently out of reach: the lightest stellar
hole required 1.7·10⁷⁷ bytes, one byte for every 587 atoms in the visible
universe. Half the interface promised something that would never happen.

**The milestone ladder.** Thirty-one rungs, each backed by real science, in
three flavours: a named real object, a physical limit where nature changes the
rules, and a horizon size you can picture. No value is typed in by hand — all
are computed from the same formulas, so a stale number cannot appear here. A few
rungs:

| Milestone | Needed | Why it is a milestone |
|---|---|---|
| Colder than the universe | 450 B | Hawking T fell to 2.725 K: the hole absorbs more from the CMB than it emits |
| Earth | 58 KB | Earth's mass inside a 9 mm horizon |
| Stellar ignition limit | 1.48 GB | 0.08 M☉ — below this hydrogen does not burn and no star is born |
| Chandrasekhar limit | 25.9 GB | 1.4 M☉ — no heavier white dwarf exists |
| Oppenheimer limit | 40.2 GB | 2.17 M☉ — no heavier neutron star exists; only a black hole |
| Cygnus X-1 | 393 GB | the first black hole humanity found, 1964 |
| GW150914 | 1.12 TB | the first merger ever heard, Nobel 2017 |
| Forbidden gap | 1.18–2.35 TB | 65–130 M☉: pair instability leaves no black hole at all |
| Omega Centauri | 148 TB | intermediate-mass hole, found in 2024 |
| **SUPERMASSIVE** | **1.77 PB** | the finale of Season I; the horizon is one light-second across |

The progress bar fills **from the previous milestone to the next**, linearly in
bytes, because the caption under it says "6.5 GB to go" and a logarithmic scale
would show 78% next to it, which would read as a lie.

**Classes.** Rank is computed from real mass, and every class boundary is also a
milestone — otherwise the dialog caption and the actual threshold would drift
apart on the first edit. An assert checks this.

| Class | Reached at | The boundary is |
|---|---|---|
| Primordial hole | 1 byte | the window of primordial holes that survived |
| Cold hole | 450 B | colder than the CMB |
| Planetary hole | 58 KB | Earth's mass |
| Impossible hole | 246.6 MB | at this weight nature makes white dwarfs and neutron stars, not black holes |
| Stellar hole | 40.2 GB | the Oppenheimer limit |
| Intermediate hole | 1.81 TB | 100 solar masses |
| Supermassive hole | 1.77 PB | 10⁵ solar masses |

**Dissipation.** The hole loses **0.5% of its mass per day**, and that is pure
game mechanics, not physics: real evaporation of a solar-mass hole takes 2·10⁶⁷
years, 10⁵⁷ times longer than the age of the universe. One honest remnant does
survive: below 450 bytes the hole really is hotter than the CMB and really does
shrink.

It is shown on its own line and **in bytes, not percent**: what a person wants
to know is not a percentage but how much to carry in to keep the hole where it is.

Hence the main consequence: the hole is **a reservoir, not an accumulator**. At a
steady inflow `F` it plateaus at `F ÷ 0.005`, i.e. **200× the daily inflow**.
That is why the rate is 0.5% and not 1%: at 1% and 11 TB/day the ceiling would be
1.1 PB and the season's 1.77 PB target would stay unreachable forever. The decay
rate is derived **from the target**, lives in a single `DECAY` constant on both
sides (client and worker), and is guarded by an assert that fails if the target
ever climbs above the ceiling.

Horizon capacity by the real Bekenstein bound is shown separately — and it
dwarfs what has been fed in: at the season target that is 1.5·10⁸⁷ bits against
1.6·10¹⁶ thrown. Horizon area is now plain geometry `4πr_s²`, so it grows as the
**square** of bytes.

---

## How it looks

One fragment shader on bare WebGL, ~135 lines of GLSL:

- **gravitational lensing** — a ray bends more the closer it passes the horizon,
  so the star field stretches into a ring;
- **the photon ring** at 1.09 radii;
- **an accretion disc** with oblate geometry and Doppler boosting (the side
  coming at you is brighter);
- **relativistic jets** from the poles — they switch on during fast feeding, the
  way real active galactic nuclei do past the Eddington limit;
- **disc colour by temperature** — the hole itself has no features (two holes of
  different weight look identical), but the disc does: by the Shakura–Sunyaev
  thin-disc model T ∝ M<sup>−1/4</sup>, which is precisely why stellar-mass holes
  shine in X-rays and supermassive ones in visible light. The disc cools
  noticeably as the crowd feeds it. It is hotter inside than at the edges,
  because T ∝ r<sup>−3/4</sup>. Colour comes from a Planck approximation in RGB
  over a remapped temperature — see "Deliberate simplifications".

**Dragging.** While a file hovers over the window the hole tilts toward the
cursor; on release a wave of curvature crosses the frame. Both effects ride on
uniforms that already exist: `mouse` (parallax) multiplied by 2.5, and `lens`
(deflection strength) with a decaying sine — the picture leads and returns,
which is exactly what a wave passing through space looks like. Not one new line
of GLSL.

`dragover` drives `pull` to one on **every** event and the frame damps it over
250 ms — so no explicit reset is needed at all: the moment dragging stops, the
effect settles by itself. This also covers a drag dropped outside the window,
which `dragleave` with its `relatedTarget === null` never catches.

**Accessibility.** Under `prefers-reduced-motion` the disc slows down (shader
time ×0.35) and parallax is disabled entirely — along with the tilt and the wave
that ride on it — while the HUD pull-in becomes a plain fade. It started at
×0.08, and that turned out not to be "calmer" but "dead": at that speed the disc
visually stands still and all that is left of the project is a black circle. The
sharpest trigger here is not rotation itself but parallax, because it responds to
the person's own movement. Muting only the interface was not enough: for
vestibular sensitivity the real problem is a full-screen rotating disc. Drop,
rejection and milestone messages are announced by screen readers through
`role="status" aria-live="polite"`.

**The page works without WebGL.** The context may be missing (acceleration off,
an old build), and that used to kill everything: the script threw at
`gl.createShader`, while `shock`, `quasar` and `hotT` are declared below — so
they stayed in the dead zone and not a single number appeared. Now all GL sits
behind a condition, and `webglcontextlost` reloads the page: on mobile the
context is lost regularly, and the canvas would otherwise freeze forever.

**Milestones.** Crossing a rung pulls the interface behind the horizon for a
second, then releases it — and shows the milestone's name together with a line
about why it is one. Thirty-one rungs across fifteen orders of magnitude, about
one per half-order, so the next target is always close and the final one always
large. A batch of files can take several rungs at once; only the top one is
announced.

There is no sound on purpose: in space you would not hear it.

Three.js here would haul a scene graph and a camera around for two triangles
covering the screen.

---

## Languages

Ukrainian for Ukrainian-speaking browsers (`navigator.languages`), English for
everyone else. A button at the bottom switches manually, and the choice lives in
`localStorage` and overrides autodetection — a Ukrainian-speaking browser abroad
and an English-speaking one in Ukraine both happen.

The `TXT` dictionary in [public/index.html](public/index.html) holds about 120
keys per language. Numeric bounds stayed in code; names moved into the
dictionary: `CLASSES`, `OBJECTS`, `SCALES`, `MILES`, `LEN_UNITS` and `KIND_RE`
are assembled from it at startup. Markup is tagged with `data-t` (text), `data-th`
(with inline tags) and `data-ta` (aria-label); Ukrainian stays in the HTML itself
as the fallback if the script dies.

Phrases containing numbers live in the dictionary as **functions**, not
fragments: `у 4 рази важча, ніж Сонце` and `4× heavier than the Sun` are
different grammar, and gluing them with shared code would mean writing a calque
in one of the languages. Milestone names and notes are keyed **by name, not by
index**: inserting a rung mid-ladder would otherwise shift a translation onto
somebody else's number.

All three tables in the dialog — masses, classes, ladder — are **generated** from
the same formulas and bounds as the rest of the page. That does not only remove
duplicated translation: when generation first landed, it immediately corrected
two numbers that had gone stale in the markup. The ladder is drawn by a one-shot
`renderMileTable()` when the dialog first opens rather than by `renderNumbers()`
— thirty-one rows of `innerHTML` on every mass-tweening frame would be pure
waste.

`<title>`, `<meta name="description">` and all `og:` tags are **English and
static**. Crawlers read them and crawlers do not send `Accept-Language`: the
share card will be in one language forever, and that language should be the one
the link travels in. The tab title for the actual user is overridden by the
script: `document.title = L.title`.

The card is `summary_large_image` with `og:image` pointing at `/og.jpg`,
1200×630. Without an image a link in Telegram or Twitter looks like a grey
rectangle, and the whole project is built on "send this to a friend".

The card itself is a screenshot of the page rather than separate artwork: that
way it shows exactly what the person will see and carries the project's headline
claim ("18.5 GB = the mass of the Sun"). To refresh it:

```
chrome --headless --use-gl=swiftshader --force-prefers-reduced-motion \
       --run-all-compositor-stages-before-draw \
       --window-size=1200,630 --virtual-time-budget=20000 \
       --screenshot=og.png file:///.../index.html
```

One trap: the headline mass animates up from zero, and headless returns an
unpredictable number of frames, so the screenshot catches the number mid-climb —
different on every run. So during capture the page has `requestAnimationFrame`
swapped for one that advances the first 300 frames at a fixed step.

---

## Architecture

```
wrangler.toml         one config
public/index.html     the whole page: markup, styles, shader, logic
worker/src/index.js   the backend
```

**There are deliberately no caching headers here.** There used to be a
`public/_headers` with `no-cache`, and it did precisely the opposite of what was
intended: it overrode what Workers Assets serves by itself, and the `ETag` went
with it. Without an ETag, "revalidate before showing" means "download all 156 KB
again" — every time, before any drawing. That produced a blank screen on every
page refresh.

The typical Workers Assets behaviour for HTML is `must-revalidate` **with an
ETag**: the page is always fresh, but when the content has not changed a 304
arrives instead of a body. And open tabs learn about a new release from
`CF_VERSION` over the websocket anyway.

The page and the API live on **one worker and one domain** — the same Worker
serves the static files, so there is no CORS between our own parts.

Shared state is **a single Durable Object** for the whole world
(`idFromName('the-hole')`). One object means increments serialise by themselves:
no races, no transactions. The WebSocket lives there too, through the
**Hibernation API** — sockets survive the object being evicted from memory, so a
full room does not keep it alive forever.

That same object is the one bottleneck of the entire project, so nothing
unnecessary is allowed near it: the worker answers 404 on every path but the four
known ones (otherwise every visitor's `/favicon.ico` would be a hit on it), and
the page takes its initial state from the socket's first message rather than a
separate `GET /state`.

There is no CORS on purpose, but **CORS by itself protects nothing** — a wrong
claim stood here for a long time. Missing CORS headers forbid another site from
*reading the response*, not from *sending the request*: a `POST` with
`text/plain` is a "simple" request, it flies without preflight, and the side
effect happens.

So `/feed` requires `content-type: application/json`. That requirement is what
makes the request non-simple: the browser sends a preflight first, and the
preflight fails because we serve no CORS. Checking `Origin` additionally closes
`<form enctype="text/plain">`, which never preflights at all.

The page also works without a backend: if `API` in
[public/index.html](public/index.html) is empty, the hole becomes personal and
persists in `localStorage`. The same happens if the worker goes down — the front
end reconnects on its own.

After a second consecutive failed connection the state is fetched once via
`GET /state`: behind a corporate proxy a WebSocket never comes up, and without
this a person saw "empty" on a hole weighing thousands of Suns. This is not
polling — exactly one request, until the socket revives.

Reconnection uses **backoff with jitter** (1 s → 60 s, ±50%). At a fixed interval
the whole room piles back in on one beat and never lets the worker get up: an
outage becomes self-sustaining. Plus a `visibilitychange` check — a sleeping
mobile tab often never receives `close`, and the socket is silently dead.

---

## API

| Method | Path | What it does |
|---|---|---|
| `GET` | `/state` | `{ bytes, count, watching, v, record, recent[] }` — `v` is `CF_VERSION` |
| `GET` | `/ws` | WebSocket; sends a state snapshot on connect and then on changes |
| `POST` | `/feed` | `{ items: [{ bytes, ext, sig }] }` → new state + `rejected[]` |
| `POST` | `/rollback?hours=N` | removes every event from the last N hours, requires `x-admin-token` |

`/ws` answers `ping` with `pong` through `setWebSocketAutoResponse` — the
platform handles it without waking the object. Without keepalive a socket on a
quiet hole stays silent for hours, NAT cuts it after 30–120 seconds, and the
client silently shows yesterday's mass. The client cannot ping by itself: any
other inbound message closes the connection, because the protocol is one-way.

WebSocket broadcast is **batched**, and the beat grows with the room:
`min(5 s, 1 s + 2 ms × watchers)`. A fixed second with two thousand watchers is
two thousand `send` calls per second out of one single-threaded object.

### Limits

| What | How much |
|---|---|
| Per drop | 100 GB |
| Per network per day | 500 GB |
| **The whole hole per day** | **50 TB**, with a burst up to 5 TB |
| Cooldown | 150 ms |
| Signature dedup | across the last 300 events |
| Batch per request | 200 items |
| `POST /feed` body | 16 KB, `content-length` required |

**A batch goes in one request.** A dropped folder is one action, not a hundred.
The client used to push files one at a time, and the cooldown put a ceiling at
~6.6 files per second: with 98 files most bounced off with a 429 while the person
saw what looked like all of them being swallowed. Retries did not help — they
only poured more requests into a jammed channel.

Every item in a batch is judged separately, and one rejection does not take down
the rest: the response carries `rejected[]` with reasons and signatures, so the
client removes exactly the rejected ones. A single drop still answers the old way
— 409/429 — so as not to break open tabs running the previous client.

The cooldown is charged on **every** request that passed the cooldown check
itself, not only on successful ones: otherwise you could hammer away with garbage
indefinitely.

**The global limit is the only one that actually holds.** A per-address cap is
honesty, not defence: addresses are free. A home IPv6 `/48` prefix contains
65,536 `/64` subnets, and a rented proxy pool covers the ~4,000 addresses that
would be enough for an entire season in one evening. So on top of everything sits
a leaky bucket for the whole hole: 50 TB per day of sustained inflow, 5 TB of
one-off burst. It does not care where the bytes came from, so it cannot be worked
around at all — even with a thousand addresses, supermassive would take forty
days. The project's projected inflow is 11 TB/day, which leaves honest traffic
4.5× of headroom.

IPv6 is cut at `/48`, not `/64`: a subscriber is delegated a `/56` or a `/48`, so
every `/64` inside belongs to them — anywhere from 256 to 65,536 free daily caps.
`/48` is the smallest block a single subscriber cannot multiply.

Counters are **mirrored into their own storage keys** (`ip:*`) rather than the
blob: inside the blob they would grow with every address and one day exceed the
128 KB value limit, breaking the write of the entire state. Memory alone was not
enough — the old argument that "under attack the object never gets to sleep" is
true for a flood and false for a slow one: drop 500 GB, wait for eviction, get a
fresh cap. Yesterday's rows are swept on wake-up, so storage does not grow.
Eviction is by **last access**, not by insertion: otherwise somebody already at
their cap could reset it in one pass with 20,000 addresses.

The extension is sanitised to `[a-z0-9]{1,8}` — `../../Some Name.pdf` becomes
`pdf`.

The limits are written twice — in the worker and on the page that displays them
under "Rules". `worker/test.mjs` compares both copies, as it does for `DECAY`: a
page quietly lying about a limit is worse than a page that says nothing.

### Rollback

The global limit makes inflation pointless but not impossible — this is for
cleaning up whatever still got through:

```bash
curl -X POST "https://nohair.dev/rollback?hours=24" \
     -H "x-admin-token: $ADMIN_TOKEN"
```

It removes every event from the last day and reduces the mass by their sum.
Inflation stops being a catastrophe and becomes ten minutes of cleanup.

---

## Development

```bash
npx wrangler login
npx wrangler dev        # locally, with a real Durable Object
npx wrangler deploy     # updates the page and the API at once
```

The rollback secret:

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
node worker/test.mjs      # limits, sanitisation, /48, rollback, routing
```

For the physics self-check, open the page with `?test` and look at the console,
**in both languages**. It verifies the formulas for mass, radius, luminosity,
evaporation time, time dilation and tidal stretching, the invertibility of
`bytesFor`/`massOf`, class boundaries, the reservoir ceiling and the milestone
ladder. Three of those checks carry their own weight:

- `MILES` must increase strictly. The values are computed from physics, so a
  wrongly sorted rung is impossible to spot by eye and would quietly break the
  count of milestones passed.
- every class boundary must also be a milestone;
- dictionary arrays must match the length of the JS constant, not merely each
  other. Only uk/en parity was checked before, and a short array quietly rendered
  `undefined`.

---

## Deliberate simplifications

Marked in the code with `ponytail:` comments — these are not forgotten loose ends
but corners cut with a known ceiling:

- **the mass law itself.** `1 byte = 10²⁰ kg` is a fiction, and the real
  Bekenstein bound says the opposite: a one-kilogram horizon would hold several
  petabytes. We play it backwards, because otherwise the whole page would show a
  few grams.
- **0.5% dissipation per day** — game mechanics with no physical alibi: real
  evaporation takes 2·10⁶⁷ years. It is also the only difficulty knob, which is
  why the rate lives in one `DECAY` constant on both sides.
- **on-screen radius grows as √(log₁₀ bytes)**, not directly. Mass is now linear
  in bytes, so the radius would be too — and the real law would put a
  billion-fold difference between 1 B and 1 GB, leaving the hole either invisible
  or filling the screen.
- **disc colour is false colour.** The law T ∝ M<sup>−1/4</sup> is real and the
  page shows the disc's real temperature (5.6·10⁵–3.8·10⁹ K). But that is X-ray
  and extreme ultraviolet, the eye cannot see it, and the Planck approximation in
  RGB is only valid over 1000–40000 K. So the real temperature is mapped
  log-linearly into the visible range — the way telescope images are coloured.
  The ordering is preserved: hotter is still bluer.
- **the file signature is FNV-1a over 64 KB**, not SHA-256. It is a seed for
  dedup and for the emission visuals, not crypto; in exchange it works on
  `file://`, where `crypto.subtle` does not exist.
- **the entire DO state is one blob** under key `d`. The value limit is 128 KB,
  so the rollback log is capped at a thousand events. If a deeper one is ever
  needed, move the log into `state.storage.sql` and the rest of the code stays
  as it is.
- **there is no plan B if the WebSocket never comes up.** The page simply stays
  personal — which is the documented behaviour without a backend. Polling
  `/state` as a fallback channel would add load exactly where it already hurts.

---

## License

MIT — see [LICENSE](LICENSE). It is a fun project.
