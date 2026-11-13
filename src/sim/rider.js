// ---------------------------------------------------------------- the rider (shared: the page and the workers)
// This file runs twice: in the page, where the AI rides the player's bike, and in every learning worker (the build puts
// a copy of it in front of the worker's code), so a plan rides the same in the simulation and in the game.

const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
// The game's state, by index (the game's own names: core S)
const S_ = { X: 0, Y: 1, Z: 2, HEADING: 3, PITCH: 4, SPEED: 8, AIR: 12, CRASH: 13, LAST_AIR: 14, GRADE: 15, LAND_SEQ: 16,
  HEIGHT: 20, DIST: 21, MISMATCH: 22, IMPACT: 23, LAST_WHIP: 41, LAST_SPIN: 43, LAST_FLIP: 44, MANUAL: 46, MANUAL_BAL: 47,
  SPIN: 48, TABLE: 52, TAIL: 53, BARS: 54, HANDS: 55, LAST_TRICKS: 56, LAST_TAIL: 57, LAST_BARS: 58 };
// The buttons the game takes (core BUTTON_*): pull up, push down, the layer (Shift), tailwhip, barspin, and the bit that
// throws tailwhips and barspins to the left.
const BTN = { UP: 1, DOWN: 2, LAYER: 8, TAIL: 16, BAR: 32, LEFT: 64 };
// The tricks a landing is counted with (s[56], core TRICK) and the unlock bits of the account (setTricks)
const TRICK = { TABLE: 16, TAILWHIP: 32, BARSPIN: 64, TBOG: 128, XUP: 256 };
const UNLOCK = { whip: 1, spin: 2, flip: 4, manual: 8, table: 16, tailwhip: 32, barspin: 64, tbog: 128, xup: 256 };
// Button tricks a trick program can throw in the air, one after another: T tailwhip, B barspin (n: how many times
// round), L table, G T-bog, X X-up (held tricks: n tenths of a second held, then let go to come back). What each
// needs from the account, the buttons it holds, and about how long it takes (measured in the game's physics: a
// tailwhip goes round in 0.6 s, a barspin in 0.37 s, a held trick takes about 0.35 s to come back once let go).
const BTRICKS = {
  T: { unlock: UNLOCK.tailwhip, b: BTN.TAIL, turn: 0.62 },
  B: { unlock: UNLOCK.barspin, b: BTN.BAR, turn: 0.4 },
  L: { unlock: UNLOCK.table, b: BTN.LAYER, back: 0.45, whip: true },
  G: { unlock: UNLOCK.tbog, b: BTN.LAYER | BTN.TAIL, back: 0.25 },
  X: { unlock: UNLOCK.xup, b: BTN.LAYER | BTN.BAR, back: 0.35 },
};
const btrickTime = (c, n) => { const d = BTRICKS[c]; return d.turn ? d.turn * n : n / 10 + d.back; };
// A planned speed at the top of the range has no limit: pedal while it helps, never brake.
const VFREE = 17.5;
// when to pump through a dip: from 0.1 m past where it starts to 0.2 m past its end (as the game's Training)
const PUMP0 = [0.1, 0.2];
// A manual (plan mn: 1 on gentle ground, 2 on slopes too): rolling, no pedals, UP held to lift the front, then fed
// whenever the game's balance meter (s[47], -1 front down .. 1 looping out) drops below MANUAL_BAL0. Measured in the
// game's physics on long level ground: so the bike stays on its back wheel 10 s and more and hardly slows; holding UP
// all the time loops out in 3 s. Only where the ground 4 m ahead is no steeper than MANUAL_SLOPE[mn] and no takeoff
// is within MANUAL_CLEAR m ahead.
const MANUAL_BAL0 = -0.2, MANUAL_SLOPE = [0, 0.06, 0.15], MANUAL_CLEAR = 8;

// ---- points
// What one landing is worth. The game gives points for a landing only in Train (base 160 buttery, 140 clean, 100
// sketchy, 50 flat or cased, which end the streak; 300 for a backflip, 100 a half turn for a spin of 360 or more, 100 a
// whip; all of it times the streak, up to 5), and skill points for every kind of trick landed (each kind once a
// landing, whatever the grade): whip 2, 360 4, backflip 6, barspin 3, T-bog 3, X-up 4, tailwhip 5, table 5, and 10
// more for a 360 table. The AI goes for both: a landing is worth its Train points plus 25 for each skill point, plus
// 15 for every turn a trick went round more than once (a double barspin, a double backflip), which the game names
// but does not pay for.
const XP_W = 25, EXTRA_W = 15;
function landPoints(s, streak) {
  const g = s[S_.GRADE] | 0, rough = g >= 4, run = rough ? 0 : streak + 1, m = Math.max(1, Math.min(5, run));
  const fl = Math.abs(s[S_.LAST_FLIP] || 0), sp = Math.abs(s[S_.LAST_SPIN] || 0), wh = Math.abs(s[S_.LAST_WHIP] || 0), tb = s[S_.LAST_TRICKS] | 0;
  const turn = sp >= 300 ? 180 * Math.floor((sp + 60) / 180) : 0, flip = fl >= 270, whip = wh >= 45;
  let train = g === 1 ? 160 : g === 2 ? 140 : g === 3 ? 100 : 50;
  if (flip) train += 300;
  if (turn >= 360) train += 100 * turn / 180;
  if (whip) train += 100;
  train *= m;
  const tail = tb & TRICK.TAILWHIP ? Math.max(1, s[S_.LAST_TAIL] | 0) : 0, bars = tb & TRICK.BARSPIN ? Math.max(1, s[S_.LAST_BARS] | 0) : 0;
  const flips = flip ? Math.max(1, Math.round(fl / 360)) : 0;
  const got = { flip: flips, spin: turn >= 360 ? turn : 0, whip: whip ? 1 : 0, tailwhip: tail, barspin: bars,
    table: tb & TRICK.TABLE ? 1 : 0, tbog: tb & TRICK.TBOG ? 1 : 0, xup: tb & TRICK.XUP ? 1 : 0 };
  const xp = (got.whip ? 2 : 0) + (got.spin ? 4 : 0) + (flips ? 6 : 0) + (bars ? 3 : 0) + (got.tbog ? 3 : 0) + (got.xup ? 4 : 0)
    + (tail ? 5 : 0) + (got.table ? 5 : 0) + (got.spin && got.table ? 10 : 0);
  const extra = Math.max(0, tail - 1) + Math.max(0, bars - 1) + Math.max(0, flips - 1) + Math.max(0, turn / 360 - 1);
  return { g, train, m, streak: run, xp, extra, got, p: train + XP_W * xp + EXTRA_W * extra };
}
// the tricks of a landing in words (got: landPoints)
const TRICK_WORDS = { flip: 'Backflip', spin: 'Spin', whip: 'Whip', tailwhip: 'Tailwhip', barspin: 'Barspin', table: 'Table', tbog: 'T-bog', xup: 'X-up' };
const trickText = got => Object.keys(TRICK_WORDS).filter(k => got && got[k]).map(k => {
  const n = got[k], w = TRICK_WORDS[k];
  return k === 'spin' ? String(n) : (k === 'flip' || k === 'tailwhip' || k === 'barspin') && n > 1 ? `${w} ×${n}` : w;
}).join(' + ');

// ---- the plan
// A plan has, per section of the line: v (speed to hold, or vs: one for each equal part of the section), pl (pull up
// that many metres before a lip), pu (how hard to pump in the dips), ph (pump down the start hill too), lg (the rider's
// weight on the ground), pt (the bike's angle to hold in the air, rad), sa (steering in the air toward the line), mn (a
// manual where the ground lets it: see MANUAL_BAL0), and off
// a jump tk, its trick program (null: none):
//   f: 1 a backflip (the pedals held up the takeoff, then let go round)
//   s: a spin, -1 left, 1 right (the whip held up the takeoff), let go sr × 100° round (3.3 a 360, 6.9 a 720, ...)
//   w: a whip, -1 or 1, let go wt × 0.25 s after the lip
//   q: button tricks one after another, each [code (BTRICKS), n, gap s after the one before was caught]
//   m: seconds of air to keep before landing: a button trick is begun only when it will be caught by then
//   lf: tailwhips and barspins thrown to the left
//   h: the first button trick's buttons held up the takeoff (thrown harder)
// (off a jump the line turns in the air from, by TURN_SA rad and more, the rider steers round toward it from the start)
const TURN_SA = 0.5;
const freshPlan = secs => {
  const p = { v: secs.map(() => 8), pt: secs.map(s => s.pt), pl: secs.map(() => 0), pu: secs.map(() => 1), tk: secs.map(() => null) };
  if (secs.some(s => Math.abs(s.turn || 0) >= TURN_SA)) p.sa = secs.map(s => (Math.abs(s.turn || 0) >= TURN_SA ? 1 : 0));
  return p;
};

// Rides line R (points every metre, ground heights H, sections S) with plan P. me.step(state, tick) gives back the
// controls [pedal, brake, steer, lean, pump, buttons, whip]. The plan is me.P, which may be changed between steps;
// the rider's own state (all of me but P and the functions) can be copied out and put back (saved states).
// jit (robustness tests): dv m/s more on every planned speed, and dt s later on every trick.
function makeRider(R, H, S, P, jit) {
  const N = R.length, J = jit || { dv: 0, dt: 0 };
  const me = { P, idx: 0, sec: 0, airSec: 0, off: 0, at: 0, landed: false, wasAir: false, prevP: null, rot: 0, let: false, inp: [0, 0, 0, 0, 0, 0, 0],
    py: 0, pat: 0, lt: -1, pa: false, vy: null, va: 0, ay: null, gOff: 0, aim: 0,
    // the button tricks of this flight: which one is next (qi), since when the last was caught (qc), taps of this one
    // given (qn), pressing now since (qp, -1 not), whether one is out (qo)
    qi: 0, qc: 0, qn: 0, qp: -1, qo: false, airT: 0 };
  const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
  const hAt = u => { const i = Math.max(0, Math.min(N - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i)); return H[i] + (H[i + 1] - H[i]) * f; };
  const vAt = (k, i) => { const q = P.vs && P.vs[k]; const v = q && q.length ? q[Math.min(q.length - 1, Math.max(0, Math.floor((i - S[k].a) * q.length / (S[k].b - S[k].a + 1))))] : P.v[k]; return v >= VFREE ? v : v + J.dv; };
  const near = (bx, bz) => {
    let bi = me.idx, bd = Infinity;
    for (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }
    return [bi, bd];
  };
  // the point the next step puts the bike at, before the plan there is used (saved states are taken there)
  me.peek = s => near(s[0], s[2])[0];
  // where the bike comes down and in how many seconds, flown on from how it flies now (null: not known yet)
  const flyOn = by => {
    if (me.vy === null) return null;
    const ay = me.ay === null ? -9.8 : Math.max(-16, Math.min(-3, me.ay)), h = 1 / 30;
    let y = by, u = me.at, vy = me.vy;
    for (let k = 0; k < 450; k++) { vy += ay * h; y += vy * h; u += me.va * h; if (u > N - 3) return null; if (vy < 0 && y - me.gOff <= hAt(u)) return [u, (k + 1) * h]; }
    return null;
  };
  // whether the frame, the bars and the bike's lay are all back in line (the last button trick was caught)
  const caught = s => Math.abs(s[S_.TAIL]) < 0.06 && Math.abs(s[S_.BARS]) < 0.06 && Math.abs(s[S_.TABLE]) < 0.06;
  me.step = (s, t) => {
    const bx = s[0], by = s[1], bz = s[2], bh = s[3], sp = s[8], air = s[12] > 0;
    if (me.prevP === null) me.prevP = s[4];
    const [bi, bd] = near(bx, bz);
    me.idx = bi;
    while (me.sec < S.length - 1 && me.idx > S[me.sec].b) me.sec++;
    me.off = Math.sqrt(bd);
    { const j = Math.min(N - 2, bi), dx = R.X[j + 1] - R.X[j], dz = R.Z[j + 1] - R.Z[j];
      me.at = j + Math.max(-0.5, Math.min(1.5, ((bx - R.X[j]) * dx + (bz - R.Z[j]) * dz) / (dx * dx + dz * dz || 1))); }
    if (air && !me.wasAir) {
      // off a lip just passed (3 m or less behind) the jump is that lip's; else the jump of this section or the one
      // before (a hop on a landing is still the last jump's). (A plan from the old AI without as: always the latter,
      // its angles were learned for those sections.)
      me.airSec = me.sec; me.rot = 0; me.let = false; me.qi = 0; me.qc = 0; me.qn = 0; me.qp = -1; me.qo = false;
      const k0 = me.sec - 1;
      if (P.as !== false && k0 >= 0 && S[k0].jump && S[k0].b >= me.idx - 3 && !(S[me.sec].jump && S[me.sec].b <= me.idx + 2)) me.airSec = k0;
      else for (let k = me.sec; k >= 0 && k >= me.sec - 1; k--) if (S[k].jump) { me.airSec = k; break; }
    }
    me.landed = !air && me.wasAir;
    me.wasAir = air;
    if (t % 2 !== 0) return me.inp;
    const a1 = look(3 + Math.abs(sp) * 0.35), a2 = look(10 + Math.abs(sp) * 0.6);
    const e1 = wrapA(Math.atan2(R.Z[a1] - bz, R.X[a1] - bx) - bh), e2 = wrapA(Math.atan2(R.Z[a2] - bz, R.X[a2] - bx) - bh);
    let st = air ? 0 : Math.max(-1, Math.min(1, 2.2 * e1 + 0.6 * e2)), pedal = 0, brake = 0, lean = 0, btn = 0, whip = 0, pump = 0;
    const sec = me.sec, idx = me.idx;
    // how fast the bike rises and goes along the line, and in the air how fast that rise changes
    if (me.lt >= 0 && t > me.lt) {
      const dt = (t - me.lt) / 60, vy = (by - me.py) / dt;
      if (air && me.pa && me.vy !== null) { const a = (vy - me.vy) / dt; me.ay = me.ay === null ? a : me.ay + 0.25 * (a - me.ay); }
      me.vy = vy; me.va = (me.at - me.pat) / dt;
    }
    if (!air) { me.ay = null; me.gOff = by - hAt(me.at); }
    me.py = by; me.pat = me.at; me.lt = t; me.pa = air;
    if (!air) {
      // hold the planned speed; ease off the pedals on steep drops (full power there throws you over the bars)
      const va = vAt(sec, idx), e = va - sp, pm = s[4] < -0.15 ? 0.4 : 1;
      if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4 && va < VFREE) brake = Math.min(1, -e * 0.5);
      const onT = R.KIND[idx] === 'takeoff';
      if (P.pl[sec] > 0 && onT && idx >= S[sec].b - P.pl[sec]) btn |= BTN.UP;
      // pump, as hard as the section says, through the dips (R.PZ, pc 0), wherever the ground 1 to 3 m ahead rises (pc
      // 2: a dip's far side, a roller's or a lip's face) or falls away (pc 1, as the old AI did); on the start hill only
      // where the plan says so. (Measured on 6 lines: pumped where it rises or in the dips the bike gains 0.5-2 m/s;
      // where it falls away, or all the time, it soon goes over.)
      if (P.pu[sec] > 0 && (R.KIND[idx] !== 'start' || (P.ph && P.ph[sec]))) {
        const pk = P.pk || PUMP0, u = me.at, pm = P.pc ? P.pc[sec] || 0 : 0, rise = (H[look(3)] - H[look(1)]) / 2;
        if (pm === 2) { if (rise > 0.03) pump = P.pu[sec]; }
        else if (pm || !R.PZ) { if (-rise > 0.03) pump = P.pu[sec]; }
        else if (R.PZ.some(z => u >= z[0] + pk[0] && u <= z[1] + pk[1])) pump = P.pu[sec];
      }
      // tricks that start up the takeoff: a spin wound up with the whip held, a backflip popped with the pedals, the
      // first button trick's buttons held (thrown harder)
      const tk = P.tk[sec];
      if (tk && onT) {
        if (tk.s) whip = tk.s;
        if (tk.f) { pedal = 1; brake = 0; }
        if (tk.h && tk.q && tk.q.length && S[sec].jump && idx >= S[sec].b - 2) btn |= BTRICKS[tk.q[0][0]].b | (tk.lf ? BTN.LEFT : 0);
      }
      if (P.lg && P.lg[sec]) lean = P.lg[sec];
      // a manual where the plan has one and the ground lets it
      const mn = P.mn ? P.mn[sec] || 0 : 0;
      if (mn && !onT && Math.abs(H[look(4)] - H[idx]) / 4 <= MANUAL_SLOPE[mn]) {
        let clear = true;
        for (let i = idx; i < Math.min(N, idx + MANUAL_CLEAR); i++) if (R.KIND[i] === 'takeoff' || R.KIND[i] === 'air') { clear = false; break; }
        if (clear) { pedal = 0; brake = 0; pump = 0; lean = 0; if (!(s[S_.MANUAL] > 0) || s[S_.MANUAL_BAL] < MANUAL_BAL0) btn |= BTN.UP; }
      }
    } else {
      const dp = wrapA(s[4] - me.prevP) * 30;
      me.rot += wrapA(s[4] - me.prevP);
      me.airT = s[12];
      const k = me.airSec, aim = P.pt[k];
      lean = Math.max(-1, Math.min(1, 2.2 * (s[4] - aim) + 0.35 * dp));
      me.aim = aim;
      const tk = P.tk[k], sa = P.sa ? P.sa[k] || 0 : 0;
      if (sa && !(tk && tk.s && Math.abs(s[S_.SPIN]) < 340)) st = Math.max(-1, Math.min(1, sa * (2.2 * e1 + 0.6 * e2)));
      if (tk) {
        let free = false, pull = 0;
        if (tk.s) {
          // hold the whip until the bike is sr × 100° round, and leave its angle alone while it turns
          const a = Math.abs(s[S_.SPIN]);
          if (a >= (tk.sr || 3.3) * 100) me.let = true;
          if (!me.let) whip = tk.s;
          if (a > 5 && a < (tk.sf || (tk.sr || 3.3) * 100 + 20)) free = true;
        }
        if (tk.f) {
          // a backflip: let it go over, then bring it to the landing angle. On a flight of over 3 s it is let go only
          // until it is over the top (pulled round when it goes too slowly), then held at the landing angle.
          const f = s[12] > 0.3 && me.rot > -0.6 ? flyOn(by) : null, long = f && s[12] + f[1] > 3;
          if (long) {
            const rem = Math.PI + 0.5 - me.rot;
            if (rem > 0) { free = true; const need = rem / Math.max(0.25, f[1] - 2.5); if (dp < need) pull = Math.max(-1, Math.min(0, -0.8 * (need - dp))); }
          } else if (me.rot > -0.6 && me.rot < 5 + 6.28 * ((tk.f | 0) - 1)) free = true;
        }
        if (tk.w && s[12] < (tk.wt || 1.5) * 0.25 + J.dt) whip = tk.w;
        if (free) lean = pull;
        // a held move: buttons held (and a lean, a steer or a whip) while the bike is more than hm.h m above the ground
        // ahead, as the old AI's moves did
        const hm = tk.hm;
        if (hm && !tk.s && !tk.f && !tk.w) {
          const gnd = Math.max(H[look(3)], H[look(8)]);
          if (s[12] > 0.1 && by - gnd > hm.h) { btn |= hm.b || 0; if (hm.ln !== undefined) lean = hm.ln; if (hm.st) st = hm.st; if (hm.w) whip = hm.w; }
        }
        // the button tricks, one after another: each begun once the one before is caught, gap seconds after, and
        // only when it will be caught m seconds before the bike comes down
        const q = tk.q;
        if (q && me.qi < q.length) {
          const [c, n, gap] = q[me.qi], d = BTRICKS[c];
          if (me.qp >= 0) {
            // pressing: a tap for a turn of a tailwhip or barspin, held n tenths of a second for a held trick
            const held = (t - me.qp) / 60;
            if (d.turn ? held < 0.07 : held < n / 10) { btn |= d.b | (tk.lf ? BTN.LEFT : 0); if (d.whip) whip = tk.w || tk.s || 1; }
            else { me.qp = -1; me.qo = true; }
          } else if (me.qo) {
            if (caught(s)) { me.qo = false; me.qc = s[12]; if (!d.turn || ++me.qn >= n) { me.qi++; me.qn = 0; } }
          } else if (s[12] >= Math.max(0.15, me.qc + (gap || 0) + J.dt)) {
            const f = flyOn(by), need = d.turn ? d.turn : btrickTime(c, n);
            if (f && f[1] >= need + (tk.m === undefined ? 0.2 : tk.m)) { me.qp = t; btn |= d.b | (tk.lf ? BTN.LEFT : 0); if (d.whip) whip = tk.w || tk.s || 1; }
          }
        }
      }
    }
    me.prevP = s[4];
    me.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, Math.round(whip * 127)];
    return me.inp;
  };
  me.save = () => { const o = {}; for (const k in me) if (k !== 'P' && typeof me[k] !== 'function') o[k] = Array.isArray(me[k]) ? me[k].slice() : me[k]; return o; };
  me.load = o => { for (const k in o) me[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; };
  return me;
}
