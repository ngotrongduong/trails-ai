// Trails AI: a rider that teaches itself to ride any line on trailsthegame.com
// and to land tricks for points. Runs inside the game page.
//
// How it works
// - Listens to the world data the game already receives (pieces, line starts,
//   your own position). Nothing is ever sent to the server by this script,
//   except closing the socket once on start so the game reconnects and sends
//   the nearby pieces again.
// - Builds the chosen line's route from its pieces and cuts it into sections
//   (one per jump, the rest every 40 m). The AI's "plan" holds, per section,
//   the speed to carry, the bike angle to hold in the air, whether to pull or
//   pump, and which trick to throw. Riding itself (steering, pedalling to the
//   planned speed, levelling in the air) is a fixed controller.
// - It learns the plan by trial and error inside Web Workers, each running the
//   game's own physics engine (the same wasm the game uses): try many changed
//   plans, keep whichever rides further and scores more. First it learns to
//   get through the line, then it tries tricks jump by jump.
// - Score = metres ridden along the line + points for tricks landed clean,
//   minus a penalty for crashing. The best run can be watched in the panel as
//   a side view of the line (the game's own replay links carry no start
//   position, so they would play from wherever the viewer spawns).
// - "Let the AI ride" drives your own bike in the real game. For that the
//   script must be in place before the game builds its physics engine. The
//   browser extension (extension/) runs it before the game starts; from the
//   bookmark it quiets the game already open in this tab and opens the game
//   again in a full-page frame with the AI loaded first. While the AI rides,
//   its controls replace yours at the engine; any key gives the bike back.
// - Jumps are described by their shape. What worked on a jump is borrowed by
//   similar jumps of other lines: a new line starts from it, and the AI tries
//   it whenever it is stuck at a jump.
// - Learning is spread over most CPU threads. What the AI learned on a line (a
//   "lesson") is kept in this browser, shared at once with other tabs on the
//   same line, and can be saved to a file or shared to the community repo on
//   GitHub. Lessons from elsewhere are ridden in this computer's simulation
//   first and kept only if they do better.
(function TAI() {
  'use strict';
  // the browser extension runs the AI before the game starts (__taiDirect), so it needs no frame
  if (window.top === window && !window.__taiDirect) { boot(TAI); return; }
  if (window.TrailsAI) { window.TrailsAI.open(); return; }

  // Runs in the tab itself: quiet the game that is already open, then open it again in a frame with the AI loaded first.
  function boot(fn) {
    const old = document.getElementById('tai-frame');
    if (old) { try { old.contentWindow.TrailsAI.open(); } catch { /* still loading */ } return; }
    // the game pauses its sound when the tab is hidden, stops when nothing draws, and stays offline without sockets
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } catch { /* keep going */ }
    window.requestAnimationFrame = () => 0;
    WebSocket.prototype.send = function () { try { this.close(); } catch { /* already closed */ } };
    window.WebSocket = function () { return { readyState: 3, send() {}, close() {}, addEventListener() {}, removeEventListener() {} }; };
    for (const el of [...document.body.children]) el.style.display = 'none';
    document.body.style.overflow = 'hidden';
    const f = document.createElement('iframe');
    f.id = 'tai-frame';
    f.src = location.origin + '/';
    f.allow = 'fullscreen; gamepad; autoplay; clipboard-write';
    f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#181a18';
    document.body.appendChild(f);
    const src = '(' + fn.toString() + ')()';
    const tick = () => {
      try {
        const w = f.contentWindow;
        if (w && w.location.href !== 'about:blank' && !w.__tai) { w.__tai = 1; w.eval(src); f.focus(); return; }
      } catch { /* frame between pages */ }
      setTimeout(tick, 0);
    };
    tick();
  }

  // ---------------------------------------------------------------- constants
  const PHYS_KINDS = ['start', 'takeoff', 'landing', 'pump', 'flat', 'berm'];
  const N_MOVES = 21;          // trick moves for the air the worker knows (index 0 = none); MANUAL is on the ground
  const SPIN_L = 16, SPIN_R = 17, FLIP = 18, WHIP_L = 19, WHIP_R = 20, MANUAL = 21;
  // The game's Training drills, by what each asks for (as the game judges it): need is how much of it one ride must get.
  // pumps: the rollers without pedals, faster at the end than at the start (the game counts 6 good pumps); laps: two laps
  // of the pump track without pedals; clean: every jump landed clean in one ride (Jumping, Pump & pull); boost / racer:
  // the jump of Boost & racer landed at least 0.97 m up (clean, or hard but under 6.5) / clean at most 0.86 m up (the
  // game asks for one, then the other, twice each); finish: the line without a fall;
  // manual: 2 s on the back wheel; whip, spin, flip: that trick landed (twice for the whip); tricks: the Trick line, a
  // backflip, a 360, a whip and a manual in one ride to the end.
  const DRILL_GOALS = {
    pumps: { name: 'Pumping', pedals: false, need: 6 }, laps: { name: 'Pump track', pedals: false },
    clean4: { name: 'Jumping' }, clean3: { name: 'Pump & pull' }, boost: { name: 'Boost & racer (boost)' },
    racer: { name: 'Boost & racer (racer)' }, finish: { name: 'Beginner line' }, manual: { name: 'Manual', need: 2 },
    whip: { name: 'Whip', need: 2 }, spin: { name: '360' }, flip: { name: 'Backflip' }, tricks: { name: 'Trick line', need: 5 },
  };
  const STORE = 'trailsai.v2.';
  // A name for every line, easier to tell apart than "the start 40 m away": the one the player gave it, else one made
  // from the start's id, so a line keeps its name on every computer (place, what is there, a number: "Đồi Thông 37").
  const NAMES = 'trailsai.names';
  const NAME_PLACE = ['Đồi', 'Dốc', 'Suối', 'Rừng', 'Đèo', 'Bãi', 'Cồn', 'Gò', 'Núi', 'Lũng', 'Ghềnh', 'Bờ', 'Trảng', 'Truông', 'Động', 'Mỏm'];
  const NAME_WHAT = ['Thông', 'Gió', 'Mây', 'Sương', 'Nắng', 'Trăng', 'Cát', 'Rêu', 'Sỏi', 'Lau', 'Tre', 'Đá', 'Hoa', 'Sao', 'Mưa', 'Sóc'];
  const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const givenNames = () => { try { return JSON.parse(localStorage.getItem(NAMES) || '{}') || {}; } catch { return {}; } };
  function lineName(id) {
    const given = givenNames()[id];
    if (given) return given;
    const drill = /^practice-(\d+)-(\d+)$/.exec(id);
    if (drill) return `Đường tập ${drill[1]}${+drill[2] ? '-' + drill[2] : ''}`;
    const tr = /^training-(\w+)$/.exec(id);
    if (tr && DRILL_GOALS[tr[1]]) return `Training: ${DRILL_GOALS[tr[1]].name}`;
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
    return `${NAME_PLACE[h & 15]} ${NAME_WHAT[(h >>> 4) & 15]} ${10 + ((h >>> 8) % 90)}`;
  }
  function setLineName(id, name) {
    const all = givenNames(), n = String(name).trim().slice(0, 40);
    if (n) all[id] = n; else delete all[id];
    try { localStorage.setItem(NAMES, JSON.stringify(all)); } catch { /* storage blocked */ }
  }
  // the community repo: lessons/<line id>.json there is the best lesson people have shared for that line
  const REPO = 'ngotrongduong/trails-ai';
  const LESSONS_URL = `https://raw.githubusercontent.com/${REPO}/main/lessons/`;
  const LESSON_FORMAT = 'trails-ai-lesson';
  // experience/jumps.json there gathers the jumps of every shared lesson (rebuilt by a GitHub workflow)
  const EXPERIENCE_URL = `https://raw.githubusercontent.com/${REPO}/main/experience/jumps.json`;
  const JUMPS_VERSION = 1;
  const TRICK_NAMES = {
    flip: 'Backflip', spin: '360', whip: 'Whip', table: 'Table', tailwhip: 'Tailwhip',
    barspin: 'Barspin', tbog: 'T-bog', xup: 'X-up', manual: 'Manual',
  };

  // ---------------------------------------------------------------- live engine
  // The game builds its physics with WebAssembly.instantiate. It gets the same engine back with one
  // change: while the AI rides, the AI's controls replace the player's on every physics step.
  const WAI = WebAssembly.instantiate.bind(WebAssembly);
  // tricks, bike and tunes are what the game set for your rider; training uses the same so a plan rides the same
  const live = { ex: null, g: 0, SL: 0, drive: null, tricks: null, bike: 0, tunes: {}, spawn: null };
  WebAssembly.instantiate = async function (src, imports) {
    const r = await WAI(src, imports);
    const ex = r && r.instance && r.instance.exports;
    if (!ex || !ex.trails_game_step || live.ex) return r;
    const px = { ...ex };
    const mine = g => !live.g || g === live.g;
    px.trails_game_new = (...a) => { const g = ex.trails_game_new(...a); if (!live.g) live.g = g; return g; };
    px.trails_set_tricks = (g, m) => { if (mine(g)) live.tricks = m; return ex.trails_set_tricks(g, m); };
    px.trails_bike_select = (g, b) => { if (mine(g)) live.bike = b; return ex.trails_bike_select(g, b); };
    px.trails_tune = (g, i, v) => { if (mine(g)) live.tunes[i] = v; return ex.trails_tune(g, i, v); };
    // where the game puts you back after a fall (a Training drill sets its start here, with the speed you start at)
    px.trails_keep_spawn = (g, x, z, h, v) => { if (mine(g)) live.spawn = { x, z, heading: h, v: v || 0 }; return ex.trails_keep_spawn(g, x, z, h, v); };
    px.trails_game_step = (g, ...inp) => {
      if (live.drive && g === live.g) {
        try { const o = live.drive.step(); if (o) inp = o; } catch (err) { live.drive = null; console.error(err); }
      }
      return ex.trails_game_step(g, ...inp);
    };
    live.ex = ex; live.SL = ex.trails_state_len();
    return { module: r.module, instance: { exports: px } };
  };
  const liveState = () => new Float64Array(live.ex.memory.buffer, live.ex.trails_game_state(live.g), live.SL);
  // the rider setup training should copy (all tricks when the game was not watched from the start)
  const riderSetup = () => ({ tricks: live.tricks === null ? 511 : live.tricks, bike: live.bike, tunes: { ...live.tunes } });

  // ---------------------------------------------------------------- capture
  const cap = { chunks: new Map(), held: new Set(), starts: [], ws: null, pose: null, poseAt: 0 };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  const WRAPPED = Symbol('trailsai');

  function take(data) {
    if (typeof data !== 'string' || data.length < 8) return;
    let r;
    try { r = JSON.parse(data); } catch { return; }
    if (r.t === 'chunk' && Array.isArray(r.c)) {
      cap.chunks.set(r.c.join(','), Array.isArray(r.pieces) ? r.pieces : []);
    } else if (r.t === 'welcome') {
      if (Array.isArray(r.starts)) cap.starts = r.starts;
      cap.held.clear();
    } else if (r.t === 'startsdiff') {
      const m = new Map(cap.starts.map(s => [s.id, s]));
      for (const id of r.gone || []) m.delete(id);
      for (const s of r.put || []) m.set(s.id, s);
      cap.starts = [...m.values()];
    }
  }
  const wrap = fn => {
    if (!fn || fn[WRAPPED]) return fn;
    const w = function (ev) { try { take(ev.data); } catch { /* never break the game */ } return fn.call(this, ev); };
    w[WRAPPED] = true;
    return w;
  };
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true, enumerable: desc.enumerable,
    get() { return desc.get.call(this); },
    set(fn) { return desc.set.call(this, wrap(fn)); },
  });
  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    try {
      if (cap.ws !== this) {
        cap.ws = this;
        const cur = desc.get.call(this);
        if (cur && !cur[WRAPPED]) desc.set.call(this, wrap(cur));
      }
      if (typeof d === 'string') {
        if (d.includes('"sub"')) {
          const r = JSON.parse(d);
          for (const c of r.add || []) cap.held.add(String(c));
          for (const c of r.drop || []) cap.held.delete(String(c));
        }
      } else if (d && d.byteLength >= 40 && d.byteLength <= 200) {
        cap.pose = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
        cap.poseAt = performance.now();
      }
    } catch { /* ignore */ }
    return origSend.call(this, d);
  };

  // ---------------------------------------------------------------- engine (main thread, no terrain)
  const assets = () => {
    const names = performance.getEntriesByType('resource').map(e => e.name);
    const pick = re => names.find(n => re.test(n));
    return {
      wasm: pick(/trails-[^/]+\.wasm/),
      land: [pick(/red-rock-study[^/]*\.bin/), pick(/grinnell-southeast-shoulder[^/]*\.bin/),
        pick(/connected-assembly-residual[^/]*\.bin/), pick(/connected-assembly-influence[^/]*\.bin/)],
    };
  };
  let eng = null;
  async function engine() {
    if (eng) return eng;
    const a = assets();
    if (!a.wasm) throw new Error('Không thấy file vật lý của game. Hãy tải lại trang game rồi mở AI lại.');
    const buf = await (await fetch(a.wasm)).arrayBuffer();
    const { instance } = await WAI(buf, {});
    const l = instance.exports;
    const g = l.trails_game_new(1);
    const txt = n => { const b = l.trails_buf(g); return new TextDecoder().decode(new Uint8Array(l.memory.buffer, b, n)); };
    const K = JSON.parse(txt(l.trails_kinds_json(g)));
    const FF = l.trails_world_sizes() & 65535;
    const wp = l.trails_world_flat(g, 1);
    const fmt = new Float64Array(l.memory.buffer, wp, 1)[0];
    const kidx = Object.fromEntries(K.map((k, i) => [k.key, i]));
    // land: the game's terrain ([2, 0, 0, 0]), or another ground such as the flat one practice lines are laid out on
    const flat = (fs, land = [2, 0, 0, 0]) => {
      const arr = [fmt, ...land];
      fs.forEach((f, i) => {
        const ki = kidx[f.kind];
        const p = K[ki].params.map(q => { const v = f.params && f.params[q.key]; return Math.min(q.max, Math.max(q.min, v !== undefined ? v : q.default)); });
        arr.push(i + 1, ki, f.x, f.z, f.heading);
        for (let h = 0; h < FF - 5; h++) arr.push(h < p.length ? p[h] : 0);
      });
      return arr;
    };
    const layout = (f, land) => {
      const a2 = flat([f], land);
      const h = a2.length * 8 + 8, c = l.trails_alloc(h), d = c + 7 & -8;
      new Float64Array(l.memory.buffer, d, a2.length).set(a2);
      const n = l.trails_layout_alone(g, d, a2.length);
      l.trails_dealloc(c, h);
      return JSON.parse(txt(n));
    };
    const stateLen = l.trails_state_len();
    const decodePose = bytes => {
      const b = new Uint8Array([3, 1, 0, 7, 0, ...bytes.slice(1)]);
      const p = l.trails_alloc(b.length);
      new Uint8Array(l.memory.buffer, p, b.length).set(b);
      const s = l.trails_net_poses(g, p, b.length);
      l.trails_dealloc(p, b.length);
      if (s !== 1) return null;
      const o = new Float64Array(l.memory.buffer, l.trails_fbuf(g), 3 + stateLen);
      const x = o[3], z = o[5], hd = o[6];
      return Number.isFinite(x) && Number.isFinite(z) ? { x, z, heading: hd } : null;
    };
    eng = { l, g, K, kidx, layout, decodePose };
    return eng;
  }

  async function whereAmI() {
    if (live.ex && live.g) {
      const s = liveState();
      if (Number.isFinite(s[0]) && Number.isFinite(s[2])) return { x: s[0], z: s[2], heading: s[3], how: 'vị trí của bạn' };
    }
    const e = await engine();
    if (cap.pose && performance.now() - cap.poseAt < 20000) {
      const p = e.decodePose(cap.pose);
      if (p) return { ...p, how: 'vị trí của bạn' };
    }
    const keys = cap.held.size ? [...cap.held] : [...cap.chunks.keys()];
    if (!keys.length) return null;
    let sx = 0, sz = 0;
    for (const k of keys) { const [cx, cz] = k.split(',').map(Number); sx += (cx + 0.5) * 256; sz += (cz + 0.5) * 256; }
    return { x: sx / keys.length, z: sz / keys.length, heading: 0, how: 'vùng bản đồ đang tải' };
  }

  // ---------------------------------------------------------------- route
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  // points [x, z, kind] along a line, from point k0 on, as one point every metre
  function resample(raw, k0) {
    const X = [], Z = [], KIND = [];
    let px = raw[k0][0], pz = raw[k0][1];
    X.push(px); Z.push(pz); KIND.push(raw[k0][2]);
    for (let i = k0 + 1; i < raw.length; i++) {
      const [qx, qz, kd] = raw[i];
      let d = Math.hypot(qx - px, qz - pz);
      if (d < 1e-6) continue;
      while (d >= 1) {
        px += (qx - px) / d; pz += (qz - pz) / d;
        X.push(px); Z.push(pz); KIND.push(kd);
        d = Math.hypot(qx - px, qz - pz);
      }
    }
    return { X, Z, KIND };
  }

  // The line from start along the pieces the game has loaded (or along pieces src, on ground land).
  async function buildRoute(start, src, land) {
    const e = await engine();
    const all = src || [...cap.chunks.values()].flat();
    const near = all.filter(p => e.kidx[p.kind] !== undefined && Math.hypot(p.x - start.x, p.z - start.z) < 2500);
    const segs = [];
    for (const p of near) {
      if (!PHYS_KINDS.includes(p.kind)) continue;
      let lay;
      try { lay = e.layout(p, land); } catch { continue; }
      if (!lay || !lay.path || lay.path.length < 2) continue;
      // layouts come back in world coordinates: path rows are [s, x, z]
      const pts = lay.path.map(q => [q[1], q[2]]);
      const ro = lay.runOut || lay.exit;
      const li = lay.leadIn || [p.x, p.z, p.heading];
      segs.push({ p, pts, end: [ro[0], ro[1], ro[2]], lead: [li[0], li[1], li[2]] });
    }
    // first piece: the one the start sits on
    let cur = null, best = 6;
    for (const s of segs) {
      for (let i = 1; i < s.pts.length; i++) {
        const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((start.x - ax) * dx + (start.z - az) * dz) / L2));
        const d = Math.hypot(start.x - (ax + dx * t), start.z - (az + dz * t));
        const hd = Math.abs(wrapA(Math.atan2(dz, dx) - start.heading));
        if (d + hd * 2 < best) { best = d + hd * 2; cur = s; }
      }
    }
    if (!cur) return null;
    const chain = [];
    const used = new Set();
    let gapAfter = [];
    while (cur && chain.length < 600) {
      chain.push(cur); used.add(cur);
      const [ex, ez, eh] = cur.end;
      const jump = cur.p.kind === 'takeoff';
      let nxt = null, score = Infinity;
      for (const s of segs) {
        if (used.has(s)) continue;
        const [lx, lz, lh] = s.lead;
        const dx = lx - ex, dz = lz - ez;
        const f = dx * Math.cos(eh) + dz * Math.sin(eh);
        const lat = -dx * Math.sin(eh) + dz * Math.cos(eh);
        const dh = Math.abs(wrapA(lh - eh));
        const maxF = jump ? 40 : 3.5;
        // (a berm's way in and out are 3 m long and lie over the flats either side of it)
        if (f < -3.5 || f > maxF) continue;
        if (Math.abs(lat) > 1.5 + Math.max(0, f) * (jump ? 0.45 : 0.3)) continue;
        if (dh > (jump ? 0.75 : 0.65)) continue;
        const sc = Math.abs(f) + Math.abs(lat) * 2 + dh * 3;
        if (sc < score) { score = sc; nxt = s; }
      }
      gapAfter.push(nxt && jump ? 1 : 0);
      cur = nxt;
    }
    // resample into 1 m steps, starting from the point nearest the start
    const raw = [];
    // On a drill's own ground (src) a piece's way in can lie over the piece before (a berm's 3 m): the points of a piece
    // behind where the line has got to are left out, so the line never doubles back.
    let hx = 0, hz = 0, hh = null;
    const add = (x, z, kd, h) => {
      if (src && hh !== null && (x - hx) * Math.cos(hh) + (z - hz) * Math.sin(hh) < 0.2) return;
      if (hh !== null || src) { hh = h !== undefined ? h : raw.length ? Math.atan2(z - hz, x - hx) : 0; }
      hx = x; hz = z; raw.push([x, z, kd]);
    };
    let n0 = 0;
    chain.forEach((s, ci) => {
      for (const q of s.pts) add(q[0], q[1], s.p.kind);
      add(s.end[0], s.end[1], gapAfter[ci] ? 'air' : s.p.kind, s.end[2]);
      if (!ci) n0 = raw.length;
    });
    // the line starts on the first piece (a line that goes round comes back past the start)
    let k0 = 0, d0 = Infinity;
    raw.forEach((q, i) => { const d = Math.hypot(q[0] - start.x, q[1] - start.z); if ((i < n0 || !src) && d < d0) { d0 = d; k0 = i; } });
    const { X, Z, KIND } = resample(raw, k0);
    if (X.length < 20) return null;
    // pieces the physics needs: everything close to the route
    const cell = 32, grid = new Map();
    for (let i = 0; i < X.length; i += 4) {
      const key = Math.floor(X[i] / cell) + ',' + Math.floor(Z[i] / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    const nearRoute = (x, z, r) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell), n = Math.ceil(r / cell);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        for (const i of grid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(X[i] - x, Z[i] - z) < r) return true;
      }
      return false;
    };
    const pieces = near.filter(p => nearRoute(p.x, p.z, p.kind === 'shape' || p.kind === 'ground' ? 70 : 35));
    const kinds = {};
    chain.forEach(s => { kinds[s.p.kind] = (kinds[s.p.kind] || 0) + 1; });
    return {
      start: { id: start.id, x: start.x, z: start.z, heading: start.heading },
      X, Z, KIND, length: X.length, pieces, kinds,
    };
  }

  // The line that goes on from the end of line R: one starting at most ONWARD_GAP metres in front of its end, going
  // roughly the same way (the ground between is ridden straight). With none that near there is none, so the bike
  // never heads off where there is no track. seen(x, z) tells the ground already ridden: a line mostly over it is not
  // taken. The line found starts where R ends (a simulation lays the ground between as its run-in).
  const ONWARD_GAP = 35;
  async function nextLine(R, seen) {
    const N = R.length, ex = R.X[N - 1], ez = R.Z[N - 1], k = Math.max(0, N - 6);
    const eh = Math.atan2(ez - R.Z[k], ex - R.X[k]);
    const e = await engine(), cands = [];
    for (const p of [...cap.chunks.values()].flat()) {
      if (!PHYS_KINDS.includes(p.kind) || e.kidx[p.kind] === undefined || Math.hypot(p.x - ex, p.z - ez) > ONWARD_GAP + 30) continue;
      let lay;
      try { lay = e.layout(p); } catch { continue; }
      if (!lay || !lay.path || lay.path.length < 2) continue;
      // the first point of the piece ahead of the bike that goes the right way (a piece may start under the line's end)
      let c = null;
      for (let i = 1; i < lay.path.length; i++) {
        const x = lay.path[i][1], z = lay.path[i][2], h = Math.atan2(z - lay.path[i - 1][2], x - lay.path[i - 1][1]);
        const dx = x - ex, dz = z - ez, f = dx * Math.cos(eh) + dz * Math.sin(eh), lat = -dx * Math.sin(eh) + dz * Math.cos(eh), dh = Math.abs(wrapA(h - eh));
        if (f < 1 || f > ONWARD_GAP || Math.abs(lat) > 3 + 0.4 * f || dh > 0.8) continue;
        const sc = f + 2 * Math.abs(lat) + 8 * dh;
        if (!c || sc < c.sc) c = { x, z, h, sc };
      }
      if (c) cands.push(c);
    }
    cands.sort((a, b) => a.sc - b.sc);
    let best = null;
    for (const c of cands.slice(0, 4)) {
      const r = await buildRoute({ id: 'onward', x: c.x, z: c.z, heading: c.h });
      if (!r || r.length < 25) continue;
      let old = 0, n = 0;
      for (let i = 0; i < r.length; i += 4, n++) if (seen(r.X[i], r.Z[i])) old++;
      if (old > n * 0.3) continue;
      if (!best || r.length > best.length) best = r;
    }
    if (best) best.start = { id: 'onward', x: ex, z: ez, heading: eh };
    return best;
  }
  // The ground a ride has covered, in 3 m cells: mark(line) adds a line, seen(x, z) asks about a point.
  function ground() {
    const cells = new Set();
    return {
      mark: L => { for (let i = 0; i < L.length; i += 2) cells.add(Math.round(L.X[i] / 3) + ',' + Math.round(L.Z[i] / 3)); },
      seen: (x, z) => {
        const a = Math.round(x / 3), b = Math.round(z / 3);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (cells.has((a + i) + ',' + (b + j))) return true;
        return false;
      },
    };
  }
  // A tour: the line from a start, then the lines that go on from its end (nextLine), one after another, joined by
  // the ground between, up to TOUR_LEGS more lines and TOUR_MAX metres. The AI learns and rides the tour as one line,
  // so a lesson also gets the lines after it right, coming at each one at the speed the line before it gives.
  // route.tour is the number of lines joined on (0: none goes on from this one).
  const TOUR_LEGS = 6, TOUR_MAX = 1500;
  async function extendRoute(route) {
    if (route.practice || route.tour !== undefined) return route;
    const g = ground();
    let X = Array.from(route.X), Z = Array.from(route.Z), KIND = Array.from(route.KIND), legs = 0;
    const pieces = route.pieces.slice(), kinds = { ...route.kinds }, have = new Set(pieces.map(p => p.kind + p.x + ',' + p.z));
    g.mark(route);
    while (legs < TOUR_LEGS && X.length < TOUR_MAX) {
      const r = await nextLine({ X, Z, length: X.length }, g.seen);
      if (!r) break;
      // the ground between, a point every metre
      const ex = X[X.length - 1], ez = Z[Z.length - 1], d = Math.hypot(r.X[0] - ex, r.Z[0] - ez);
      for (let i = 1; i < d; i++) { X.push(ex + (r.X[0] - ex) * i / d); Z.push(ez + (r.Z[0] - ez) * i / d); KIND.push('flat'); }
      X = X.concat(Array.from(r.X)); Z = Z.concat(Array.from(r.Z)); KIND = KIND.concat(Array.from(r.KIND));
      for (const p of r.pieces) { const key = p.kind + p.x + ',' + p.z; if (!have.has(key)) { have.add(key); pieces.push(p); } }
      for (const [k, n] of Object.entries(r.kinds || {})) kinds[k] = (kinds[k] || 0) + n;
      g.mark(r); legs++;
    }
    return { ...route, X, Z, KIND, length: X.length, pieces, kinds, tour: legs };
  }

  // ---------------------------------------------------------------- practice lines
  // Lines like the game's Training drills, made up anew from a seed: a start hill, then tables, doubles, step-ups and
  // step-downs of many sizes, three in a row, rollers and berms. They lie where the game puts its own drills, on its
  // training hill (6 % down from x = 9100 for 400 m), and are laid out as the game lays out its drills: each piece starts
  // where the one before ends (after its gap), and a landing is made just long enough for its top to sit `step` above
  // the line (a step-up) or below it (a step-down). Heights are above the ground: a line steps down the hill as it goes.
  // hard (0 to 1) makes the jumps kickier, higher, longer and more of them in a row.
  const PRACTICE_LAND = [1, 0.06, 9100, 9500], FLAT_LAND = [1, 0, 0, 0], PRACTICE_PIECES = 26;
  function practicePieces(rnd, hard = 0) {
    const R = (a, b) => a + rnd() * (b - a), I = (a, b) => Math.floor(R(a, b + 1));
    const out = [{ kind: 'start', p: { height: R(3.6, 5), deck: 4, back: 8, width: 3.2 } }, { kind: 'flat', p: { len: R(6, 10), width: 2.8 } }];
    // turn: degrees turned so far; a berm after a berm turns back, so the line keeps going down the hill
    let level = 0, turn = 0;
    const takeoff = () => ({ kind: 'takeoff', p: { radius: R(6.5 - 2.5 * hard, 11 - 3 * hard), length: R(3.4, 4.6 + 2 * hard), width: 2.4, base: 3.2, height: level } });
    // the game's pieces sit at most 4 m below the ground
    const landing = (drop, o = {}) => { drop = Math.min(drop, 4 + level); const p = { kind: 'landing', p: { radius: R(18, 25), width: 4, height: level - drop }, carry: true, ...o }; level -= drop; return p; };
    const inRow = 3 + Math.round(2 * hard);
    // back to the ground with a pump down to it, then a few metres of flat
    const back = () => {
      if (level < -0.1) out.push({ kind: 'pump', p: { len: R(12, 16), start: level, peak: level / 2, end: 0, width: 2.8 } });
      level = 0;
      out.push({ kind: 'flat', p: { len: R(3, 8), width: 2.8 } });
    };
    while (out.length < PRACTICE_PIECES) {
      const pick = rnd(), jumps = 0.65 + 0.15 * hard;
      // too deep for another drop: back to the ground first
      if (pick < jumps && level < -2.5) back();
      if (pick < 0.25) out.push(takeoff(), { kind: 'flat', p: { len: R(3, 6), width: 2.4 }, carry: true }, landing(R(0.6, 2.2)));
      else if (pick < jumps) {
        const u = rnd(), step = u < 0.35 ? R(0.3, 0.8 + 0.9 * hard) : u < 0.65 ? -R(0.4, 1) : 0;
        out.push(takeoff(), landing(R(1.5, 3.5), { gap: R(3, 7 + 5 * hard), step }));
      } else if (pick < jumps + (1 - jumps) / 2) {
        back();
        for (let k = I(3, 6); k > 0; k--) out.push({ kind: 'pump', p: { len: R(4, 7), peak: R(0.25, 0.5), width: 3 } });
        out.push({ kind: 'flat', p: { len: 3, width: 3 } });
      } else {
        back();
        const t = turn ? -turn : (rnd() < 0.5 ? 1 : -1) * I(50, 90);
        turn += t;
        out.push({ kind: 'berm', p: { radius: R(6, 8), turn: t, wall: R(1.4, 1.9), inside: 1.2, angle: 55 } }, { kind: 'flat', p: { len: 3, width: 3 } });
      }
      // a jump straight after a jump: inRow in a row at most, then back to the ground
      if (out.length > 3 && out.slice(-2 * inRow).filter(p => p.kind === 'landing').length >= inRow) back();
    }
    back();
    out.push({ kind: 'flat', p: { len: 15, width: 2.8 } });
    return out;
  }
  // Practice line number lane of the set made from seed, as a line the AI can ride (null if a piece would not lay out).
  async function practiceLine(seed, lane, hard = 0) {
    const e = await engine();
    let s = (seed * 7919 + lane * 104729) % 2147483648 || 1;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const spec = practicePieces(rnd, hard);
    let r = { x: PRACTICE_LAND[2], z: 9000 + lane * 40, heading: 0, height: 0 };
    const pieces = [], raw = [], kinds = {};
    let spawn = null, n0 = 0;
    for (const h of spec) {
      const K = e.K[e.kidx[h.kind]], u = h.gap || 0;
      if (!K) return null;
      const f = { kind: h.kind, x: r.x + u * Math.cos(r.heading), z: r.z + u * Math.sin(r.heading), heading: r.heading, params: {} };
      for (const q of K.params) f.params[q.key] = h.p[q.key] !== undefined ? h.p[q.key] : q.default;
      if (h.carry && h.kind === 'flat') f.params.height = r.height;
      if (h.carry && h.kind === 'pump') f.params.start = r.height;
      if (h.carry && h.kind === 'landing') {
        const q = K.params.find(q => q.key === 'length');
        let a = q.min, b = q.max;
        for (let i = 0; i < 40; i++) {
          f.params.length = (a + b) / 2;
          const L = e.layout(f, FLAT_LAND), top = L && L.points && L.points[0] ? L.points[0][1] : 0;
          if (top - r.height - (h.step || 0) < 0) a = f.params.length; else b = f.params.length;
        }
        f.params.length = (a + b) / 2;
      }
      const lay = e.layout(f, FLAT_LAND);
      if (!lay || !lay.exit || !lay.path || lay.path.length < 2) return null;
      if (!spawn) spawn = lay.spawn || { x: lay.path[0][1], z: lay.path[0][2], heading: r.heading };
      // the end of a takeoff before a gap is in the air, as on the game's lines
      if (u > 0 && raw.length) raw[raw.length - 1][2] = 'air';
      for (const q of lay.path) raw.push([q[1], q[2], h.kind]);
      raw.push([lay.exit[0], lay.exit[1], h.kind]);
      if (!n0) n0 = raw.length;
      pieces.push(f); kinds[h.kind] = (kinds[h.kind] || 0) + 1;
      r = { x: lay.exit[0], z: lay.exit[1], heading: lay.exit[2], height: lay.exit[3] };
    }
    // the line starts where the bike stands on the start hill (its back is behind it)
    const ahead = q => (q[0] - spawn.x) * Math.cos(spawn.heading) + (q[1] - spawn.z) * Math.sin(spawn.heading) > 0.5;
    let k0 = 0;
    while (k0 < n0 && !ahead(raw[k0])) k0++;
    const { X, Z, KIND } = resample([[spawn.x, spawn.z, 'start']].concat(raw.slice(k0)), 0);
    return {
      start: { id: `practice-${seed}-${lane}`, x: spawn.x, z: spawn.z, heading: spawn.heading },
      X, Z, KIND, length: X.length, pieces, kinds, land: PRACTICE_LAND, practice: true,
    };
  }

  // ---------------------------------------------------------------- the game's Training drills
  // Opening a drill in the game's Training lays all its drills out in the physics, on a slope of their own, and puts the
  // spawn at the start of the one chosen (with the speed you start at, see trails_keep_spawn) with the tricks that
  // drill is about unlocked (none for the six basic drills). The AI reads the drill from there, as the game has it: its
  // pieces, its start, and from those and the tricks what the game asks for (DRILL_GOALS).
  async function trainingWorld() {
    if (!live.ex || !live.g) return null;
    const e = await engine(), ex = live.ex, sz = ex.trails_world_sizes(), FF = sz & 65535, HL = sz >>> 16 || 5;
    const p = ex.trails_world_flat(live.g, 0);
    // the trails lie on the game's own terrain (ground 2), the drills on a plain slope (ground 1)
    if (new Float64Array(ex.memory.buffer, p, HL)[1] !== 1) return null;
    const land = Array.from(new Float64Array(ex.memory.buffer, p + 8, 4)), pieces = [];
    for (let r = 0; r < 2000; r++) {
      const a = new Float64Array(ex.memory.buffer, p + (HL + r * FF) * 8, FF), K = e.K[a[1]];
      if (!(a[0] > 0) || a[0] % 1 || !K) break;
      const params = {};
      K.params.forEach((q, i) => { params[q.key] = a[5 + i]; });
      pieces.push({ kind: K.key, x: a[2], z: a[3], heading: a[4], params });
    }
    return pieces.length ? { land, pieces } : null;
  }
  // The drill open in the game now, as lines the AI can learn (two for Boost & racer, one for each way to ride it), or
  // an empty list when the game is not in Training. A pump track goes round: its line is two laps of it.
  async function drillsNow() {
    const sp = live.spawn, w = sp && await trainingWorld();
    if (!w) return [];
    const r = await buildRoute({ id: 'training', x: sp.x, z: sp.z, heading: sp.heading }, w.pieces, w.land);
    if (!r) return [];
    const k = r.kinds, jumps = k.takeoff || 0, mask = live.tricks || 0, N = r.length;
    const loop = N > 30 && Math.hypot(r.X[N - 1] - r.X[0], r.Z[N - 1] - r.Z[0]) < 8 && !!k.berm;
    let goals;
    if (mask) goals = [mask === 1 ? 'whip' : mask === 2 ? 'spin' : mask === 4 ? 'flip' : mask === 8 ? 'manual' : 'tricks'];
    else goals = loop ? ['laps'] : !jumps ? ['pumps'] : k.berm ? ['finish'] : jumps === 1 ? ['boost', 'racer'] : [jumps >= 4 ? 'clean4' : 'clean3'];
    let { X, Z, KIND } = r;
    if (loop) {
      X = Array.from(X); Z = Array.from(Z); KIND = Array.from(KIND);
      for (let i = 0; i < N + 15; i++) { X.push(r.X[i % N]); Z.push(r.Z[i % N]); KIND.push(r.KIND[i % N]); }
    }
    // Every landing on the line, as [where its deck starts, where its slope ends] in metres along the line, to the
    // centimetre: the Training judges a landing by where on it the wheels come down (see the landings in episode).
    const e = await engine(), along = (x, z) => {
      let bi = -1, bd = 1.5;
      for (let i = 0; i < X.length - 1; i++) {
        const dx = X[i + 1] - X[i], dz = Z[i + 1] - Z[i], t = clamp(((x - X[i]) * dx + (z - Z[i]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const d = Math.hypot(x - X[i] - dx * t, z - Z[i] - dz * t);
        if (d < bd) { bd = d; bi = i + t; }
      }
      return bi;
    };
    const lands = [];
    for (const p of r.pieces || []) {
      if (p.kind !== 'landing') continue;
      let lay = null;
      try { lay = e.layout(p, w.land); } catch { lay = null; }
      if (!lay || !lay.points || !lay.points.length) continue;
      const b = lay.points[lay.points.length - 1][0], a0 = along(p.x, p.z);
      const a1 = along(p.x + b * Math.cos(p.heading), p.z + b * Math.sin(p.heading));
      if (a0 >= 0 && a1 > a0) lands.push([+a0.toFixed(2), +a1.toFixed(2)]);
    }
    lands.sort((a, b) => a[0] - b[0]);
    return goals.map(goal => {
      const kind = goal.startsWith('clean') ? 'clean' : goal;
      const drill = { goal, kind, need: DRILL_GOALS[goal].need || (kind === 'clean' ? jumps : 1), pedals: DRILL_GOALS[goal].pedals !== false, tricks: mask };
      return {
        start: { id: `training-${goal}`, x: sp.x, z: sp.z, heading: sp.heading, v: sp.v },
        X, Z, KIND, length: X.length, pieces: r.pieces, kinds: k, land: w.land, practice: true, drill, lands,
      };
    });
  }

  // ---------------------------------------------------------------- the rider
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Moves the AI may try in the air: buttons to hold, plus an optional lean, steer or whip. The last six are done as
  // the game's Training teaches them: a 360 either way (SPIN_L, SPIN_R: the whip held from the bottom of the takeoff,
  // let go hr × 100° round), a backflip (FLIP: the pedals held up the takeoff and a pull pl metres before the lip, then
  // let it go round), a whip either way let go hr × 0.25 s after the lip (WHIP_L, WHIP_R: in time for the bike to come
  // back straight, a whip held down to the landing is landed crossed up) and a manual (MANUAL: on the ground, the front
  // wheel held up).
  const MOVES = [null, { b: 16 }, { b: 32 }, { b: 48 }, { b: 24 }, { b: 40 }, { b: 8 }, { b: 4, ln: -1 }, { b: 4, ln: 1 }, { w: 1 }, { w: -1 }, { b: 64, st: 1 }, { st: 1 }, { st: -1 }, { b: 8, st: 1 }, { b: 12, ln: -1 },
    { spin: -1 }, { spin: 1 }, { flip: 1 }, { wt: -1 }, { wt: 1 }, { man: 1 }];
  // when to pump through a dip, unless a plan has its own (P.pk): from 0.1 m past where it starts to 0.2 m past its end
  const PUMP0 = [0.1, 0.2];

  // The game's points for one jump, counted as the game counts them in trains (its only points): 100, plus 60 for a
  // buttery landing or 40 for a clean one, 300 for a flip, 100 per half turn of a spin of 360° or more, 100 for a whip.
  // A flat or cased landing gets 50 and ends the streak. All of it is multiplied by the streak of landings that were not
  // flat or cased, up to 5. grade is the game's word for the landing: 1 buttery, 2 clean, 3 sketchy, 4 flat, 5 cased.
  // tr: 1 flip, 2 spin, 4 whip.
  function gamePoints(grade, flip, spin, whip, streak) {
    const rough = grade >= 4, run = rough ? 0 : streak + 1, m = Math.max(1, Math.min(5, run));
    const a = Math.abs(spin || 0), turn = a >= 300 ? 180 * Math.floor((a + 60) / 180) : 0;
    const tr = (Math.abs(flip || 0) >= 270 ? 1 : 0) | (turn >= 360 ? 2 : 0) | (Math.abs(whip || 0) >= 45 ? 4 : 0);
    let p = rough ? 50 : 100 + (grade === 1 ? 60 : grade === 2 ? 40 : 0);
    if (tr & 1) p += 300;
    if (tr & 2) p += 100 * turn / 180;
    if (tr & 4) p += 100;
    return { p: p * m, m, streak: run, tr, turn };
  }
  const GRADE_NAMES = ['', 'Buttery', 'Clean', 'Sketchy', 'Flat', 'Cased'];
  // landings counted by grade (c[grade]), in words
  const gradeCount = c => c.map((n, g) => (g && n ? `${n} ${GRADE_NAMES[g]}` : '')).filter(Boolean).join(', ') || 'chưa có cú nhảy nào';
  const deg = r => Math.round(Math.abs(r) * 180 / Math.PI);
  // What a jump of the review (episode's jl) says to do: why a landing was not clean, or which trick its air allows
  // (fits: the trick book's summary, bookSummary).
  function landingTip(e, fits) {
    // a hop off a bump (well under a metre up) that the game still counts
    if (e.g >= 4 && e.h < 0.5) return 'Bị nảy khỏi mô rồi rơi xấu: qua đoạn này nên ép xe giữ bánh sát đất (pump) thay vì bay. Rơi xấu làm mất chuỗi nhân.';
    if (e.g === 5) return 'Bay hụt, chạm mép hoặc mặt bằng trước dốc đáp: cần lấy đà nhanh hơn. Cased làm mất chuỗi nhân.';
    if (e.g === 4) return 'Rơi xuống chỗ bằng: bay quá xa (hoặc không có dốc đáp). Flat làm mất chuỗi nhân.';
    if (e.g === 3) return e.dp < -0.12 ? `Chúc đầu ${deg(e.dp)}° so với dốc đáp: giữ đầu xe ngẩng hơn.` : e.dp > 0.12 ? `Ngẩng đầu ${deg(e.dp)}° so với dốc đáp: hạ đầu xe theo dốc.` : 'Chạm đất hơi mạnh: cần khớp dốc đáp hơn.';
    if (!e.tr) { const ok = fits.filter(f => e.a >= f.min).map(f => f.name); if (ok.length) return `Bay đủ lâu cho ${ok.join(' hoặc ')} (theo sổ tay trick).`; }
    return '';
  }
  const trickWords = (tr, turn) =>[tr & 1 ? 'Backflip' : '', tr & 2 ? `Spin ${turn}` : '', tr & 4 ? 'Whip' : ''].filter(Boolean).join(' + ');

  // Rides line R (points every metre, ground heights H, sections S) with plan P. step(state, tick) gives back the
  // controls [pedal, brake, steer, lean, pump, buttons, whip]. The same code rides in the training workers
  // (it is copied into them as text) and in the real game, so a learned plan rides the same in both.
  function makeRider(R, H, S, P) {
    const N = R.length;
    // rot: how far the bike has turned over backwards since it took off; let: the whip of a 360 let go
    const me = { idx: 0, sec: 0, airSec: 0, off: 0, landed: false, wasAir: false, prevP: null, rot: 0, let: false, inp: [0, 0, 0, 0, 0, 0, 0] };
    const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
    // the speed to hold: one for the section, or, when P.vs has a list for it, one for each equal part of the section
    const vAt = (k, i) => { const q = P.vs && P.vs[k]; return q && q.length ? q[Math.min(q.length - 1, Math.max(0, Math.floor((i - S[k].a) * q.length / (S[k].b - S[k].a + 1))))] : P.v[k]; };
    me.step = (s, t) => {
      const bx = s[0], by = s[1], bz = s[2], bh = s[3], sp = s[8], air = s[12] > 0;
      if (me.prevP === null) me.prevP = s[4];
      let bi = me.idx, bd = Infinity;
      for (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }
      me.idx = bi;
      while (me.sec < S.length - 1 && me.idx > S[me.sec].b) me.sec++;
      me.off = Math.sqrt(bd);
      // at: how far along the line the bike is, between its points (they are a metre apart)
      { const j = Math.min(N - 2, bi), dx = R.X[j + 1] - R.X[j], dz = R.Z[j + 1] - R.Z[j];
        me.at = j + clamp(((bx - R.X[j]) * dx + (bz - R.Z[j]) * dz) / (dx * dx + dz * dz || 1), -0.5, 1.5); }
      if (air && !me.wasAir) {
        me.airSec = me.sec; me.rot = 0; me.let = false;
        // off a lip just passed (3 m or less behind) the jump is that lip's, even when the section after it ends at a lip
        // too. Plans learned before this (P.as not set) keep the old way: their angles were learned for those sections.
        const k0 = me.sec - 1;
        if (P.as && k0 >= 0 && S[k0].jump && S[k0].b >= me.idx - 3 && !(S[me.sec].jump && S[me.sec].b <= me.idx + 2)) me.airSec = k0;
        else for (let k = me.sec; k >= 0 && k >= me.sec - 1; k--) if (S[k].jump) { me.airSec = k; break; }
      }
      me.landed = !air && me.wasAir;
      me.wasAir = air;
      if (t % 2 === 0) {
        const a1 = look(3 + Math.abs(sp) * 0.35), a2 = look(10 + Math.abs(sp) * 0.6);
        const e1 = wrapA(Math.atan2(R.Z[a1] - bz, R.X[a1] - bx) - bh), e2 = wrapA(Math.atan2(R.Z[a2] - bz, R.X[a2] - bx) - bh);
        let st = air ? 0 : clamp(2.2 * e1 + 0.6 * e2, -1, 1), pedal = 0, brake = 0, lean = 0, btn = 0, whip = 0, pump = 0;
        const sec = me.sec, idx = me.idx;
        if (!air) {
          // hold the planned speed; ease off the pedals on steep drops (full power there throws you over the bars)
          const e = vAt(sec, idx) - sp, pm = s[4] < -0.15 ? 0.4 : 1;
          if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4) brake = Math.min(1, -e * 0.5);
          if (P.pl && P.pl[sec] > 0 && R.KIND[idx] === 'takeoff' && idx >= S[sec].b - P.pl[sec]) btn |= 1;
          // Pump, as hard as the section says. A plan with pz pumps through the dips as the game's Training teaches (the
          // zones R.PZ: from pk[0] m past where one starts to pk[1] m past where it ends); older plans where the ground
          // 1 to 3 m ahead falls away. Not on the start hill: there the real game throws you off where the simulation
          // does not.
          if (P.pu && P.pu[sec] > 0 && R.KIND[idx] !== 'start') {
            if (P.pz && R.PZ) { const pk = P.pk || PUMP0, u = me.at; if (R.PZ.some(z => u >= z[0] + pk[0] && u <= z[1] + pk[1])) pump = P.pu[sec]; }
            else if ((H[look(1)] - H[look(3)]) / 2 > 0.03) pump = P.pu[sec];
          }
          // tricks that start on the ground: a 360 is wound up with the whip held up the takeoff, a backflip popped
          // with the pedals held up it; a manual pulls while the front drops and lets go as it rises past the balance
          const gm = MOVES[P.mv[sec] | 0];
          if (gm && R.KIND[idx] === 'takeoff') { if (gm.spin) whip = gm.spin; if (gm.flip) { pedal = 1; brake = 0; } }
          if (gm && gm.man && R.KIND[idx] !== 'takeoff' && !(s[46] > 0 && s[47] >= 0)) btn |= 1;
        } else {
          // keep the bike at the planned angle for the landing, unless a trick needs the lean
          const dp = wrapA(s[4] - me.prevP) * 30;
          me.rot += wrapA(s[4] - me.prevP);
          lean = clamp(2.2 * (s[4] - P.pt[me.airSec]) + 0.35 * dp, -1, 1);
          const mv = MOVES[P.mv[me.airSec] | 0];
          if (mv && mv.spin) {
            // hold the whip until the bike is hr × 100° round, and leave its angle alone while it turns
            const a = Math.abs(s[48]);
            if (a >= P.hr[me.airSec] * 100) me.let = true;
            if (!me.let) whip = mv.spin;
            if (a > 5 && a < 320) lean = 0;
          } else if (mv && mv.flip) {
            // let it go over, then bring it to the landing angle
            if (me.rot > -0.6 && me.rot < 5) lean = 0;
          } else if (mv && mv.wt) {
            if (s[12] < P.hr[me.airSec] * 0.25) whip = mv.wt;
          } else if (mv && !mv.man) {
            const gnd = Math.max(H[look(3)], H[look(8)]);
            if (s[12] > 0.1 && by - gnd > P.hr[me.airSec]) { btn = mv.b || 0; if (mv.ln !== undefined) lean = mv.ln; if (mv.st) st = mv.st; if (mv.w) whip = mv.w; }
          }
        }
        me.prevP = s[4];
        me.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, Math.round(whip * 127)];
        // what the plan asks for here, in the brain's terms (for the brain to learn from lessons)
        me.want = air ? [0, 0, 0, P.pt[me.airSec], 1] : [vAt(sec, idx), btn & 1, pump, 0, 0];
      }
      return me.inp;
    };
    return me;
  }

  // The brain: a small neural network that rides any line from what it sees, instead of a plan learned for one line.
  // Every other step it looks at the bike (speed, pitch and how fast it turns, in the air or not, rising or falling,
  // height above the ground) and the ground 2 to 33 m ahead, and sets the speed to hold, whether to pull up, how hard
  // to pump and the angle to hold in the air. Steering stays the fixed controller's. Weights w: 22 inputs to 16 hidden
  // (tanh), then 4 outputs (tanh) with a bias each. All-zero outputs ride like a fresh plan: 8 m/s, land on the slope.
  const BRAIN = { inp: 22, hid: 16, out: 4 };
  BRAIN.size = BRAIN.inp * BRAIN.hid + BRAIN.hid * BRAIN.out + BRAIN.out;
  // The speed output o (-1 to 1) asks for 2 to 18 m/s, 8 at 0; the air output, up to 0.8 rad off the landing slope.
  // (The first brains could only ask for 3 to 13 m/s and 0.4 rad, and a fifth of the jumps learned on lines need more.)
  const brainSpeed = o => 8 + (o > 0 ? 10 : 6) * o, speedOut = v => (v > 8 ? (v - 8) / 10 : (v - 8) / 6), BRAIN_TILT = 0.8;
  function makeBrainRider(R, H, w) {
    const N = R.length, NI = 22, NH = 16, NO = 4, AHEAD = [2, 4, 6, 8, 11, 14, 18, 22, 27, 33];
    let nextTake = R.nextTake, nextLand = R.nextLand;
    if (!nextTake) {
      nextTake = new Int32Array(N).fill(-1); nextLand = new Int32Array(N).fill(-1);
      let a = -1, b = -1;
      for (let i = N - 1; i >= 0; i--) { if (R.KIND[i] === 'takeoff') a = i; if (R.KIND[i] === 'landing') b = i; nextTake[i] = a; nextLand[i] = b; }
    }
    const me = { idx: 0, sec: 0, airSec: 0, off: 0, landed: false, wasAir: false, prevP: null, prevY: null, vy: 0, landPt: 0, inp: [0, 0, 0, 0, 0, 0, 0] };
    const x = new Float64Array(NI), h = new Float64Array(NH), o = new Float64Array(NO), W2 = NI * NH, B2 = W2 + NH * NO;
    const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
    // the slope to land on for a jump whose lip is at i
    const landSlope = i => { const nl = nextLand[i]; const j = nl >= 0 && nl - i < 45 ? nl : Math.min(N - 5, i + 12); return clamp(Math.atan2(H[Math.min(N - 1, j + 4)] - H[j], 4), -0.7, 0.2); };
    me.step = (s, t) => {
      const bx = s[0], by = s[1], bz = s[2], bh = s[3], sp = s[8], air = s[12] > 0;
      if (me.prevP === null) { me.prevP = s[4]; me.prevY = by; }
      me.vy = (by - me.prevY) * 60; me.prevY = by;
      let bi = me.idx, bd = Infinity;
      for (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }
      me.idx = bi;
      me.off = Math.sqrt(bd);
      if (air && !me.wasAir) me.landPt = landSlope(me.idx);
      me.landed = !air && me.wasAir;
      me.wasAir = air;
      if (t % 2 === 0) {
        const a1 = look(3 + Math.abs(sp) * 0.35), a2 = look(10 + Math.abs(sp) * 0.6);
        const e1 = wrapA(Math.atan2(R.Z[a1] - bz, R.X[a1] - bx) - bh), e2 = wrapA(Math.atan2(R.Z[a2] - bz, R.X[a2] - bx) - bh);
        let st = air ? 0 : clamp(2.2 * e1 + 0.6 * e2, -1, 1), pedal = 0, brake = 0, lean = 0, btn = 0, pump = 0;
        const dp = (s[4] - me.prevP) * 30, idx = me.idx, gy = H[idx], nt = nextTake[idx];
        // what the brain sees, each number roughly between -1 and 1
        x[0] = sp / 10; x[1] = s[4]; x[2] = clamp(dp / 3, -3, 3); x[3] = air ? 1 : 0; x[4] = clamp(me.vy / 5, -3, 3); x[5] = clamp((by - gy) / 3, -2, 3);
        for (let k = 0; k < 10; k++) x[6 + k] = clamp((H[look(AHEAD[k])] - gy) / 3, -3, 3);
        x[16] = nt < 0 ? 1 : Math.min(1, (nt - idx) / 30);
        x[17] = air ? me.landPt : nt >= 0 ? landSlope(nt) : 0;
        x[18] = R.KIND[idx] === 'takeoff' ? 1 : 0; x[19] = R.KIND[idx] === 'landing' ? 1 : 0; x[20] = R.KIND[idx] === 'pump' ? 1 : 0; x[21] = 1;
        // without weights the brain only watches (while a lesson's plan rides, to learn from it)
        if (!w) { me.prevP = s[4]; me.seen = true; return me.inp; }
        me.seen = false;
        for (let j = 0; j < NH; j++) { let a = 0; for (let i = 0; i < NI; i++) a += x[i] * w[i * NH + j]; h[j] = Math.tanh(a); }
        for (let k = 0; k < NO; k++) { let a = w[B2 + k]; for (let j = 0; j < NH; j++) a += h[j] * w[W2 + j * NO + k]; o[k] = Math.tanh(a); }
        if (!air) {
          const e = brainSpeed(o[0]) - sp, pm = s[4] < -0.15 ? 0.4 : 1;
          if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4) brake = Math.min(1, -e * 0.5);
          if (o[1] > 0.5) btn |= 1;
          if (o[2] > 0) pump = o[2];
        } else lean = clamp(2.2 * (s[4] - (me.landPt + BRAIN_TILT * o[3])) + 0.35 * dp, -1, 1);
        me.prevP = s[4];
        me.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, 0];
      }
      return me.inp;
    };
    me.x = x; me.o = o;
    return me;
  }
  // Teach brain w to do what the plans did (rows from watchPlan: 22 seen, 5 asked for, landing slope). Each output is
  // fitted before its tanh, only where it means something: speed, pull and pump on the ground, the air angle in the
  // air. Pull is rare, so its rows count more. Returns new weights; w is not changed.
  async function fitBrain(w, rows, epochs = 40) {
    const NI = BRAIN.inp, NH = BRAIN.hid, NO = BRAIN.out, W2 = NI * NH, B2 = W2 + NH * NO, RW = 28, n = rows.length / RW | 0;
    const at = v => Math.atanh(clamp(v, -0.95, 0.95));
    const T = new Float64Array(n * NO), M = new Float64Array(n * NO);
    let pulls = 0;
    for (let r = 0; r < n; r++) if (!(rows[r * RW + NI + 4] > 0) && rows[r * RW + NI + 1] > 0) pulls++;
    const pullW = clamp((n - pulls) / Math.max(1, pulls) / 4, 1, 8);
    for (let r = 0; r < n; r++) {
      const q = r * RW + NI, air = rows[q + 4] > 0;
      if (air) { T[r * NO + 3] = at((rows[q + 3] - rows[q + 5]) / BRAIN_TILT); M[r * NO + 3] = 1; continue; }
      T[r * NO] = at(speedOut(rows[q])); M[r * NO] = 1;
      T[r * NO + 1] = rows[q + 1] > 0 ? 1.2 : -1.2; M[r * NO + 1] = rows[q + 1] > 0 ? pullW : 1;
      T[r * NO + 2] = rows[q + 2] > 0 ? at(rows[q + 2]) : -1; M[r * NO + 2] = 1;
    }
    const p = w.slice(), m = new Float64Array(p.length), v = new Float64Array(p.length), g = new Float64Array(p.length);
    const h = new Float64Array(NH), dh = new Float64Array(NH), d = new Float64Array(NO), order = Array.from({ length: n }, (_, i) => i);
    const LR = 0.005, BATCH = 64;
    let t = 0;
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; }
      for (let b0 = 0; b0 < n; b0 += BATCH) {
        g.fill(0);
        const b1 = Math.min(n, b0 + BATCH);
        for (let bi = b0; bi < b1; bi++) {
          const r = order[bi], x0 = r * RW;
          for (let j = 0; j < NH; j++) { let a = 0; for (let i = 0; i < NI; i++) a += rows[x0 + i] * p[i * NH + j]; h[j] = Math.tanh(a); }
          dh.fill(0);
          for (let k = 0; k < NO; k++) {
            const mk = M[r * NO + k];
            if (!mk) { d[k] = 0; continue; }
            let a = p[B2 + k]; for (let j = 0; j < NH; j++) a += h[j] * p[W2 + j * NO + k];
            d[k] = mk * (a - T[r * NO + k]);
            g[B2 + k] += d[k];
            for (let j = 0; j < NH; j++) { g[W2 + j * NO + k] += d[k] * h[j]; dh[j] += d[k] * p[W2 + j * NO + k]; }
          }
          for (let j = 0; j < NH; j++) { const dz = dh[j] * (1 - h[j] * h[j]); if (dz) for (let i = 0; i < NI; i++) g[i * NH + j] += dz * rows[x0 + i]; }
        }
        t++;
        const nb = b1 - b0;
        for (let i = 0; i < p.length; i++) {
          const gi = g[i] / nb;
          m[i] = 0.9 * m[i] + 0.1 * gi; v[i] = 0.999 * v[i] + 0.001 * gi * gi;
          p[i] -= LR * (m[i] / (1 - 0.9 ** t)) / (Math.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8);
        }
      }
      await new Promise(r => setTimeout(r, 0));
    }
    return p;
  }
  // A new brain: hidden weights from a fixed random draw, outputs all zero.
  function freshBrain() {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const w = new Array(BRAIN.size).fill(0);
    for (let i = 0; i < BRAIN.inp * BRAIN.hid; i++) { const u = rnd() || 1e-9, v = rnd(); w[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.6; }
    return w;
  }

  // ---------------------------------------------------------------- worker
  const workerSrc = `
'use strict';
let l,SL,K,kidx,FF,fmt;
// a worker can hold several lines, each in its own game; g, R, H and S are those of the line being ridden
let g,R,H,S=null;const lines=[];
function use(i){({g,R,H,S}=lines[i]);}
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
function state(){const p=l.trails_game_state(g);return new Float64Array(l.memory.buffer,p,SL);}
async function init(m){
  const {instance}=await WebAssembly.instantiate(m.wasm,{});
  l=instance.exports;
  m.land.forEach((b,i)=>{const n=l.trails_alloc(b.byteLength);new Uint8Array(l.memory.buffer,n,b.byteLength).set(new Uint8Array(b));if(!l.trails_land_data(i,n,b.byteLength))throw new Error('land '+i)});
  g=l.trails_game_new(1);SL=l.trails_state_len();
  const txt=n=>{const b=l.trails_buf(g);return new TextDecoder().decode(new Uint8Array(l.memory.buffer,b,n))};
  K=JSON.parse(txt(l.trails_kinds_json(g)));kidx=Object.fromEntries(K.map((k,i)=>[k.key,i]));
  FF=l.trails_world_sizes()&65535;const wp=l.trails_world_flat(g,1);fmt=new Float64Array(l.memory.buffer,wp,1)[0];
  (m.routes||[m.route]).forEach((route,i)=>{if(i)g=l.trails_game_new(1);addLine(route,m.setup)});
}
function addLine(route,setup){
  R=route;
  // the route starts at the first piece after the start hill: add a straight run-in from the spawn
  {const d=Math.hypot(R.X[0]-R.start.x,R.Z[0]-R.start.z),n=Math.floor(d);
    if(n>=2){const X=[],Z=[],KI=[];for(let i=0;i<n;i++){const f=i/d;X.push(R.start.x+(R.X[0]-R.start.x)*f);Z.push(R.start.z+(R.Z[0]-R.start.z)*f);KI.push('start')}
      R.X=X.concat(Array.from(R.X));R.Z=Z.concat(Array.from(R.Z));R.KIND=KI.concat(Array.from(R.KIND));R.length=R.X.length;
      if(R.lands)R.lands=R.lands.map(q=>[q[0]+n,q[1]+n])}}
  // the game's terrain, or the ground of a practice line (R.land)
  const arr=[fmt,...(R.land||[2,0,0,0])];let n=0;
  for(const f of R.pieces){const ki=kidx[f.kind];if(ki===undefined)continue;n++;
    const p=K[ki].params.map(q=>{const v=f.params&&f.params[q.key];return Math.min(q.max,Math.max(q.min,v!==undefined?v:q.default))});
    arr.push(n,ki,f.x,f.z,f.heading);for(let h=0;h<FF-5;h++)arr.push(h<p.length?p[h]:0)}
  const h=arr.length*8+8,c=l.trails_alloc(h),d=c+7&-8;new Float64Array(l.memory.buffer,d,arr.length).set(arr);
  l.trails_draft(g,d,arr.length);l.trails_dealloc(c,h);l.trails_draft_apply(g);
  // ride with your setup from the game: unlocked tricks, bike, tunes
  const su=setup||{tricks:511,bike:0,tunes:{}};
  if(su.bike)l.trails_bike_select(g,su.bike);
  for(const [i,v] of Object.entries(su.tunes||{}))l.trails_tune(g,+i,v);
  l.trails_set_tricks(g,su.tricks);
  H=new Float64Array(R.length);for(let i=0;i<R.length;i++)H[i]=l.trails_draft_height(g,R.X[i],R.Z[i]);
  R.nextTake=new Int32Array(R.length).fill(-1);R.nextLand=new Int32Array(R.length).fill(-1);
  let t=-1,ld=-1;for(let i=R.length-1;i>=0;i--){if(R.KIND[i]==='takeoff')t=i;if(R.KIND[i]==='landing')ld=i;R.nextTake[i]=t;R.nextLand[i]=ld}
  S=sections();
  R.PZ=pumpZones();
  lines.push({g,R,H,S});
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TP={flip:300,spin:200,table:80,tailwhip:150,barspin:120,tbog:80,xup:60};
const MOVES=${JSON.stringify(MOVES)},PUMP0=${JSON.stringify(PUMP0)};
const brainSpeed=${brainSpeed.toString()},BRAIN_TILT=${BRAIN_TILT};
${makeRider.toString()}
${makeBrainRider.toString()}
${gamePoints.toString()}
// Cut the line into sections: one ends at every takeoff lip, the others every 40 m.
// A jump section also gets the jump's shape (f), so what was learned on a similar jump of another line can be borrowed:
// lip angle, ramp height, the ground 3, 6, 9, 12 and 16 m past the lip (gap and landing) and the slope of the run-up.
function sections(){
  const N=R.length,out=[];let a=0;
  const isT=i=>i<N&&R.KIND[i]==='takeoff';
  const at=k=>H[clamp(k,0,N-1)];
  for(let i=0;i<N;i++){
    const lip=isT(i)&&!isT(i+1);
    if(lip||i-a>=40||i===N-1){
      let pt=0,f=null;
      if(lip){const nl=R.nextLand[i];const j=nl>=0&&nl-i<45?nl:Math.min(N-5,i+12);pt=clamp(Math.atan2(H[Math.min(N-1,j+4)]-H[j],4),-0.7,0.2);
        let lo=H[i];for(let k=Math.max(0,i-15);k<i;k++)lo=Math.min(lo,H[k]);
        f=[Math.atan2(at(i)-at(i-3),3),H[i]-lo].concat([3,6,9,12,16].map(d=>at(i+d)-H[i]),[(at(i-5)-at(i-25))/20]).map(v=>+v.toFixed(3))}
      const sec={a,b:i,jump:lip,pt:+pt.toFixed(3)};if(f)sec.f=f;
      out.push(sec);a=i+1}
  }
  return out;
}
// Where the game's Training says to pump (its green): where the ground bends up (a dip: over ±0.5 m it curves more
// than 0.06), at least 0.8 m long, not on a takeoff (from 0.3 m before it to 1.5 m past its lip) and not a dip just
// before one (2.5 m or less from it, a takeoff's run-in: there you pull). Each zone is [from, to, its lowest point], in
// metres along the line, found every 5 cm as the game does.
function pumpZones(){
  const N=R.length,st=0.05,n=Math.floor((N-1)/st)+1,h=new Float64Array(n),e=10;
  for(let i=0;i<n;i++){const u=i*st,j=Math.min(N-2,Math.floor(u)),f=u-j;h[i]=l.trails_draft_height(g,R.X[j]+(R.X[j+1]-R.X[j])*f,R.Z[j]+(R.Z[j+1]-R.Z[j])*f)}
  const tk=[];
  for(let i=0;i<N;i++)if(R.KIND[i]==='takeoff'&&(i===0||R.KIND[i-1]!=='takeoff')){let b=i;while(b+1<N&&R.KIND[b+1]==='takeoff')b++;tk.push([i,b+1])}
  const near=u=>tk.some(q=>u>=q[0]-0.3&&u<=q[1]+1.5),out=[];
  let a=-1;
  for(let i=0;i<n;i++){
    const c=(h[Math.max(0,i-e)]-2*h[i]+h[Math.min(n-1,i+e)])/0.25>0.06&&!near(i*st);
    if(c&&a<0)a=i;
    if((!c||i===n-1)&&a>=0){
      if((i-a)*st>=0.8){let p=a;for(let m=a;m<=i;m++)if(h[m]<h[p])p=m;const z=[a*st,i*st,p*st].map(v=>+v.toFixed(2));if(!tk.some(q=>q[0]-z[1]<2.5&&q[0]>z[2]))out.push(z)}
      a=-1}
  }
  return out;
}
// The game's coach: [pumps so far, speed the last one gave (m/s), ...] (older games have none)
const coach=()=>l.trails_coach?new Float64Array(l.memory.buffer,l.trails_coach(g),9):null;
// One ride of the line with plan P (or the brain opt.brain). Returns how far it got, the points and why it ended.
// A Training drill starts at its own speed, and some drills take the pedals away (the game zeroes them)
function spawn(){l.trails_set_spawn_at(g,R.start.x,R.start.z,R.start.heading,R.start.v||0);l.trails_game_reset(g)}
const noPedals=inp=>{if(R.drill&&!R.drill.pedals)inp[0]=0;return inp};
// How much of what a Training drill asks for one ride got (see DRILL_GOALS): manual is the longest manual in ticks.
// A trick counts when it came off a real jump, was not landed flat or cased, and the ride went on to the end (the game
// wants you to ride away from it). So on a trick drill the AI first learns to ride the drill to the end, as on any
// line, and then puts the tricks in, a ride with one more of them counting over one with fewer. The Trick line wants
// one trick off each jump: a jump counts for one of its tricks only (kinds: how many of flip, spin and whip the jumps
// give, each jump used once), and each of them counts before the end too, so the AI learns them one by one.
function trickKinds(js){
  let best=0;
  const go=(i,got)=>{ if(i===js.length){ let n=0; for(const b of [1,2,4]) if(got&b) n++; if(n>best) best=n; return; }
    go(i+1,got); for(const b of [1,2,4]) if((js[i].tr&b)&&!(got&b)) go(i+1,got|b); };
  go(0,0);
  return best;
}
// A jump is judged by its first landing: a bounce after a cased landing is no landing of its own.
function drillGoal(D,end,v,jl,manual,pumps,nl){
  const fin=end==='về đích',seen=new Set(),big=jl.filter(e=>e.a>0.4&&!seen.has(e.k)&&seen.add(e.k)),ok=e=>e.g>0&&e.g<=2&&e.spot!==false;
  const did=b=>big.filter(e=>(e.tr&b)&&e.g<=3).length,tr=n=>fin?Math.min(D.need,n):0;
  const kinds=()=>trickKinds(big.filter(e=>e.tr&&e.g<=3));
  // the jumps of Jumping and Pump & pull are learned in order: the clean landings in a row from the first, and a
  // tenth for each clean one after (so a ride that lands the first jump right counts, even if the next ones go worse).
  // With the drill's landings known (nl of them) each is judged by the first landing on it, and a jump not flown at
  // all (a hop onto its table) counts as missed: else skipping a hard first jump looks better than trying it.
  // A clean landing at the edge of the game's limits (impact near 5, the bike well off the slope) came down sketchy
  // in a real ride: there a clean one needs some to spare, a buttery one has it.
  const safe=e=>ok(e)&&(e.g===1||(e.imp<4.5&&e.mis<12));
  const on=nl?Array.from({length:nl},(_,j)=>jl.find(e=>e.li===j)||null):big,okAt=e=>!!e&&(nl?safe(e):ok(e));
  let first=0;while(first<on.length&&okAt(on[first]))first++;
  const have={pumps,laps:fin?1:0,finish:fin?1:0,clean:first+0.1*on.slice(first).filter(okAt).length,
    // a boost comes down from high up, never softly: the game counts it landed clean, or hard (impact under 6.5, not
    // the engine's grade) on the landing's sweet spot with the bike within 12° of the slope. Real rides came out as
    // high and as hard as the simulation's; some to spare on both all the same (0.97 m up / 0.86 m at most).
    boost:big.filter(e=>ok(e)&&e.mis<12&&e.imp<6&&e.h>=1.02).length,racer:big.filter(e=>safe(e)&&e.h<=0.8).length,manual:Math.min(2,manual/60),
    whip:tr(did(4)),spin:tr(did(2)),flip:tr(did(1)),
    tricks:kinds()+(manual>=120?1:0)+(fin?1:0)}[D.kind]||0;
  return {n:+Math.min(D.need,have).toFixed(2),need:D.need};
}
function episode(P,opt){
  opt=opt||{};const rec=opt.rec,until=opt.until||1e9;
  spawn();
  let s=state();
  const N=R.length;let idx=0,prog=0,pts=0,seq=s[16],stall=0,t=0,crash=0,end='hết giờ';
  const maxT=Math.min(18000,Math.round(N/2.5*60)+600);
  const rider=opt.brain?makeBrainRider(R,H,opt.brain):makeRider(R,H,S,P);
  // the speed when the bike first got to each point
  const vr=new Float32Array(N);
  // with rec: every other tick [distance along the line, height, pitch, in air, speed], plus trick and crash events
  const tr=rec?[]:null,ev=rec?[]:null;
  const tricks={};let pending=null,manualM=0,landT=-1e9,jumps=0,landAt=-1,lastJ=-1,progAt=0,progT=0;
  // every jump the game counts (it grades the landing), with the game's own points for it (gamePoints) and the streak
  const jl=[];let game=0,streak=0,airP=0,manRun=0,manBest=0;
  // pumps judged as the game's Training judges them: a push (pump held on the ground) is good when it starts no more than
  // 0.8 m before a zone and no later than 0.2 m past its lowest point, goes on to 0.2 m before that point or further,
  // ends no more than 0.8 m past the zone, and the game's coach says it gave 0.3 km/h or more. pumpGain: what all the
  // pushes gave, m/s. A push ends 0.45 s after it is let go, or when the coach has counted it.
  const PZ=R.PZ||[],zoneAt=u=>PZ.find(z=>u>=z[0]-1.2&&u<=z[1]+0.3)||null,c0=coach();
  let push=null,goodPumps=0,pumpGain=0,seenPump=c0?c0[0]:0;
  // the landings: [deck, bottom] of each, exact on a drill (R.lands), else its first and last point
  const LS=R.lands?R.lands:[];if(!R.lands)for(let i=0;i<N;i++)if(R.KIND[i]==='landing'){if(LS.length&&LS[LS.length-1][1]===i-1)LS[LS.length-1][1]=i;else LS.push([i,i])}
  const newPush=u=>({from:u,to:u,z:zoneAt(u),since:null,kmh:null});
  for(t=0;t<maxT;t++){
    const air=s[12]>0;
    const inp=noPedals(rider.step(s,t));
    if(PZ.length){const u=rider.at,c=!(s[12]>0.12)&&inp[4]>25&&!(inp[5]&1);
      if(c&&!push)push=newPush(u);
      if(push){if(c&&push.since===null)push.to=u;else if(push.since===null)push.since=0;else push.since++;if(c&&push.since!==null)push.since=27}
      const q=coach();if(q&&q[0]!==seenPump){seenPump=q[0];pumpGain+=q[1];if(push)push.kmh=q[1]*3.6}
      if(push&&push.since!==null&&(push.since>=27||push.kmh!==null)){const z=push.z;
        if(z&&push.from>=z[0]-0.8&&push.from<=z[2]+0.2&&push.to<=z[1]+0.8&&push.to>=z[2]-0.2&&!(push.kmh!==null&&push.kmh<0.3))goodPumps++;
        push=c?newPush(u):null}}
    idx=rider.idx;if(idx>prog){for(let i=prog+1;i<=idx;i++)vr[i]=Math.abs(s[8]);prog=idx}
    if(rider.off>7&&!air){end='lạc khỏi đường';pts-=20;break}
    if(idx>=N-3){end='về đích';pts+=150;break}
    if(idx>=until){end='đạt mốc';break}
    if(rider.landed){landT=t;if(s[14]>0.3)landAt=t}
    if(landAt>=0&&t-landAt>=45){if(idx>lastJ+3){pts+=15;jumps++;lastJ=idx}landAt=-1}
    if(prog>progAt){progAt=prog;progT=t}else if(t-progT>480){end='kẹt';pts-=25;break}
    l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);
    s=state();
    if(rec&&t%2===0){const j=Math.min(N-2,idx),dx=R.X[j+1]-R.X[j],dz=R.Z[j+1]-R.Z[j];
      const f=clamp(((s[0]-R.X[j])*dx+(s[2]-R.Z[j])*dz)/(dx*dx+dz*dz||1),-0.5,1.5);
      tr.push(+(j+f).toFixed(2),+s[1].toFixed(2),+s[4].toFixed(3),s[12]>0?1:0,+Math.abs(s[8]).toFixed(1))}
    if(s[13]>0){crash=s[13];end='ngã';pts-=25;pending=null;if(rec)ev.push({t,crash});break}
    if(s[12]>0)airP=s[4];
    if(s[16]!==seq){seq=s[16];
      const got={};const fl=Math.abs(s[44]||0),spn=Math.abs(s[43]||0),wh=Math.abs(s[41]||0),tb=s[56]||0;
      if(fl>=270)got.flip=Math.round(fl/360)||1;
      if(spn>=300)got.spin=Math.max(1,Math.round(spn/360));
      if(wh>=45)got.whip=wh;
      if(tb&16)got.table=1;if(tb&32)got.tailwhip=Math.max(1,s[57]|0);if(tb&64)got.barspin=Math.max(1,s[58]|0);if(tb&128)got.tbog=1;if(tb&256)got.xup=1;
      if(Object.keys(got).length)pending={got,t};
      const gr=s[15]|0;
      if(gr>0){const k=rider.airSec,gp=gamePoints(gr,s[44],s[43],s[41],streak),i=Math.min(N-3,Math.max(2,idx));
        streak=gp.streak;game+=gp.p;
        // the bike's pitch just before it came down less the slope of the ground there (above 0: nose too high)
        const dp=airP-Math.atan2(H[i+2]-H[i-2],4);
        // where on the landing the wheels came down, as the game's Training judges it: the back wheel past the knuckle
        // (0.8 m down the landing and 0.2 more) and the front no more than 1 m past its bottom, else short or overshot
        // (the wheels about half a metre either side of the bike; a metre to spare at the knuckle: real rides came down
        // up to a metre shorter than the simulation's, 0.3 m at the bottom)
        const rw=rider.at-0.45,fw=rider.at+0.55,ls=LS.find(q=>rw>=q[0]-4&&rw<=q[1]+3),spot=!!ls&&rw>=ls[0]+2&&(rw<=ls[1]-1.5||fw<=ls[1]+0.7);
        jl.push({k,i:idx,spot,li:R.lands&&ls?LS.indexOf(ls):-1,u:ls?+(rw-ls[0]).toFixed(2):null,a:+s[14].toFixed(2),h:+s[20].toFixed(2),d:+s[21].toFixed(1),g:gr,dp:+dp.toFixed(3),mis:+(s[22]||0).toFixed(3),imp:+s[23].toFixed(2),tr:gp.tr,sp:gp.turn,p:gp.p,m:gp.m,mv:P&&P.mv?P.mv[k]|0:0});
        if(rec)ev.push({t,land:gr,tr:gp.tr,sp:gp.turn,p:gp.p,m:gp.m})}
    }
    if(pending&&t-pending.t>=30){const k=Object.keys(pending.got);let p=0;for(const n of k){p+=n==='whip'?pending.got[n]:TP[n]*pending.got[n];tricks[n]=(tricks[n]||0)+(n==='whip'?1:pending.got[n])}
      p*=1+0.5*(k.length-1);pts+=p;if(rec)ev.push({t:pending.t,got:pending.got,p:Math.round(p)});pending=null}
    if(s[46]>0&&!(s[12]>0)){const m=Math.abs(s[8])/60;manualM+=m;pts+=m*10;if(++manRun>manBest)manBest=manRun}else manRun=0;
    if(Math.abs(s[8])<0.6&&!(s[12]>0)){if(++stall>150){end='đứng lại';pts-=25;break}}else stall=0;
  }
  if(manualM>=2)tricks.manual=Math.round(manualM);
  const sec=rider.sec,crashSec=crash?(s[12]>0||t-landT<60?rider.airSec:sec):sec;
  // Of two rides that end at the same place, the one that came at it faster counts a little more (at most 1 m): it got
  // closer to making it. Without this every try that fails at a steep ramp scores the same, and learning has nothing
  // to go by there.
  const pace=0.05*Math.min(20,vr[Math.max(0,prog-5)]);
  // vEnd: the speed at the end; vAvg: the mean speed along the line (m/s)
  const vEnd=+Math.abs(s[8]).toFixed(2),vAvg=+(prog/Math.max(1,t)*60).toFixed(2);
  const res={fit:prog+pts+pace,prog,pts:Math.round(pts),crash,end,tricks,ticks:t,sec,crashSec,jumps,game,jl,vEnd,vAvg,goodPumps,pumpGain:+pumpGain.toFixed(2)};
  if(R.drill)res.goal=drillGoal(R.drill,end,Math.abs(s[8]),jl,manBest,goodPumps,R.lands&&R.drill.kind==='clean'?R.lands.length:0);
  if(rec)res.trace={tr,ev,H:Array.from(H,h=>+h.toFixed(2))};
  return res;
}
// A lesson's plan rides the line while a brain without weights watches. Every other step: what the brain sees (22),
// what the plan asks for (speed, pull, pump, angle in the air, in the air) and the slope the brain would land on.
// The last second before a fall is left out: that is no example to follow.
// With brain w, the brain rides instead and the plan only says what it would do: so the brain also learns what to do
// where its own mistakes take it, places the plan never went.
function watchPlan(P,until,w){
  spawn();
  // the line here may be cut short: keep the plan's first sections, fresh values past its end
  const D={v:()=>8,pt:i=>S[i].pt,mv:()=>0,hr:()=>1.5,pl:()=>0,pu:()=>0},Q={};
  for(const k in D)Q[k]=S.map((_,i)=>P[k]&&typeof P[k][i]==='number'?P[k][i]:D[k](i));
  if(P.vs)Q.vs=S.map((_,i)=>Array.isArray(P.vs[i])?P.vs[i]:null);
  for(const k of ['as','pz','pk'])if(P[k]!==undefined)Q[k]=P[k];
  let s=state();const N=R.length,rider=makeRider(R,H,S,Q),eye=makeBrainRider(R,H,null),me=w?makeBrainRider(R,H,w):null,rows=[];
  let prog=0,progT=0,fell=false;
  for(let t=0;t<18000;t++){
    let inp=rider.step(s,t);eye.step(s,t);
    if(me)inp=me.step(s,t);
    noPedals(inp);
    if(t%2===0&&eye.seen&&rider.want){for(const v of eye.x)rows.push(v);for(const v of rider.want)rows.push(v);rows.push(eye.landPt)}
    if(rider.idx>prog){prog=rider.idx;progT=t}else if(t-progT>480)break;
    if(rider.idx>=Math.min(N-3,until))break;
    if(rider.off>7&&!(s[12]>0))break;
    l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);s=state();
    if(s[13]>0){fell=true;break}
  }
  if(fell&&!me)rows.length=Math.max(0,rows.length-30*28);
  return {rows,prog};
}
// The brain w rides the line and its riding is written down as a plan, section by section: the speed it held (as it
// aimed, and as it went), where it pulled before a lip, how hard it pumped down slopes, the angle it held in the air.
// Sections past its fall keep fresh values. Returns how far the brain got and four plans (the speed as aimed or as
// ridden, on the whole section or on its end): which one rides closest to the brain differs from line to line.
function brainPlan(w){
  spawn();
  const N=R.length,K=S.length,me=makeBrainRider(R,H,w);
  const Q={v:S.map(()=>8),pt:S.map(s=>s.pt),mv:S.map(()=>0),hr:S.map(()=>1.5),pl:S.map(()=>0),pu:S.map(()=>0),as:1};
  const tk=makeRider(R,H,S,Q),z=()=>new Float64Array(K);
  const aim=z(),went=z(),nv=z(),aimE=z(),wentE=z(),nE=z(),pu=z(),np=z(),pt=z(),na=z(),pl=z();
  const maxT=Math.min(18000,Math.round(N/2.5*60)+600);
  let s=state(),prog=0,progT=0,stall=0;
  for(let t=0;t<maxT;t++){
    const air=s[12]>0,inp=noPedals(me.step(s,t));tk.step(s,t);
    const i=me.idx;if(i>prog){prog=i;progT=t}else if(t-progT>480)break;
    if(me.off>7&&!air||i>=N-3)break;
    if(t%2===0){
      if(!air){const k=tk.sec,a=clamp(brainSpeed(me.o[0]),2,18),v=Math.abs(s[8]);aim[k]+=a;went[k]+=v;nv[k]++;
        if(i>=S[k].b-8){aimE[k]+=a;wentE[k]+=v;nE[k]++}
        if((inp[5]&1)&&R.KIND[i]==='takeoff'&&i<=S[k].b)pl[k]=Math.max(pl[k],S[k].b-i+1);
        if((H[Math.min(N-1,i+1)]-H[Math.min(N-1,i+3)])/2>0.03){pu[k]+=Math.max(0,me.o[2]);np[k]++}}
      else{const k=tk.airSec;pt[k]+=me.landPt+BRAIN_TILT*me.o[3];na[k]++}
    }
    l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);s=state();
    if(s[13]>0)break;
    if(Math.abs(s[8])<0.6&&!(s[12]>0)){if(++stall>150)break}else stall=0;
  }
  // the speed of a section: on the whole of it, or on its last 8 m (where it meets a lip or the next section)
  const plan=(v,n,vE)=>{const P=JSON.parse(JSON.stringify(Q));
    for(let k=0;k<K;k++){
      if(vE&&nE[k])P.v[k]=+clamp(vE[k]/nE[k],2,18).toFixed(3);
      else if(n[k])P.v[k]=+clamp(v[k]/n[k],2,18).toFixed(3);
      if(na[k])P.pt[k]=+(pt[k]/na[k]).toFixed(4);
      P.pl[k]=Math.min(10,Math.round(pl[k]));
      const p=np[k]?pu[k]/np[k]:0;P.pu[k]=p<0.05?0:+p.toFixed(2);
    }
    return P};
  return {prog,plans:[plan(aim,nv),plan(went,nv),plan(aim,nv,aimE),plan(went,nv,wentE)]};
}
onmessage=async e=>{const m=e.data;
  try{
    if(m.type==='init'){await init(m);
      const metas=lines.map(L=>({secs:L.S,length:L.R.length,geo:m.geo===false?null:{X:Array.from(L.R.X),Z:Array.from(L.R.Z),KIND:Array.from(L.R.KIND),H:Array.from(L.H),PZ:L.R.PZ}}));
      postMessage({type:'ready',id:m.id,...metas[0],metas})}
    else if(m.type==='eval'){use(0);const out=m.plans.map(p=>episode(p,{until:m.until}));postMessage({type:'evals',id:m.id,out})}
    else if(m.type==='replay'){use(0);postMessage({type:'replay',id:m.id,r:episode(m.plan,{rec:true})})}
    // brains: each task is [brain, line]; only what the learning needs comes back
    else if(m.type==='watch'){use(m.line);postMessage({type:'watch',id:m.id,...watchPlan(m.plan,m.until,m.brain)})}
    else if(m.type==='brainplan'){use(0);postMessage({type:'brainplan',id:m.id,...brainPlan(m.w)})}
    else if(m.type==='brains'){const out=m.tasks.map(([b,i])=>{use(i);const r=episode(null,{brain:m.brains[b],until:m.until});return {fit:r.fit,prog:r.prog,end:r.end,jumps:r.jumps}});postMessage({type:'brains',id:m.id,out})}
  }catch(err){postMessage({type:'error',id:m.id,error:String(err&&err.stack||err)})}
};`;

  class Pool {
    constructor(n) {
      const url = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
      this.ws = Array.from({ length: n }, () => new Worker(url));
      this.seq = 0;
    }
    call(w, msg, transfer) {
      return new Promise((resolve, reject) => {
        const id = ++this.seq;
        const h = e => {
          if (e.data.id !== id) return;
          w.removeEventListener('message', h);
          if (e.data.type === 'error') reject(new Error(e.data.error)); else resolve(e.data);
        };
        w.addEventListener('message', h);
        w.postMessage({ ...msg, id }, transfer || []);
      });
    }
    async assets() {
      const a = assets();
      const wasm = await (await fetch(a.wasm)).arrayBuffer();
      const land = await Promise.all(a.land.map(u => fetch(u).then(r => r.arrayBuffer())));
      return { wasm, land };
    }
    // Every worker gets the line.
    async init(route, setup) {
      const { wasm, land } = await this.assets();
      this.held = this.ws.map(() => [0]);
      const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'init', wasm: wasm.slice(0), land: land.map(b => b.slice(0)), routes: [route], setup })));
      return r[0].metas[0];
    }
    // The workers share the lines out: with fewer lines than workers each worker holds one line, and the spare workers
    // go to the longest lines (rides there take longest); else each holds a few. A line takes seconds to load and tens
    // of MB in each worker holding it.
    async initSpread(routes, setup) {
      const { wasm, land } = await this.assets();
      const W = this.ws.length, L = routes.length;
      if (L <= W) {
        const count = routes.map(() => 1);
        for (let k = L; k < W; k++) { let bi = 0; routes.forEach((r, l) => { if (r.length / count[l] > routes[bi].length / count[bi]) bi = l; }); count[bi]++; }
        this.held = [];
        count.forEach((c, l) => { for (let k = 0; k < c; k++) this.held.push([l]); });
      } else this.held = this.ws.map((_, i) => routes.map((_, l) => l).filter(l => l % W === i));
      const r = await Promise.all(this.ws.map((w, i) => this.call(w, { type: 'init', wasm: wasm.slice(0), land: land.map(b => b.slice(0)), routes: this.held[i].map(l => routes[l]), setup, geo: false })));
      return routes.map((_, l) => { const i = this.held.findIndex(h => h.includes(l)); return r[i].metas[this.held[i].indexOf(l)]; });
    }
    // Rides of brains on lines: tasks are [brain index, line index], each sent to a worker holding that line, in turn.
    // Results come back in the same order.
    async evalBrains(brains, tasks, until) {
      const holders = new Map(), turn = new Map(), parts = this.ws.map(() => []);
      tasks.forEach((t, i) => {
        const l = t[1];
        if (!holders.has(l)) holders.set(l, this.held.map((h, wi) => (h.includes(l) ? wi : -1)).filter(wi => wi >= 0));
        const hs = holders.get(l), k = turn.get(l) || 0;
        turn.set(l, k + 1);
        const wi = hs[k % hs.length];
        parts[wi].push([i, this.held[wi].indexOf(l)]);
      });
      const res = new Array(tasks.length);
      await Promise.all(parts.map(async (ix, wi) => {
        if (!ix.length) return;
        const r = await this.call(this.ws[wi], { type: 'brains', brains, tasks: ix.map(([i, local]) => [tasks[i][0], local]), until });
        r.out.forEach((o, k) => { res[ix[k][0]] = o; });
      }));
      return res;
    }
    async evalAll(plans, until) {
      const n = this.ws.length, parts = Array.from({ length: n }, () => []);
      plans.forEach((p, i) => parts[i % n].push(i));
      const res = new Array(plans.length);
      await Promise.all(parts.map(async (ix, wi) => {
        if (!ix.length) return;
        const r = await this.call(this.ws[wi], { type: 'eval', plans: ix.map(i => plans[i]), until });
        r.out.forEach((o, k) => { res[ix[k]] = o; });
      }));
      return res;
    }
    replay(plan) { return this.call(this.ws[0], { type: 'replay', plan }).then(r => r.r); }
    // The brain rides the line, and its riding comes back as plans (see brainPlan in the worker).
    brainPlan(w) { return this.call(this.ws[0], { type: 'brainplan', w }).then(r => ({ prog: r.prog, plans: r.plans })); }
    // Each { line, plan } ridden by a worker holding the line, with a brain watching (see watchPlan in the worker);
    // with brain, that brain rides and the plan only says what it would do.
    watchPlans(items, until, brain) {
      return Promise.all(items.map(({ line, plan }) => {
        const wi = this.held.findIndex(h => h.includes(line));
        return this.call(this.ws[wi], { type: 'watch', line: this.held[wi].indexOf(line), plan, until, brain }).then(r => ({ rows: r.rows, prog: r.prog }));
      }));
    }
    close() { this.ws.forEach(w => w.terminate()); }
  }

  // ---------------------------------------------------------------- learning (trial and error on the plan)
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clonePlan = p => JSON.parse(JSON.stringify(p));
  function freshPlan(secs) {
    return { v: secs.map(() => 8), pt: secs.map(s => s.pt), mv: secs.map(() => 0), hr: secs.map(() => 1.5), pl: secs.map(() => 0), pu: secs.map(() => 0), as: 1 };
  }
  // A plan from before P.as (see makeRider) was learned with jumps put on the section the bike was in or the one
  // before; some, on this branch, already the new way. It is ridden both ways and keeps the better one for good.
  async function settleAir(pool, P) {
    if (P.as !== undefined) return { plan: P, run: (await pool.evalAll([P]))[0] };
    const two = [{ ...clonePlan(P), as: 0 }, { ...clonePlan(P), as: 1 }];
    const runs = await pool.evalAll(two);
    const i = beats(runs[1], runs[0]) ? 1 : 0;
    return { plan: two[i], run: runs[i] };
  }
  const PLAN_KEYS = ['v', 'pt', 'mv', 'hr', 'pl', 'pu'];
  const num = v => typeof v === 'number' && Number.isFinite(v);
  // vs, a speed for every part of a section, is there only once learning has split a section
  const partsOk = (P, n) => P.vs === undefined || (Array.isArray(P.vs) && P.vs.length === n && P.vs.every(q => q === null || (Array.isArray(q) && q.length <= 12 && q.every(num))));
  const planFits = (p, secs) => p && PLAN_KEYS.every(k => Array.isArray(p[k]) && p[k].length === secs.length) && partsOk(p, secs.length);
  // rounds a jump's best landing (Trainer.marks) is tried again before the AI stops coming back to it
  const MARK_TRIES = 24;
  // The first landing of each jump section in a ride (its review, jl), by section.
  const firstLandings = r => { const m = new Map(); for (const e of (r && r.jl) || []) if (!m.has(e.k)) m.set(e.k, e); return m; };
  // What a plan does on jump section k and its run-up (the section before), to put back later with setJumpVals; with
  // keepTrick the move and its timing stay as they are in p.
  const jumpVals = (p, k) => [k - 1, k].filter(q => q >= 0).map(q => ({ q, v: p.v[q], vs: p.vs && p.vs[q] ? p.vs[q].slice() : null, pt: p.pt[q], pl: p.pl[q], pu: p.pu[q], mv: p.mv[q], hr: p.hr[q] }));
  function setJumpVals(p, vals, keepTrick) {
    for (const r of vals) {
      if (r.q >= p.v.length) continue;
      p.v[r.q] = r.v; p.pt[r.q] = r.pt; p.pl[r.q] = r.pl; p.pu[r.q] = r.pu;
      if (r.vs || (p.vs && p.vs[r.q])) { if (!p.vs) p.vs = p.v.map(() => null); p.vs[r.q] = r.vs ? r.vs.slice() : null; }
      if (!keepTrick) { p.mv[r.q] = r.mv; p.hr[r.q] = r.hr; }
    }
  }
  // Ride a beats ride b when it gets further, or as far with more points. Points only decide once rides get as far
  // (in the end, all the way): before, a trick a ride did on an earlier jump made it count over rides that went further.
  // Once both get all the way, the game's own points for their jumps decide first (gamePoints): landing clean and keeping
  // the streak going is what the game counts, more than the AI's own guess at points.
  // With the same game points, the faster ride all the way (its mean speed, vAvg) counts over the slower one.
  // On a Training drill, getting more of what the drill asks for (r.goal) comes before everything else.
  const done = r => r.end === 'về đích' && typeof r.game === 'number';
  const goalN = r => (r.goal ? r.goal.n : 0);
  const faster = (a, b) => (typeof a.vAvg === 'number' && typeof b.vAvg === 'number' && Math.abs(a.vAvg - b.vAvg) > 0.05 ? a.vAvg > b.vAvg : null);
  const beats = (a, b) => !b || (goalN(a) !== goalN(b) ? goalN(a) > goalN(b) : a.prog > b.prog || (a.prog === b.prog && (done(a) && done(b) && a.game !== b.game ? a.game > b.game
    : done(a) && done(b) && faster(a, b) !== null ? faster(a, b) : a.fit > b.fit + 0.01)));
  const goalMet = r => !!(r && r.goal && r.goal.n >= r.goal.need);

  // ---------------------------------------------------------------- the trick book
  // What every trick try taught: how long the bike was in the air, the move tried, whether the bike landed it, and the
  // trick and landing the game counted. Kept for each set of unlocked tricks, so on a jump the AI tries the moves that
  // worked on jumps with as much air, instead of any move at random. Rows: [airtime, move, landed 0/1, tr, grade].
  const BOOK = 'trailsai.trickbook', BOOK_ROWS = 4000;
  function loadBook(mask) {
    try { const b = JSON.parse(localStorage.getItem(BOOK) || 'null'); return b && b.version === 1 && Array.isArray(b[mask]) ? b[mask] : []; } catch { return []; }
  }
  function saveBook(mask, rows) {
    try {
      let b = JSON.parse(localStorage.getItem(BOOK) || 'null');
      if (!b || b.version !== 1) b = { version: 1 };
      b[mask] = rows.slice(-BOOK_ROWS);
      localStorage.setItem(BOOK, JSON.stringify(b));
    } catch { /* storage full or blocked */ }
  }
  const trickValue = tr => (tr & 1 ? 300 : 0) + (tr & 2 ? 200 : 0) + (tr & 4 ? 100 : 0);
  // n moves to try on a jump with air seconds in the air, each trick given its turn. A move's worth: its chance of
  // landing a trick on jumps within 0.2 s of that much air (one success and one failure assumed to start with) times
  // what its tricks were worth, or before it has landed one there what its trick is worth to the game (a backflip 300,
  // a 360 200, a whip 100; the old button moves 40), less when the trick has never been landed with this little air.
  // To that is added more the fewer times a move was tried at this air (as a bandit picks its arms: upper confidence
  // bound), so a move tried a few times and failed is not given up on, and the best is not tried only. Every trick
  // move that has had fewer than 3 tries at this air gets one try in the round first; the rest are drawn by worth.
  // (Weighing what the moves had landed, squared, made the whip, the easiest trick, take nearly every try.)
  const TRICK_MOVES = [FLIP, SPIN_L, SPIN_R, WHIP_L, WHIP_R];
  const moveBit = m => (m === FLIP ? 1 : m === SPIN_L || m === SPIN_R ? 2 : m === WHIP_L || m === WHIP_R ? 4 : 0);
  function bookMoves(rows, air, n) {
    const near = rows.filter(r => Math.abs(r[0] - air) <= 0.2);
    let landed = 0;
    for (const r of rows) if (r[2] && r[0] <= air + 0.1) landed |= r[3];
    const tries = new Array(N_MOVES).fill(0), w = new Array(N_MOVES).fill(0);
    for (const r of near) if (r[1] > 0 && r[1] < N_MOVES) tries[r[1]]++;
    const all = near.length;
    for (let m = 1; m < N_MOVES; m++) {
      let ok = 0, val = 0;
      for (const r of near) if (r[1] === m && r[2] && r[3]) { ok++; val += trickValue(r[3]); }
      const b = moveBit(m), prior = b ? trickValue(b) * (landed & b || !rows.length ? 1 : 0.5) : 40;
      const est = ((ok + 1) / (tries[m] + 2)) * (ok ? val / ok : prior);
      w[m] = est + 150 * Math.sqrt(Math.log(all + 2) / (tries[m] + 1)) * (b ? 1 : 0.25);
    }
    const out = TRICK_MOVES.filter(m => tries[m] < 3).sort((a, b) => w[b] - w[a]).slice(0, n);
    const sum = w.reduce((a, v) => a + v * v, 0);
    while (out.length < n) {
      let x = Math.random() * sum, m = 1;
      for (; m < N_MOVES - 1; m++) { x -= w[m] * w[m]; if (x <= 0) break; }
      out.push(m);
    }
    return out;
  }
  // For each trick the game counts: the least air it was landed with (the shortest tenth of its landings left out) and
  // how often it was landed out of the tries with at least that much air.
  function bookSummary(rows) {
    return [[1, 'Backflip'], [2, 'Spin'], [4, 'Whip']].map(([b, name]) => {
      const got = rows.filter(r => r[2] && r[3] & b).map(r => r[0]).sort((x, y) => x - y);
      if (!got.length) return { name, n: 0 };
      const min = got[Math.floor(got.length * 0.1)], tries = rows.filter(r => r[0] >= min).length;
      return { name, n: got.length, min, tries };
    });
  }
  // The moves a trick drill of the game's Training tries on its jumps.
  const DRILL_MOVES = { whip: [WHIP_L, WHIP_R], spin: [SPIN_L, SPIN_R], flip: [FLIP], tricks: [FLIP, SPIN_L, SPIN_R, WHIP_L, WHIP_R] };
  // A first plan for a Training drill: the jumps of a trick drill taken fast (its kickers throw the bike up more than
  // along: measured, about 13 m/s gets a backflip, a 360 or a whip round and onto the landing), and a manual on the
  // Manual drill. The tricks themselves come once the drill is ridden to the end (see drillGoal). The drills without
  // pedals pump through every dip, never braking.
  function drillSeed(P, secs, D) {
    if (DRILL_MOVES[D.kind]) secs.forEach((s, k) => { if (s.jump) P.v[k] = 13; });
    if (D.kind === 'manual') secs.forEach((s, k) => { if (!s.jump) P.mv[k] = MANUAL; });
    if (!D.pedals) { P.pz = 1; P.pu = P.pu.map(() => 1); P.v = P.v.map(() => 18); }
    return P;
  }
  const clampV = v => Math.min(18, Math.max(2, v));
  // Changes the speed of section q by about sd: its one speed, or one or all of its parts once it has them. With
  // split, a section without parts is first cut into parts of about 8 m with its speed (so it can slow down for a bump
  // and speed up again for the jump after it). v stays the speed at the end of the section, which jumps lend.
  function moveSpeed(p, s, q, sd, split) {
    if (split && !(p.vs && p.vs[q])) {
      if (!p.vs) p.vs = p.v.map(() => null);
      p.vs[q] = new Array(Math.max(2, Math.round((s.b - s.a + 1) / 8))).fill(p.v[q]);
    }
    const k = p.vs && p.vs[q];
    if (!k) { p.v[q] = clampV(p.v[q] + gauss() * sd); return; }
    if (Math.random() < 0.3) { const d = gauss() * sd; for (let i = 0; i < k.length; i++) k[i] = clampV(k[i] + d); }
    else for (let i = 0; i < k.length; i++) if (Math.random() < 0.5) k[i] = clampV(k[i] + gauss() * sd);
    p.v[q] = k[k.length - 1];
  }

  // ---------------------------------------------------------------- shared lessons
  // A lesson is what the AI knows about one line: the line itself, the plan and the score it reached.
  // Lessons from other tabs, files and the community repo are taken only after they ride better in
  // this computer's own simulation, so a wrong or made-up lesson can never make the AI worse.
  function readLesson(raw, id) {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    const L = m && m.line, P = m && m.plan, S0 = L && L.start;
    if (!L || !P || !S0 || typeof S0.id !== 'string' || !num(S0.x) || !num(S0.z) || !num(S0.heading)) return null;
    if (id && S0.id !== id) return null;
    const n = Array.isArray(L.X) ? L.X.length : 0;
    if (n < 20 || n > 20000 || !L.X.every(num) || !Array.isArray(L.Z) || L.Z.length !== n || !L.Z.every(num)) return null;
    if (!Array.isArray(L.KIND) || L.KIND.length !== n || !L.KIND.every(k => typeof k === 'string')) return null;
    if (!Array.isArray(L.pieces) || L.pieces.length > 20000) return null;
    if (!L.pieces.every(p => p && typeof p.kind === 'string' && num(p.x) && num(p.z) && num(p.heading) && (!p.params || Object.values(p.params).every(num)))) return null;
    if (L.land !== undefined && !(Array.isArray(L.land) && L.land.length === 4 && L.land.every(num))) return null;
    if (!Array.isArray(P.v) || !PLAN_KEYS.every(k => Array.isArray(P[k]) && P[k].length === P.v.length && P[k].every(num)) || !partsOk(P, P.v.length)) return null;
    L.length = n;
    if (!L.kinds || typeof L.kinds !== 'object') L.kinds = {};
    return m;
  }
  // A saved line is out of date when the game now holds the chunk one of its pieces sits in, and the piece is gone.
  function lineStale(line) {
    // practice lines are not in the game's world
    if (line.practice) return false;
    for (const p of line.pieces) {
      const got = cap.chunks.get(Math.floor(p.x / 256) + ',' + Math.floor(p.z / 256));
      if (got && !got.some(q => q.kind === p.kind && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05)) return true;
    }
    return false;
  }
  async function communityLesson(id) {
    try {
      // GitHub's caches can hand out an old file for minutes; an address never asked for before gets the current one
      const r = await fetch(LESSONS_URL + encodeURIComponent(id) + '.json?t=' + Date.now(), { cache: 'no-store' });
      return r.ok ? readLesson(await r.text(), id) : null;
    } catch { return null; }
  }

  // ---------------------------------------------------------------- borrowed experience
  // Every lesson keeps, for each jump its line has got over, the jump's shape and the plan that did it. On a new line
  // the AI looks for the most similar jump learned anywhere else and starts from what worked there; while learning it
  // keeps trying those when stuck at a jump. A borrowed plan is ridden first and kept only if it does better.
  const JUMP_KEYS = ['v', 'dpt', 'pl', 'pu'];
  const goodJump = j => j && typeof j.id === 'string' && Array.isArray(j.f) && j.f.length === JUMP_SCALE.length && j.f.every(num) && JUMP_KEYS.every(k => num(j[k]));
  function localJumps() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(STORE)) continue;
        let m = null;
        try { m = JSON.parse(localStorage.getItem(key)); } catch { continue; }
        const J = m && m.jumps, id = m && m.line && m.line.start && m.line.start.id;
        if (!J || J.version !== JUMPS_VERSION || !Array.isArray(J.list) || typeof id !== 'string') continue;
        for (const j of J.list) if (goodJump({ ...j, id })) out.push({ ...j, id });
      }
    } catch { /* storage blocked */ }
    return out;
  }
  async function communityJumps() {
    try {
      const r = await fetch(EXPERIENCE_URL + '?t=' + Date.now(), { cache: 'no-store' });
      const m = r.ok ? await r.json() : null;
      return m && m.version === JUMPS_VERSION && Array.isArray(m.jumps) ? m.jumps.filter(goodJump) : [];
    } catch { return []; }
  }
  // this browser's own lessons count over the community copy of the same line
  async function gatherJumps() {
    const mine = localJumps(), have = new Set(mine.map(j => j.id));
    return mine.concat((await communityJumps()).filter(j => !have.has(j.id)));
  }
  // how different two jumps are (each number divided by a difference that matters); under 4 they count as alike.
  // Jumps of different lines are mostly 2.5 to 5 apart; a loose match costs little, since every borrowed plan is ridden first.
  const JUMP_SCALE = [0.12, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.06];
  const jumpDist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + ((v - b[i]) / JUMP_SCALE[i]) ** 2, 0));
  // For every jump section of this line: the most similar jumps learned on other lines, nearest first.
  function matchJumps(secs, lib, ownId) {
    const out = secs.map(() => null);
    secs.forEach((s, k) => {
      if (!s.f) return;
      const near = lib.filter(j => j.id !== ownId).map(j => ({ j, d: jumpDist(s.f, j.f) })).filter(o => o.d < 4).sort((a, b) => a.d - b.d).slice(0, 5);
      if (near.length) out[k] = near;
    });
    return out;
  }
  function applyJump(p, s, k, j) {
    p.v[k] = j.v; p.pt[k] = s.pt + j.dpt; p.pl[k] = j.pl; p.pu[k] = j.pu;
    if (p.vs) p.vs[k] = null;
  }
  // which simulation scored a stored ride: one scored by other code (another goal, other judges) is not trusted
  let simHash = null;
  function simId() {
    if (simHash === null) { let h = 2166136261; for (let i = 0; i < workerSrc.length; i++) h = Math.imul(h ^ workerSrc.charCodeAt(i), 16777619) >>> 0; simHash = h.toString(36); }
    return simHash;
  }

  class Trainer {
    constructor(ui) { this.ui = ui; this.running = false; this.pool = null; }
    key() { return STORE + (this.route ? this.route.start.id : 'none'); }
    // The plan of lesson m for this line: as it is, or, learned on the line alone while this is its tour (the line and
    // the lines after it), kept for the sections wholly on the line, fresh for the rest. Else null.
    planOf(m) {
      if (!m || !m.plan) return null;
      if (planFits(m.plan, this.secs)) return m.plan;
      const L = m.line, P = m.plan, n = P.v && P.v.length;
      if (!this.route.tour || !L || L.tour !== undefined || !L.X || L.X.length >= this.route.length || !planFits(P, new Array(n))) return null;
      // the line's points must be the tour's first points
      for (let i = 0; i < L.X.length; i += 10) if (Math.abs(L.X[i] - this.route.X[i]) > 0.01 || Math.abs(L.Z[i] - this.route.Z[i]) > 0.01) return null;
      const runIn = this.N - this.route.length, end = runIn + L.X.length - 1, out = freshPlan(this.secs);
      let k = 0;
      for (; k < Math.min(n - 1, this.secs.length); k++) {
        if (this.secs[k].b >= end) break;
        for (const key of PLAN_KEYS) out[key][k] = P[key][k];
        if (P.vs && P.vs[k]) { if (!out.vs) out.vs = out.v.map(() => null); out.vs[k] = P.vs[k].slice(); }
      }
      // the first section not kept
      this.kept = k;
      return out;
    }
    load() {
      let mine = null;
      try { mine = JSON.parse(localStorage.getItem(this.key()) || 'null'); } catch { mine = null; }
      this.kept = 0;
      const plan = this.planOf(mine), ok = !!plan;
      this.plan = ok ? clonePlan(plan) : freshPlan(this.secs);
      this.gen = ok ? mine.gen : 0;
      this.hist = ok ? (mine.hist || []) : [];
      this.found = ok ? (mine.found || {}) : {};
      // (the records of a lesson made for these very sections only)
      this.marks = ok && mine.marks && typeof mine.marks === 'object' && planFits(mine.plan, this.secs) ? mine.marks : {};
      this.fails = {};
      this.stuck = 0; this.lastProg = -1; this.alt = null; this.fix = null;
      this.best = null;
      return { fromTrack: !!ok, kept: ok ? this.kept : 0 };
    }
    lesson() {
      // the line is kept with the memory: rebuilt later from whatever the game has loaded, it could come out shorter
      const { start, X, Z, KIND, pieces, kinds, length, land, practice, tour, drill, lands } = this.route;
      // numbers are kept exact: the ride is so sensitive that a route rounded to the centimetre rides differently
      const line = { start, X: Array.from(X), Z: Array.from(Z), KIND, pieces, kinds, length };
      // the number of lines joined on after the line (see extendRoute)
      if (tour !== undefined) line.tour = tour;
      // a practice line is laid on its own ground; a Training drill also keeps what the game asks for
      if (practice) Object.assign(line, { land, practice });
      // (and where its landings are, which its goal is judged by: see drillGoal)
      if (drill) { line.drill = drill; if (lands) line.lands = lands; }
      return { format: LESSON_FORMAT, version: 1, plan: this.plan, gen: this.gen, hist: this.hist.slice(-400), found: this.found, marks: Object.fromEntries(Object.entries(this.marks || {}).map(([k, { plan, ...m }]) => [k, m])), bestRun: this.best, sim: simId(), route: start, line, setup: this.setup, jumps: this.jumpRecord(), savedAt: Date.now() };
    }
    // What the jumps this line's best ride got over teach other lines: each jump's shape and the plan used on it.
    jumpRecord() {
      const S = this.secs, P = this.plan, b = this.best, list = [];
      // landed and rode on: 25 m past the lip
      if (b) S.forEach((s, k) => { if (s.f && s.b + 25 < b.prog) list.push({ f: s.f, v: +P.v[k].toFixed(3), dpt: +(P.pt[k] - s.pt).toFixed(4), pl: P.pl[k], pu: P.pu[k] }); });
      return { version: JUMPS_VERSION, list };
    }
    save() {
      // another tab learning the same line may have stored a better plan: take it instead of writing over it
      if (this.takeStored()) return;
      try { localStorage.setItem(this.key(), JSON.stringify(this.lesson())); } catch { /* storage full: keep training anyway */ }
    }
    // Plans stored by this browser were scored by the same simulation with the same rider, so a higher score can be trusted.
    takeStored(raw) {
      let m = null;
      try { m = JSON.parse(raw || localStorage.getItem(this.key()) || 'null'); } catch { m = null; }
      if (!m || !this.best || !m.bestRun || m.sim !== simId() || !planFits(m.plan, this.secs) || JSON.stringify(m.setup) !== JSON.stringify(this.setup)) return false;
      if (!beats(m.bestRun, this.best)) return false;
      this.plan = m.plan; this.best = m.bestRun; this.gen = Math.max(this.gen, m.gen || 0);
      return true;
    }
    // A lesson from elsewhere (a file, the community repo) is ridden here first and kept only if it does better.
    async offer(m) {
      const got = this.pool && this.planOf(m);
      if (!got) return { fits: false };
      const { plan, run } = await settleAir(this.pool, got);
      const took = beats(run, this.best);
      if (took) { this.plan = clonePlan(plan); this.best = run; this.save(); }
      return { fits: true, took, run };
    }
    async prepare(route, workers) {
      this.stop();
      if (this.pool) this.pool.close();
      this.route = route;
      this.setup = riderSetup();
      this.pool = new Pool(workers);
      const meta = await this.pool.init(route, this.setup);
      this.secs = meta.secs; this.N = meta.length; this.geo = meta.geo;
      this.book = loadBook(this.setup.tricks); this.bookDirty = false;
      const mem = this.load();
      if (!mem.fromTrack && route.drill) drillSeed(this.plan, this.secs, route.drill);
      ({ plan: this.plan, run: this.best } = await settleAir(this.pool, this.plan));
      // jumps of this line that look like jumps learned on other lines (this.library is set by the panel)
      this.borrow = matchJumps(this.secs, this.library || [], route.start.id);
      this.borrowed = new Set(); this.borrowWins = 0;
      const alike = this.borrow.filter(Boolean);
      mem.jumps = this.secs.filter(s => s.jump).length;
      mem.alike = alike.length;
      mem.lines = new Set(alike.map(b => b[0].j.id)).size;
      mem.fresh = this.best; mem.from = 'fresh';
      if (!mem.fromTrack && alike.length) {
        // a new line starts from the nearest borrowed jump everywhere it has one, if that rides better than starting from nothing
        const seed = clonePlan(this.plan);
        this.borrow.forEach((b, k) => { if (b) applyJump(seed, this.secs[k], k, b[0].j); });
        mem.seed = (await this.pool.evalAll([seed]))[0];
        if (beats(mem.seed, this.best)) { this.plan = seed; this.best = mem.seed; mem.from = 'borrow'; }
      }
      if (!mem.fromTrack && this.brainW) {
        // or from how the shared brain rides this line (this.brainW is set by the panel), written down as a plan
        const got = await this.pool.brainPlan(this.brainW);
        const runs = await this.pool.evalAll(got.plans);
        const bi = runs.reduce((b, r, i) => (beats(r, runs[b]) ? i : b), 0);
        mem.brain = { prog: got.prog, run: runs[bi] };
        if (beats(runs[bi], this.best)) { this.plan = got.plans[bi]; this.best = runs[bi]; mem.from = 'brain'; }
      }
      if (mem.kept && this.brainW) {
        // a lesson learned on the line alone, now a tour: the lines joined on start from how the brain rides them
        const got = await this.pool.brainPlan(this.brainW);
        const mixes = got.plans.map(b => {
          const p = clonePlan(this.plan);
          for (let k = mem.kept; k < this.secs.length; k++) {
            for (const key of PLAN_KEYS) p[key][k] = b[key][k];
            if (p.vs) p.vs[k] = b.vs && b.vs[k] ? b.vs[k].slice() : null;
          }
          return p;
        });
        const runs = await this.pool.evalAll(mixes);
        const bi = runs.reduce((b, r, i) => (beats(r, runs[b]) ? i : b), 0);
        if (beats(runs[bi], this.best)) { this.plan = mixes[bi]; this.best = runs[bi]; }
      }
      return mem;
    }
    stop() { this.running = false; }

    // Changed copies of the plan around section k: speed, landing angle, pull and pump.
    // Up to a sixth of them use what worked on a similar jump of another line, around where the AI falls
    // (more would leave too few of the AI's own tries: measured, a third slowed learning down on some lines).
    rideCandidates(k, n, wide, base = this.plan) {
      const S = this.secs, out = [], opts = [];
      for (let q = Math.max(0, k - 1); q <= Math.min(S.length - 1, k + 1); q++) for (const o of (this.borrow && this.borrow[q]) || []) opts.push([q, o.j]);
      const nb = Math.min(opts.length, Math.floor(n / 6));
      this.borrowed = new Set();
      for (let i = 0; i < n; i++) {
        const p = clonePlan(base);
        if (i < nb) {
          // a different borrowed jump each round; as is, or nudged a little to fit this line
          const [q, j] = opts[(this.gen * nb + i) % opts.length];
          applyJump(p, S[q], q, j);
          if (Math.random() < 0.5) { p.v[q] = clampV(p.v[q] + gauss() * 0.7); p.pt[q] += gauss() * 0.06; }
          this.borrowed.add(i);
          out.push(p);
          continue;
        }
        // long stuck, the cause may lie further back (the run-up to a jump can start several sections before it)
        const span = 1 + Math.floor(Math.random() * (this.stuck > 60 ? 5 : 3));
        // sections are split into parts with their own speeds more often the longer the AI is stuck
        const split = this.stuck > 20 ? 0.3 : 0.1;
        for (let q = Math.max(0, k - span); q <= Math.min(S.length - 1, k + 1); q++) {
          if (Math.random() < 0.7) moveSpeed(p, S[q], q, 1.5 * wide, Math.random() < split);
          if (S[q].jump && Math.random() < 0.4) p.pt[q] += gauss() * 0.15;
          if (S[q].jump && Math.random() < 0.15) p.pl[q] = p.pl[q] ? 0 : 1 + Math.floor(Math.random() * 5);
          if (Math.random() < 0.1) p.pu[q] = p.pu[q] ? 0 : +(Math.random() * 0.6).toFixed(2);
        }
        out.push(p);
      }
      return out;
    }
    // Another way to ride up to section k: the three sections before it and k itself drawn anew (speeds, often by parts,
    // landing angles, pulls and pumps), the rest of the plan kept.
    wildCandidates(k, n) {
      const S = this.secs, out = [], r = (a, b) => a + Math.random() * (b - a);
      for (let i = 0; i < n; i++) {
        const p = clonePlan(this.plan);
        if (!p.vs) p.vs = p.v.map(() => null);
        for (let q = Math.max(0, k - 3); q <= k; q++) {
          p.vs[q] = null; p.mv[q] = 0;
          p.v[q] = r(4, 18);
          if (Math.random() < 0.6) moveSpeed(p, S[q], q, 4, true);
          p.pt[q] = S[q].pt + r(-0.5, 0.4);
          p.pl[q] = S[q].jump && Math.random() < 0.6 ? Math.floor(r(1, 6)) : 0;
          p.pu[q] = Math.random() < 0.4 ? +r(0.1, 0.9).toFixed(2) : 0;
        }
        out.push(p);
      }
      return out;
    }
    // How long the best ride is in the air off the jump of section j (0: it does not jump there).
    airOf(j) { return Math.max(0, ...((this.best && this.best.jl) || []).filter(e => e.k === j).map(e => e.a)); }
    // What to work on once the line is ridden to the end, from the review of the best ride's jumps: a landing that was
    // not clean (the game gives little for it and it can end the streak that multiplies every jump after it), most often
    // the worst ones, else a trick on a jump landed clean that has none yet. Returns the section and whether to land it
    // better (or try a trick on it).
    pointsTarget(passed) {
      const jl = this.best.jl || [], tricksOn = !!this.setup.tricks;
      const worst = new Map();
      for (const e of jl) worst.set(e.k, Math.max(worst.get(e.k) || 0, e.g));
      const weak = [...worst].filter(([, g]) => g >= 3);
      const pickW = list => {
        let x = Math.random() * list.reduce((a, [, w]) => a + w, 0);
        for (const [k, w] of list) { x -= w; if (x <= 0) return k; }
        return list[list.length - 1][0];
      };
      // a jump that once landed better than it does now (buttery that went back to clean, say): its record is tried again
      const M = this.marks || {};
      const lost = [...firstLandings(this.best)].filter(([k, e]) => M[k] && M[k].g < e.g && (M[k].tries || 0) < MARK_TRIES);
      if (lost.length && Math.random() < 0.4) return { j: pickW(lost.map(([k, e]) => [k, e.g - M[k].g])), land: true };
      if (weak.length && (!tricksOn || Math.random() < 0.6)) return { j: pickW(weak.map(([k, g]) => [k, g >= 4 ? 4 : 2])), land: true };
      if (!tricksOn) {
        // all landed clean or better: buttery is still worth a little more, on every jump of the streak
        const clean = [...worst].filter(([, g]) => g === 2);
        return clean.length ? { j: clean[Math.floor(Math.random() * clean.length)][0], land: true } : null;
      }
      const bare = passed.filter(j => !jl.some(e => e.k === j && e.tr) && (worst.get(j) || 9) <= 2);
      const from = bare.length && Math.random() < 0.7 ? bare : passed;
      // the more air, the more tricks fit: long jumps are tried more often
      return { j: pickW(from.map(j => [j, 0.3 + this.airOf(j)])), land: false };
    }
    // On a Training drill, what its goal still lacks in the best ride: a trick drill tries its trick on a jump that has
    // not landed one yet (or any jump), and a manual on the flats (Manual, Trick line); the others land the jumps better.
    // Once the goal is met, the jumps are worked on for points as on any line. Null: just get further.
    drillTarget(passed, finished) {
      const D = this.route.drill, b = this.best;
      if (goalMet(b)) return finished && passed.length ? this.pointsTarget(passed) : null;
      if (D.kind === 'manual' || (D.kind === 'tricks' && Math.random() < 0.3)) return { manual: true };
      if (!D.pedals) return { pump: true };
      // a landing the drill does not count yet (not clean, or not on the landing's sweet part) is worked on first
      const off = (b.jl || []).filter(e => e.a > 0.4 && (e.g > 2 || e.spot === false) && passed.includes(e.k));
      // (mostly the first of them: the jumps are learned in order)
      if (off.length && (D.kind === 'clean' || D.kind === 'boost' || D.kind === 'racer' || D.kind === 'finish')) return { j: off[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * off.length)].k, land: true };
      // a landing made better leaves more room for a trick on it (and for the jump after it)
      if (DRILL_MOVES[D.kind] && finished && Math.random() < 0.25) return this.pointsTarget(passed);
      if (DRILL_MOVES[D.kind]) {
        // (on the Trick line, a jump whose trick an earlier jump already does is bare too)
        let seen = 0;
        const bare = passed.filter(j => {
          const e = (b.jl || []).find(x => x.k === j && x.tr);
          if (!e) return true;
          const dup = D.kind === 'tricks' && (e.tr & seen) === e.tr;
          seen |= e.tr;
          return dup;
        });
        const from = bare.length ? bare : passed;
        return from.length ? { j: from[Math.floor(Math.random() * from.length)], land: false } : null;
      }
      return finished && passed.length ? this.pointsTarget(passed) : null;
    }
    // Pump tries: pumping through the dips as the game teaches (pz), when in a dip to start and stop (pk) and how hard
    // to pump in a few sections (0 for none).
    pumpCandidates(n) {
      const S = this.secs, out = [];
      for (let i = 0; i < n; i++) {
        const p = clonePlan(this.plan);
        if (!p.pz && Math.random() < 0.6) { p.pz = 1; if (Math.random() < 0.5) p.pu = p.pu.map(() => 1); }
        if (Math.random() < 0.5) { const q = p.pk || PUMP0; p.pk = [clamp(q[0] + gauss() * 0.3, -1, 1), clamp(q[1] + gauss() * 0.3, -1, 1)].map(v => +v.toFixed(2)); }
        const m = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < m; j++) p.pu[Math.floor(Math.random() * S.length)] = [0, 0.5, 0.8, 1][Math.floor(Math.random() * 4)];
        out.push(p);
      }
      return out;
    }
    // Manual tries: the manual on or off on a section off the jumps, and the speed there.
    manualCandidates(n) {
      const S = this.secs, flats = S.map((s, k) => (s.jump ? -1 : k)).filter(k => k >= 0), out = [];
      for (let i = 0; i < n; i++) {
        const p = clonePlan(this.plan), k = flats[Math.floor(Math.random() * flats.length)];
        if (k === undefined) { out.push(p); continue; }
        if (Math.random() < 0.6) p.mv[k] = p.mv[k] === MANUAL ? 0 : MANUAL;
        if (Math.random() < 0.6) moveSpeed(p, S[k], k, 1.5, false);
        out.push(p);
      }
      return out;
    }
    // Tries for a better landing off the jump of section k: the angle held in the air, the speed the jump is taken at
    // (and sometimes that of the section before, the run-up), and whether to pull up off the lip.
    // Every other round the jump is worked out instead of guessed: a grid of take-off speeds (from 1.2 m/s slower to
    // 1.8 faster) by angles in the air (0.1 rad either way), the rest of the plan as it is. The take-off speed is the
    // run-up's too (three times the change) when the jump's own section is too short to get to it (under 15 m: the
    // speed at the lip is the one the bike came in at).
    // A jump that landed better in some earlier try than in ride ref (see noteMarks) first gets that try's values back:
    // all of them, only the jump's own, and with a little change of angle. A trick in base stays (only the way in and
    // the angle come back). A jump that has stayed bad for many rounds (this.fails) is also tried with the sections
    // before it changed, further back the longer it stays bad (2 to 6 sections): a jump comes at the lip the way the
    // jumps before it send it, and the change it needs may lie there.
    landCandidates(k, n, base = this.plan, ref = this.best) {
      const S = this.secs, out = [];
      const faster = (p, q, dv) => { const u = p.vs && p.vs[q]; if (u) { u[u.length - 1] = clampV(u[u.length - 1] + dv); p.v[q] = u[u.length - 1]; } else p.v[q] = clampV(p.v[q] + dv); };
      const mk = this.marks && this.marks[k], now = firstLandings(ref).get(k);
      if (mk && (mk.tries || 0) < MARK_TRIES && (!now || mk.g < now.g || (mk.g === now.g && mk.mis < now.mis - 1))) {
        mk.tries = (mk.tries || 0) + 1;
        const keep = (base.mv[k] | 0) !== 0;
        // The try itself, as it was up to the jump with the rest from base: the ride is the same up to there, so the
        // jump lands as it did (the values of the jump alone come at it with a run-up that may have changed since)
        if (mk.plan && planFits(mk.plan, S)) {
          const p = clonePlan(base), q = mk.plan;
          for (let s = 0; s <= k; s++) {
            for (const key of PLAN_KEYS) if (!(keep && s === k && (key === 'mv' || key === 'hr'))) p[key][s] = q[key][s];
            if ((q.vs && q.vs[s]) || (p.vs && p.vs[s])) { if (!p.vs) p.vs = p.v.map(() => null); p.vs[s] = q.vs && q.vs[s] ? q.vs[s].slice() : null; }
          }
          // (how the whole line is pumped too)
          for (const key of ['pz', 'pk', 'as']) if (q[key] !== undefined) p[key] = Array.isArray(q[key]) ? q[key].slice() : q[key]; else delete p[key];
          out.push(p);
        }
        for (const how of ['all', 'own', 'nudge']) {
          const p = clonePlan(base);
          setJumpVals(p, how === 'own' ? mk.vals.filter(r => r.q === k) : mk.vals, keep);
          if (how === 'nudge') p.pt[k] += gauss() * 0.05;
          out.push(p);
        }
      }
      if (this.gen % 2 === 0) {
        const short = k > 0 && S[k].b - S[k].a < 15;
        for (const dv of [-1.2, -0.6, 0, 0.6, 1.2, 1.8]) for (const da of [-0.1, 0, 0.1]) {
          const p = clonePlan(base);
          faster(p, k, dv);
          if (short) faster(p, k - 1, dv * 3);
          p.pt[k] += da;
          out.push(p);
        }
      }
      const deep = (this.fails && this.fails[k]) || 0;
      for (let i = out.length; i < n; i++) {
        const p = clonePlan(base);
        if (Math.random() < 0.8) p.pt[k] += gauss() * 0.12;
        if (Math.random() < 0.5) moveSpeed(p, S[k], k, 0.8, false);
        if (k > 0 && Math.random() < 0.25) moveSpeed(p, S[k - 1], k - 1, 0.8, false);
        if (S[k].jump && Math.random() < 0.15) p.pl[k] = p.pl[k] ? 0 : 1 + Math.floor(Math.random() * 5);
        if (deep >= 8 && k > 1 && i % 3 === 0) {
          const span = Math.min(k, 2 + Math.floor(deep / 8), 6);
          for (let q = k - span; q < k; q++) {
            if (Math.random() < 0.6) moveSpeed(p, S[q], q, 1.5, Math.random() < 0.3);
            if (S[q].jump && Math.random() < 0.4) p.pt[q] += gauss() * 0.15;
            if (S[q].jump && Math.random() < 0.15) p.pl[q] = p.pl[q] ? 0 : 1 + Math.floor(Math.random() * 5);
            if (Math.random() < 0.2) p.pu[q] = [0, 0.5, 1][Math.floor(Math.random() * 3)];
          }
        }
        out.push(p);
      }
      return out;
    }
    // The first jump of ride r that lands worse than in the best ride, else its worst landing not clean (-1: none).
    worseJump(r) {
      const a = firstLandings(this.best), b = [...firstLandings(r)];
      const w = b.find(([k, e]) => e.g > ((a.get(k) || {}).g || 9) || (e.g >= 3 && !a.has(k)));
      if (w) return w[0];
      const bad = b.filter(([, e]) => e.g >= 3).sort((x, y) => y[1].g - x[1].g);
      return bad.length ? bad[0][0] : -1;
    }
    // Every try's landings: the best each jump ever came down (its grade, then how square to the slope) in a try that
    // rode on from it, with the try's values for the jump and its run-up. The plan kept is the one with the most points
    // over the whole line, so a change for one jump can make another land worse than it once did: it gets them back.
    noteMarks(cands, res) {
      const M = this.marks || (this.marks = {});
      res.forEach((r, i) => {
        if (!r || !cands[i]) return;
        for (const [k, e] of firstLandings(r)) {
          if (!(e.g > 0) || (r.crash && r.crashSec === k) || !(r.end === 'về đích' || r.prog > e.i + 12)) continue;
          const m = M[k];
          // (a record from a stored lesson has no plan: a try that lands as well gives it one)
          if (m && !(e.g < m.g || (e.g === m.g && (e.mis < m.mis - 1 || !m.plan)))) continue;
          // (the whole plan of that try only while learning: kept with the lesson, the records would weigh too much)
          M[k] = { g: e.g, mis: +e.mis.toFixed(1), vals: jumpVals(cands[i], k), plan: clonePlan(cands[i]) };
        }
      });
    }
    // Trick tries on jump section j: a move (from the trick book, for this much air: see bookMoves), how high to let go
    // of it, and the landing angle.
    trickCandidates(j, n) {
      const out = [], air = this.airOf(j), only = this.route.drill && DRILL_MOVES[this.route.drill.kind];
      const moves = !only && air ? bookMoves(this.book, air, n) : null;
      for (let i = 0; i < n; i++) {
        const p = clonePlan(this.plan);
        // a trick drill tries only its own tricks (the Trick line keeps the one a jump has, mostly)
        if (only) {
          // on the Trick line, mostly a trick that no other jump of the plan does
          const kind = m => (m === FLIP ? 1 : m === SPIN_L || m === SPIN_R ? 2 : m === WHIP_L || m === WHIP_R ? 4 : 0);
          let used = 0;
          this.secs.forEach((s, k) => { if (k !== j && s.jump) used |= kind(p.mv[k]); });
          const fresh = only.filter(m => !(used & kind(m))), from = fresh.length && Math.random() < 0.75 ? fresh : only;
          if (!only.includes(p.mv[j]) || (used & kind(p.mv[j])) || Math.random() < 0.3) p.mv[j] = from[Math.floor(Math.random() * from.length)];
        }
        // (a fifth of the tries keep the jump's move and change only how it is done)
        else if (i < n * 0.8 || !p.mv[j]) p.mv[j] = moves ? moves[i] : 1 + Math.floor(Math.random() * (N_MOVES - 1));
        if (p.mv[j] === FLIP && Math.random() < 0.5) p.pl[j] = 1 + Math.floor(Math.random() * 5);
        p.hr[j] = +(0.3 + Math.random() * 2.5).toFixed(2);
        if (Math.random() < 0.5) p.pt[j] += gauss() * 0.12;
        if (Math.random() < 0.3) {
          // the speed the jump is taken at: the section's, or that of its last part
          const q = p.vs && p.vs[j];
          if (q) { q[q.length - 1] = clampV(q[q.length - 1] + gauss()); p.v[j] = q[q.length - 1]; } else p.v[j] = clampV(p.v[j] + gauss());
        }
        out.push(p);
      }
      return out;
    }
    async run() {
      if (this.running || !this.pool) return;
      this.running = true;
      // two tries per worker each round, so more CPU threads means more tries in the same time
      const LAMBDA = Math.max(24, this.pool.ws.length * 2 - 1), S = this.secs;
      while (this.running) {
        const t0 = performance.now();
        const best = this.best;
        const finished = best.end === 'về đích';
        const passedJumps = S.map((s, i) => (s.jump && s.b < best.prog - 8 ? i : -1)).filter(i => i >= 0);
        // First get through the whole line, and only then practise tricks on its jumps for more points. (Trick rounds
        // while stuck, as before, kept the AI from ever trying the jump it was stuck on again: only rounds spent getting
        // through count how long it has been stuck.)
        // a better landing often makes the ride fall further on (it comes at what follows faster or slower): every other
        // round then goes to riding on from such a try (this.fix), as long as it keeps getting further, for up to 40 rounds
        if (this.fix && (!finished || this.fix.n >= 40)) this.fix = null;
        const fixing = !!this.fix && this.gen % 2 === 1;
        // a Training drill works on its goal (one round in four while it is not yet ridden to the end: the odd rounds
        // between go to other ways of riding up to where it falls, below)
        const D = this.route.drill;
        // a line ridden to the end also works on its pumping, one round in five (faster for the same points)
        const target = fixing ? null : D ? (finished || this.gen % 4 === 1 ? this.drillTarget(passedJumps, finished) : null)
          : finished && this.gen % 5 === 2 ? { pump: true } : finished && passedJumps.length ? this.pointsTarget(passedJumps) : null;
        let cands, until, mode;
        if (target && (target.manual || target.pump)) {
          cands = target.pump ? this.pumpCandidates(LAMBDA) : this.manualCandidates(LAMBDA);
          this.borrowed = new Set();
          until = undefined;
          mode = target.pump ? 'pump' : 'manual';
        } else if (fixing) {
          // After a trick try, every other round lands that jump better with the trick kept (see the trick round below).
          // A try followed that rides to the end (a jump landed better, the points lost further on) works on the first
          // jump after it that lands worse than in the best ride.
          const F = this.fix;
          let j = F.land !== undefined && F.n % 2 === 0 ? F.land : -1;
          if (j < 0 && F.best.end === 'về đích') j = this.worseJump(F.best);
          cands = j >= 0 ? this.landCandidates(j, LAMBDA, F.plan, F.best)
            : this.rideCandidates(Math.min(S.length - 1, F.best.crashSec), LAMBDA, 1.5, F.plan);
          this.borrowed = new Set();
          until = undefined;
          mode = 'fix';
        } else if (target) {
          // the whole line is ridden every time: a jump's points count only with the streak of the jumps before it
          cands = target.land ? this.landCandidates(target.j, LAMBDA) : this.trickCandidates(target.j, LAMBDA);
          this.borrowed = new Set();
          until = undefined;
          mode = target.land ? 'land' : 'trick';
        } else if (!finished && this.stuck > 100 && this.gen % 2) {
          // Long stuck, the way the AI rides up to that place may lead nowhere: it may come at a jump in a way that only
          // just gets it past what comes before (on one line it cased a gap, hit the face of the landing and lost all
          // its speed for the next jump). So every other round goes to another way: sections before the place drawn
          // anew, the best of them followed for 60 rounds, and taken as soon as it gets further than the AI's best.
          const A = this.alt;
          if (!A || A.n >= 60) { this.alt = null; cands = this.wildCandidates(Math.min(S.length - 1, best.crashSec), LAMBDA); }
          else cands = this.rideCandidates(Math.min(S.length - 1, A.best.crashSec), LAMBDA, 2, A.plan);
          this.borrowed = new Set();
          until = Math.min(this.N, best.prog + 120);
          mode = 'other';
        } else {
          const k = Math.min(S.length - 1, best.crashSec);
          cands = this.rideCandidates(k, LAMBDA, 1 + Math.min(2, this.stuck / 15));
          until = finished ? undefined : Math.min(this.N, best.prog + 120);
          mode = 'ride';
        }
        const other = mode === 'other';
        if (mode === 'manual' || mode === 'pump') cands.unshift(clonePlan(this.plan));
        else if (mode === 'fix') cands.unshift(clonePlan(this.fix.plan));
        else if (!other) cands.unshift(clonePlan(this.plan));
        else if (this.alt) cands.unshift(clonePlan(this.alt.plan));
        const res = await this.pool.evalAll(cands, until);
        if (!this.running && !res) break;
        if (mode === 'trick') this.learnBook(target.j, cands, res);
        this.noteMarks(cands, res);
        const prev = this.best;
        let bi = 0;
        res.forEach((r, i) => { if (beats(r, res[bi])) bi = i; });
        let improved = false, borrowed = false;
        if (mode === 'fix') {
          const F = this.fix;
          F.n++;
          if (beats(res[bi], F.best)) { F.plan = cands[bi]; F.best = res[bi]; }
          if (beats(F.best, this.best)) { this.plan = F.plan; this.best = F.best; improved = true; this.fix = null; }
        } else if (other) {
          if (!this.alt || beats(res[bi], this.alt.best)) this.alt = { plan: cands[bi], best: res[bi], n: this.alt ? this.alt.n : 0 };
          this.alt.n++;
          if (beats(this.alt.best, this.best)) {
            const full = (await this.pool.evalAll([this.alt.plan]))[0];
            if (beats(full, this.best)) { this.plan = this.alt.plan; this.best = full; improved = true; this.stuck = 0; this.alt = null; }
          }
        } else if (bi > 0) {
          const full = until === undefined ? res[bi] : (await this.pool.evalAll([cands[bi]]))[0];
          // compared with the current best, which a lesson from elsewhere may have raised during this round
          if (beats(full, this.best)) {
            this.plan = cands[bi]; this.best = full; improved = true;
            // cands[0] is the current plan, so try i of rideCandidates is cands[i + 1]
            if (this.borrowed.has(bi - 1)) { borrowed = true; this.borrowWins++; }
          }
        } else if (mode === 'land') {
          // no try got as far with more points: keep the one that landed this jump better and rode best after it (to
          // the end with fewer points, too: the jumps after it are then worked on, see fixing)
          const k = target.j, g0 = Math.min(...(best.jl || []).filter(e => e.k === k).map(e => e.g), 9);
          let pick = -1;
          res.forEach((r, i) => {
            const e = i && r.jl.find(q => q.k === k);
            if (e && e.g < g0 && e.g <= 3 && (r.end === 'về đích' || r.prog > e.i + 15) && (pick < 0 || beats(r, res[pick]))) pick = i;
          });
          if (pick > 0 && (!this.fix || beats(res[pick], this.fix.best))) this.fix = { plan: cands[pick], best: res[pick], n: 0 };
        } else if (mode === 'trick') {
          // No try got more points: a trick that was landed (even sketchy) and ridden on from is not thrown away. It is
          // followed for 40 rounds (this.fix), landing that jump better with the trick kept and riding on from it, as a
          // trick costs the landing and the speed after it until the rest of the line is fitted to it.
          const j = target.j;
          let pick = -1;
          res.forEach((r, i) => {
            const e = i && firstLandings(r).get(j);
            if (e && e.tr && e.g <= 3 && !(r.crash && r.crashSec === j) && (r.end === 'về đích' || r.prog > e.i + 15) && (pick < 0 || beats(r, res[pick]))) pick = i;
          });
          if (pick > 0 && (!this.fix || beats(res[pick], this.fix.best))) this.fix = { plan: cands[pick], best: res[pick], n: 0, land: j };
        }
        // a jump worked on for its landing without landing it better counts one more failed round (see landCandidates)
        if (mode === 'land') {
          const k = target.j, g = r => { const e = firstLandings(r).get(k); return e ? e.g : 9; };
          const F = this.fails || (this.fails = {});
          F[k] = g(this.best) < g(prev) ? 0 : (F[k] || 0) + 1;
        }
        if (improved && mode === 'ride') this.alt = null;
        if (mode === 'ride') this.stuck = this.best.prog > this.lastProg ? 0 : this.stuck + 1;
        this.lastProg = Math.max(this.lastProg, this.best.prog);
        const news = [];
        for (const k of Object.keys(this.best.tricks)) if (!this.found[k]) { this.found[k] = this.gen + 1; news.push(TRICK_NAMES[k] || k); }
        if (improved || news.length) this.ui.record(this.gen + 1, this.best, news, !improved, borrowed, prev);
        this.gen++;
        if (this.bookDirty && this.gen % 10 === 0) { saveBook(this.setup.tricks, this.book); this.bookDirty = false; }
        const mean = res.reduce((a, r) => a + r.fit, 0) / res.length;
        this.hist.push([this.gen, Math.round(this.best.fit), Math.round(mean), this.best.prog]);
        this.ui.progress({ gen: this.gen, best: this.best, mean, ms: performance.now() - t0, mode, tries: res.length });
        // saved at once when better, so other tabs learning this line pick it up
        if (improved || this.gen % 5 === 0) this.save();
      }
      this.save();
      if (this.bookDirty) { saveBook(this.setup.tricks, this.book); this.bookDirty = false; }
      this.running = false;
    }
    // Writes into the trick book what each trick try on jump j did (cands[0], the plan as it was, is not a try).
    learnBook(j, cands, res) {
      const ref = this.airOf(j);
      for (let i = 1; i < cands.length; i++) {
        const mv = cands[i].mv[j] | 0, r = res[i];
        if (!mv || !r) continue;
        const e = r.jl.find(q => q.k === j), fell = !e || (r.crash && r.crashSec === j);
        if (!e && !ref) continue;
        this.book.push([e ? e.a : ref, mv, fell ? 0 : 1, e ? e.tr : 0, e ? e.g : 0]);
      }
      if (this.book.length > BOOK_ROWS) this.book.splice(0, this.book.length - BOOK_ROWS);
      this.bookDirty = true;
    }
    // The best plan ridden once more with a recording of the ride.
    async bestRide() { return this.pool ? this.pool.replay(this.plan) : null; }
  }

  // ---------------------------------------------------------------- the shared brain
  // One brain learns to ride many lines at once by evolution strategies: each round it rides many slightly changed
  // copies of itself (every change tried both ways) on a few of its lines, and moves its weights toward the changes
  // that rode better. The line chosen in the list is kept aside and never learned on: how far the brain rides it shows
  // whether it can ride a line it has never seen. The best brain so far on all its lines is the one kept and used.
  // version 2: wider speed and air outputs (brainSpeed), so the numbers of a version 1 brain mean something else
  const BRAIN_KEY = 'trailsai.brain2';
  const BRAIN_FORMAT = 'trails-ai-brain', BRAIN_VERSION = 2;
  const BRAIN_URL = `https://raw.githubusercontent.com/${REPO}/main/brain/brain.json`;
  const BRAIN_CAP = 400;   // metres of each line a brain is scored on (a long line would hold every round up)
  const weightsOk = w => Array.isArray(w) && w.length === BRAIN.size && w.every(num);
  const readBrain = raw => {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    return m && m.format === BRAIN_FORMAT && m.version === BRAIN_VERSION && weightsOk(m.w) ? m : null;
  };
  // The first n metres of a line with only the pieces near them: brains are scored on the start of each line, and
  // fewer pieces load much faster.
  function truncLine(route, n) {
    if (route.length <= n) return route;
    const X = Array.from(route.X).slice(0, n), Z = Array.from(route.Z).slice(0, n);
    const near = (x, z, r) => { for (let i = 0; i < n; i += 3) if (Math.hypot(X[i] - x, Z[i] - z) < r) return true; return false; };
    const pieces = route.pieces.filter(p => near(p.x, p.z, p.kind === 'shape' || p.kind === 'ground' ? 70 : 35));
    return { ...route, X, Z, KIND: route.KIND.slice(0, n), length: n, pieces };
  }
  async function communityBrain() {
    try {
      const r = await fetch(BRAIN_URL + '?t=' + Date.now(), { cache: 'no-store' });
      return r.ok ? readBrain(await r.text()) : null;
    } catch { return null; }
  }

  class BrainTrainer {
    constructor(ui) { this.ui = ui; this.running = false; this.pool = null; this.load(); }
    load() {
      let m = null;
      try { m = readBrain(localStorage.getItem(BRAIN_KEY) || 'null'); } catch { m = null; }
      this.best = m ? m.w : freshBrain();
      this.mean = m && weightsOk(m.mean) ? m.mean : this.best.slice();
      this.adam = m && m.adam && weightsOk(m.adam.m) && weightsOk(m.adam.v) ? m.adam : null;
      this.gen = m && num(m.gen) ? m.gen : 0;
      this.seen = m && Array.isArray(m.lines) ? m.lines.filter(id => typeof id === 'string') : [];
      this.hist = m && Array.isArray(m.hist) ? m.hist : [];
    }
    record() {
      return { format: BRAIN_FORMAT, version: BRAIN_VERSION, arch: BRAIN, w: this.best, mean: this.mean, adam: this.adam, gen: this.gen, lines: this.seen, score: this.score, test: this.test, hist: this.hist.slice(-400), savedAt: Date.now() };
    }
    save() { try { localStorage.setItem(BRAIN_KEY, JSON.stringify(this.record())); } catch { /* storage full: keep learning anyway */ } }
    stop() { this.running = false; }
    // Each worker holds every line; train are learned on, test (may be null) only ridden.
    async prepare(train, test, workers) {
      this.stop();
      if (this.pool) this.pool.close();
      this.setup = riderSetup();
      this.pool = new Pool(workers);
      const routes = (test ? train.concat([test]) : train).map(r => truncLine(r, BRAIN_CAP + 60));
      const metas = await this.pool.initSpread(routes, this.setup);
      this.lines = routes.map((r, i) => ({ id: r.start.id, len: metas[i].length }));
      this.trainIdx = train.map((_, i) => i);
      this.testIdx = test ? train.length : -1;
      this.testId = test ? test.start.id : null;
      for (const r of train) if (!r.practice && !this.seen.includes(r.start.id)) this.seen.push(r.start.id);
      // the kept brain and a new one, on all the lines: where the brain stands, and where it started from
      const all = this.trainIdx.concat(test ? [this.testIdx] : []);
      const [b, f] = await this.rate([this.best, freshBrain()], all);
      const part = (r, idx) => ({ fit: r.fit(idx), share: r.share(idx), runs: idx.map(i => r.runs[all.indexOf(i)]) });
      this.score = part(b, this.trainIdx); this.base = part(f, this.trainIdx);
      this.test = test ? part(b, [this.testIdx]) : null; this.testBase = test ? part(f, [this.testIdx]) : null;
    }
    // Rides of each brain on lines idx (scored on their first BRAIN_CAP metres). Per brain: the rides, and for any
    // subset of the lines the mean score per metre (what learning compares) and the mean share of the line ridden.
    async rate(brains, idx) {
      const tasks = [];
      brains.forEach((_, b) => idx.forEach(i => tasks.push([b, i])));
      const res = await this.pool.evalBrains(brains, tasks, BRAIN_CAP);
      const cap = i => Math.min(this.lines[i].len, BRAIN_CAP);
      return brains.map((_, b) => {
        const runs = idx.map((i, k) => res[b * idx.length + k]);
        const over = (sub, f) => sub.reduce((s, i) => s + f(runs[idx.indexOf(i)], i), 0) / sub.length;
        return {
          runs,
          fit: (sub = idx) => over(sub, (r, i) => r.fit / cap(i)),
          share: (sub = idx) => over(sub, (r, i) => Math.min(r.prog, cap(i)) / cap(i)),
        };
      });
    }
    // A brain from elsewhere (a file, the community repo) is ridden on this computer's lines first and kept only if better.
    async offer(w) {
      if (!this.pool || !weightsOk(w)) return null;
      const [r] = await this.rate([w], this.trainIdx);
      const took = await this.keep(w, r);
      return { took, share: r.share() };
    }
    // w (rated r on the training lines) becomes the brain if it rides them better
    async keep(w, r) {
      if (!(r.fit() > this.score.fit + 1e-6)) return false;
      this.best = w.slice(); this.mean = w.slice(); this.adam = null;
      this.score = { fit: r.fit(), share: r.share(), runs: r.runs };
      if (this.testIdx >= 0) { const [t] = await this.rate([this.best], [this.testIdx]); this.test = { fit: t.fit(), share: t.share(), runs: t.runs }; }
      this.save();
      return true;
    }
    // Learn from lessons: plans ([{ line, plan }], line = index into the training lines) ride their lines while the brain
    // watches, then a new brain is taught to do what they did. Only plans that ride further than the brain on their line
    // are teachers. Then a few times over: the taught brain rides those lines itself while the plans say what they would
    // do where it goes, and it is taught again on all of it. The best of these is kept only if it rides the training
    // lines better than the brain already does.
    async distill(plans, rounds = 2) {
      if (!this.pool || !plans.length) return null;
      const seen = await this.pool.watchPlans(plans, BRAIN_CAP);
      const mine = i => this.score.runs[this.trainIdx.indexOf(i)].prog;
      const ok = seen.map((r, k) => r.prog > mine(plans[k].line) + 5);
      const teach = plans.filter((_, k) => ok[k]), sets = seen.filter((_, k) => ok[k]).map(r => r.rows);
      const join = () => {
        const out = new Float64Array(sets.reduce((s, a) => s + a.length, 0));
        let at = 0;
        for (const a of sets) { out.set(a, at); at += a.length; }
        return out;
      };
      const info = { lines: teach.length, rows: 0, took: false, steps: [], plans: seen.map((r, k) => [plans[k].line, r.prog, mine(plans[k].line)]) };
      this.lastDistill = info;
      let rows = join();
      if (rows.length < 28 * 200) return info;
      let w = await fitBrain(freshBrain(), rows, 60), bestW = null, bestR = null;
      for (let k = 0; ; k++) {
        const [r] = await this.rate([w], this.trainIdx);
        info.steps.push(+r.share().toFixed(3));
        if (!bestR || r.fit() > bestR.fit()) { bestW = w; bestR = r; }
        if (k >= rounds - 1) break;
        for (const m of await this.pool.watchPlans(teach, BRAIN_CAP, w)) sets.push(m.rows);
        rows = join();
        w = await fitBrain(w, rows, 30);
      }
      Object.assign(info, { rows: rows.length / 28 | 0, share: bestR.share(), w: bestW, took: await this.keep(bestW, bestR) });
      return info;
    }
    // The next BATCH training lines, taken in turn from a shuffled queue: with many lines a round costs the same, and
    // every line comes up as often.
    nextLines(BATCH) {
      if (!this.queue || this.queue.length < BATCH) {
        const q = this.queue || [];
        this.queue = q.concat(this.trainIdx.slice().sort(() => Math.random() - 0.5).filter(i => !q.includes(i)));
      }
      return this.queue.splice(0, BATCH);
    }
    async run() {
      if (this.running || !this.pool) return;
      this.running = true;
      this.queue = null;
      try { await this.learn(); } finally { this.save(); this.running = false; }
    }
    // Evolution strategies: P changes of the mean brain, each tried both ways on the same BATCH lines, and the mean
    // moved toward the changes that rode better. (Measured against climbing as a line's lesson does, from a new brain
    // for 6 minutes: climbing learned the training lines as fast but rode lines it had not seen worse, 42 % to 35 %,
    // while this went 42 % to 46 %.)
    async learn() {
      const n = BRAIN.size, P = 10, SIG = 0.15, LR = 0.03, WD = 0.002, BATCH = 12;
      if (!this.adam) this.adam = { m: new Array(n).fill(0), v: new Array(n).fill(0), t: 0 };
      const A = this.adam;
      while (this.running) {
        const t0 = performance.now(), pick = this.nextLines(BATCH);
        const eps = Array.from({ length: P }, () => Array.from({ length: n }, gauss));
        const brains = [];
        for (const e of eps) { brains.push(this.mean.map((w, i) => w + SIG * e[i])); brains.push(this.mean.map((w, i) => w - SIG * e[i])); }
        const rates = await this.rate(brains, pick);
        if (!this.running) break;
        // by rank, not raw score: one lucky ride cannot swing the step; equal scores share a rank (else the change
        // listed first would always count as the worse one)
        const fits = rates.map(r => r.fit());
        const order = fits.map((_, i) => i).sort((a, b) => fits[a] - fits[b]);
        const rank = new Array(fits.length);
        for (let k = 0; k < order.length;) {
          let e = k;
          while (e + 1 < order.length && fits[order[e + 1]] === fits[order[k]]) e++;
          for (let q = k; q <= e; q++) rank[order[q]] = (k + e) / 2 / (fits.length - 1) - 0.5;
          k = e + 1;
        }
        const g = new Array(n).fill(0);
        eps.forEach((e, p) => { const d = rank[2 * p] - rank[2 * p + 1]; for (let i = 0; i < n; i++) g[i] += d * e[i]; });
        A.t++;
        for (let i = 0; i < n; i++) {
          const gi = g[i] / (2 * P * SIG) - WD * this.mean[i];
          A.m[i] = 0.9 * A.m[i] + 0.1 * gi; A.v[i] = 0.999 * A.v[i] + 0.001 * gi * gi;
          this.mean[i] += LR * (A.m[i] / (1 - 0.9 ** A.t)) / (Math.sqrt(A.v[i] / (1 - 0.999 ** A.t)) + 1e-8);
        }
        this.gen++;
        let improved = false;
        // every 5 rounds the brain itself rides all its lines, and is kept if it rides them better than the best so far
        if (this.gen % 5 === 0) {
          const [r] = await this.rate([this.mean], this.trainIdx);
          if (r.fit() > this.score.fit + 1e-6) {
            this.best = this.mean.slice(); this.score = { fit: r.fit(), share: r.share(), runs: r.runs }; improved = true;
            if (this.testIdx >= 0) { const [t] = await this.rate([this.best], [this.testIdx]); this.test = { fit: t.fit(), share: t.share(), runs: t.runs }; }
          }
          this.hist.push([this.gen, +this.score.share.toFixed(4), +r.share().toFixed(4), this.test ? +this.test.share.toFixed(4) : null]);
          this.save();
        }
        this.ui.brainProgress({ gen: this.gen, ms: performance.now() - t0, tries: brains.length * pick.length, improved });
      }
    }
  }

  // ---------------------------------------------------------------- panel
  const css = `
  #tai{position:fixed;top:64px;right:12px;width:330px;max-height:calc(100vh - 80px);overflow:auto;z-index:2147483000;
    background:rgba(18,22,28,.94);color:#e8edf2;font:13px/1.4 system-ui,sans-serif;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:12px 14px}
  #tai h3{margin:0 0 6px;font-size:15px;display:flex;justify-content:space-between;align-items:center}
  #tai .x{background:none;border:0;color:#9aa;font-size:18px;cursor:pointer}
  #tai select,#tai button.b{width:100%;margin:4px 0;padding:7px 9px;border-radius:9px;border:1px solid #334;background:#232a33;color:#e8edf2;font:inherit}
  #tai button.b{cursor:pointer;background:#2f6fde;border-color:#2f6fde;font-weight:600}
  #tai button.b.g{background:#232a33;border-color:#3a4554;font-weight:500}
  #tai button.b:disabled{opacity:.45;cursor:default}
  #tai .row{display:flex;gap:6px}#tai .row>*{flex:1}#tai .row.s button.b{font-size:12px;padding:7px 4px}
  #tai .row.big button.b{font-size:16px;padding:12px 6px;border-radius:11px}
  #tai button.b.on{background:#c0392b;border-color:#c0392b}
  #tai .row.pk>select{flex:1}#tai .row.pk>button.b{flex:0 0 40px;padding:7px 0}
  #tai details.more{margin-top:8px;border-top:1px solid #2a323c;padding-top:6px}
  #tai details.more summary{cursor:pointer;color:#9fb0c2;padding:4px 0}
  #tai .st{color:#9fb0c2;margin:4px 0 8px;min-height:18px}
  #tai .sec{margin:12px 0 2px;padding-top:10px;border-top:1px solid #2a323c;font-weight:600;color:#fff}
  #tai .sec small{display:block;font-weight:400;color:#9fb0c2;font-size:12px}
  #tai .kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:6px 0}
  #tai .kv b{color:#fff;font-weight:600;text-align:right}
  #tai canvas{width:100%;height:90px;background:#141920;border-radius:8px;margin:6px 0}
  #tai .log{max-height:130px;overflow:auto;font-size:12px;color:#c9d4df;border-top:1px solid #2a323c;padding-top:6px}
  #tai .jr{font-size:12px;margin:3px 0;line-height:1.35}#tai .jr small{color:#9fb0c2}#tai .g1,#tai .g2{color:#9be3b0}#tai .g3{color:#ffd166}#tai .g4,#tai .g5{color:#ff8a7a}
  #tai .log div{margin:2px 0}#tai .tag{display:inline-block;background:#1f3d2a;color:#9be3b0;border-radius:6px;padding:0 6px;margin:1px 3px 1px 0;font-size:12px}
  #tai-view{position:fixed;inset:0;z-index:2147483001;background:rgba(6,9,13,.72);display:flex;align-items:center;justify-content:center;font:14px/1.4 system-ui,sans-serif;color:#e8edf2}
  #tai-view .card{width:min(980px,96vw);background:#141920;border-radius:16px;padding:12px;box-shadow:0 16px 50px rgba(0,0,0,.5)}
  #tai-view .bar{display:flex;gap:8px;align-items:center;margin-bottom:8px}#tai-view .bar b{flex:1;font-size:15px}
  #tai-view button{font:inherit;padding:6px 12px;border-radius:9px;border:1px solid #3a4554;background:#232a33;color:#e8edf2;cursor:pointer}
  #tai-view canvas{display:block;width:100%;aspect-ratio:960/420;border-radius:10px}
  #tai-badge{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;background:rgba(18,22,28,.9);color:#ffd166;
    font:600 15px/1.4 system-ui,sans-serif;padding:8px 16px;border-radius:12px;pointer-events:none;text-align:center}
  #tai-badge small{display:block;color:#c9d4df;font-weight:400;font-size:12px}`;

  // ---------------------------------------------------------------- watching a ride (side view of the line)
  const CRASH_NAMES = ['', 'Cắm đầu', 'Đập xuống đất', 'Lật xe', 'Bay qua ghi-đông', 'Bắt chéo khi tiếp đất', 'Lộn quá đà', 'Không bắt kịp khung xe', 'Không bắt kịp ghi-đông', 'Tiếp đất nghiêng'];
  const trickText = got => Object.entries(got).map(([k, n]) => (TRICK_NAMES[k] || k) + (k === 'whip' ? ` ${Math.round(n)}°` : n > 1 ? ` ×${n}` : '')).join(' + ');

  function showRide(run) {
    const { tr, ev, H } = run.trace, F = 5, n = tr.length / F;
    if (n < 2) return;
    const box = document.createElement('div'); box.id = 'tai-view';
    box.innerHTML = `<div class="card"><div class="bar"><b>Lượt chạy tốt nhất của AI · ${run.prog} m · ${typeof run.game === 'number' ? run.game + ' điểm game' : Math.round(run.fit) + ' điểm'}</b>
      <button class="sp">Tốc độ ×1</button><button class="again">Xem lại</button><button class="close">Đóng</button></div>
      <canvas width="960" height="420"></canvas></div>`;
    document.body.appendChild(box);
    const c = box.querySelector('canvas'), x = c.getContext('2d'), W = c.width, Hh = c.height;
    const at = (i, k) => tr[Math.min(n - 1, i) * F + k];
    const ground = d => { const i = Math.max(0, Math.min(H.length - 2, Math.floor(d))), f = d - i; return H[i] * (1 - f) + H[i + 1] * f; };
    let T = 0, speed = 1, last = performance.now(), camY = at(0, 1), raf = 0, closed = false;
    const shown = [];
    const close = () => { closed = true; cancelAnimationFrame(raf); box.remove(); };
    box.querySelector('.close').onclick = close;
    box.onclick = e => { if (e.target === box) close(); };
    box.querySelector('.again').onclick = () => { T = 0; shown.length = 0; };
    box.querySelector('.sp').onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; e.target.textContent = `Tốc độ ×${speed}`; };

    function bike(bx, by, ang, crashed) {
      x.save(); x.translate(bx, by); x.rotate(ang);
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = '#dfe7ef'; x.lineWidth = 3;
      for (const wx of [-15, 15]) { x.beginPath(); x.arc(wx, 0, 10, 0, Math.PI * 2); x.stroke(); }
      x.strokeStyle = '#4da3ff'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(-15, 0); x.lineTo(-3, -1); x.lineTo(11, -13); x.lineTo(15, 0); x.moveTo(-3, -1); x.lineTo(-6, -13); x.lineTo(11, -13); x.stroke();
      // rider
      x.strokeStyle = crashed ? '#ff8a7a' : '#ffd166'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-6, -15); x.lineTo(-1, -33); x.lineTo(12, -20); x.stroke();
      x.beginPath(); x.arc(1, -40, 6, 0, Math.PI * 2); x.fillStyle = x.strokeStyle; x.fill();
      x.restore();
    }

    function frame(now) {
      if (closed) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      T = Math.min((n - 1) * 2 + 90, T + dt * 60 * speed);
      const fi = Math.min(n - 1.001, T / 2), i = Math.floor(fi), f = fi - i;
      const lerp = k => at(i, k) * (1 - f) + at(i + 1, k) * f;
      const d = lerp(0), y = lerp(1), pitch = lerp(2), air = at(i, 3), sp = at(i, 4);
      camY += (y + 2 - camY) * Math.min(1, dt * 3);
      const S = 14, cx = W * 0.35, cy = Hh * 0.55;
      const X = m => cx + (m - d) * S, Y = h => cy - (h - camY) * S;
      // sky and ground
      const sky = x.createLinearGradient(0, 0, 0, Hh); sky.addColorStop(0, '#1d3557'); sky.addColorStop(1, '#4a6b8a');
      x.fillStyle = sky; x.fillRect(0, 0, W, Hh);
      const m0 = d - cx / S - 1, m1 = d + (W - cx) / S + 1;
      x.beginPath(); x.moveTo(X(m0), Hh);
      for (let m = m0; m <= m1; m += 0.5) x.lineTo(X(m), Y(ground(m)));
      x.lineTo(X(m1), Hh); x.closePath();
      x.fillStyle = '#3b2f24'; x.fill();
      x.strokeStyle = '#7bb661'; x.lineWidth = 4; x.beginPath();
      for (let m = m0; m <= m1; m += 0.5) m === m0 ? x.moveTo(X(m), Y(ground(m))) : x.lineTo(X(m), Y(ground(m)));
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '13px system-ui';
      for (let m = Math.ceil(m0 / 50) * 50; m < m1; m += 50) { x.fillRect(X(m), Y(ground(m)) - 30, 2, 30); x.fillText(`${m} m`, X(m) + 4, Y(ground(m)) - 20); }
      // the rider
      const tick = Math.round(T);
      const crashEv = ev.find(e => e.crash && e.t <= tick);
      const tumble = crashEv ? Math.min(2.5, (tick - crashEv.t) / 25) : 0;
      bike(X(d), Y(y) - 6, -pitch + tumble, !!crashEv);
      // events that have happened so far
      // the game's points: landings carry them (the AI's own trick estimate only when the ride has no landings recorded)
      const lands = ev.some(e => e.land);
      let pts = 0;
      for (const e of ev) if (e.t <= tick) {
        if (lands ? e.land : e.got) pts += e.p;
        if (!shown.includes(e) && !(lands && e.got)) shown.push(e);
      }
      const recent = shown.filter(e => tick - e.t < 150).slice(-2);
      x.textAlign = 'center';
      recent.forEach((e, k) => {
        const age = (tick - e.t) / 150;
        x.globalAlpha = 1 - age * age; x.font = 'bold 30px system-ui';
        x.fillStyle = e.crash || e.land >= 4 ? '#ff8a7a' : '#ffd166';
        const words = e.land ? [GRADE_NAMES[e.land], trickWords(e.tr, e.sp)].filter(Boolean).join(' + ') + `  +${e.p}${e.m > 1 ? ' ×' + e.m : ''}` : `${trickText(e.got)}  +${e.p}`;
        x.fillText(e.crash ? `Ngã: ${CRASH_NAMES[e.crash] || 'mất lái'}` : words, W / 2, 70 + k * 38 - age * 20);
      });
      x.globalAlpha = 1; x.textAlign = 'left';
      // numbers
      x.fillStyle = 'rgba(10,14,20,.55)'; x.fillRect(12, Hh - 46, 420, 34);
      x.fillStyle = '#e8edf2'; x.font = '16px system-ui';
      x.fillText(`${Math.round(d)} m   ·   ${lands ? '' : 'trick '}${pts} điểm   ·${Math.round(sp * 3.6)} km/h${air ? '   ·   đang bay' : ''}`, 22, Hh - 23);
      if (T >= (n - 1) * 2 + 60) {
        x.fillStyle = 'rgba(10,14,20,.7)'; x.fillRect(W / 2 - 220, Hh / 2 - 40, 440, 64);
        x.fillStyle = '#fff'; x.font = 'bold 20px system-ui'; x.textAlign = 'center';
        x.fillText(`Hết lượt: ${run.end} sau ${run.prog} m`, W / 2, Hh / 2); x.textAlign = 'left';
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function makePanel() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const el = document.createElement('div'); el.id = 'tai';
    el.innerHTML = `
      <h3>AI tự học Trails <button class="x" title="Ẩn">×</button></h3>
      <div class="st">Đang chuẩn bị…</div>
      <div class="row pk"><select class="pick"><option>Đang tìm đường gần bạn…</option></select><button class="b g rename" title="Đặt tên cho đường này">✎</button><button class="b g refresh" title="Tìm lại đường gần tôi">↻</button></div>
      <div class="row big"><button class="b learn" disabled>Học lái</button><button class="b drive" disabled>AI lái</button></div>
      <div class="kv">
        <span>Đang làm</span><b class="k-now">–</b>
        <span>Đường này</span><b class="k-line">chưa học</b>
        <span>Bộ não chung</span><b class="k-brain">–</b>
      </div>
      <div class="log"></div>
      <details class="more"><summary>Chi tiết, xem lại và chia sẻ</summary>
      <div class="sec">Bài học của đường này<small>Kế hoạch AI tự tìm cho riêng đường đang chọn.</small></div>
      <div class="kv">
        <span>Vòng học</span><b class="k-gen">0</b>
        <span>Đang tập</span><b class="k-mode">–</b>
        <span>Điểm cao nhất</span><b class="k-best">–</b>
        <span>Quãng đường tốt nhất</span><b class="k-prog">–</b>
        <span>Lượt chạy tốt nhất</span><b class="k-end">–</b>
        <span>Tốc độ học</span><b class="k-speed">–</b>
        <span>Mượn kinh nghiệm</span><b class="k-borrow">–</b>
      </div>
      <div class="k-tricks"></div>
      <div class="sec">Xem lại từng cú nhảy<small>Lượt tốt nhất, chấm như game chấm: kiểu tiếp đất, trick, điểm và chuỗi nhân.</small></div>
      <div class="k-jumps"><div class="jr">Chưa có lượt nào.</div></div>
      <div class="k-book"></div>
      <canvas width="600" height="180"></canvas>
      <div class="row"><button class="b g watch" disabled>Xem lại lượt chạy tốt nhất</button></div>
      <div class="row s"><button class="b g export" disabled>Lưu ra file</button><button class="b g import">Mở file</button><button class="b g share" disabled>Chia sẻ GitHub</button></div>
      <input type="file" accept=".json,application/json" class="file" hidden>
      <div class="row"><button class="b g forget" disabled>Quên đường này, học lại từ đầu</button></div>
      <div class="sec">Bộ não chung<small>Một mạng nơ-ron luyện trên nhiều đường cùng lúc để lái được cả đường chưa từng thấy. Đường đang chọn được để riêng làm bài kiểm tra. Bộ não cũng cho đường mới một cách bắt đầu.</small></div>
      <div class="kv">
        <span>Vòng luyện</span><b class="b-gen">0</b>
        <span>Luyện trên</span><b class="b-lines">–</b>
        <span>Trên các đường luyện</span><b class="b-train">–</b>
        <span>Đường chưa từng thấy</span><b class="b-test">–</b>
        <span>Tốc độ luyện</span><b class="b-speed">–</b>
      </div>
      <div class="row s"><button class="b g brain-export">Lưu bộ não</button><button class="b g brain-import">Mở bộ não</button><button class="b g brain-share">Chia sẻ GitHub</button></div>
      <input type="file" accept=".json,application/json" class="bfile" hidden>
      </details>`;
    document.body.appendChild(el);
    const $ = s => el.querySelector(s);
    return { el, $ };
  }

  function main() {
    const { el, $ } = makePanel();
    // every CPU thread but two (kept for the game itself) learns; past 16 the workers' start-up costs more than they add
    const workers = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 2));
    let routeCache = new Map(), choices = [], busy = false;
    const say = t => { $('.st').textContent = t; };
    const log = (html) => { const d = document.createElement('div'); d.innerHTML = html; $('.log').prepend(d); };
    const fmtTricks = tr => Object.entries(tr || {}).map(([k, n]) => `<span class="tag">${TRICK_NAMES[k] || k}${k === 'whip' ? '' : k === 'manual' ? ' ' + n + ' m' : n > 1 ? ' ×' + n : ''}</span>`).join('') || '<span style="color:#7d8a97">chưa có trick nào</span>';

    const ui = {
      record(gen, run, news, onlyNews, borrowed, prev) {
        if (news.length) log(`<b>Vòng ${gen}:</b> lần đầu làm được ${news.map(n => `<span class="tag">${n}</span>`).join('')}`);
        if (onlyNews) return;
        const n = run.jl ? run.jl.length : run.jumps, pts = typeof run.game === 'number' ? `${run.game} điểm game` : `${Math.round(run.fit)} điểm`;
        // with the line ridden to the end both times: which jumps were landed or tricked differently
        const what = [];
        if (prev && prev.jl && run.jl && prev.end === 'về đích' && run.end === 'về đích') {
          // a jump is the same jump in both rides when it came down within 12 m
          const used = new Set();
          run.jl.forEach((b, i) => {
            const a = prev.jl.find(q => !used.has(q) && Math.abs(q.i - b.i) < 12);
            if (!a) return;
            used.add(a);
            if (a.g !== b.g) what.push(`cú ${i + 1}: ${GRADE_NAMES[a.g]} → ${GRADE_NAMES[b.g]}`);
            if (b.tr && b.tr !== a.tr) what.push(`cú ${i + 1}: ${trickWords(b.tr, b.sp)}`);
          });
        }
        const up = what.length ? ` · ${what.slice(0, 4).join(', ')}` : '';
        // how fast, and what pumping gave (a good pump: in a dip, timed as the game's Training wants)
        const kmh = v => (v * 3.6).toFixed(1);
        const pace = typeof run.vAvg === 'number' ? ` · trung bình ${kmh(run.vAvg)} km/h${run.goodPumps ? `, ${run.goodPumps} cú pump đúng nhịp (+${kmh(run.pumpGain)} km/h)` : ''}` : '';
        // a Training drill: how much of its goal the ride gets
        const goal = run.goal ? ` · mục tiêu bài tập ${run.goal.n}/${run.goal.need}${goalMet(run) ? ' ✓' : ''}` : '';
        if (goalMet(run) && !goalMet(prev)) log(`<b>Vòng ${gen}: AI đạt mục tiêu của bài tập trong mô phỏng.</b> Mở bài này trong Training rồi bấm “AI lái” để AI làm bài thật.`);
        log(`Vòng ${gen}: kỷ lục mới ${run.prog} m (${pts}${prev && typeof prev.game === 'number' && run.end === 'về đích' && prev.end === 'về đích' ? `, trước ${prev.game}` : ''}, ${n} cú nhảy, ${run.end})${pace}${goal}${up}${borrowed ? ' · <b>nhờ kinh nghiệm từ đường khác</b>' : ''}`);
      },
      progress(p) {
        $('.k-gen').textContent = p.gen;
        $('.k-mode').textContent = p.mode === 'trick' ? 'trick trên các cú nhảy' : p.mode === 'land' ? 'tiếp đất đẹp hơn, giữ chuỗi nhân' : p.mode === 'fix' ? 'chạy tiếp sau cú tiếp đất đẹp hơn' : p.mode === 'manual' ? 'manual (bánh sau)' : p.mode === 'pump' ? 'pump qua các chỗ trũng (lấy tốc độ)' : 'vượt hết đường';
        showBest(p.best);
        $('.k-speed').textContent = `${(p.ms / 1000).toFixed(1)} s / vòng (${p.tries} lần thử, ${workers} luồng)`;
        showBorrow();
        draw();
      },
      brainProgress(p) {
        $('.b-speed').textContent = `${(p.ms / 1000).toFixed(1)} s / vòng (${p.tries} lượt chạy)`;
        showBrain();
        if (p.improved) log(`Bộ não vòng ${p.gen}: kỷ lục mới, đi được ${pct(brain.score.share)} quãng đường các đường luyện${brain.test ? `, ${brain.test.runs[0].prog} m trên đường chưa từng thấy` : ''}.`);
      },
    };
    const pct = v => `${Math.round(v * 100)}%`;
    function showBrain() {
      $('.b-gen').textContent = brain.gen;
      $('.k-brain').textContent = !brain.gen ? 'chưa luyện' : brain.score ? `đi được ${pct(brain.score.share)} trên ${brain.trainIdx.length} đường` : `đã luyện ${brain.gen} vòng`;
      if (!brain.lines) return;
      $('.b-lines').textContent = `${brain.trainIdx.length} đường`;
      $('.b-train').textContent = `${pct(brain.score.share)} quãng đường (lúc mới: ${pct(brain.base.share)})`;
      const cap = brain.testIdx >= 0 ? Math.min(brain.lines[brain.testIdx].len, BRAIN_CAP) : 0;
      $('.b-test').textContent = brain.test ? `${brain.test.runs[0].prog} / ${cap} m (lúc mới: ${brain.testBase.runs[0].prog} m)` : '–';
    }
    // The best ride's jumps one by one, as the game grades and counts them, with what to change on the ones not landed clean.
    function jumpReview(b) {
      const jl = b && b.jl;
      if (!jl) return '<div class="jr">Chưa có lượt nào được chấm.</div>';
      if (!jl.length) return '<div class="jr">Lượt này chưa có cú nhảy nào được game tính.</div>';
      const runIn = trainer.route ? trainer.N - trainer.route.length : 0, c =[0, 0, 0, 0, 0, 0], fits = bookSummary(trainer.book || []).filter(x => x.n);
      let top = 1;
      for (const e of jl) { c[e.g]++; top = Math.max(top, e.m); }
      return `<div class="jr"><b>${b.game} điểm</b> theo cách game tính · ${gradeCount(c)} · chuỗi cao nhất ×${top}</div>` + jl.map((e, n) => {
        const tip = landingTip(e, fits);
        return `<div class="jr"><b>${n + 1}.</b> ${Math.max(0, e.i - runIn)} m · bay ${e.a.toFixed(2)} s, cao ${e.h.toFixed(1)} m, xa ${e.d.toFixed(1)} m · <span class="g${e.g}">${GRADE_NAMES[e.g]}</span>${e.tr ? ' · ' + trickWords(e.tr, e.sp) : ''} · <b>+${e.p}</b>${e.m > 1 ? ` (×${e.m})` : ''}${tip ? `<br><small>${tip}</small>` : ''}</div>`;
      }).join('');
    }
    function bookText() {
      if (!trainer.setup) return '';
      if (!trainer.setup.tricks) return '<div class="jr"><b>Sổ tay trick:</b> tài khoản chưa mở khóa trick, nên AI chỉ tập tiếp đất đẹp và giữ chuỗi.</div>';
      const B = trainer.book || [];
      return `<div class="jr"><b>Sổ tay trick</b> (${B.length} lần thử): ${bookSummary(B).map(x => (x.n ? `${x.name} làm được từ ${x.min.toFixed(2)} s bay (${x.n}/${x.tries} lần)` : `${x.name} chưa làm được`)).join(' · ')}</div>`;
    }
    function showBest(b) {
      if (!b) return;
      $('.k-best').textContent = typeof b.game === 'number' ? `${b.game} (cách game tính)` : Math.round(b.fit);
      $('.k-jumps').innerHTML = jumpReview(b);
      $('.k-book').innerHTML = bookText();
      $('.k-prog').textContent = `${b.prog} / ${trainer.N} m`;
      $('.k-end').textContent = `${b.end}, ${b.jumps} cú nhảy${b.goal ? ` · mục tiêu bài tập ${b.goal.n}/${b.goal.need}${goalMet(b) ? ' ✓' : ''}` : ''}`;
      $('.k-tricks').innerHTML = fmtTricks(b.tricks);
      $('.watch').disabled = $('.export').disabled = $('.share').disabled = false;
      showLine();
    }
    // how far the AI gets on the line chosen in the list: learning it now, or as saved by an earlier session
    function showLine() {
      const o = choices[+$('.pick').value];
      let t = '–';
      if (o && trainer.route && trainer.route.start.id === o.s.id && trainer.best) t = `AI đi được ${trainer.best.prog} / ${trainer.N} m`;
      else if (o) {
        let m = null;
        try { m = JSON.parse(localStorage.getItem(STORE + o.s.id) || 'null'); } catch { m = null; }
        t = m && m.bestRun ? `AI đi được ${m.bestRun.prog} m` : 'chưa học';
      }
      $('.k-line').textContent = t;
    }
    const trainer = new Trainer(ui);
    const brain = new BrainTrainer(ui);
    function showBorrow() {
      if (!trainer.borrow) return;
      const alike = trainer.borrow.filter(Boolean).length, jumps = trainer.secs.filter(s => s.jump).length;
      $('.k-borrow').textContent = alike ? `${alike}/${jumps} cú nhảy giống · giúp ${trainer.borrowWins} lần` : `chưa có cú nhảy giống`;
    }

    function draw() {
      const c = $('canvas'), x = c.getContext('2d'), h = trainer.hist;
      x.clearRect(0, 0, c.width, c.height);
      if (h.length < 2) return;
      const max = Math.max(...h.map(r => r[1]), 1), min = Math.min(0, ...h.map(r => r[2]));
      const X = i => 8 + (i / (h.length - 1)) * (c.width - 16), Y = v => c.height - 10 - (v - min) / (max - min) * (c.height - 24);
      const line = (k, col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); h.forEach((r, i) => i ? x.lineTo(X(i), Y(r[k])) : x.moveTo(X(i), Y(r[k]))); x.stroke(); };
      line(2, '#5d7085'); line(1, '#4da3ff');
      x.fillStyle = '#9fb0c2'; x.font = '22px system-ui'; x.fillText(`cao nhất ${max}`, 12, 26);
    }

    async function findTracks() {
      say('Đang chờ game tải xong…');
      for (let i = 0; i < 180 && !(live.g && cap.starts.length && cap.chunks.size); i++) await new Promise(r => setTimeout(r, 500));
      say('Đang tìm đường quanh bạn…');
      if (!cap.chunks.size) {
        if (cap.ws && cap.ws.readyState === 1) {
          say('Đang lấy dữ liệu đường đua (game sẽ kết nối lại một lần)…');
          cap.ws.close();
          for (let i = 0; i < 40 && cap.chunks.size < 4; i++) await new Promise(r => setTimeout(r, 500));
          await new Promise(r => setTimeout(r, 2500));
        } else {
          say('Chưa bắt được kết nối của game. Hãy đạp xe một chút rồi bấm nút ↻ cạnh danh sách đường.');
          return;
        }
      }
      const me = await whereAmI();
      if (!me) { say('Chưa biết bạn đang ở đâu. Hãy đạp xe một chút rồi thử lại.'); return; }
      const near = cap.starts.map(s => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) })).filter(o => o.d < 600).sort((a, b) => a.d - b.d).slice(0, 15);
      // the Training drill open in the game comes first
      const drills = await drillsNow();
      choices = drills.map(r => ({ s: r.start, d: 0, drill: r })).concat(near);
      listLines();
      $('.learn').disabled = $('.drive').disabled = !choices.length;
      showLine();
      if (drills.length) say(`Bạn đang mở bài tập “${drills.map(r => DRILL_GOALS[r.drill.goal].name).join(' / ')}” trong Training: nó ở đầu danh sách. Bấm “Học lái” để AI tập bài này trong mô phỏng, rồi “AI lái” để AI làm bài thật.`);
      else say(near.length ? `Tìm thấy ${near.length} điểm xuất phát gần ${me.how}. Chọn đường (gần nhất ở trên cùng) rồi bấm “Học lái” hoặc “AI lái”.` : 'Không có đường nào trong vòng 600 m. Hãy đến gần một đường rồi bấm ↻.');
    }
    // opening a drill in the game's Training (or leaving it) brings the list up to date, while the AI is not busy
    let spawnSeen = live.spawn;
    setInterval(async () => {
      if (live.spawn === spawnSeen || busy || learning || live.drive || looping || starting) return;
      spawnSeen = live.spawn;
      const ds = await drillsNow();
      if (ds.length ? !choices.some(o => o.drill && o.s.id === ds[0].start.id) : choices.some(o => o.drill)) findTracks();
    }, 1500);
    function listLines() {
      const sel = $('.pick'), at = sel.value;
      sel.innerHTML = choices.length ? choices.map((o, i) => `<option value="${i}">${i + 1}. ${esc(lineName(o.s.id))} · ${o.drill ? 'bài tập đang mở' : `cách ${Math.round(o.d)} m`}${hasMemory(o.s.id) ? ' · đã học' : ''}</option>`).join('')
        : '<option>Không thấy điểm xuất phát nào gần đây</option>';
      if (at && choices[+at]) sel.value = at;
    }
    function renameLine() {
      const o = choices[+$('.pick').value];
      if (!o) return;
      const got = prompt('Tên cho đường này (để trống thì dùng lại tên AI đặt):', lineName(o.s.id));
      if (got === null) return;
      setLineName(o.s.id, got);
      listLines();
      say(`Đường này giờ tên là “${lineName(o.s.id)}”.`);
    }
    const hasMemory = id => { try { return !!localStorage.getItem(STORE + id); } catch { return false; } };
    const savedLine = id => { try { const m = JSON.parse(localStorage.getItem(STORE + id) || 'null'); return m && m.line && m.line.X ? m.line : null; } catch { return null; } };

    // Rides a lesson from elsewhere in this computer's simulation; it replaces the AI's plan only if it does better.
    const sharedSeen = new Map();
    async function useLesson(m, from, quiet) {
      const r = await trainer.offer(m);
      if (!r.fits) { if (!quiet) log(`Bài học từ ${from} được học trên một bản đồ khác của đường này nên AI không dùng được.`); return; }
      if (r.took) { log(`<b>Dùng bài học từ ${from}:</b> chạy được ${r.run.prog} m, ${Math.round(r.run.fit)} điểm, giỏi hơn AI đang có.`); showBest(trainer.best); draw(); }
      else if (!quiet) log(`Bài học từ ${from}: ${r.run.prog} m, ${Math.round(r.run.fit)} điểm. AI của bạn đang giỏi hơn nên giữ nguyên.`);
    }

    // Learns the line chosen in the list until stopped (by the player, or by the learning loop below). Returns false
    // when the line could not be loaded.
    const introduced = new Set();
    async function start() {
      const o = choices[+$('.pick').value];
      if (busy || !o) return false;
      busy = true;
      try {
        // one learner at a time: the brain and the practice give their workers back
        releaseBrain(); releaseDrill();
        // a new line, the rider changed bike or tricks in the game since training started, or the workers were given away
        const setupChanged = trainer.setup && JSON.stringify(trainer.setup) !== JSON.stringify(riderSetup());
        if (!trainer.route || trainer.route.start.id !== o.s.id || setupChanged || !trainer.pool) {
          say('Đang dò đường đi từ điểm xuất phát…');
          // the line comes from this browser's memory, else from the community repo, else from the pieces the game has loaded
          const shared = await communityLesson(o.s.id);
          // a Training drill is read from the game as it is now
          let route = o.drill || routeCache.get(o.s.id) || savedLine(o.s.id);
          if (route && lineStale(route)) { log('Đường này đã được sửa trong game từ lần học trước, AI dò lại đường.'); route = null; }
          if (!route && shared && !lineStale(shared.line)) { route = shared.line; log('Lấy bản đồ đường này từ bài học cộng đồng trên GitHub.'); }
          if (!route) route = await buildRoute(o.s);
          if (!route) { say('Không dò được đường từ điểm này (có thể chưa tải hết). Thử điểm khác hoặc đến gần hơn.'); return false; }
          // learned as a tour, with the lines that go on from its end
          const len0 = route.tour === undefined ? route.length : 0;
          route = await extendRoute(route);
          routeCache.set(o.s.id, route);
          if (len0 && route.tour) log(`Nối thêm <b>${route.tour} đường đi tiếp</b> sau đường này (${len0} m thành ${route.length} m): AI học cả tuyến, để lúc lái thật nó đi tiếp bằng bài học.`);
          say(`Đường dài ${route.length} m, ${route.pieces.length} chi tiết. Đang nạp vật lý vào ${workers} luồng (có thể mất vài chục giây)…`);
          const t0 = performance.now();
          // jumps learned on other lines, in this browser and shared on GitHub
          trainer.library = await gatherJumps();
          // a brain that has learned something also shows a new line how it would ride it
          trainer.brainW = brain.gen ? brain.best.slice() : null;
          const mem = await trainer.prepare(route, workers);
          const kinds = Object.entries(route.kinds).map(([k, n]) => `${n} ${k}`).join(', ');
          const took = mem.from !== 'fresh';
          // back from a turn of the brain: no need to tell it all again
          if (mem.fromTrack && introduced.has(o.s.id)) log(`Quay lại học đường này (vòng ${trainer.gen}, đang đi được ${trainer.best.prog} m).`);
          else {
          introduced.add(o.s.id);
          log(`Đường mới <b>${esc(lineName(o.s.id))}</b>: ${route.length} m (${kinds}). Nạp xong sau ${((performance.now() - t0) / 1000).toFixed(0)} s.`);
          log(mem.kept ? `Nhớ lại ${trainer.gen} vòng đã học trên đường này (${mem.kept} đoạn đầu), học tiếp các đường nối thêm.` : mem.fromTrack ? `Nhớ lại ${trainer.gen} vòng đã học trên đường này.` :`${took ? 'Bắt đầu học' : 'Bắt đầu học từ con số 0'} (đường chia thành ${trainer.secs.length} đoạn, ${mem.jumps} cú nhảy).`);
          if (!mem.fromTrack) log('Nếu đường thật dài hơn thế, hãy đạp dọc theo đường cho game tải hết, rồi bấm “Quên đường này, học lại từ đầu” (trong mục Chi tiết).');
          if (!trainer.library.length) log('Chưa có kinh nghiệm cú nhảy từ đường nào khác. Học xong đường này thì những đường sau sẽ mượn được.');
          else if (!mem.alike) log(`Kho kinh nghiệm có ${trainer.library.length} cú nhảy từ các đường khác, nhưng chưa cú nào giống cú nhảy của đường này.`);
          else {
            log(`<b>Mượn kinh nghiệm:</b> ${mem.alike}/${mem.jumps} cú nhảy của đường này giống cú nhảy AI đã học ở ${mem.lines} đường khác. Mỗi khi bị kẹt ở một cú nhảy, AI thử cách đã thành công ở những cú giống nó.`);
            if (mem.from === 'borrow') log(`Bắt đầu bằng cách chạy mượn được: đi được ngay <b>${mem.seed.prog} m</b> (học từ con số 0 thì chỉ ${mem.fresh.prog} m).`);
            else if (mem.seed && beats(mem.seed, mem.fresh)) log(`Mượn nguyên cả đường thì đi được ${mem.seed.prog} m (học từ con số 0: ${mem.fresh.prog} m).`);
            else if (mem.seed) log(`Mượn nguyên cả đường thì đi được ${mem.seed.prog} m, chưa hơn học từ con số 0 (${mem.fresh.prog} m), nên AI mượn dần từng cú nhảy.`);
          }
          if (mem.brain) {
            const b = mem.brain, at = r => `${r.prog} m, ${Math.round(r.fit)} điểm`;
            if (mem.from === 'brain') log(`<b>Bắt đầu từ cách lái của bộ não chung:</b> bộ não đi được ${b.prog} m trên đường này. Chép cách lái đó thành bài học thì được ngay <b>${at(b.run)}</b> (học từ con số 0: ${at(mem.fresh)}${mem.seed ? `; mượn cú nhảy: ${at(mem.seed)}` : ''}).`);
            else log(`Bộ não chung đi được ${b.prog} m trên đường này. Chép cách lái đó thành bài học thì được ${at(b.run)}, chưa hơn cách bắt đầu đang có (${at(trainer.best)}), nên không dùng.`);
          }
          if (route.drill) log(`<b>Bài tập Training “${DRILL_GOALS[route.drill.goal].name}”:</b> AI tập trong mô phỏng cho tới khi đạt mục tiêu của bài${route.drill.pedals ? '' : ' (không được đạp, như trong game)'}.`);
          else if (trainer.setup.tricks === 0) log('Tài khoản của bạn chưa mở khóa trick trong game (game mở khi bạn đủ 200 cú nhảy và 5 đường), nên AI tập chạy hết đường mà không làm trick. Mở khóa xong, lần học sau AI sẽ tự tập trick.');
          }
          if (shared) { sharedSeen.set(o.s.id, shared.savedAt); await useLesson(shared, 'cộng đồng trên GitHub'); }
          $('.k-gen').textContent = trainer.gen;
          showBest(trainer.best);
          showBorrow();
          draw();
          $('.forget').disabled = false;
        }
        if (!learning || cancel) return true;
        say('AI đang học đường này: thử, ngã, rút kinh nghiệm… Bạn có thể tiếp tục chơi.');
        busy = false;
        await trainer.run();
      } catch (err) {
        say('Lỗi: ' + (err && err.message || err));
        console.error(err);
      } finally {
        busy = false;
      }
      return true;
    }

    async function watch() {
      if (!trainer.pool) { say('Xem lại được khi AI đang học đường này (bấm “Học lái”).'); return; }
      say('Đang dựng lại lượt chạy tốt nhất…');
      const r = await trainer.bestRide();
      if (!r || !r.trace) return;
      say(`Lượt chạy tốt nhất: ${r.prog} m, ${Math.round(r.fit)} điểm, kết thúc: ${r.end}.`);
      showRide(r);
    }

    // ---- the shared brain
    // The line from a start: this browser's memory if still right, else the pieces the game has loaded.
    // With tour, the line with the lines that go on from it (what the AI learns and rides from a start in the list);
    // the brain's lines need only the first metres of each.
    async function lineFor(s, tour) {
      let route = routeCache.get(s.id) || savedLine(s.id);
      if (route && lineStale(route)) route = null;
      if (!route) route = await buildRoute(s);
      if (route && tour) route = await extendRoute(route);
      if (route) routeCache.set(s.id, route);
      return route;
    }
    // Lines for the brain, up to BRAIN_LINES: every line learned in this browser, then the lines from the starts nearest
    // the chosen one (any start whose pieces the game has loaded, not only the ones in the list). The chosen line is kept
    // aside. Up to DRILLS of them are drills the AI has learned (their lessons are the brain's quickest teachers), and at
    // least NEW_DRILLS are new ones, more when there are few lines around: drills of every kind and size, so the brain
    // learns to ride jumps in general instead of the lines near you by heart.
    const BRAIN_LINES = 40, DRILLS = 12, NEW_DRILLS = 4;
    async function brainLines() {
      const o = choices[+$('.pick').value], at = o ? o.s : choices.length ? choices[0].s : null;
      const most = BRAIN_LINES, real = most - DRILLS - NEW_DRILLS;
      const testId = o ? o.s.id : null, got = new Map(), drills = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(STORE)) continue;
          const id = key.slice(STORE.length), L = savedLine(id);
          if (L && L.practice) drills.push(L);
          else if (L && id !== testId && !lineStale(L)) got.set(id, L);
        }
      } catch { /* storage blocked */ }
      // starts a few metres apart lead onto the same line: one of them is enough (and none next to the chosen line)
      const taken = [...got.values()].map(r => r.start).concat(o ? [o.s] : []);
      const near = at ? cap.starts.map(s => ({ s, d: Math.hypot(s.x - at.x, s.z - at.z) })).filter(q => q.d < 800).sort((a, b) => a.d - b.d) : [];
      for (const { s } of near) {
        if (got.size >= real) break;
        if (got.has(s.id) || taken.some(t => Math.hypot(t.x - s.x, t.z - s.z) < 3)) continue;
        const r = await lineFor(s);
        if (r && r.length >= 40) { got.set(s.id, r); taken.push(s); }
      }
      const train = [...got.values()].slice(0, real), seed = Math.floor(Math.random() * 1e6);
      drills.sort(() => Math.random() - 0.5);
      train.push(...drills.slice(0, DRILLS));
      for (let lane = 0; train.length < most && lane < most * 2; lane++) {
        // easy to as hard as the drills the AI practises now
        const r = await practiceLine(seed, lane, drillLevel() * (lane % 4) / 3);
        if (r && r.length >= 40) train.push(r);
      }
      return { train, test: o ? await lineFor(o.s) : null };
    }
    // one learner at a time: CPU threads go to the line or to the brain
    function releaseBrain() {
      if (brain.running) brain.stop();
      if (brain.pool) { brain.pool.close(); brain.pool = null; }
    }
    function releaseLine() {
      if (trainer.running) trainer.stop();
      if (trainer.pool) { trainer.pool.close(); trainer.pool = null; }
    }
    // Trains the shared brain until stopped. Returns false when there are not enough lines for it.
    let distilledKey = null, brainTold = false;
    async function brainStart() {
      if (busy) return false;
      busy = true;
      try {
        releaseLine(); releaseDrill();
        const o = choices[+$('.pick').value];
        if (!brain.pool || brain.testId !== (o ? o.s.id : null) || JSON.stringify(brain.setup) !== JSON.stringify(riderSetup())) {
          say('Đang gom các đường để luyện bộ não chung…');
          const { train, test } = await brainLines();
          if (train.length < 2) { log('Bộ não chung cần ít nhất 2 đường gần đây để luyện, nên AI chỉ học đường đang chọn.'); return false; }
          say(`Đang nạp ${train.length + (test ? 1 : 0)} đường vào ${workers} luồng cho bộ não chung (có thể mất một phút)…`);
          const t0 = performance.now();
          await brain.prepare(train, test, workers);
          const real = train.filter(r => !r.practice), lens = real.map(r => r.length);
          if (!brainTold) log(`<b>Bộ não chung:</b> luyện trên ${train.length} đường: ${real.length} đường thật quanh bạn${real.length ? ` (dài ${Math.min(...lens)}–${Math.max(...lens)} m)` : ''} và ${train.length - real.length} bài tập kiểu Training AI tự tạo. Mỗi vòng thử trên ${Math.min(12, train.length)} đường lần lượt, mỗi đường chấm ${BRAIN_CAP} m đầu${test ? `. Đường đang chọn (${test.length} m) được để riêng, bộ não không bao giờ luyện trên nó` : ''}. Nạp xong sau ${((performance.now() - t0) / 1000).toFixed(0)} s.`);
          brainTold = true;
          const shared = await communityBrain();
          if (shared) {
            const r = await brain.offer(shared.w);
            if (r) log(r.took ? `<b>Dùng bộ não từ cộng đồng trên GitHub:</b> đi được ${pct(r.share)} quãng đường các đường của bạn, giỏi hơn bộ não đang có.` : `Bộ não cộng đồng trên GitHub đi được ${pct(r.share)} quãng đường các đường của bạn, chưa hơn bộ não đang có.`);
          }
          // the lessons of this browser show the brain how they ride, so it does not start from nothing
          const plans = [];
          let key = '';
          brain.trainIdx.forEach(i => {
            try { const m = JSON.parse(localStorage.getItem(STORE + brain.lines[i].id) || 'null'); if (m && m.plan && Array.isArray(m.plan.v)) { plans.push({ line: i, plan: m.plan }); key += `${brain.lines[i].id}:${m.gen};`; } } catch { /* skip it */ }
          });
          // only when the lessons have learned more since the last time
          if (plans.length && key !== distilledKey) {
            distilledKey = key;
            say(`Bộ não đang xem ${plans.length} bài học đã có để bắt chước…`);
            const d = await brain.distill(plans);
            if (d && d.share === undefined) log(`Chưa có bài học nào đi xa hơn bộ não trên đường của nó, nên bộ não không cần bắt chước.`);
            else if (d) log(d.took ? `<b>Bộ não đã bắt chước ${d.lines} bài học</b> (${d.rows} khoảnh khắc): giờ đi được ${pct(d.share)} quãng đường các đường luyện.` : `Bộ não thử bắt chước ${d.lines} bài học nhưng chỉ đi được ${pct(d.share)}, chưa hơn bộ não đang có nên giữ nguyên.`);
          }
          showBrain();
        }
        if (!learning || cancel) return true;
        say('AI đang luyện bộ não chung trên nhiều đường cùng lúc, vài phút nữa sẽ quay lại đường này… Bạn có thể tiếp tục chơi.');
        busy = false;
        await brain.run();
      } catch (err) {
        say('Lỗi: ' + (err && err.message || err));
        console.error(err);
      } finally {
        busy = false;
      }
      return true;
    }

    // ---- practice: new practice lines learned for a few minutes the way the chosen line is, one after another. Every
    // jump of them the AI gets over goes into the jumps new lines borrow from, and their lessons into what the shared
    // brain imitates. A drill ridden to the end makes the next ones harder; one not ridden halfway, easier. (Easy drills
    // were ridden to the end in a few seconds, so they taught little.)
    const DRILL_TIME = 3 * 60e3, DRILLS_KEPT = 24, DRILL_KEY = 'trailsai.drill';
    let drillT0 = 0;
    const drill = new Trainer({
      record() {},
      // a round that ends after "Dừng học" does not write over the status
      progress(p) { if (learning && phase === 'drill') $('.k-now').textContent = `tập bài tập kiểu Training: ${p.best.prog} / ${drill.N} m`; },
    });
    // how hard the drills are: read, or set to v
    function drillLevel(v) {
      if (v === undefined) {
        let s = null;
        try { s = localStorage.getItem(DRILL_KEY); } catch { /* storage blocked */ }
        return s !== null && num(+s) ? clamp(+s, 0, 1) : 0.3;
      }
      v = +clamp(v, 0, 1).toFixed(2);
      try { localStorage.setItem(DRILL_KEY, String(v)); } catch { /* storage blocked */ }
      return v;
    }
    function releaseDrill() {
      if (drill.running) drill.stop();
      if (drill.pool) { drill.pool.close(); drill.pool = null; }
    }
    // only the newest drills are kept, so they never fill the browser's storage
    function dropOldDrills() {
      const all = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(STORE + 'practice-')) continue;
          let at = 0;
          try { at = JSON.parse(localStorage.getItem(key)).savedAt || 0; } catch { /* unreadable: goes first */ }
          all.push([at, key]);
        }
        all.sort((a, b) => b[0] - a[0]).slice(DRILLS_KEPT).forEach(([, key]) => localStorage.removeItem(key));
      } catch { /* storage blocked */ }
    }
    async function drillStart() {
      if (busy) return false;
      busy = true;
      try {
        releaseLine(); releaseBrain();
        say('AI đang tập các bài tập kiểu Training, vài phút nữa sẽ quay lại đường này… Bạn có thể tiếp tục chơi.');
        const level0 = drillLevel();
        let n = 0, done = 0, jumps = 0, level = level0;
        drillT0 = Date.now();
        while (learning && !cancel && Date.now() - drillT0 < DRILL_TIME) {
          let route = null;
          for (let i = 0; i < 5 && !route; i++) {
            const r = await practiceLine(Math.floor(Math.random() * 1e6), 0, level);
            if (r && r.length >= 60) route = r;
          }
          if (!route) break;
          drill.library = await gatherJumps();
          drill.brainW = brain.gen ? brain.best.slice() : null;
          await drill.prepare(route, workers);
          if (!learning || cancel) break;
          busy = false;
          await drill.run();
          busy = true;
          n++; jumps += drill.jumpRecord().list.length;
          const end = drill.best.end === 'về đích';
          if (end) done++;
          // only a drill that had its time counts as not ridden
          if (end || Date.now() - drillT0 >= DRILL_TIME) level = drillLevel(end ? level + 0.1 : drill.best.prog < drill.N / 2 ? level - 0.1 : level);
          dropOldDrills();
        }
        if (n) log(`<b>Tập ${n} bài tập kiểu Training</b> (độ khó ${Math.round(level0 * 100)}%${level !== level0 ? ` → ${Math.round(level * 100)}%` : ''}): về đích ${done}/${n} bài, ${jumps} cú nhảy vượt được đã vào kho kinh nghiệm.`);
      } catch (err) {
        say('Lỗi: ' + (err && err.message || err));
        console.error(err);
      } finally {
        busy = false;
        releaseDrill();
      }
      return true;
    }

    // ---- "Học lái": one button for all the learning. The chosen line learns until it has not got better for a few
    // minutes, then a new practice line for a few minutes, then the shared brain on all the lines near you and some
    // practice lines, then back to the line, and so on. One learner at a time has every CPU thread. Each helps the
    // others: lessons give the brain lines to learn on and plans to imitate, practice gives jumps to borrow from, and the
    // brain gives new lines a start.
    const LINE_MIN = 2 * 60e3, LINE_STALL = 3 * 60e3, BRAIN_TIME = 5 * 60e3;
    let learning = false, cancel = false, phase = null, phaseT0 = 0, gainT = 0, gainRun = null, brainT0 = 0, brainRestUntil = 0, loopId = 0;
    function showNow() {
      $('.k-now').textContent = !learning ? 'nghỉ' : phase === 'brain' ? 'luyện bộ não chung' : phase === 'drill' ? 'tập bài tập kiểu Training' : 'học đường này';
      const b = $('.learn');
      b.textContent = learning ? 'Dừng học' : 'Học lái';
      b.classList.toggle('on', learning);
    }
    async function learnLoop(my) {
      while (learning && my === loopId) {
        cancel = false; phase = 'line'; phaseT0 = gainT = Date.now(); gainRun = null; showNow();
        if (!(await start())) { learning = false; break; }
        if (!learning || my !== loopId || cancel || Date.now() < brainRestUntil) continue;
        cancel = false; phase = 'drill'; drillT0 = Date.now(); showNow();
        log(`Đường này ${Math.round(LINE_STALL / 60e3)} phút chưa tiến thêm: AI tập một bài tập kiểu Training, luyện bộ não chung vài phút rồi quay lại.`);
        await drillStart();
        if (!learning || my !== loopId || cancel) continue;
        cancel = false; phase = 'brain'; brainT0 = 0; showNow();
        // not enough lines for the brain: keep to the line for a while
        if (!(await brainStart())) brainRestUntil = Date.now() + 15 * 60e3;
      }
      if (my === loopId) { phase = null; showNow(); }
    }
    setInterval(() => {
      if (!learning) return;
      const now = Date.now();
      if (phase === 'line' && trainer.running) {
        if (trainer.best && beats(trainer.best, gainRun)) { gainRun = trainer.best; gainT = now; }
        if (now - phaseT0 > LINE_MIN && now - gainT > LINE_STALL && now >= brainRestUntil) trainer.stop();
      } else if (phase === 'drill' && drill.running) {
        // a drill ridden to the end has nothing more to teach about jumps: on to the next one
        if (now - drillT0 > DRILL_TIME || (drill.best && drill.best.end === 'về đích')) drill.stop();
      } else if (phase === 'brain' && brain.running) {
        if (!brainT0) brainT0 = now;
        else if (now - brainT0 > BRAIN_TIME) brain.stop();
      }
    }, 2000);
    async function learnButton() {
      if (learning) {
        learning = false; cancel = true; loopId++; trainer.stop(); brain.stop(); drill.stop(); phase = null; showNow();
        say('Đã dừng học. Những gì AI học được đã được lưu, bấm “Học lái” để học tiếp.');
        return;
      }
      if (!choices[+$('.pick').value]) return;
      learning = true; showNow();
      // a loop stopped a moment ago may still be loading or finishing a round: let it end first
      for (let i = 0; i < 600 && (busy || trainer.running || brain.running); i++) await new Promise(r => setTimeout(r, 200));
      if (learning) learnLoop(++loopId);
    }
    // another line chosen while learning: start over on it
    function lineChanged() {
      showLine();
      if (!learning) return;
      cancel = true; trainer.stop(); brain.stop(); drill.stop();
    }

    // "AI lái": the AI rides your bike in the game on the line chosen in the list: back to the start of the line, then
    // its controls replace yours. The line's lesson and the shared brain both ride the line in the simulation first,
    // and the one that gets further drives. While the line is learning, a better plan for the part still ahead is used
    // at once. After a fall the AI rides again with what it has learned since, until you press any key.
    let badge = null, starting = false, looping = false;
    const driveLabel = on => { $('.drive').textContent = on ? 'Dừng AI lái' : 'AI lái'; $('.drive').classList.toggle('on', on); };
    function stopDrive(why, byPlayer) {
      if (byPlayer) { looping = false; driveLabel(false); }
      if (!live.drive) return;
      const d = live.drive;
      live.drive = null;
      if (badge) { badge.remove(); badge = null; }
      if (d.cleanup) d.cleanup();
      const m = Math.max(0, d.base + d.rider.idx), e = Math.max(0, d.expect - d.runIn);
      const extra = (d.legs ? `, đi tiếp sang ${d.legs} đường khác` : '') + (d.tricks ? `, ${d.tricks} trick` : '') + (d.swaps ? `, dùng ${d.swaps} cách mới học được giữa chừng` : '');
      log(`<b>${d.who} lái thật:</b> ${why} sau ${m} m${extra}.`);
      if (d.grades) log(`Game chấm: ${gradeCount(d.grades)}, <b>${d.game} điểm</b> (cách game tính trong train), chuỗi cao nhất ×${d.top}.`);
      // the simulation only knew the first line
      if (!byPlayer && !d.legs) {
        // what a real ride teaches: whether the simulation still matches the game (the game has now loaded the whole way ridden)
        if (lineStale(d.route)) log('<b>Bản đồ trong mô phỏng không còn khớp với game</b> (đường đã được sửa). Bấm “Quên đường này, học lại từ đầu” để AI dò lại đường.');
        else if (Math.abs(m - e) > 15) log(`Lượt thật lệch so với mô phỏng (dự đoán ${e} m), dù bản đồ vẫn khớp.`);
        else log(`Đúng như mô phỏng dự đoán (${e} m).`);
      }
      if (looping) {
        say(`${d.who} lái thật: ${why} sau ${m} m. Lái lại sau 3 giây với những gì mới học được (bấm phím bất kỳ để dừng).`);
        setTimeout(() => { if (looping && !live.drive) aiDrive(); }, 3000);
      } else say(`${d.who} lái thật: ${why} sau ${m} m${extra}.`);
    }
    function driveButton() {
      if (live.drive || looping) { stopDrive('bạn đã dừng AI', true); return; }
      looping = true; driveLabel(true);
      aiDrive();
    }
    const cant = msg => { say(msg); looping = false; driveLabel(false); };
    // still lying where the last run crashed: press the game's own "Ride again" (R) so its bail screen resets too. In
    // a Training drill always (restart): the game then starts the drill over, and judges the ride from its start.
    async function getUp(always) {
      if (!always && !(liveState()[13] > 0)) return;
      starting = true;
      for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: 'r', code: 'KeyR', bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      starting = false;
    }
    // The line's lesson rides the bike: the plan being learned now (better plans learned meanwhile are taken on the
    // way, see takeNewer), or else plan P saved for the line, on the line's own small simulation ctx.
    function driveLesson(ctx, P, expect) {
      const now = !P, geo = now ? trainer.geo : ctx.geo, secs = now ? trainer.secs : ctx.secs;
      const R = { X: geo.X, Z: geo.Z, KIND: geo.KIND, length: geo.X.length, PZ: geo.PZ };
      // the rider reads this plan on every step
      const plan = clonePlan(now ? trainer.plan : P);
      const rider = makeRider(R, geo.H, secs, plan);
      let known = trainer.plan;
      const d = { who: 'AI', route: now ? trainer.route : ctx.route, rider, expect, tricks: 0, swaps: 0 };
      // A newer plan fits the bike where it is only if it rides the part already passed the same way: the game then
      // gets the same states the simulation scored, so the plan's score holds for the rest of this ride too.
      if (now) d.takeNewer = () => {
        const p = trainer.plan;
        if (p === known || !trainer.running) return;
        known = p;
        const upto = Math.min(secs.length - 1, Math.max(rider.sec, rider.airSec) + 1);
        for (const k of PLAN_KEYS) for (let i = 0; i <= upto; i++) if (p[k][i] !== plan[k][i]) return;
        for (const k of PLAN_KEYS) plan[k] = p[k].slice();
        d.swaps++; d.expect = trainer.best.prog;
      };
      ride(d, R);
    }
    // A one-thread simulation of the line chosen, to ride the brain and saved plans on it before they drive.
    let rideCtx = null;
    async function lineCtx(o) {
      if (rideCtx && rideCtx.id === o.s.id && JSON.stringify(rideCtx.setup) === JSON.stringify(riderSetup())) return rideCtx;
      // a lesson learned on the line alone (before tours) drives that line as learned, and the brain rides on after it
      const L = savedLine(o.s.id), alone = L && L.tour === undefined && !L.practice && !lineStale(L) ? L : null;
      const route = trainer.route && trainer.route.start.id === o.s.id ? trainer.route : o.drill || alone || await lineFor(o.s, true);
      if (!route) return null;
      if (rideCtx) rideCtx.pool.close();
      const pool = new Pool(1), setup = riderSetup();
      const meta = await pool.init(route, setup);
      rideCtx = { id: o.s.id, route, pool, geo: meta.geo, secs: meta.secs, setup };
      return rideCtx;
    }
    async function aiDrive() {
      if (starting) return;
      if (!live.ex || !live.g) return cant('AI chưa gắn được vào game. Hãy tải lại trang game rồi bấm nút AI lại.');
      let o = choices[+$('.pick').value];
      if (!o) return cant('Hãy chọn một đường trong danh sách trước đã.');
      // Boost & racer asks for one way, then the other, and each restart moves it on: start the drill over first,
      // then ride the lesson for the way the game shows it asks for now ("now: racer")
      const styles = o.drill && (o.drill.drill.kind === 'boost' || o.drill.drill.kind === 'racer');
      if (styles) {
        await getUp(true);
        const ask = ((document.body.innerText || '').match(/now:\s*(boost|racer)/i) || [])[1];
        const i = ask ? choices.findIndex(c => c.drill && c.drill.drill.kind === ask.toLowerCase()) : -1;
        if (i >= 0 && choices[i] !== o) { o = choices[i]; $('.pick').value = String(i); log(`Game đang hỏi kiểu <b>${ask}</b>: AI lái bài học “${esc(lineName(o.s.id))}”.`); }
      }
      starting = true;
      let go = null;
      try {
        say('AI đang thử đường này trong mô phỏng trước khi lái…');
        const ctx = await lineCtx(o);
        if (!ctx) return cant('Không dò được đường từ điểm này (có thể chưa tải hết). Thử điểm khác hoặc đến gần hơn.');
        const w = brain.best.slice();
        const [bs] = await ctx.pool.evalBrains([w], [[0, 0]]);
        // the lesson: being learned now on this line, or saved in this browser for this bike and tricks
        let ls = null, P = null;
        const setup = JSON.stringify(riderSetup());
        if (trainer.route && trainer.route.start.id === o.s.id && trainer.best && JSON.stringify(trainer.setup) === setup) ls = trainer.best;
        else {
          let m = null;
          try { m = JSON.parse(localStorage.getItem(STORE + o.s.id) || 'null'); } catch { m = null; }
          if (m && planFits(m.plan, ctx.secs) && JSON.stringify(m.setup) === setup) ({ plan: P, run: ls } = await settleAir(ctx.pool, m.plan));
        }
        const better = (a, b) => a.prog > b.prog || (a.prog === b.prog && a.fit >= b.fit);
        // on a Training drill the lesson always rides: the brain knows nothing of what the drill asks for
        const lesson = ls && (!!ls.goal || better(ls, bs));
        log(ls ? `AI lái bằng <b>${lesson ? 'bài học của đường này' : 'bộ não chung'}</b>: trong mô phỏng bài học đi được ${ls.prog} m, bộ não ${bs.prog} m.`
          : `Đường này chưa có bài học, nên <b>bộ não chung</b> lái (trong mô phỏng đi được ${bs.prog} m). Bấm “Học lái” để AI học đường này.`);
        go = lesson ? () => driveLesson(ctx, P, ls.prog) : () => {
          const geo = ctx.geo, R = { X: geo.X, Z: geo.Z, KIND: geo.KIND, length: geo.X.length };
          ride({ who: 'Bộ não', route: ctx.route, rider: makeBrainRider(R, geo.H, w), expect: bs.prog, tricks: 0, swaps: 0 }, R);
        };
      } catch (err) {
        cant('Lỗi: ' + (err && err.message || err)); console.error(err);
      } finally { starting = false; }
      if (!go || !looping) return;
      if (o.drill && !(await drillsNow()).some(r => r.start.id === o.s.id)) return cant(`Hãy mở bài “${DRILL_GOALS[o.drill.drill.goal].name}” trong Training (bấm Ride) rồi bấm “AI lái”.`);
      if (!styles) await getUp(!!o.drill);
      go();
    }
    // Past the end of the line (and of its tour, see extendRoute) the AI rides on into the next line ahead instead of
    // stopping, as long as there is one (nextLine). The shared brain rides those: they have no lesson yet.
    const ONWARD_LEGS = 30;
    async function onwardLeg(R, seen) {
      const best = await nextLine(R, seen);
      if (!best) return null;
      const pool = new Pool(1), meta = await pool.init(best, riderSetup());
      return { route: best, pool, geo: meta.geo };
    }
    // Hands the bike to rider d.rider on line R: back to the start, then its controls replace yours on every step.
    function ride(d, R) {
      const st = d.route.start;
      // the training line starts with a straight run-in from the spawn; distances shown are along the real line
      d.runIn = Math.max(0, R.length - d.route.length);
      // metres ridden = d.base + the index on the line ridden now (lines ridden on into add up)
      d.base = -d.runIn; d.legs = 0;
      // a Training drill has been started over by the game itself (getUp), from its start and at its speed
      const drill = d.route.drill;
      if (!drill) {
        live.ex.trails_set_spawn_at(live.g, st.x, st.z, st.heading, 0);
        live.ex.trails_game_reset(live.g);
      }
      let t = 0, seq = null, rider = d.rider, next = null;
      // the ground ridden in this run, so a line ahead that goes back over it is not taken
      const { mark, seen } = ground(), pools = [], w = brain.best.slice();
      // find the line after the one ridden now while riding it
      const lookAhead = () => {
        const h = next = { leg: null };
        if (d.legs >= ONWARD_LEGS || d.route.practice) return;
        onwardLeg(R, seen).then(l => { if (!l) return; if (d.over) l.pool.close(); else h.leg = l; }).catch(err => console.error(err));
      };
      d.cleanup = () => { d.over = true; pools.forEach(p => p.close()); if (next && next.leg) next.leg.pool.close(); };
      mark(R); lookAhead();
      d.step = () => {
        const s = liveState();
        if (seq === null) seq = s[16];
        if (s[13] > 0) { setTimeout(() => stopDrive('ngã'), 0); return null; }
        if (s[16] !== seq) {
          seq = s[16];
          if ((s[56] | 0) & 0x1f0 || Math.abs(s[44] || 0) >= 270 || Math.abs(s[43] || 0) >= 300 || Math.abs(s[41] || 0) >= 45) d.tricks++;
          // the landing as the game grades it, and its points as the game counts them
          const gr = s[15] | 0;
          if (gr > 0) {
            const gp = gamePoints(gr, s[44], s[43], s[41], d.streak || 0);
            d.streak = gp.streak; d.game = (d.game || 0) + gp.p; d.top = Math.max(d.top || 1, gp.m);
            (d.grades = d.grades || [0, 0, 0, 0, 0, 0])[gr]++;
          }
        }
        if (d.takeNewer && t % 30 === 0) d.takeNewer();
        const inp = rider.step(s, t++).slice();
        // the drills without pedals: the game takes the player's pedals away, the AI keeps off them itself
        if (drill && !drill.pedals) inp[0] = 0;
        if (rider.idx >= R.length - 3) {
          const leg = next && next.leg;
          if (!leg) { setTimeout(() => stopDrive('về đích'), 0); return null; }
          // ride on: the brain takes the next line from the point of it nearest the bike
          const g = leg.geo, R2 = { X: g.X, Z: g.Z, KIND: g.KIND, length: g.X.length }, r2 = makeBrainRider(R2, g.H, w);
          let bi = 0, bd = Infinity;
          for (let i = 0; i < Math.min(R2.length, 60); i++) { const q = (R2.X[i] - s[0]) ** 2 + (R2.Z[i] - s[2]) ** 2; if (q < bd) { bd = q; bi = i; } }
          r2.idx = bi;
          d.base += rider.idx - bi; d.legs++; d.takeNewer = null; d.who = 'Bộ não';
          pools.push(leg.pool); R = R2; rider = d.rider = r2;
          mark(R); lookAhead();
        }
        if (rider.off > 12 && !(s[12] > 0)) { setTimeout(() => stopDrive('lạc khỏi đường'), 0); return null; }
        if (badge && t % 15 === 0) badge.firstChild.textContent = `${d.who} đang lái · ${Math.max(0, d.base + rider.idx)} m${d.legs ? ` · đường thứ ${d.legs + 1}` : ''}${d.swaps ? ` · học thêm ${d.swaps} lần` : ''}`;
        return inp;
      };
      live.drive = d;
      // after a bail the game stops stepping the bike, so watch for it from outside too
      const watchBail = setInterval(() => {
        if (live.drive !== d) { clearInterval(watchBail); return; }
        if (liveState()[13] > 0) { clearInterval(watchBail); stopDrive('ngã'); }
      }, 250);
      badge = document.createElement('div'); badge.id = 'tai-badge';
      badge.innerHTML = `${d.who} đang lái<small>${learning ? 'Vẫn đang học ở nền · ' : ''}bấm phím bất kỳ để lấy lại tay lái</small>`;
      document.body.appendChild(badge);
      driveLabel(true);
      say(`${d.who} đang lái xe của bạn${learning ? ' và vẫn học tiếp ở nền' : ''} (bạn cần đang ngồi trên xe, không đi bộ). Bấm phím bất kỳ để lấy lại tay lái.`);
    }
    // any key from the player takes the bike back
    window.addEventListener('keydown', e => { if ((live.drive || looping) && e.isTrusted) stopDrive('bạn đã lấy lại tay lái', true); }, true);
    // buttons must not keep the keyboard focus, or the game's keys would press them
    el.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') e.target.blur(); });

    $('.x').onclick = () => { el.style.display = 'none'; };
    $('.refresh').onclick = () => findTracks();
    $('.rename').onclick = () => renameLine();
    $('.learn').onclick = () => learnButton();
    $('.drive').onclick = () => driveButton();
    $('.watch').onclick = () => watch();
    $('.pick').onchange = () => lineChanged();
    showNow();
    showBrain();
    // ---- sharing the brain
    function saveBrainFile() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...brain.record(), adam: null })], { type: 'application/json' }));
      a.download = 'brain.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    $('.brain-export').onclick = () => { saveBrainFile(); say('Đã lưu bộ não vào file brain.json (trong thư mục Tải xuống).'); };
    $('.brain-share').onclick = () => {
      saveBrainFile();
      window.open(`https://github.com/${REPO}/upload/main/brain`, '_blank', 'noopener');
      log('Đã lưu file <b>brain.json</b>. Trên trang GitHub vừa mở, kéo file đó vào rồi bấm nút xanh ở cuối trang (Propose changes). Cần tài khoản GitHub.');
    };
    $('.brain-import').onclick = () => $('.bfile').click();
    $('.bfile').onchange = async () => {
      const f = $('.bfile').files[0];
      $('.bfile').value = '';
      if (!f) return;
      const m = readBrain(await f.text());
      if (!m) { say('File này không phải bộ não của AI Trails.'); return; }
      if (!brain.pool) { say('Bộ não từ file cần được chạy thử trên các đường của bạn trước. Bấm “Học lái”, đợi tới lúc AI luyện bộ não chung, rồi mở file lại.'); return; }
      const r = await brain.offer(m.w);
      log(r.took ? `<b>Dùng bộ não từ file:</b> đi được ${pct(r.share)} quãng đường các đường của bạn, giỏi hơn bộ não đang có.` : `Bộ não từ file đi được ${pct(r.share)} quãng đường các đường của bạn, chưa hơn bộ não đang có nên giữ nguyên.`);
      showBrain();
    };
    $('.forget').onclick = async () => {
      if (!trainer.route || !confirm('Xóa những gì AI đã học trên đường này?')) return;
      stopDrive('bạn đã dừng AI', true);
      // learning goes on from nothing on this line
      cancel = true;
      trainer.stop();
      // the training loop saves once more as it stops: wait for it before wiping
      for (let i = 0; i < 300 && trainer.running; i++) await new Promise(r => setTimeout(r, 100));
      const key = trainer.key();
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      routeCache.delete(trainer.route.start.id);
      if (trainer.pool) trainer.pool.close();
      trainer.pool = null; trainer.route = null; trainer.best = null; trainer.hist = []; trainer.borrow = null;
      $('.k-gen').textContent = '0'; $('.k-mode').textContent = '–';
      for (const k of ['.k-best', '.k-prog', '.k-end', '.k-speed', '.k-borrow']) $(k).textContent = '–';
      $('.k-tricks').innerHTML = '';
      $('.watch').disabled = $('.forget').disabled = $('.export').disabled = $('.share').disabled = true;
      if (rideCtx) { rideCtx.pool.close(); rideCtx = null; }
      introduced.clear();
      draw(); showLine();
      log(learning ? 'Đã xóa trí nhớ của đường này. AI dò lại đường và học lại từ đầu.' : 'Đã xóa trí nhớ của đường này. Bấm “Học lái” để AI dò lại đường và học lại từ đầu.');
      say(learning ? 'Đã xóa, AI đang học lại từ đầu.' : 'Đã xóa. Bấm “Học lái” để học lại từ đầu.');
    };

    // ---- sharing what the AI learned
    const lessonFile = () => `${trainer.route.start.id}.json`;
    function saveFile() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(trainer.lesson())], { type: 'application/json' }));
      a.download = lessonFile();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    $('.export').onclick = () => {
      if (!trainer.route) return;
      saveFile();
      say(`Đã lưu bài học vào file ${lessonFile()} (trong thư mục Tải xuống).`);
    };
    $('.share').onclick = () => {
      if (!trainer.route) return;
      saveFile();
      window.open(`https://github.com/${REPO}/upload/main/lessons`, '_blank', 'noopener');
      log(`Đã lưu file <b>${lessonFile()}</b>. Trên trang GitHub vừa mở, kéo file đó vào rồi bấm nút xanh ở cuối trang (Propose changes). Cần tài khoản GitHub.`);
    };
    $('.import').onclick = () => $('.file').click();
    $('.file').onchange = async () => {
      const f = $('.file').files[0];
      $('.file').value = '';
      if (!f) return;
      const m = readLesson(await f.text());
      if (!m) { say('File này không phải bài học của AI Trails.'); return; }
      const id = m.line.start.id;
      if (trainer.route && trainer.route.start.id === id && trainer.pool) { await useLesson(m, 'file'); return; }
      if (hasMemory(id)) { say('Bài học này của một đường khác. Chọn đường đó, bấm “Học lái”, rồi mở file lại.'); return; }
      // a line not learned here yet: the file becomes its memory, and starting on it rides the plan before trusting it
      try { localStorage.setItem(STORE + id, JSON.stringify({ ...m, bestRun: null })); } catch { say('Trình duyệt hết chỗ lưu.'); return; }
      say('Đã nhập bài học. Đến gần đường đó, chọn nó trong danh sách rồi bấm “Học lái”.');
    };
    // another tab learning the same line saved a better plan
    window.addEventListener('storage', e => {
      if (!trainer.route || e.key !== trainer.key() || !e.newValue) return;
      if (trainer.takeStored(e.newValue)) { log(`Nhận bài học giỏi hơn từ một tab khác: ${trainer.best.prog} m, ${Math.round(trainer.best.fit)} điểm.`); showBest(trainer.best); }
    });
    // while learning, look for a newer community lesson every 10 minutes (others may have shared a better one)
    setInterval(async () => {
      if (!trainer.running || !trainer.route) return;
      const id = trainer.route.start.id, m = await communityLesson(id);
      if (!m || sharedSeen.get(id) === m.savedAt) return;
      sharedSeen.set(id, m.savedAt);
      await useLesson(m, 'cộng đồng trên GitHub', true);
    }, 10 * 60 * 1000);

    window.TrailsAI = {
      open() { el.style.display = ''; },
      // the extension found a newer AI on GitHub and kept it for the next page load
      newer() { log('<b>Có bản AI mới.</b> Bấm F5 để dùng (những gì AI đã học vẫn còn nguyên).'); },
      cap, trainer, brain, drill, buildRoute, practiceLine, findTracks, engine, live, drive: driveButton, learn: learnButton, gatherJumps, fitBrain, freshBrain,
    };
    if (window.__taiNewer) window.TrailsAI.newer();
    setTimeout(findTracks, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
})();
