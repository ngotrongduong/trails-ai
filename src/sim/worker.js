// ---------------------------------------------------------------- a learning worker
// Runs the game's own physics (the same WebAssembly the game runs) on one line, and rides plans on it: whole rides
// (eval), or a part of the line from a saved state (roll, the search's way). The build puts sim/rider.js in front.
'use strict';
let l, SL, K, kidx, FF, fmt, g, R, H, S;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function state() { return new Float64Array(l.memory.buffer, l.trails_game_state(g), SL); }
async function init(m) {
  const { instance } = await WebAssembly.instantiate(m.wasm, {});
  l = instance.exports;
  m.land.forEach((b, i) => { const n = l.trails_alloc(b.byteLength); new Uint8Array(l.memory.buffer, n, b.byteLength).set(new Uint8Array(b)); if (!l.trails_land_data(i, n, b.byteLength)) throw new Error('land ' + i); });
  g = l.trails_game_new(1); SL = l.trails_state_len();
  const txt = n => { const b = l.trails_buf(g); return new TextDecoder().decode(new Uint8Array(l.memory.buffer, b, n)); };
  K = JSON.parse(txt(l.trails_kinds_json(g))); kidx = Object.fromEntries(K.map((k, i) => [k.key, i]));
  FF = l.trails_world_sizes() & 65535; const wp = l.trails_world_flat(g, 1); fmt = new Float64Array(l.memory.buffer, wp, 1)[0];
  addLine(m.route, m.setup);
}
function addLine(route, setup) {
  R = route;
  // the line starts at the first piece after the start: a straight run-in from the spawn
  const d = Math.hypot(R.X[0] - R.start.x, R.Z[0] - R.start.z), n = Math.floor(d);
  if (n >= 2) {
    const X = [], Z = [], KI = [], W = [];
    for (let i = 0; i < n; i++) { const f = i / d; X.push(R.start.x + (R.X[0] - R.start.x) * f); Z.push(R.start.z + (R.Z[0] - R.start.z) * f); KI.push('start'); W.push(0); }
    R.X = X.concat(Array.from(R.X)); R.Z = Z.concat(Array.from(R.Z)); R.KIND = KI.concat(Array.from(R.KIND));
    R.W = R.W ? W.concat(Array.from(R.W)) : null;
  }
  R.length = R.X.length;
  R.HW = Float32Array.from(R.KIND, (k, i) => (R.W && R.W.length === R.length && R.W[i] > 0 ? R.W[i] : HALF_W[k] || 1.5));
  const arr = [fmt, 2, 0, 0, 0];
  let c = 0;
  for (const f of R.pieces) {
    const ki = kidx[f.kind]; if (ki === undefined) continue; c++;
    const p = K[ki].params.map(q => { const v = f.params && f.params[q.key]; return Math.min(q.max, Math.max(q.min, v !== undefined ? v : q.default)); });
    arr.push(c, ki, f.x, f.z, f.heading); for (let h = 0; h < FF - 5; h++) arr.push(h < p.length ? p[h] : 0);
  }
  const h = arr.length * 8 + 8, a = l.trails_alloc(h), dd = a + 7 & -8;
  new Float64Array(l.memory.buffer, dd, arr.length).set(arr);
  l.trails_draft(g, dd, arr.length); l.trails_dealloc(a, h); l.trails_draft_apply(g);
  // ride with the player's setup from the game: unlocked tricks, bike, tunes
  const su = setup || { tricks: 511, bike: 0, tunes: {} };
  if (su.bike) l.trails_bike_select(g, su.bike);
  for (const [i, v] of Object.entries(su.tunes || {})) l.trails_tune(g, +i, v);
  l.trails_set_tricks(g, su.tricks);
  H = new Float64Array(R.length); for (let i = 0; i < R.length; i++) H[i] = l.trails_draft_height(g, R.X[i], R.Z[i]);
  S = sections();
  R.PZ = pumpZones();
}
// Cut the line into sections: one ends at every takeoff lip, the others every 40 m. A jump's pt: the slope to land on.
function sections() {
  const N = R.length, out = [];
  let a = 0, nl = -1;
  const nextLand = new Int32Array(N).fill(-1);
  for (let i = N - 1; i >= 0; i--) { if (R.KIND[i] === 'landing') nl = i; nextLand[i] = nl; }
  const isT = i => i < N && R.KIND[i] === 'takeoff';
  for (let i = 0; i < N; i++) {
    const lip = isT(i) && !isT(i + 1);
    if (lip || i - a >= 40 || i === N - 1) {
      let pt = 0;
      if (lip) { const q = nextLand[i], j = q >= 0 && q - i < 45 ? q : Math.min(N - 5, i + 12); pt = clamp(Math.atan2(H[Math.min(N - 1, j + 4)] - H[j], 4), -0.7, 0.2); }
      out.push({ a, b: i, jump: lip, pt: +pt.toFixed(3) });
      a = i + 1;
    }
  }
  return out;
}
// Where the game's Training says to pump: where the ground bends up (a dip: over ±0.5 m it curves more than 0.06), at
// least 0.8 m long, not on a takeoff (from 0.3 m before it to 1.5 m past its lip) and not a dip just before one (2.5 m
// or less: there you pull). Each zone is [from, to, its lowest point] in metres along the line, found every 5 cm.
function pumpZones() {
  const N = R.length, st = 0.05, n = Math.floor((N - 1) / st) + 1, h = new Float64Array(n), e = 10;
  for (let i = 0; i < n; i++) { const u = i * st, j = Math.min(N - 2, Math.floor(u)), f = u - j; h[i] = l.trails_draft_height(g, R.X[j] + (R.X[j + 1] - R.X[j]) * f, R.Z[j] + (R.Z[j + 1] - R.Z[j]) * f); }
  const tk = [];
  for (let i = 0; i < N; i++) if (R.KIND[i] === 'takeoff' && (i === 0 || R.KIND[i - 1] !== 'takeoff')) { let b = i; while (b + 1 < N && R.KIND[b + 1] === 'takeoff') b++; tk.push([i, b + 1]); }
  const nearT = u => tk.some(q => u >= q[0] - 0.3 && u <= q[1] + 1.5), out = [];
  let a = -1;
  for (let i = 0; i < n; i++) {
    const c = (h[Math.max(0, i - e)] - 2 * h[i] + h[Math.min(n - 1, i + e)]) / 0.25 > 0.06 && !nearT(i * st);
    if (c && a < 0) a = i;
    if ((!c || i === n - 1) && a >= 0) {
      if ((i - a) * st >= 0.8) { let p = a; for (let m = a; m <= i; m++) if (h[m] < h[p]) p = m; const z = [a * st, i * st, p * st].map(v => +v.toFixed(2)); if (!tk.some(q => q[0] - z[1] < 2.5 && q[0] > z[2])) out.push(z); }
      a = -1;
    }
  }
  return out;
}
function spawn() { l.trails_set_spawn_at(g, R.start.x, R.start.z, R.start.heading, 0); l.trails_game_reset(g); }
// steps without a metre more along the line before a ride is stuck (the AI driving in the game gives up as soon)
const STUCK = 180;
// Staying on the line. Half the width of the line at each point (R.HW): the piece's own, else the game's default for
// its kind (start 4 m wide, a lip 1.5, a landing 3.4, a pump 2.4, a flat 2). On the ground the bike may be OFF_EDGE m
// past the edge (the line's points are a metre apart, and the bike has its length); further off is off the line. Off
// the line by a lip (a takeoff, or the gap after it) the bike is riding round the jump: the ride ends there, as a fall
// would. Anywhere else each metre ridden off the line costs OFF_COST points (see judged in the learner).
const HALF_W = { start: 2, takeoff: 0.75, air: 0.75, landing: 1.7, pump: 1.2, flat: 1, berm: 2.5 };
const OFF_EDGE = 1;
// Past the end of the line the bike rides on straight at about 6 m/s, in the air at the plan's angle, and once on the
// ground half a second (halt) brakes to a stop; braking only going forwards, hard only where level (braking while
// rolling back tips the bike over backwards).
function tailBrake(s) { const v = s[8], p = s[4]; if (s[12] > 0 || v <= 0) return 0; if (Math.abs(p) >= 0.15) return p > 0 ? 70 : 40; return v > 1.5 ? 70 : 127; }
function tailInp(s, inp, halt) {
  const n = R.length, k = Math.max(0, n - 6), h = Math.atan2(R.Z[n - 1] - R.Z[k], R.X[n - 1] - R.X[k]), v = s[8], air = s[12] > 0;
  const st = Math.round((air ? 0 : clamp(2 * wrapA(h - s[3]), -1, 1)) * 127), ln = air ? inp[3] : 0;
  return halt ? [0, tailBrake(s), st, ln, 0, 0, 0] : [v < 6 ? 127 : 0, v > 9 ? 40 : 0, st, ln, 0, 0, 0];
}
// A ride of the line with plan P (jit: see makeRider), kept as an object so that it can stop where a test says (go),
// be saved with the game's memory (save) and go on later from there, with another plan for what is still ahead (load).
// jl: every landing the game counted, with its points (landPoints) once the bike has stayed up half a second after it
// (as the game keeps a landing); game: all those points; streak: the game's streak going on.
function Ep(P, jit) {
  spawn();
  const s = state(), N = R.length;
  const E = { P, jit: jit || null, N, t: 0, idx: 0, prog: 0, seq: s[16], stall: 0, crash: 0, end: 'timeout', done: null,
    maxT: Math.min(120000, Math.round(N / 2.5 * 60) + 600), vr: new Float32Array(N), pending: null, landT: -1e9,
    progAt: 0, progT: 0, offM: 0, round: 0, jl: [], game: 0, train: 0, xp: 0, streak: 0, airP: 0, tail: -1, calm: 0, halt: 0, held: -1, vTail: 0, bigLand: -1,
    man: 0, manCur: 0, manN: 0, manLong: 0 };
  E.rider = makeRider(R, H, S, P, E.jit);
  return E;
}
// Rides E on until stop(E, state) says to wait (null back) or the ride is over (its result back).
function go(E, stop) {
  if (E.done) return E.done;
  const N = E.N, rider = E.rider;
  let s = state();
  for (; E.t < E.maxT; E.t++) {
    const t = E.t;
    if (stop && stop(E, s)) return null;
    const air = s[12] > 0;
    let inp = rider.step(s, t);
    const idx = E.idx = rider.idx;
    if (rider.landed && s[14] > 2) E.bigLand = idx;
    const outside = !air && E.tail < 0 && rider.off > R.HW[idx] + OFF_EDGE;
    if (outside && (R.KIND[idx] === 'takeoff' || R.KIND[idx] === 'air')) { E.end = 'off'; E.round = 1; return fin(E, s); }
    if (idx > E.prog) { for (let i = E.prog + 1; i <= idx; i++) E.vr[i] = Math.abs(s[8]); if (outside) E.offM += idx - E.prog; E.prog = idx; }
    E.calm = air ? 0 : E.calm + 1;
    // past the end: ridden on, braked to a stop and held a second: only a bike that stays up there has finished
    if (idx >= N - 3 && E.tail < 0) { E.tail = t; E.vTail = +Math.abs(s[8]).toFixed(2); }
    if (E.tail >= 0) {
      if (!E.halt && (E.calm >= 30 || (!air && s[8] < -0.3))) E.halt = 1;
      if (E.held < 0 && E.halt && !air && Math.abs(s[8]) < 0.5 && Math.abs(s[4]) < 0.15) E.held = t;
      if (((E.held >= 0 && t - E.held >= 60) || t - E.tail >= 420) && !E.pending) { E.end = 'finish'; return fin(E, s); }
      inp = E.held >= 0 ? [0, 127, 0, 0, 0, 0, 0] : tailInp(s, inp, E.halt);
    } else if (rider.off > (E.bigLand >= 0 && idx - E.bigLand < 40 ? 15 : Math.max(7, R.W && R.W.length === N ? R.W[idx] + 1 : 0)) && !air) { E.end = 'off'; return fin(E, s); }
    if (rider.landed) E.landT = t;
    if (E.prog > E.progAt) { E.progAt = E.prog; E.progT = t; } else if (E.tail < 0 && t - E.progT > STUCK) { E.end = 'stuck'; return fin(E, s); }
    l.trails_game_step(g, inp[0], inp[1], inp[2], inp[3], inp[4], inp[5], inp[6]);
    s = state();
    if (s[13] > 0) { E.crash = s[13]; E.end = 'crash'; E.pending = null; return fin(E, s); }
    if (s[46] > 0) E.manCur++; else if (E.manCur) manEnd(E);
    if (s[12] > 0) E.airP = s[4];
    if (s[16] !== E.seq) {
      E.seq = s[16];
      if ((s[15] | 0) > 0) {
        const k = rider.airSec, lp = landPoints(s, E.streak), i = Math.min(N - 3, Math.max(2, idx)), sl = Math.atan2(H[i + 2] - H[i - 2], 4);
        E.streak = lp.streak;
        // (dp: the bike's pitch just before it came down less the slope there; imp, mis: how hard and how far off)
        E.pending = { t, e: { k, i: idx, a: +s[14].toFixed(2), h: +s[20].toFixed(2), g: lp.g, p: lp.p, train: lp.train, m: lp.m, st: lp.streak, xp: lp.xp, extra: lp.extra, got: lp.got,
          dp: +(E.airP - sl).toFixed(3), sl: +sl.toFixed(4), imp: +s[23].toFixed(2), mis: +(s[22] || 0).toFixed(3), t } };
      }
    }
    const pd = E.pending;
    if (pd && t - pd.t >= 30) { E.jl.push(pd.e); E.game += pd.e.p; E.train += pd.e.train; E.xp += pd.e.xp; E.pending = null; }
    if (E.tail < 0 && Math.abs(s[8]) < 0.6 && !(s[12] > 0)) { if (++E.stall > 150) { E.end = 'stopped'; return fin(E, s); } } else E.stall = 0;
  }
  return fin(E, state());
}
// A manual ended: the game keeps one of a second or more (its time and metres count); so does the AI (steps)
const MAN_MIN = 60;
function manEnd(E) { if (E.manCur >= MAN_MIN) { E.man += E.manCur; E.manN++; E.manLong = Math.max(E.manLong, E.manCur); } E.manCur = 0; }
// What a ride got, at its end (final) or so far (a ride stopped on the way).
function summary(E, s, final) {
  const rider = E.rider, t = E.t, prog = E.prog;
  const sec = rider.sec, crashSec = E.crash ? (s[12] > 0 || t - E.landT < 60 ? rider.airSec : sec) : sec;
  // of two rides that end at the same place, the one that came at it faster counts a little more (at most 1 m)
  const pace = 0.05 * Math.min(20, E.vr[Math.max(0, prog - 5)]);
  const vEnd = E.tail >= 0 ? E.vTail : +Math.abs(s[8]).toFixed(2), vAvg = +(prog / Math.max(1, t) * 60).toFixed(2);
  return { fit: prog + pace + E.game / 1000, prog, crash: E.crash, end: final ? E.end : 'riding', ticks: t, sec, crashSec,
    game: E.game, train: E.train, xp: E.xp, streak: E.streak, jl: E.jl.slice(), vEnd, vAvg, offM: E.offM, round: E.round,
    man: +((E.man + (E.manCur >= MAN_MIN ? E.manCur : 0)) / 60).toFixed(2), manN: E.manN + (E.manCur >= MAN_MIN ? 1 : 0), manLong: +(Math.max(E.manLong, E.manCur >= MAN_MIN ? E.manCur : 0) / 60).toFixed(2) };
}
function fin(E, s) { return E.done = summary(E, s, true); }

// Saved states. A worker keeps its memory as it was once the line was loaded (the base: the same in every worker, as
// its hash shows); a state is the pages that differ from the base, so putting one back makes the whole memory exactly
// as it was, in any worker. Which pages rides write (KP) is learned on the way: after each lot of tries the memory
// outside KP is compared with the base, and when a ride wrote there those pages join KP and the lot is ridden again.
// clean: the memory outside KP is known to be the base.
const PG = 4096, PW = PG / 4, KP = new Set();
let BN = 0, BZ = null, BO = null, BB = null, BB32 = null, BH = 0, clean = false;
function takeBase() {
  const m32 = new Int32Array(l.memory.buffer), n = m32.length / PW;
  let c = 0, h = 2166136261;
  BN = n; BZ = new Uint8Array(n); BO = new Int32Array(n);
  for (let p = 0; p < n; p++) { let z = 1; for (let i = p * PW, e = i + PW; i < e; i++) { const v = m32[i]; h = Math.imul(h ^ v, 16777619); if (v !== 0) z = 0; } BZ[p] = z; if (!z) BO[p] = c++; }
  BB = new Uint8Array(c * PG); BB32 = new Int32Array(BB.buffer);
  const m = new Uint8Array(l.memory.buffer);
  for (let p = 0; p < n; p++) if (!BZ[p]) BB.set(m.subarray(p * PG, p * PG + PG), BO[p] * PG);
  BH = h >>> 0;
}
function baseIs(m32, p) {
  const o = p * PW;
  if (p >= BN || BZ[p]) { for (let i = o; i < o + PW; i++) if (m32[i] !== 0) return false; return true; }
  const b = BO[p] * PW; for (let i = 0; i < PW; i++) if (m32[o + i] !== BB32[b + i]) return false; return true;
}
function toBase(m, p) { if (p >= BN || BZ[p]) m.fill(0, p * PG, p * PG + PG); else m.set(BB.subarray(BO[p] * PG, BO[p] * PG + PG), p * PG); }
function snapMem() {
  const ps = Int32Array.from([...KP].sort((a, b) => a - b)), m = new Uint8Array(l.memory.buffer), d = new Uint8Array(ps.length * PG);
  for (let i = 0; i < ps.length; i++) d.set(m.subarray(ps[i] * PG, ps[i] * PG + PG), i * PG);
  return { ps, d, len: m.length };
}
function putMem(sn) {
  // (a state may hold pages past this worker's memory: KP comes from rides in other workers too)
  if (sn) { const need = Math.max(sn.len, sn.ps.length ? (sn.ps[sn.ps.length - 1] + 1) * PG : 0), have = l.memory.buffer.byteLength; if (have < need) l.memory.grow(Math.ceil((need - have) / 65536)); }
  const m = new Uint8Array(l.memory.buffer), inS = new Set();
  if (sn) for (let i = 0; i < sn.ps.length; i++) { const p = sn.ps[i]; inS.add(p); KP.add(p); m.set(sn.d.subarray(i * PG, i * PG + PG), p * PG); }
  if (clean) { for (const p of KP) if (!inS.has(p)) toBase(m, p); return; }
  const m32 = new Int32Array(l.memory.buffer), n = m32.length / PW;
  for (let p = 0; p < n; p++) if (!inS.has(p) && !baseIs(m32, p)) { toBase(m, p); KP.add(p); }
  clean = true;
}
function rogue() { const m32 = new Int32Array(l.memory.buffer), n = m32.length / PW, out = []; for (let p = 0; p < n; p++) if (!KP.has(p) && !baseIs(m32, p)) out.push(p); return out; }
function save(E) {
  const e = {};
  for (const k in E) if (k !== 'rider' && k !== 'P' && k !== 'done') e[k] = E[k];
  e.vr = E.vr.slice(); e.jl = E.jl.slice(); e.pending = E.pending ? { t: E.pending.t, e: E.pending.e } : null;
  return { mem: snapMem(), e, r: E.rider.save() };
}
function load(n, P, jit) {
  putMem(n.mem);
  const E = { ...n.e, P, jit: jit || null, done: null };
  E.vr = n.e.vr.slice(); E.jl = n.e.jl.slice(); E.pending = n.e.pending ? { t: n.e.pending.t, e: n.e.pending.e } : null;
  E.rider = makeRider(R, H, S, P, E.jit); E.rider.load(n.r);
  return E;
}
// P ridden from the base until stop (none: to the end, and its result back); the pages it wrote join KP
function fromBase(P, stop) {
  putMem(null);
  const E = Ep(P), r = go(E, stop);
  for (const p of rogue()) KP.add(p);
  return stop ? E : r;
}
function calib(plans) { for (const P of plans) fromBase(P); return { list: [...KP], hash: BH, size: BN * PG }; }
// A ride stopped halfway and saved, something else ridden, the state put back and the ride gone on: it must end
// exactly as the same ride straight through.
function selftest(P, Q) {
  const full = fromBase(P), half = Math.max(1, full.ticks >> 1), E = fromBase(P, E => E.t >= half);
  if (E.done) return { ok: true, short: true };
  const n = save(E), X = Ep(Q || P); go(X, X => X.t >= half + 240); for (const p of rogue()) KP.add(p);
  const r = go(load(n, P));
  const ok = r.prog === full.prog && r.ticks === full.ticks && r.game === full.game && r.end === full.end && r.jl.length === full.jl.length;
  return { ok, a: [full.prog, full.ticks, full.game, full.end], b: [r.prog, r.ticks, r.game, r.end] };
}
// Tries for one part of the line: from saved state node (null: the start) each plan rides on; when the bike gets to
// point a1 its state is saved (kept by key bid:i for take), and the ride goes on until it has been on the ground 45
// steps after a1 and after its last landing, or gets to point a2, or is over. With jits, each plan also rides from the
// node with each of them (a little faster or slower, its tricks later), and its worst of those comes back too (worst).
// A try the game's code fails in (its memory written where KP did not say) counts as a fall there, and the lot is
// ridden again.
const kids = new Map();
// The check of the whole memory (rogue) reads all of it (70 MB, 60-90 ms): after every lot until 30 lots in a row
// found nothing, then every 6th lot (a page missed in between only makes a few tries ride on from a state not quite
// right; every ride the AI keeps is ridden again from the start).
let quiet = 0, lots = 0;
// tr: where the bike went (the viewer's): every TR_EVERY steps its place along the line, its height and where it is
// on the map (x, z), four numbers a point
const TR_EVERY = 3;
function rollOne(node, P, jit, a1, a2, keep, tr) {
  let kid = null, kt = 0;
  const E = node ? load(node, P, jit) : (putMem(null), Ep(P, jit)), t0 = E.t;
  const stop = (E, s) => {
    if (tr && E.t > t0 && (E.t - t0) % TR_EVERY === 0) tr.push(+E.rider.at.toFixed(2), +s[1].toFixed(2), +s[0].toFixed(2), +s[2].toFixed(2));
    if (keep && !kid && a1 >= 0 && E.rider.peek(s) >= a1) { kid = save(E); kt = E.t; }
    if (E.rider.idx >= a2) return true;
    return (keep ? !!kid : a1 >= 0 && E.rider.idx >= a1) && !(s[12] > 0) && E.t - Math.max(E.landT, kt) >= 45 && !E.pending;
  };
  const end = go(E, stop), r = end || summary(E, state(), false);
  r.kid = keep ? !!kid : false; r.v = +Math.abs(state()[8]).toFixed(2);
  return { r, kid };
}
const failed = err => ({ fit: -1e9, prog: 0, end: 'error', crash: 1, crashSec: 0, sec: 0, jl: [], game: 0, train: 0, xp: 0, streak: 0, ticks: 0, vAvg: 0, kid: false, v: 0, error: String(err) });
function roll(m) {
  for (let lot = 0; ; lot++) {
    const out = [], got = [];
    let broke = false;
    m.plans.forEach((P, i) => {
      let r;
      try {
        // (jitOnly: a try already ridden, ridden again with the jitters only)
        const tr = m.trace && !m.jitOnly ? [] : null;
        const one = m.jitOnly ? { r: { kid: true }, kid: null } : rollOne(m.node, P, null, m.a1, m.a2, true, tr);
        r = one.r;
        if (tr) r.tr = tr;
        if (one.kid) got.push([m.bid + ':' + i, one.kid]);
        if (m.jits && m.jits.length && r.kid) {
          let worst = null;
          for (const j of m.jits) { const x = rollOne(m.node, P, j, m.a1, m.a2, false).r; if (!worst || x.prog < worst.prog || (x.prog === worst.prog && x.game < worst.game)) worst = x; }
          r.worst = { prog: worst.prog, end: worst.end, game: worst.game, crash: worst.crash };
        }
      } catch (err) { broke = true; clean = false; r = failed(err); }
      out.push(r);
    });
    const look = broke || quiet < 30 || ++lots % 6 === 0, bad = look ? rogue() : [];
    for (const p of bad) KP.add(p);
    quiet = bad.length || broke ? 0 : quiet + (look ? 1 : 0);
    if ((!bad.length && !broke) || lot >= 3) { for (const [k, v] of got) kids.set(k, v); return out; }
    for (const [k] of got) kids.delete(k);
  }
}
// A whole ride of P with a record: where the bike was every 6th step and what every landing got (for the panel)
// A whole ride of plan P, and every TRACE_EVERY steps where it was: tick, place along the line, height, speed,
// pitch, in the air (the real ride in the game keeps the same, to be laid side by side)
const TRACE_EVERY = 3;
function trace(P) {
  putMem(null); clean = false;
  const E = Ep(P), pts = [];
  const r = go(E, (E, s) => { if (E.t % TRACE_EVERY === 0) pts.push([E.t, +E.rider.at.toFixed(2), +s[1].toFixed(3), +s[8].toFixed(3), +s[4].toFixed(4), s[12] > 0 ? 1 : 0]); return false; });
  return { r, pts };
}
onmessage = async e => {
  const m = e.data;
  // (rides other than the search's may write anywhere: see putMem)
  if (m.type !== 'roll' && m.type !== 'take' && m.type !== 'clear') clean = false;
  try {
    if (m.type === 'init') {
      await init(m); takeBase();
      postMessage({ type: 'ready', id: m.id, secs: S, length: R.length, geo: { X: Array.from(R.X), Z: Array.from(R.Z), KIND: Array.from(R.KIND), W: R.W ? Array.from(R.W) : null, H: Array.from(H), PZ: R.PZ } });
    } else if (m.type === 'eval') { const out = m.plans.map(p => { putMem(null); clean = false; return go(Ep(p, m.jit)); }); postMessage({ type: 'evals', id: m.id, out }); }
    else if (m.type === 'trace') postMessage({ type: 'trace', id: m.id, ...trace(m.plan) });
    else if (m.type === 'calib') postMessage({ type: 'calib', id: m.id, ...calib(m.plans) });
    else if (m.type === 'pages') { for (const p of m.list) KP.add(p); postMessage({ type: 'pages', id: m.id, test: selftest(m.plans[0], m.plans[1]) }); }
    else if (m.type === 'snapat') { const full = fromBase(m.P), E = fromBase(m.P, E => E.t >= full.ticks >> 1); postMessage({ type: 'snapat', id: m.id, full, node: E.done ? null : save(E) }); }
    else if (m.type === 'snaptest') postMessage({ type: 'snaptest', id: m.id, r: go(load(m.node, m.P)) });
    else if (m.type === 'roll') postMessage({ type: 'roll', id: m.id, out: roll(m) });
    else if (m.type === 'take') postMessage({ type: 'take', id: m.id, nodes: m.keys.map(k => kids.get(k) || null) });
    else if (m.type === 'clear') { kids.clear(); postMessage({ type: 'clear', id: m.id }); }
  } catch (err) { postMessage({ type: 'error', id: m.id, error: String(err && err.stack || err) }); }
};
