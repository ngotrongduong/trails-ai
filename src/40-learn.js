  // ---------------------------------------------------------------- learning: trial and error on the plan
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clonePlan = p => JSON.parse(JSON.stringify(p));
  const clampV = v => clamp(v, 2, 18);
  const planFits = (p, secs) => !!p && ['v', 'pt', 'pl', 'pu', 'tk'].every(k => Array.isArray(p[k]) && p[k].length === secs.length)
    && ['vs', 'lg', 'sa', 'ph', 'pc', 'mn'].every(k => p[k] === undefined || (Array.isArray(p[k]) && p[k].length === secs.length));
  // ---- the show
  // What the AI rides for: a show of skill, every jump worth what it shows by itself (not the game's streak, which
  // makes a jump worth what the jumps before it were). A jump (a landing: jl entry) is worth
  // - its landing: SHOW_LAND by the game's grade (buttery 160 … cased 0);
  // - plus its tricks, each by how hard it is: SHOW_TRICK, 50 × the game's skill points for it (its Tricks board:
  //   whip 2, 360 4, backflip 6, barspin 3, T-bog 3, X-up 4, tailwhip 5, table 5, a 360 table 10 on top), every turn
  //   counted (a 720 two 360s, a triple tailwhip three tailwhips), × the combo: 1 + SHOW_KIND for every kind of trick
  //   in the jump after the first, + SHOW_MORE for every trick of a kind already in it. So a backflip alone is 440 on
  //   a clean landing; a backflip 360 tailwhip 1640; a backflip 720 double tailwhip barspin 4190.
  // A ride is worth its jumps, + SHOW_VARIETY for every kind of trick it lands somewhere (the manual too), + MANUAL_W a
  // second on the back wheel, in manuals of a second or more (those the game keeps: the longer, the more).
  const SHOW_LAND = [0, 160, 140, 100, 50, 0], SHOW_KIND = 0.5, SHOW_MORE = 0.25, SHOW_VARIETY = 300, MANUAL_W = 60;
  const SHOW_TRICK = { flip: 300, spin: 200, whip: 100, tailwhip: 250, barspin: 150, table: 250, tbog: 150, xup: 200 }, SHOW_SPINTABLE = 500;
  // a landing's tricks: n of them (every turn counted), k kinds, sum of what they are worth
  const tricksIn = got => {
    let n = 0, k = 0, sum = 0;
    for (const [key, w] of Object.entries(SHOW_TRICK)) {
      const c = got ? key === 'spin' ? Math.round((got.spin || 0) / 360) : got[key] || 0 : 0;
      if (c > 0) { n += c; k++; sum += w * c; }
    }
    if (got && got.spin && got.table) sum += SHOW_SPINTABLE;
    return { n, k, sum };
  };
  const tricksOf = got => tricksIn(got).n;
  const jumpShow = e => { const t = tricksIn(e.got); return (SHOW_LAND[e.g] || 0) + (t.n ? t.sum * (1 + SHOW_KIND * (t.k - 1) + SHOW_MORE * (t.n - t.k)) : 0); };
  // (lands: jl entries, man: seconds of manual)
  const showOf = (lands, man) => {
    const kinds = new Set();
    let v = MANUAL_W * (man || 0);
    for (const e of lands || []) { v += jumpShow(e); for (const key of Object.keys(SHOW_TRICK)) if (e.got && e.got[key]) kinds.add(key); }
    if (man >= 1) kinds.add('manual');
    return Math.round(v + SHOW_VARIETY * kinds.size);
  };
  const rideShow = r => showOf(r.jl, r.man);
  const rideTricks = r => (r.jl || []).reduce((a, e) => a + tricksOf(e.got), 0);
  // the most tricks in one jump
  const rideMost = r => Math.max(0, ...(r.jl || []).map(e => tricksOf(e.got)));
  // Ride a beats ride b: all the way first; then the further; at the end, the more it is worth (judged); then the
  // faster. What a ride is worth: its show, and
  // - less TIME_COST a second the ride took (to the end, or to where it is);
  // - less CASED_COST a cased landing (a search that cannot find the speed for a jump would settle for casing it);
  // - less OFF_COST a metre ridden off the line (one that cannot clear a jump would ride round it; riding round a
  //   jump's lip ends the ride there: see the worker).
  const CASED_COST = 200, OFF_COST = 60, TIME_COST = 20;
  const done = r => r.end === 'finish';
  const far = r => (done(r) ? Infinity : r.prog);
  const judged = r => {
    let v = rideShow(r) - OFF_COST * (r.offM || 0) - TIME_COST * (r.ticks || 0) / 60;
    for (const e of r.jl || []) if (e.g === 5) v -= CASED_COST;
    return v;
  };
  const beats = (a, b) => !b || far(a) > far(b) || (far(a) === far(b) && (judged(a) !== judged(b) ? judged(a) > judged(b)
    : Math.abs((a.vAvg || 0) - (b.vAvg || 0)) > 0.05 ? a.vAvg > b.vAvg : a.fit > b.fit + 0.01));
  const aliveAt = r => r.end === 'riding' || r.end === 'finish';
  // The search: partial rides kept at each section (BEAM), tries per section in its first round, how many times a sweep
  // may back up before it gives up for this time; the rider's weight on the ground and the steering in the air a try
  // may give a section.
  const BEAM = 6, SWEEP_TRIES = 72, MAX_BACKS = 12, SEED_ROOM = 80;
  const LEANS = [0, 0.3, 0.6, 1, -0.3, -0.6], AIR_STEERS = [0, 0.15, 0.3, 0.5, 0.8, 1];
  // the ways to pump (pc, see the rider): through the dips, where the ground falls away, where it rises (drawn anew
  // twice as often: it gains the most speed)
  const PUMP_WAYS = [0, 1, 2], PUMP_PICK = [0, 1, 2, 2];
  const setPer = (p, key, k, v) => { if (!p[key]) { if (!v) return; p[key] = p.v.map(() => 0); } p[key][k] = v; };
  // How a section the real game went otherwise than the simulation is ridden in tries: each try also a little faster
  // and slower, its tricks a little later, and judged by the worst of those (see roll in the worker).
  const JITS = [{ dv: 0.3, dt: 0 }, { dv: -0.3, dt: 0 }, { dv: 0, dt: 0.06 }];

  // ---- the trick book
  // What every trick tried off a jump did: rows [air seconds, trick, landed 0/1]. A trick is one part of a trick
  // program: F a backflip, S a 360, S2 a 720, S3 a 1080, W a whip, or a button trick (BTRICKS: T, B, L, G, X). The AI draws the
  // tricks of a program by what they are worth and how often they were landed with that much air (as a bandit picks its
  // arms: a trick little tried gets tries), so it tries everything it may, and more of what works.
  const BOOK_ROWS = 6000;
  // what a trick is worth in the show (SHOW_TRICK) and the least air it takes
  const TRICK_PARTS = {
    F: { unlock: UNLOCK.flip, worth: SHOW_TRICK.flip, air: 0.8 }, S: { unlock: UNLOCK.spin, worth: SHOW_TRICK.spin, air: 0.7 },
    S2: { unlock: UNLOCK.spin, worth: 2 * SHOW_TRICK.spin, air: 1.2 }, S3: { unlock: UNLOCK.spin, worth: 3 * SHOW_TRICK.spin, air: 1.7 }, W: { unlock: UNLOCK.whip, worth: SHOW_TRICK.whip, air: 0.45 },
    T: { unlock: UNLOCK.tailwhip, worth: SHOW_TRICK.tailwhip, air: 0.85 }, B: { unlock: UNLOCK.barspin, worth: SHOW_TRICK.barspin, air: 0.6 },
    L: { unlock: UNLOCK.table, worth: SHOW_TRICK.table, air: 0.8 }, G: { unlock: UNLOCK.tbog, worth: SHOW_TRICK.tbog, air: 0.6 }, X: { unlock: UNLOCK.xup, worth: SHOW_TRICK.xup, air: 0.7 },
  };
  // the parts of a trick program, and whether a landing (jl entry, landPoints' got) counted each
  const partsOf = tk => {
    if (!tk) return [];
    const out = [];
    if (tk.f) out.push('F');
    if (tk.s) out.push((tk.sr || 3.3) > 9 ? 'S3' : (tk.sr || 3.3) > 5.5 ? 'S2' : 'S');
    if (tk.w) out.push('W');
    for (const [c] of tk.q || []) if (!out.includes(c)) out.push(c);
    return out;
  };
  const GOT_KEY = { F: 'flip', S: 'spin', S2: 'spin', S3: 'spin', W: 'whip', T: 'tailwhip', B: 'barspin', L: 'table', G: 'tbog', X: 'xup' };
  // (a 720 or a 1080 that came round less counts as not landed)
  const gotPart = (got, part) => (got[GOT_KEY[part]] || 0) >= ({ S2: 720, S3: 1080 }[part] || 1);
  function bookWeights(rows, air, mask) {
    const w = {}, near = rows.filter(r => Math.abs(r[0] - air) <= 0.25);
    for (const [c, d] of Object.entries(TRICK_PARTS)) {
      if ((mask & d.unlock) !== d.unlock) continue;
      let n = 0, ok = 0;
      for (const r of near) if (r[1] === c) { n++; if (r[2]) ok++; }
      const prior = air >= d.air ? 1 : 0.35;
      w[c] = d.worth * (ok + prior) / (n + 1 + (1 - prior)) + 120 * Math.sqrt(Math.log(near.length + 2) / (n + 1));
    }
    return w;
  }
  // Held moves (the old AI's moves 1-15, and a lean either way): buttons held, a lean, a steer or a whip while the bike
  // is more than h m above the ground ahead. Some lines are ridden only so: n458teqth2 needs full steer in the air off
  // its first jumps.
  const OLD_HELD = [null, { b: 16 }, { b: 32 }, { b: 48 }, { b: 24 }, { b: 40 }, { b: 8 }, { b: 4, ln: -1 }, { b: 4, ln: 1 }, { w: 1 }, { w: -1 },
    { b: 64, st: 1 }, { st: 1 }, { st: -1 }, { b: 8, st: 1 }, { b: 12, ln: -1 }];
  const HELD = OLD_HELD.slice(1).concat([{ ln: 1 }, { ln: -1 }]);
  const heldMove = h => ({ hm: { ...pick(HELD), h: h !== undefined ? h : +(0.2 + Math.random() * 1.6).toFixed(2) } });
  // A trick program for a jump with air seconds of flight, drawn by the book: some of a backflip, a spin and a whip (a
  // spin and a whip are the same control, so one or the other), then button tricks one after another (each kind once
  // or more: two barspins, three tailwhips), as many as the air may take. Now and then a held move instead.
  function drawTricks(rows, air, mask) {
    if (Math.random() < 0.15) return heldMove();
    const w = bookWeights(rows, air, mask), has = c => w[c] > 0;
    const sum = Object.values(w).reduce((a, x) => a + x, 0) || 1, want = c => has(c) && Math.random() < Math.min(0.85, 1.6 * w[c] / sum + 0.2);
    const tk = {};
    let left = air - 0.35;
    if (want('F') && left > 0.6) { tk.f = 1; left -= 0.35; }
    if (want('S3') && left > 1.4) { tk.s = Math.random() < 0.5 ? -1 : 1; tk.sr = +(9.9 + Math.random() * 0.6).toFixed(2); left -= 0.9; }
    else if (want('S2') && left > 0.9) { tk.s = Math.random() < 0.5 ? -1 : 1; tk.sr = +(6.6 + Math.random() * 0.6).toFixed(2); left -= 0.6; }
    else if (want('S') && left > 0.5) { tk.s = Math.random() < 0.5 ? -1 : 1; tk.sr = +(3.0 + Math.random() * 0.6).toFixed(2); left -= 0.3; }
    else if (want('W')) { tk.w = Math.random() < 0.5 ? -1 : 1; tk.wt = +(0.6 + Math.random() * 2).toFixed(2); }
    const q = [];
    for (const c of ['T', 'B', 'L', 'G', 'X'].sort(() => Math.random() - 0.5)) {
      if (!want(c)) continue;
      const turnT = BTRICKS[c].turn, n = turnT ? 1 + (Math.random() < 0.35 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0) : 2 + Math.floor(Math.random() * 5);
      const need = btrickTime(c, n);
      if (need > left) continue;
      q.push([c, n, +(Math.random() < 0.6 ? 0 : Math.random() * 0.15).toFixed(2)]);
      left -= need;
    }
    if (q.length) { tk.q = q; tk.m = +(0.1 + Math.random() * 0.25).toFixed(2); if (Math.random() < 0.3) tk.lf = 1; if (Math.random() < 0.15) tk.h = 1; }
    return Object.keys(tk).length ? tk : null;
  }
  // a trick program changed a little: its timings, the margin it keeps, a part more or less
  function nudgeTricks(tk, rows, air, mask) {
    if (!tk || Math.random() < 0.15) return drawTricks(rows, air, mask);
    const t = JSON.parse(JSON.stringify(tk));
    if (t.hm) return Math.random() < 0.7 ? (t.hm.h = +clamp(t.hm.h + gauss() * 0.3, 0, 3).toFixed(2), t) : heldMove(t.hm.h);
    if (t.s && Math.random() < 0.5) t.sr = +clamp(t.sr + gauss() * 0.25, 2.8, 11).toFixed(2);
    if (t.w && Math.random() < 0.5) t.wt = +clamp(t.wt + gauss() * 0.4, 0.3, 3).toFixed(2);
    if (t.q && Math.random() < 0.5) t.m = +clamp((t.m === undefined ? 0.2 : t.m) + gauss() * 0.08, 0, 0.6).toFixed(2);
    if (t.q && Math.random() < 0.3) { const i = Math.floor(Math.random() * t.q.length), it = t.q[i]; it[2] = +clamp(it[2] + gauss() * 0.06, 0, 0.4).toFixed(2); if (Math.random() < 0.4) it[1] = Math.max(1, it[1] + (Math.random() < 0.5 ? -1 : 1)); }
    if (Math.random() < 0.15) {
      const more = drawTricks(rows, air, mask);
      if (more && more.q) t.q = (t.q || []).concat(more.q.slice(0, 1)), t.m = t.m === undefined ? 0.2 : t.m;
    }
    if (t.q && t.q.length > 1 && Math.random() < 0.1) t.q.splice(Math.floor(Math.random() * t.q.length), 1);
    return t;
  }

  // ---- the learner
  // One line: a pool of workers with the line, the plan learned so far and its best ride (best), the trick book (book:
  // rows, kept by the caller), and the sections a real ride has shown to be fragile (fragile: section numbers).
  // on.progress(info) while it searches, on.better(best) when it has a better plan, on.saved() after each sweep.
  class Learner {
    constructor(on) { this.on = on || {}; this.running = false; this.pool = null; this.fragile = new Set(); this.book = []; }
    async prepare(route, setup, files, workers, mem, make) {
      this.stop();
      if (this.pool) this.pool.close();
      this.route = route; this.setup = setup;
      this.pool = new Pool(workers, make);
      const meta = await this.pool.init(route, setup, files);
      this.secs = meta.secs; this.N = meta.length; this.geo = meta.geo;
      const ok = mem && planFits(mem.plan, this.secs);
      this.plan = ok ? clonePlan(mem.plan) : freshPlan(this.secs);
      if (!ok && mem && mem.seed) this.seedFrom(mem.seed);
      this.gen = ok ? mem.gen || 0 : 0;
      this.hist = ok ? (mem.hist || []).slice(-400) : [];
      this.fragile = new Set(ok ? mem.fragile || [] : []); this.jitScale = ok ? mem.jitScale || 1 : 1; this.bestHolds = undefined;
      this.best = (await this.pool.evalAll([this.plan]))[0];
      // (a fresh line, or one whose memory no longer rides: a plan from nothing may do better)
      if (!done(this.best)) { const f = freshPlan(this.secs), r = (await this.pool.evalAll([f]))[0]; if (beats(r, this.best)) { this.plan = f; this.best = r; } }
      // the pages of memory a ride changes, from rides that fall, jump and throw tricks
      const slow = freshPlan(this.secs), wild = clonePlan(this.plan);
      this.secs.forEach((s, k) => { if (s.jump) wild.tk[k] = { f: 1, q: [['B', 1, 0], ['T', 1, 0], ['L', 3, 0]] }; });
      wild.v = wild.v.map(v => clampV(v + 2));
      await this.pool.calib([this.plan, slow, wild]);
      return { fromMemory: !!ok, best: this.best };
    }
    // What this line has learned, for another way of it (seedOf), and taken up by that way (seedFrom): the sections of
    // the part the two share (the same points, and SEED_ROOM m more, as a section looks ahead) ridden the same way.
    seedOf() { const g = this.geo; return { plan: clonePlan(this.plan), secs: this.secs.map(s => [s.a, s.b]), X: Array.from(g.X), Z: Array.from(g.Z), KIND: Array.from(g.KIND) }; }
    seedFrom(sd) {
      const g = this.geo, n = Math.min(g.X.length, sd.X.length);
      let same = 0;
      while (same < n && Math.abs(g.X[same] - sd.X[same]) < 0.05 && Math.abs(g.Z[same] - sd.Z[same]) < 0.05 && g.KIND[same] === sd.KIND[same]) same++;
      const p = this.plan, q = sd.plan;
      this.secs.forEach((s, k) => {
        const j = sd.secs.findIndex(o => o[0] === s.a && o[1] === s.b);
        if (j < 0 || s.b + SEED_ROOM >= same) return;
        for (const key of ['v', 'pt', 'pl', 'pu', 'tk']) p[key][k] = clonePlan(q[key][j] === undefined ? null : q[key][j]);
        for (const key of ['vs', 'lg', 'sa', 'ph', 'pc', 'mn']) if (q[key] && q[key][j]) { if (!p[key]) p[key] = p.v.map(() => (key === 'vs' ? null : 0)); p[key][k] = clonePlan(q[key][j]); }
      });
    }
    stop() { this.running = false; }
    close() { this.stop(); if (this.pool) this.pool.close(); this.pool = null; }
    // how long the best ride is in the air off the jump of section j (0: it does not jump there)
    airOf(j) { return Math.max(0, ...((this.best && this.best.jl) || []).filter(e => e.k === j).map(e => e.a)); }
    onHill(k) { const s = this.secs[k], K = this.geo && this.geo.KIND; if (!K) return false; for (let i = s.a; i <= s.b; i++) if (K[i] === 'start') return true; return false; }
    // try a against try b at the same place in the line (> 0: a better); on a fragile section, by their worst first
    horizon(a, b, fragile) {
      if (fragile) {
        // (a try not ridden with the jitters has not shown it holds)
        const wa = !!a.worst && aliveAt(a.worst) && !a.worst.crash, wb = !!b.worst && aliveAt(b.worst) && !b.worst.crash;
        if (wa !== wb) return wa ? 1 : -1;
      }
      const la = aliveAt(a), lb = aliveAt(b);
      if (la !== lb) return la ? 1 : -1;
      if (!la) return a.prog !== b.prog ? a.prog - b.prog : a.fit - b.fit;
      const ja = judged(a), jb = judged(b);
      if (ja !== jb) return ja - jb;
      return a.fit - b.fit;
    }
    // the trick program a try gives jump section k: drawn anew, changed a little, or kept
    trickFor(p, k, wide) {
      const air = this.airOf(k), mask = this.setup.tricks;
      if (!air || Math.random() > 0.45 * Math.min(1.5, wide)) return;
      p.tk[k] = Math.random() < 0.5 ? drawTricks(this.book, air, mask) : nudgeTricks(p.tk[k], this.book, air, mask);
    }
    // Section k of base changed about as much as wide says: its speed (one, or by parts), the angle held in the air,
    // the pull, the pump, the weight on the ground, the steering in the air and the tricks off a jump.
    secTry(base, k, wide) {
      const s = this.secs[k], p = clonePlan(base);
      if (!p.vs) p.vs = p.v.map(() => null);
      const sd = wide, u = p.vs[k];
      if (u && u.length) {
        if (Math.random() < 0.15) { p.v[k] = clampV(u[u.length - 1] + gauss() * sd); p.vs[k] = null; }
        else { for (let i = 0; i < u.length; i++) if (Math.random() < 0.7) u[i] = clampV(u[i] + gauss() * sd); p.v[k] = u[u.length - 1]; }
      } else if (Math.random() < 0.15 && s.b - s.a >= 12) {
        const n = 2 + (Math.random() < 0.4 ? 1 : 0);
        p.vs[k] = Array.from({ length: n }, () => +clampV(p.v[k] + gauss() * sd).toFixed(2));
        p.v[k] = p.vs[k][n - 1];
      } else if (Math.random() < 0.85) p.v[k] = clampV(p.v[k] + gauss() * sd);
      if (Math.random() < (s.jump ? 0.8 : 0.3)) p.pt[k] += gauss() * (s.jump ? 0.12 : 0.04) * wide;
      if (s.jump && Math.random() < 0.2 * wide) p.pl[k] = Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 5);
      if (Math.random() < 0.3 * wide) p.pu[k] = pick([0, 0.5, 0.8, 1, 1]);
      if (Math.random() < 0.15 * wide) { const now = p.pc ? p.pc[k] || 0 : 0; setPer(p, 'pc', k, pick(PUMP_WAYS.filter(w => w !== now))); if (!p.pu[k]) p.pu[k] = 1; }
      if (this.onHill(k) && Math.random() < 0.2 * wide) { setPer(p, 'ph', k, p.ph && p.ph[k] ? 0 : 1); if (p.ph && p.ph[k] && !p.pu[k]) p.pu[k] = 1; }
      if (Math.random() < 0.12 * wide) setPer(p, 'lg', k, pick(LEANS));
      if (Math.random() < 0.15 * wide) { const now = p.mn ? p.mn[k] || 0 : 0; setPer(p, 'mn', k, pick([0, 1, 2].filter(m => m !== now))); }
      if (s.jump) {
        if (Math.random() < 0.25 * wide) setPer(p, 'sa', k, pick(AIR_STEERS));
        this.trickFor(p, k, wide);
        if (p.tk[k] && p.tk[k].f && Math.random() < 0.4) p.pl[k] = 1 + Math.floor(Math.random() * 5);
      }
      return p;
    }
    // Section k drawn anew, whatever the plan had: speeds anywhere from 3 to 18 m/s (often by parts; a quarter of them
    // 18, no limit at all), any angle in the air, a pull or none, a pump or none. A place no ride has got past yet may
    // need what is far from anything tried.
    wildTry(base, k) {
      const s = this.secs[k], p = clonePlan(base), r = (a, b) => a + Math.random() * (b - a);
      const rv = () => (Math.random() < 0.25 ? 18 : +r(3, 18).toFixed(2));
      if (!p.vs) p.vs = p.v.map(() => null);
      if (Math.random() < 0.5 && s.b - s.a >= 12) { const n = 2 + Math.floor(Math.random() * 3); p.vs[k] = Array.from({ length: n }, rv); p.v[k] = p.vs[k][n - 1]; }
      else { p.vs[k] = null; p.v[k] = rv(); }
      if (s.jump) {
        p.pt[k] = Math.random() < 0.5 ? s.pt + r(-0.6, 0.4) : r(-1.2, 0.6);
        p.pl[k] = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 6) : 0;
        if (Math.random() < 0.5) setPer(p, 'sa', k, pick(AIR_STEERS));
        const r0 = Math.random();
        p.tk[k] = r0 < 0.45 ? null : r0 < 0.65 ? heldMove() : p.tk[k];
      }
      p.pu[k] = Math.random() < 0.7 ? pick([0.5, 0.8, 1, 1]) : 0;
      setPer(p, 'pc', k, pick(PUMP_PICK));
      if (this.onHill(k)) setPer(p, 'ph', k, p.pu[k] && Math.random() < 0.5 ? 1 : 0);
      if (Math.random() < 0.4) setPer(p, 'lg', k, pick(LEANS));
      setPer(p, 'mn', k, Math.random() < 0.3 ? pick([1, 2]) : 0);
      return p;
    }
    // First round from partial ride nd: the plan as it is, one with no speed limit, a grid of take-off speeds by angles
    // on a jump, the plan with no tricks there (a trick that costs the landing), and n changed copies, part drawn anew.
    firstTries(nd, k, wide, n, wild) {
      const s = this.secs[k], out = [{ p: clonePlan(nd.plan), same: true }];
      if (nd.plan.v[k] < VFREE || (nd.plan.vs && nd.plan.vs[k])) { const p = clonePlan(nd.plan); if (p.vs) p.vs[k] = null; p.v[k] = 18; out.push({ p }); }
      if (this.onHill(k) && !(nd.plan.ph && nd.plan.ph[k] && nd.plan.pu[k] >= 1)) { const p = clonePlan(nd.plan); setPer(p, 'ph', k, 1); p.pu[k] = 1; out.push({ p }); }
      // (pumped hard each other way: through the dips, where the ground rises, where it falls away)
      for (const w of PUMP_WAYS) if (w !== (nd.plan.pc ? nd.plan.pc[k] || 0 : 0) || nd.plan.pu[k] < 1) { const p = clonePlan(nd.plan); setPer(p, 'pc', k, w); p.pu[k] = 1; out.push({ p }); }
      // (a manual each way the plan has not: on gentle ground, on slopes too)
      for (const m of [1, 2]) if (m !== (nd.plan.mn ? nd.plan.mn[k] || 0 : 0)) { const p = clonePlan(nd.plan); setPer(p, 'mn', k, m); out.push({ p }); }
      if (s.jump) {
        for (const dv of [-1.2, -0.6, 0.6, 1.2, 1.8]) for (const da of [-0.1, 0, 0.1]) {
          const p = clonePlan(nd.plan), u = p.vs && p.vs[k];
          if (u) { u[u.length - 1] = clampV(u[u.length - 1] + dv * wide); p.v[k] = u[u.length - 1]; } else p.v[k] = clampV(p.v[k] + dv * wide);
          p.pt[k] += da;
          out.push({ p });
        }
        if (nd.plan.tk[k]) { const p = clonePlan(nd.plan); p.tk[k] = null; out.push({ p }); }
        // (a jump the line turns in the air from: steered round hard and gently, if the plan does not already)
        if (Math.abs(s.turn || 0) >= TURN_SA) for (const a of [1, 0.5]) if ((nd.plan.sa ? nd.plan.sa[k] || 0 : 0) !== a) { const p = clonePlan(nd.plan); setPer(p, 'sa', k, a); out.push({ p }); }
      }
      for (let i = 0; i < n; i++) out.push({ p: Math.random() < wild ? this.wildTry(nd.plan, k) : this.secTry(nd.plan, k, wide) });
      return out;
    }
    // Second round: values of section k taken from the best tries of the first (each value from one of them at random)
    // and changed a little, as much as those tries differ from each other.
    eliteTry(el, k) {
      const one = () => pick(el), p = clonePlan(one());
      const spread = f => { const xs = el.map(f), m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
      const sv = Math.max(0.15, spread(q => q.v[k])), sp = Math.max(0.015, spread(q => q.pt[k]));
      const from = one();
      if (!p.vs) p.vs = p.v.map(() => null);
      p.vs[k] = from.vs && from.vs[k] ? from.vs[k].map(v => +clampV(v + gauss() * sv).toFixed(2)) : null;
      p.v[k] = p.vs[k] ? p.vs[k][p.vs[k].length - 1] : clampV(from.v[k] + gauss() * sv);
      p.pt[k] = one().pt[k] + gauss() * sp;
      p.pl[k] = one().pl[k]; p.pu[k] = one().pu[k];
      const t = one().tk[k]; p.tk[k] = t && Math.random() < 0.4 ? nudgeTricks(t, this.book, this.airOf(k), this.setup.tricks) : t ? clonePlan(t) : null;
      for (const key of ['lg', 'sa', 'ph', 'pc', 'mn']) { const w = one(); if (w[key] || p[key]) setPer(p, key, k, w[key] ? w[key][k] : 0); }
      return { p };
    }
    // Rides tries cs (each {nd, p}) from their partial rides, spread over the workers. jitOnly: each c is a try c.of
    // ridden again with jitters jits only, and the worst of those goes to c.of.r.worst.
    async rollAll(cs, a1, a2, jits, jitOnly) {
      const pool = this.pool, W = pool.ws.length, per = Math.ceil(cs.length / W), jobs = [];
      for (let wi = 0; wi < W; wi++) {
        const part = cs.slice(wi * per, (wi + 1) * per);
        if (!part.length) continue;
        jobs.push((async () => {
          for (let i = 0; i < part.length;) {
            let j = i; while (j < part.length && part[j].nd === part[i].nd) j++;
            const bid = `${++this.bid}`, group = part.slice(i, j);
            const out = await pool.roll(wi, { node: group[0].nd.n, plans: group.map(c => c.p), a1, a2, bid, jits, jitOnly: !!jitOnly, trace: !!this.watch && !jitOnly });
            if (jitOnly) group.forEach((c, q) => { c.of.r.worst = out[q].worst; });
            else group.forEach((c, q) => { c.r = out[q]; c.wi = wi; c.key = `${bid}:${q}`; });
            i = j;
          }
        })());
      }
      await Promise.all(jobs);
      if (!jitOnly) this.tries += cs.length;
    }
    // Writes into the trick book what each trick program tried off jump j did.
    learnBook(j, cs) {
      const ref = this.airOf(j);
      for (const c of cs) {
        const tk = c.p.tk[j], r = c.r;
        if (!tk || c.same || !r) continue;
        const e = r.jl.find(q => q.k === j), fell = !e || (r.crash && r.crashSec === j);
        if (!e && !ref) continue;
        for (const part of partsOf(tk)) this.book.push([e ? e.a : ref, part, !fell && e && gotPart(e.got, part) ? 1 : 0]);
      }
      if (this.book.length > BOOK_ROWS) this.book.splice(0, this.book.length - BOOK_ROWS);
      this.bookDirty = true;
    }
    // A sweep goes along the line keeping a beam of the best partial rides, each a saved state at the start of section
    // k with the plan that got there. From each, section k is ridden many ways (two rounds: around the plan, then
    // around the best tries of the first round), each try riding on until the bike has been on the ground 0.75 s in
    // section k+1. The best tries, kept different from each other in speed, are the beam at section k+1. When no try
    // gets into section k+1 the sweep backs up one, two, four, then six sections and tries those more widely. At the
    // end the best full ride is checked from the start and kept if it beats the plan held so far.
    async sweep(wide) {
      const S = this.secs, K = S.length, pool = this.pool;
      let beam = [{ n: null, plan: clonePlan(this.plan), inc: true }], k = 0, backs = 0, bestEnd = null;
      const beams = [beam], widen = new Map(), fails = {}, t0 = performance.now();
      this.tries = 0; this.bid = this.bid || 0;
      while (k < K && this.running) {
        const a1 = k + 1 < K ? S[k + 1].a : -1, a2 = k + 2 < K ? S[k + 2].a : this.N + 10, w = wide * (widen.get(k) || 1);
        const fr = this.fragile.has(k);
        const n1 = Math.max(12, Math.ceil(SWEEP_TRIES / beam.length)), cs = [];
        const front = done(this.best) ? K : this.best.crashSec, wild = k >= front - 1 && k <= front ? 0.5 : widen.has(k) ? 0.3 : 0.1;
        for (const nd of beam) for (const c of this.firstTries(nd, k, w, n1, wild)) cs.push({ nd, ...c });
        await this.rollAll(cs, a1, a2, null);
        if (!this.running) return null;
        // on a fragile section, the best tries of a round are ridden again with the jitters (the others would not be
        // picked whatever their worst)
        const jitTop = async list => {
          if (!fr) return;
          const top = list.filter(c => c.r.kid).sort((x, y) => this.horizon(y.r, x.r, false)).slice(0, 3 * BEAM);
          await this.rollAll(top.map(c => ({ nd: c.nd, p: c.p, of: c })), a1, a2, this.jits(), true);
        };
        await jitTop(cs);
        if (!this.running) return null;
        const more = [];
        for (const nd of beam) {
          const mine = cs.filter(c => c.nd === nd).sort((x, y) => this.horizon(y.r, x.r, fr));
          const el = mine.slice(0, Math.max(2, Math.ceil(mine.length / 5))).map(c => c.p);
          for (let i = 0; i < Math.ceil(n1 / 2); i++) more.push({ nd, ...this.eliteTry(el, k) });
        }
        await this.rollAll(more, a1, a2, null);
        if (!this.running) return null;
        await jitTop(more);
        if (!this.running) return null;
        const all = cs.concat(more);
        if (S[k].jump) this.learnBook(k, all);
        for (const c of all) if (c.r.end !== 'riding' && (!bestEnd || beats(c.r, bestEnd.r))) bestEnd = c;
        if (this.on.progress) this.on.progress({ k, K, backs, tries: this.tries, ms: performance.now() - t0 });
        const ok = a1 < 0 ? [] : all.filter(c => c.r.kid).sort((x, y) => this.horizon(y.r, x.r, fr));
        // (for the viewer: this section's tries, where each went and how it ended, the ones kept for the next one)
        const show = kept => {
          if (this.on.round && this.watch) this.on.round({ gen: this.gen, k, K, backs, tries: this.tries, best: this.best,
            rides: all.filter(c => c.r.tr).map(c => ({ tr: c.r.tr, end: c.r.end, kid: !!c.r.kid, prog: c.r.prog, round: !!c.r.round, game: c.r.game, kept: kept.includes(c) })) });
          for (const c of all) delete c.r.tr;
        };
        if (a1 < 0) { show(bestEnd ? [bestEnd] : []); break; }
        if (!ok.length) {
          show([]);
          if (backs >= MAX_BACKS) break;
          const f = (fails[k] = (fails[k] || 0) + 1), back = Math.min(k, [1, 2, 4, 6][Math.min(3, f - 1)]);
          for (let q = k - back; q <= k; q++) widen.set(q, Math.min(4, (widen.get(q) || 1) * 1.8));
          backs++; k -= back; beam = beams[k]; beams.length = k + 1;
          await pool.clearKids();
          continue;
        }
        const sel = [], speeds = new Set(), own = ok.find(c => c.nd.inc && c.same);
        if (own) { sel.push(own); speeds.add(Math.round(own.r.v)); }
        for (const c of ok) { if (sel.length >= BEAM) break; const v = Math.round(c.r.v); if (!sel.includes(c) && !speeds.has(v)) { speeds.add(v); sel.push(c); } }
        for (const c of ok) { if (sel.length >= BEAM) break; if (!sel.includes(c)) sel.push(c); }
        show(sel);
        const nodes = new Array(sel.length);
        await Promise.all([...new Set(sel.map(c => c.wi))].map(async wi => {
          const mine = sel.map((c, i) => [c, i]).filter(([c]) => c.wi === wi);
          const got = await pool.take(wi, mine.map(([c]) => c.key));
          mine.forEach(([c, i], q) => { nodes[i] = { n: got[q], plan: c.p, inc: !!(c.nd.inc && c.same), r: c.r }; });
        }));
        await pool.clearKids();
        beam = nodes.filter(nd => nd.n);
        k++; beams[k] = beam;
      }
      if (!this.running || !bestEnd) return { improved: false };
      // checked from the start, as everything else is compared
      const full = (await pool.evalAll([bestEnd.p]))[0];
      let improved = beats(full, this.best);
      // where real rides have fallen, a plan that holds with the jitters beats one that does not, whatever their points
      // (else the plan that keeps falling in the game would stay, for it scores more in the simulation)
      if (this.fragile.size) {
        if (this.bestHolds === undefined) this.bestHolds = await this.holds(this.plan);
        const h = await this.holds(bestEnd.p);
        if (h !== this.bestHolds) improved = h;
        if (improved) this.bestHolds = h;
      }
      if (improved) { this.plan = bestEnd.p; this.best = full; }
      return { improved, full, backs, ms: performance.now() - t0 };
    }
    // the jitters, as wide as real rides have shown they need to be
    jits() { const s = this.jitScale || 1; return JITS.map(j => ({ dv: j.dv * s, dt: j.dt * s })); }
    // whether plan p, ridden from the start with each of the jitters, gets past every fragile section
    async holds(p) {
      const last = Math.max(...this.fragile), need = Math.min(this.N - 1, this.secs[last].b + 5);
      const rs = await Promise.all(this.jits().map(j => this.pool.evalAll([p], j).then(o => o[0])));
      return rs.every(r => done(r) || r.prog >= need);
    }
    async run() {
      if (this.running || !this.pool) return;
      this.running = true;
      try {
        if (!this.pool.snapOk) throw new Error(tx('trạng thái vật lý không lưu lại được trên máy này', 'the physics state cannot be saved on this computer'));
        let wide = 1;
        while (this.running) {
          const r = await this.sweep(wide);
          if (!this.running) break;
          const improved = r && r.improved;
          wide = improved ? 1 : Math.min(2.5, wide * 1.35);
          this.gen++;
          this.hist.push([this.gen, Math.round(this.best.game), this.best.prog, done(this.best) ? 1 : 0]);
          if (improved && this.on.better) this.on.better(this.best);
          if (this.on.saved) this.on.saved();
        }
      } catch (err) {
        if (this.running && !(this.pool && this.pool.closed)) throw err;
      } finally { this.running = false; }
    }
    // A real ride of the line fell (or came down worse) where the simulation of the same plan did not: that section is
    // fragile from now on, and the best plan is checked again with the jitters. Falling again where it already was
    // fragile, with a plan that held with the jitters, they were not wide enough: half as wide again (at most 4 times).
    markFragile(k) {
      if (!(k >= 0 && k < this.secs.length)) return;
      if (this.fragile.has(k) && this.bestHolds) this.jitScale = Math.min(4, (this.jitScale || 1) * 1.5);
      this.fragile.add(k); this.bestHolds = undefined;
    }
  }
