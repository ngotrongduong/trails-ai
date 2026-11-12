(function TAI() {
'use strict';
if (window.top === window && !window.__taiDirect) { boot(TAI); return; }
if (window.TrailsAI) { window.TrailsAI.open(); return; }
function boot(fn) {
const old = document.getElementById('tai-frame');
if (old) { try { old.contentWindow.TrailsAI.open(); } catch { /* still loading */ } return; }
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
const keep = (() => {
const LS = window.localStorage, DB = 'trailsai', OS = 'kv', LOCAL = new Set(['trailsai.code', 'trailsai.lang']);
const mem = new Map(), listeners = [];
let db = null;
const ours = k => !!k && k.startsWith('trailsai.') && !LOCAL.has(k);
const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('trailsai.keep') : null;
if (chan) {
chan.onmessage = e => {
const { key, value } = e.data || {};
if (!ours(key)) return;
if (value === null) mem.delete(key); else mem.set(key, value);
for (const f of listeners) { try { f(key, value); } catch (err) { console.error(err); } }
};
}
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
const ready = (async () => {
try {
db = await new Promise((res, rej) => {
const q = indexedDB.open(DB, 1);
q.onupgradeneeded = () => q.result.createObjectStore(OS);
q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
});
const t = db.transaction(OS, 'readonly');
const ks = t.objectStore(OS).getAllKeys(), vs = t.objectStore(OS).getAll();
await done(t);
ks.result.forEach((k, i) => mem.set(k, vs.result[i]));
} catch (err) {
console.error('AI Trails: IndexedDB', err);
db = null;
try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (ours(k)) mem.set(k, LS.getItem(k)); } } catch { /* storage blocked */ }
}
})();
const failed = err => { console.error('AI Trails: IndexedDB', err); if (api.onError) { try { api.onError(err); } catch { /* the panel is gone */ } } };
const write = (k, v) => {
if (db) {
try {
const t = db.transaction(OS, 'readwrite');
if (v === null) t.objectStore(OS).delete(k); else t.objectStore(OS).put(v, k);
t.onerror = t.onabort = () => failed(t.error);
if (t.commit) t.commit();
} catch (err) { failed(err); }
} else if (v === null) LS.removeItem(k); else LS.setItem(k, v);
if (chan) chan.postMessage({ key: k, value: v });
};
const api = {
ready, onError: null,
getItem: k => (LOCAL.has(k) ? LS.getItem(k) : mem.has(k) ? mem.get(k) : null),
setItem(k, v) { v = String(v); if (LOCAL.has(k)) { LS.setItem(k, v); return; } write(k, v); mem.set(k, v); },
removeItem(k) { if (LOCAL.has(k)) { LS.removeItem(k); return; } mem.delete(k); write(k, null); },
keys: () => [...mem.keys()],
listen: f => { listeners.push(f); },
};
return api;
})();
const readJSON = (k, d) => { try { const v = JSON.parse(keep.getItem(k) || 'null'); return v === null ? d : v; } catch { return d; } };
const writeJSON = (k, v) => { try { keep.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const LANG = 'trailsai.lang';
let lang = (() => { try { return keep.getItem(LANG) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } })();
const tx = (vi, en) => (lang === 'en' ? en : vi);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = v => typeof v === 'number' && Number.isFinite(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kmh = v => (v * 3.6).toFixed(0);
const WAI = WebAssembly.instantiate.bind(WebAssembly);
const live = { ex: null, g: 0, SL: 0, drive: null, tricks: null, bike: 0, tunes: {}, steps: 0 };
WebAssembly.instantiate = async function (src, imports) {
const r = await WAI(src, imports);
const bare = r instanceof WebAssembly.Instance;
const ex = bare ? r.exports : r && r.instance && r.instance.exports;
if (!ex || !ex.trails_game_step || live.ex) return r;
const px = { ...ex };
const mine = g => !live.g || g === live.g;
px.trails_game_new = (...a) => { const g = ex.trails_game_new(...a); if (!live.g) live.g = g; return g; };
px.trails_set_tricks = (g, m) => { if (mine(g)) live.tricks = m; return ex.trails_set_tricks(g, m); };
px.trails_bike_select = (g, b) => { if (mine(g)) live.bike = b; return ex.trails_bike_select(g, b); };
px.trails_tune = (g, i, v) => { if (mine(g)) live.tunes[i] = v; return ex.trails_tune(g, i, v); };
px.trails_game_step = (g, ...inp) => {
if (g === live.g) {
live.steps++;
if (live.drive) { try { const o = live.drive.step(); if (o) inp = o; } catch (err) { live.drive = null; console.error(err); } }
}
return ex.trails_game_step(g, ...inp);
};
live.ex = ex; live.SL = ex.trails_state_len();
return bare ? { exports: px } : { module: r.module, instance: { exports: px } };
};
const liveState = () => new Float64Array(live.ex.memory.buffer, live.ex.trails_game_state(live.g), live.SL);
const riderSetup = () => ({ tricks: live.tricks === null ? 511 : live.tricks, bike: live.bike, tunes: { ...live.tunes } });
const cap = { chunks: new Map(), held: new Set(), starts: [], ws: null };
const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
const WRAPPED = Symbol('trailsai');
function take(data) {
if (typeof data !== 'string' || data.length < 8) return;
let r;
try { r = JSON.parse(data); } catch { return; }
if (r.t === 'chunk' && Array.isArray(r.c)) cap.chunks.set(r.c.join(','), Array.isArray(r.pieces) ? r.pieces : []);
else if (r.t === 'welcome') { if (Array.isArray(r.starts)) cap.starts = r.starts; cap.held.clear(); }
else if (r.t === 'startsdiff') {
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
if (cap.ws !== this && typeof d === 'string') {
cap.ws = this;
const cur = desc.get.call(this);
if (cur && !cur[WRAPPED]) desc.set.call(this, wrap(cur));
}
if (typeof d === 'string' && d.includes('"sub"')) {
const r = JSON.parse(d);
for (const c of r.add || []) cap.held.add(String(c));
for (const c of r.drop || []) cap.held.delete(String(c));
}
} catch { /* ignore */ }
return origSend.call(this, d);
};
const allPieces = () => [...cap.chunks.values()].flat();
const RIDE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR']);
const playerKeys = { last: 0, onKey: null };
window.addEventListener('keydown', e => {
if (!e.isTrusted || !RIDE_KEYS.has(e.code)) return;
const t = e.target;
if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
playerKeys.last = Date.now();
if (playerKeys.onKey) { try { playerKeys.onKey(e); } catch (err) { console.error(err); } }
}, true);
const PHYS_KINDS = ['start', 'takeoff', 'landing', 'pump', 'flat', 'berm'];
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
if (!a.wasm) throw new Error(tx('Không thấy file vật lý của game. Hãy tải lại trang game.', "The game's physics file was not found. Reload the game's page."));
const { instance } = await WAI(await (await fetch(a.wasm)).arrayBuffer(), {});
const l = instance.exports, g = l.trails_game_new(1);
const txt = n => { const b = l.trails_buf(g); return new TextDecoder().decode(new Uint8Array(l.memory.buffer, b, n)); };
const K = JSON.parse(txt(l.trails_kinds_json(g))), FF = l.trails_world_sizes() & 65535;
const wp = l.trails_world_flat(g, 1), fmt = new Float64Array(l.memory.buffer, wp, 1)[0];
const kidx = Object.fromEntries(K.map((k, i) => [k.key, i]));
const layout = f => {
const arr = [fmt, 2, 0, 0, 0], ki = kidx[f.kind];
const p = K[ki].params.map(q => { const v = f.params && f.params[q.key]; return Math.min(q.max, Math.max(q.min, v !== undefined ? v : q.default)); });
arr.push(1, ki, f.x, f.z, f.heading);
for (let h = 0; h < FF - 5; h++) arr.push(h < p.length ? p[h] : 0);
const h = arr.length * 8 + 8, c = l.trails_alloc(h), d = c + 7 & -8;
new Float64Array(l.memory.buffer, d, arr.length).set(arr);
const n = l.trails_layout_alone(g, d, arr.length);
l.trails_dealloc(c, h);
return JSON.parse(txt(n));
};
eng = { K, kidx, layout };
return eng;
}
const layouts = new WeakMap();
function layOf(e, p) {
if (!layouts.has(p)) { let lay = null; try { lay = e.layout(p); } catch { lay = null; } layouts.set(p, lay); }
return layouts.get(p);
}
function resample(raw, k0) {
const X = [], Z = [], KIND = [], W = [];
let px = raw[k0][0], pz = raw[k0][1];
X.push(px); Z.push(pz); KIND.push(raw[k0][2]); W.push(raw[k0][3] || 0);
for (let i = k0 + 1; i < raw.length; i++) {
const [qx, qz, kd, hw] = raw[i];
let d = Math.hypot(qx - px, qz - pz);
if (d < 1e-6) continue;
while (d >= 1) {
px += (qx - px) / d; pz += (qz - pz) / d;
X.push(px); Z.push(pz); KIND.push(kd); W.push(hw || 0);
d = Math.hypot(qx - px, qz - pz);
}
}
return { X, Z, KIND, W };
}
async function buildRoute(start, back) {
const e = await engine();
const near = allPieces().filter(p => e.kidx[p.kind] !== undefined && Math.hypot(p.x - start.x, p.z - start.z) < 2500);
const segs = [];
for (const p of near) {
if (!PHYS_KINDS.includes(p.kind)) continue;
const lay = layOf(e, p);
if (!lay || !lay.path || lay.path.length < 2) continue;
const ro = lay.runOut || lay.exit, li = lay.leadIn || [p.x, p.z, p.heading];
segs.push({ p, pts: lay.path.map(q => [q[1], q[2]]), end: [ro[0], ro[1], ro[2]], lead: [li[0], li[1], li[2]] });
}
let cur = null, best = 6;
for (const s of segs) {
for (let i = 1; i < s.pts.length; i++) {
const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
const t = clamp(((start.x - ax) * dx + (start.z - az) * dz) / L2, 0, 1);
const d = Math.hypot(start.x - (ax + dx * t), start.z - (az + dz * t));
const hd = Math.abs(wrapA(Math.atan2(dz, dx) + (back ? Math.PI : 0) - start.heading));
if (d + hd * 2 < best) { best = d + hd * 2; cur = s; }
}
}
if (!cur) return null;
const chain = [], used = new Set(), gapAfter = [];
while (cur && chain.length < 600) {
chain.push(cur); used.add(cur);
let nxt = null, score = Infinity;
for (const s of segs) {
if (used.has(s)) continue;
const a = back ? s : cur, b = back ? cur : s;
const [ex, ez, eh] = a.end, jump = a.p.kind === 'takeoff', [lx, lz, lh] = b.lead;
const dx = lx - ex, dz = lz - ez, f = dx * Math.cos(eh) + dz * Math.sin(eh), lat = -dx * Math.sin(eh) + dz * Math.cos(eh), dh = Math.abs(wrapA(lh - eh));
const maxF = jump ? (b.p.kind === 'landing' ? 250 : 40) : 3.5;
if (f < -3.5 || f > maxF) continue;
if (Math.abs(lat) > 1.5 + Math.min(40, Math.max(0, f)) * (jump ? 0.45 : 0.3)) continue;
if (dh > (jump ? 0.75 : 0.65)) continue;
const sc = Math.abs(f) + Math.abs(lat) * 2 + dh * 3;
if (sc < score) { score = sc; nxt = s; }
}
if (!back && cur.p.kind !== 'takeoff') {
let along = Infinity, on = null;
for (const s of segs) {
if (used.has(s) || s.p.kind !== 'takeoff') continue;
const [lx, lz, lh] = s.lead;
let run = 0;
for (let i = 1; i < cur.pts.length; i++) {
const [ax, az] = cur.pts[i - 1], [bx, bz] = cur.pts[i];
const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
const t = ((lx - ax) * dx + (lz - az) * dz) / L, off = Math.abs((lz - az) * dx - (lx - ax) * dz) / L;
if (t >= 0 && t <= L && off < 1.5 && Math.abs(wrapA(lh - Math.atan2(dz, dx))) < 0.65 && run + t > 1 && run + t < along) { along = run + t; on = s; }
run += L;
}
}
if (on) { cur.cut = along; nxt = on; }
}
gapAfter.push(nxt && (back ? nxt : cur).p.kind === 'takeoff' ? 1 : 0);
cur = nxt;
}
const raw = [], flip = { takeoff: 'landing', landing: 'takeoff' };
let hw = 0, n0 = 0;
const add = (x, z, kd) => raw.push([x, z, kd, hw]);
chain.forEach((s, ci) => {
hw = s.p.params && s.p.params.width > 0 ? s.p.params.width / 2 : 0;
if (back) {
const kd = flip[s.p.kind] || s.p.kind;
add(s.end[0], s.end[1], ci && gapAfter[ci - 1] ? 'air' : kd);
for (let i = s.pts.length - 1; i >= 0; i--) add(s.pts[i][0], s.pts[i][1], kd);
} else if (s.cut !== undefined) {
let run = 0;
add(s.pts[0][0], s.pts[0][1], s.p.kind);
for (let i = 1; i < s.pts.length; i++) {
const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], L = Math.hypot(bx - ax, bz - az) || 1;
if (run + L >= s.cut) { const t = (s.cut - run) / L; add(ax + (bx - ax) * t, az + (bz - az) * t, s.p.kind); break; }
add(bx, bz, s.p.kind); run += L;
}
} else {
for (const q of s.pts) add(q[0], q[1], s.p.kind);
add(s.end[0], s.end[1], gapAfter[ci] ? 'air' : s.p.kind);
}
if (!ci) n0 = raw.length;
});
let k0 = 0, d0 = Infinity;
raw.forEach((q, i) => { const d = Math.hypot(q[0] - start.x, q[1] - start.z); if (i < n0 && d < d0) { d0 = d; k0 = i; } });
const { X, Z, KIND, W } = resample(raw, k0);
if (X.length < 20) return null;
const cell = 32, grid = new Map();
for (let i = 0; i < X.length; i += 4) {
const key = Math.floor(X[i] / cell) + ',' + Math.floor(Z[i] / cell);
if (!grid.has(key)) grid.set(key, []);
grid.get(key).push(i);
}
const nearLine = (x, z, r) => {
const cx = Math.floor(x / cell), cz = Math.floor(z / cell), n = Math.ceil(r / cell);
for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (const i of grid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(X[i] - x, Z[i] - z) < r) return true;
return false;
};
const pieces = near.filter(p => nearLine(p.x, p.z, p.kind === 'shape' || p.kind === 'ground' ? 70 : 35));
const kinds = {};
chain.forEach(s => { kinds[s.p.kind] = (kinds[s.p.kind] || 0) + 1; });
return { start: { id: start.id, x: start.x, z: start.z, heading: start.heading }, X, Z, KIND, W, length: X.length, pieces, kinds };
}
async function widthsOf(route) {
const e = await engine(), segs = [];
for (const p of route.pieces) {
if (!PHYS_KINDS.includes(p.kind) || !(p.params && p.params.width > 0)) continue;
const lay = layOf(e, p);
if (lay && lay.path && lay.path.length > 1) segs.push({ hw: p.params.width / 2, pts: lay.path.map(q => [q[1], q[2]]) });
}
return Array.from(route.X, (x, i) => {
const z = route.Z[i];
let w = 0;
for (const s of segs) {
if (s.hw <= w) continue;
for (let k = 1; k < s.pts.length; k++) {
const [ax, az] = s.pts[k - 1], [bx, bz] = s.pts[k], dx = bx - ax, dz = bz - az;
const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 2) { w = s.hw; break; }
}
}
return w;
});
}
function lineStale(line) {
for (const p of line.pieces) {
const got = cap.chunks.get(Math.floor(p.x / 256) + ',' + Math.floor(p.z / 256));
if (got && !got.some(q => q.kind === p.kind && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05)) return true;
}
return false;
}
function bikeNow() {
if (!live.ex || !live.g) return null;
const s = liveState();
return Number.isFinite(s[0]) && Number.isFinite(s[2]) ? { x: s[0], z: s[2], heading: s[3], v: Math.abs(s[8]), air: s[12] > 0, down: s[13] > 0 } : null;
}
const HERE_RUN = 40;
async function lineHere(me) {
const e = await engine();
let c = null;
for (const p of allPieces()) {
if (!PHYS_KINDS.includes(p.kind) || e.kidx[p.kind] === undefined || Math.hypot(p.x - me.x, p.z - me.z) > 80) continue;
const lay = layOf(e, p);
if (!lay || !lay.path || lay.path.length < 2) continue;
for (let i = 1; i < lay.path.length; i++) {
const ax = lay.path[i - 1][1], az = lay.path[i - 1][2], bx = lay.path[i][1], bz = lay.path[i][2];
const h = Math.atan2(bz - az, bx - ax), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
for (let q = 0; q <= n; q++) {
const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n, d = Math.hypot(x - me.x, z - me.z);
if (d > 20) continue;
for (const back of [false, true]) {
const hh = wrapA(h + (back ? Math.PI : 0)), score = d + 8 * Math.abs(wrapA(hh - me.heading));
if (!c || score < c.score) c = { x, z, h: hh, back, score };
}
}
}
}
if (!c) return null;
let x = c.x, z = c.z, h = c.h, back = c.back;
const rb = await buildRoute({ id: 'back', x: c.x, z: c.z, heading: wrapA(c.h + Math.PI) }, !c.back);
if (rb) {
let k = 0;
while (k + 1 < Math.min(rb.length, HERE_RUN + 1) && !['takeoff', 'landing', 'air', 'start'].includes(rb.KIND[k + 1])) k++;
const gate = rb.KIND[k + 1] === 'start' && cap.starts
.filter(o => Math.hypot(o.x - rb.X[k + 1], o.z - rb.Z[k + 1]) < 25 && Math.abs(wrapA(o.heading - c.h)) < 0.6)
.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
if (gate) { x = gate.x; z = gate.z; h = gate.heading; back = false; }
else if (k >= 3) { x = rb.X[k]; z = rb.Z[k]; h = Math.atan2(rb.Z[k - 1] - rb.Z[k], rb.X[k - 1] - rb.X[k]); }
}
const s = { id: gateId(x, z, h) || `here-${Math.round(x)}_${Math.round(z)}_${back ? 'b' : 'f'}`, x, z, heading: h };
const r = await buildRoute(s, back);
if (r) r.back = back;
return r && r.length >= 25 ? r : null;
}
const gateId = (x, z, h) => { const o = cap.starts.find(o => Math.hypot(o.x - x, o.z - z) < 1 && Math.abs(wrapA(o.heading - h)) < 0.1); return o ? o.id : null; };
const START_NEAR = 15;
async function lineAt(me, library) {
const close = (s, r) => Math.hypot(s.x - me.x, s.z - me.z) < r && Math.abs(wrapA(s.heading - me.heading)) < 1.2;
const known = library.filter(o => close(o.start, START_NEAR)).sort((a, b) => Math.hypot(a.start.x - me.x, a.start.z - me.z) - Math.hypot(b.start.x - me.x, b.start.z - me.z))[0];
if (known) return { id: known.id, route: null, how: 'library' };
const gate = cap.starts.filter(s => close(s, START_NEAR)).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
if (gate) { const r = await buildRoute(gate); if (r) return { id: gate.id, route: r, how: 'start' }; }
const r = await lineHere(me);
return r ? { id: r.start.id, route: r, how: 'here' } : null;
}
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const S_ = { X: 0, Y: 1, Z: 2, HEADING: 3, PITCH: 4, SPEED: 8, AIR: 12, CRASH: 13, LAST_AIR: 14, GRADE: 15, LAND_SEQ: 16,
HEIGHT: 20, DIST: 21, MISMATCH: 22, IMPACT: 23, LAST_WHIP: 41, LAST_SPIN: 43, LAST_FLIP: 44, MANUAL: 46, MANUAL_BAL: 47,
SPIN: 48, TABLE: 52, TAIL: 53, BARS: 54, HANDS: 55, LAST_TRICKS: 56, LAST_TAIL: 57, LAST_BARS: 58 };
const BTN = { UP: 1, DOWN: 2, LAYER: 8, TAIL: 16, BAR: 32, LEFT: 64 };
const TRICK = { TABLE: 16, TAILWHIP: 32, BARSPIN: 64, TBOG: 128, XUP: 256 };
const UNLOCK = { whip: 1, spin: 2, flip: 4, manual: 8, table: 16, tailwhip: 32, barspin: 64, tbog: 128, xup: 256 };
const BTRICKS = {
T: { unlock: UNLOCK.tailwhip, b: BTN.TAIL, turn: 0.62 },
B: { unlock: UNLOCK.barspin, b: BTN.BAR, turn: 0.4 },
L: { unlock: UNLOCK.table, b: BTN.LAYER, back: 0.45, whip: true },
G: { unlock: UNLOCK.tbog, b: BTN.LAYER | BTN.TAIL, back: 0.25 },
X: { unlock: UNLOCK.xup, b: BTN.LAYER | BTN.BAR, back: 0.35 },
};
const btrickTime = (c, n) => { const d = BTRICKS[c]; return d.turn ? d.turn * n : n / 10 + d.back; };
const VFREE = 17.5;
const PUMP0 = [0.1, 0.2];
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
const TRICK_WORDS = { flip: 'Backflip', spin: 'Spin', whip: 'Whip', tailwhip: 'Tailwhip', barspin: 'Barspin', table: 'Table', tbog: 'T-bog', xup: 'X-up' };
const trickText = got => Object.keys(TRICK_WORDS).filter(k => got && got[k]).map(k => {
const n = got[k], w = TRICK_WORDS[k];
return k === 'spin' ? String(n) : (k === 'flip' || k === 'tailwhip' || k === 'barspin') && n > 1 ? `${w} ×${n}` : w;
}).join(' + ');
const freshPlan = secs => ({ v: secs.map(() => 8), pt: secs.map(s => s.pt), pl: secs.map(() => 0), pu: secs.map(() => 0), tk: secs.map(() => null) });
function makeRider(R, H, S, P, jit) {
const N = R.length, J = jit || { dv: 0, dt: 0 };
const me = { P, idx: 0, sec: 0, airSec: 0, off: 0, at: 0, landed: false, wasAir: false, prevP: null, rot: 0, let: false, inp: [0, 0, 0, 0, 0, 0, 0],
py: 0, pat: 0, lt: -1, pa: false, vy: null, va: 0, ay: null, gOff: 0, aim: 0,
qi: 0, qc: 0, qn: 0, qp: -1, qo: false, airT: 0 };
const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
const hAt = u => { const i = Math.max(0, Math.min(N - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i)); return H[i] + (H[i + 1] - H[i]) * f; };
const vAt = (k, i) => { const q = P.vs && P.vs[k]; const v = q && q.length ? q[Math.min(q.length - 1, Math.max(0, Math.floor((i - S[k].a) * q.length / (S[k].b - S[k].a + 1))))] : P.v[k]; return v >= VFREE ? v : v + J.dv; };
const near = (bx, bz) => {
let bi = me.idx, bd = Infinity;
for (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }
return [bi, bd];
};
me.peek = s => near(s[0], s[2])[0];
const flyOn = by => {
if (me.vy === null) return null;
const ay = me.ay === null ? -9.8 : Math.max(-16, Math.min(-3, me.ay)), h = 1 / 30;
let y = by, u = me.at, vy = me.vy;
for (let k = 0; k < 450; k++) { vy += ay * h; y += vy * h; u += me.va * h; if (u > N - 3) return null; if (vy < 0 && y - me.gOff <= hAt(u)) return [u, (k + 1) * h]; }
return null;
};
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
me.airSec = me.sec; me.rot = 0; me.let = false; me.qi = 0; me.qc = 0; me.qn = 0; me.qp = -1; me.qo = false;
const k0 = me.sec - 1;
if (P.as === false) { for (let k = me.sec; k >= 0 && k >= me.sec - 1; k--) if (S[k].jump) { me.airSec = k; break; } }
else if (k0 >= 0 && S[k0].jump && S[k0].b >= me.idx - 3 && !(S[me.sec].jump && S[me.sec].b <= me.idx + 2)) me.airSec = k0;
}
me.landed = !air && me.wasAir;
me.wasAir = air;
if (t % 2 !== 0) return me.inp;
const a1 = look(3 + Math.abs(sp) * 0.35), a2 = look(10 + Math.abs(sp) * 0.6);
const e1 = wrapA(Math.atan2(R.Z[a1] - bz, R.X[a1] - bx) - bh), e2 = wrapA(Math.atan2(R.Z[a2] - bz, R.X[a2] - bx) - bh);
let st = air ? 0 : Math.max(-1, Math.min(1, 2.2 * e1 + 0.6 * e2)), pedal = 0, brake = 0, lean = 0, btn = 0, whip = 0, pump = 0;
const sec = me.sec, idx = me.idx;
if (me.lt >= 0 && t > me.lt) {
const dt = (t - me.lt) / 60, vy = (by - me.py) / dt;
if (air && me.pa && me.vy !== null) { const a = (vy - me.vy) / dt; me.ay = me.ay === null ? a : me.ay + 0.25 * (a - me.ay); }
me.vy = vy; me.va = (me.at - me.pat) / dt;
}
if (!air) { me.ay = null; me.gOff = by - hAt(me.at); }
me.py = by; me.pat = me.at; me.lt = t; me.pa = air;
if (!air) {
const va = vAt(sec, idx), e = va - sp, pm = s[4] < -0.15 ? 0.4 : 1;
if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4 && va < VFREE) brake = Math.min(1, -e * 0.5);
const onT = R.KIND[idx] === 'takeoff';
if (P.pl[sec] > 0 && onT && idx >= S[sec].b - P.pl[sec]) btn |= BTN.UP;
if (P.pu[sec] > 0 && (R.KIND[idx] !== 'start' || (P.ph && P.ph[sec]))) {
const pk = P.pk || PUMP0, u = me.at;
if ((P.pc && P.pc[sec]) || !R.PZ) { if ((H[look(1)] - H[look(3)]) / 2 > 0.03) pump = P.pu[sec]; }
else if (R.PZ.some(z => u >= z[0] + pk[0] && u <= z[1] + pk[1])) pump = P.pu[sec];
}
const tk = P.tk[sec];
if (tk && onT && S[sec].jump) {
if (tk.s) whip = tk.s;
if (tk.f) { pedal = 1; brake = 0; }
if (tk.h && tk.q && tk.q.length && idx >= S[sec].b - 2) btn |= BTRICKS[tk.q[0][0]].b | (tk.lf ? BTN.LEFT : 0);
}
if (P.lg && P.lg[sec]) lean = P.lg[sec];
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
const a = Math.abs(s[S_.SPIN]);
if (a >= (tk.sr || 3.3) * 100) me.let = true;
if (!me.let) whip = tk.s;
if (a > 5 && a < (tk.sr || 3.3) * 100 + 20) free = true;
}
if (tk.f) {
const f = s[12] > 0.3 && me.rot > -0.6 ? flyOn(by) : null, long = f && s[12] + f[1] > 3;
if (long) {
const rem = Math.PI + 0.5 - me.rot;
if (rem > 0) { free = true; const need = rem / Math.max(0.25, f[1] - 2.5); if (dp < need) pull = Math.max(-1, Math.min(0, -0.8 * (need - dp))); }
} else if (me.rot > -0.6 && me.rot < 5 + 6.28 * ((tk.f | 0) - 1)) free = true;
}
if (tk.w && s[12] < (tk.wt || 1.5) * 0.25 + J.dt) whip = tk.w;
if (free) lean = pull;
const q = tk.q;
if (q && me.qi < q.length) {
const [c, n, gap] = q[me.qi], d = BTRICKS[c];
if (me.qp >= 0) {
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
const WORKER_SRC = "const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));\nconst S_ = { X: 0, Y: 1, Z: 2, HEADING: 3, PITCH: 4, SPEED: 8, AIR: 12, CRASH: 13, LAST_AIR: 14, GRADE: 15, LAND_SEQ: 16,\nHEIGHT: 20, DIST: 21, MISMATCH: 22, IMPACT: 23, LAST_WHIP: 41, LAST_SPIN: 43, LAST_FLIP: 44, MANUAL: 46, MANUAL_BAL: 47,\nSPIN: 48, TABLE: 52, TAIL: 53, BARS: 54, HANDS: 55, LAST_TRICKS: 56, LAST_TAIL: 57, LAST_BARS: 58 };\nconst BTN = { UP: 1, DOWN: 2, LAYER: 8, TAIL: 16, BAR: 32, LEFT: 64 };\nconst TRICK = { TABLE: 16, TAILWHIP: 32, BARSPIN: 64, TBOG: 128, XUP: 256 };\nconst UNLOCK = { whip: 1, spin: 2, flip: 4, manual: 8, table: 16, tailwhip: 32, barspin: 64, tbog: 128, xup: 256 };\nconst BTRICKS = {\nT: { unlock: UNLOCK.tailwhip, b: BTN.TAIL, turn: 0.62 },\nB: { unlock: UNLOCK.barspin, b: BTN.BAR, turn: 0.4 },\nL: { unlock: UNLOCK.table, b: BTN.LAYER, back: 0.45, whip: true },\nG: { unlock: UNLOCK.tbog, b: BTN.LAYER | BTN.TAIL, back: 0.25 },\nX: { unlock: UNLOCK.xup, b: BTN.LAYER | BTN.BAR, back: 0.35 },\n};\nconst btrickTime = (c, n) => { const d = BTRICKS[c]; return d.turn ? d.turn * n : n / 10 + d.back; };\nconst VFREE = 17.5;\nconst PUMP0 = [0.1, 0.2];\nconst XP_W = 25, EXTRA_W = 15;\nfunction landPoints(s, streak) {\nconst g = s[S_.GRADE] | 0, rough = g >= 4, run = rough ? 0 : streak + 1, m = Math.max(1, Math.min(5, run));\nconst fl = Math.abs(s[S_.LAST_FLIP] || 0), sp = Math.abs(s[S_.LAST_SPIN] || 0), wh = Math.abs(s[S_.LAST_WHIP] || 0), tb = s[S_.LAST_TRICKS] | 0;\nconst turn = sp >= 300 ? 180 * Math.floor((sp + 60) / 180) : 0, flip = fl >= 270, whip = wh >= 45;\nlet train = g === 1 ? 160 : g === 2 ? 140 : g === 3 ? 100 : 50;\nif (flip) train += 300;\nif (turn >= 360) train += 100 * turn / 180;\nif (whip) train += 100;\ntrain *= m;\nconst tail = tb & TRICK.TAILWHIP ? Math.max(1, s[S_.LAST_TAIL] | 0) : 0, bars = tb & TRICK.BARSPIN ? Math.max(1, s[S_.LAST_BARS] | 0) : 0;\nconst flips = flip ? Math.max(1, Math.round(fl / 360)) : 0;\nconst got = { flip: flips, spin: turn >= 360 ? turn : 0, whip: whip ? 1 : 0, tailwhip: tail, barspin: bars,\ntable: tb & TRICK.TABLE ? 1 : 0, tbog: tb & TRICK.TBOG ? 1 : 0, xup: tb & TRICK.XUP ? 1 : 0 };\nconst xp = (got.whip ? 2 : 0) + (got.spin ? 4 : 0) + (flips ? 6 : 0) + (bars ? 3 : 0) + (got.tbog ? 3 : 0) + (got.xup ? 4 : 0)\n+ (tail ? 5 : 0) + (got.table ? 5 : 0) + (got.spin && got.table ? 10 : 0);\nconst extra = Math.max(0, tail - 1) + Math.max(0, bars - 1) + Math.max(0, flips - 1) + Math.max(0, turn / 360 - 1);\nreturn { g, train, m, streak: run, xp, extra, got, p: train + XP_W * xp + EXTRA_W * extra };\n}\nconst TRICK_WORDS = { flip: 'Backflip', spin: 'Spin', whip: 'Whip', tailwhip: 'Tailwhip', barspin: 'Barspin', table: 'Table', tbog: 'T-bog', xup: 'X-up' };\nconst trickText = got => Object.keys(TRICK_WORDS).filter(k => got && got[k]).map(k => {\nconst n = got[k], w = TRICK_WORDS[k];\nreturn k === 'spin' ? String(n) : (k === 'flip' || k === 'tailwhip' || k === 'barspin') && n > 1 ? `${w} ×${n}` : w;\n}).join(' + ');\nconst freshPlan = secs => ({ v: secs.map(() => 8), pt: secs.map(s => s.pt), pl: secs.map(() => 0), pu: secs.map(() => 0), tk: secs.map(() => null) });\nfunction makeRider(R, H, S, P, jit) {\nconst N = R.length, J = jit || { dv: 0, dt: 0 };\nconst me = { P, idx: 0, sec: 0, airSec: 0, off: 0, at: 0, landed: false, wasAir: false, prevP: null, rot: 0, let: false, inp: [0, 0, 0, 0, 0, 0, 0],\npy: 0, pat: 0, lt: -1, pa: false, vy: null, va: 0, ay: null, gOff: 0, aim: 0,\nqi: 0, qc: 0, qn: 0, qp: -1, qo: false, airT: 0 };\nconst look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));\nconst hAt = u => { const i = Math.max(0, Math.min(N - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i)); return H[i] + (H[i + 1] - H[i]) * f; };\nconst vAt = (k, i) => { const q = P.vs && P.vs[k]; const v = q && q.length ? q[Math.min(q.length - 1, Math.max(0, Math.floor((i - S[k].a) * q.length / (S[k].b - S[k].a + 1))))] : P.v[k]; return v >= VFREE ? v : v + J.dv; };\nconst near = (bx, bz) => {\nlet bi = me.idx, bd = Infinity;\nfor (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }\nreturn [bi, bd];\n};\nme.peek = s => near(s[0], s[2])[0];\nconst flyOn = by => {\nif (me.vy === null) return null;\nconst ay = me.ay === null ? -9.8 : Math.max(-16, Math.min(-3, me.ay)), h = 1 / 30;\nlet y = by, u = me.at, vy = me.vy;\nfor (let k = 0; k < 450; k++) { vy += ay * h; y += vy * h; u += me.va * h; if (u > N - 3) return null; if (vy < 0 && y - me.gOff <= hAt(u)) return [u, (k + 1) * h]; }\nreturn null;\n};\nconst caught = s => Math.abs(s[S_.TAIL]) < 0.06 && Math.abs(s[S_.BARS]) < 0.06 && Math.abs(s[S_.TABLE]) < 0.06;\nme.step = (s, t) => {\nconst bx = s[0], by = s[1], bz = s[2], bh = s[3], sp = s[8], air = s[12] > 0;\nif (me.prevP === null) me.prevP = s[4];\nconst [bi, bd] = near(bx, bz);\nme.idx = bi;\nwhile (me.sec < S.length - 1 && me.idx > S[me.sec].b) me.sec++;\nme.off = Math.sqrt(bd);\n{ const j = Math.min(N - 2, bi), dx = R.X[j + 1] - R.X[j], dz = R.Z[j + 1] - R.Z[j];\nme.at = j + Math.max(-0.5, Math.min(1.5, ((bx - R.X[j]) * dx + (bz - R.Z[j]) * dz) / (dx * dx + dz * dz || 1))); }\nif (air && !me.wasAir) {\nme.airSec = me.sec; me.rot = 0; me.let = false; me.qi = 0; me.qc = 0; me.qn = 0; me.qp = -1; me.qo = false;\nconst k0 = me.sec - 1;\nif (P.as === false) { for (let k = me.sec; k >= 0 && k >= me.sec - 1; k--) if (S[k].jump) { me.airSec = k; break; } }\nelse if (k0 >= 0 && S[k0].jump && S[k0].b >= me.idx - 3 && !(S[me.sec].jump && S[me.sec].b <= me.idx + 2)) me.airSec = k0;\n}\nme.landed = !air && me.wasAir;\nme.wasAir = air;\nif (t % 2 !== 0) return me.inp;\nconst a1 = look(3 + Math.abs(sp) * 0.35), a2 = look(10 + Math.abs(sp) * 0.6);\nconst e1 = wrapA(Math.atan2(R.Z[a1] - bz, R.X[a1] - bx) - bh), e2 = wrapA(Math.atan2(R.Z[a2] - bz, R.X[a2] - bx) - bh);\nlet st = air ? 0 : Math.max(-1, Math.min(1, 2.2 * e1 + 0.6 * e2)), pedal = 0, brake = 0, lean = 0, btn = 0, whip = 0, pump = 0;\nconst sec = me.sec, idx = me.idx;\nif (me.lt >= 0 && t > me.lt) {\nconst dt = (t - me.lt) / 60, vy = (by - me.py) / dt;\nif (air && me.pa && me.vy !== null) { const a = (vy - me.vy) / dt; me.ay = me.ay === null ? a : me.ay + 0.25 * (a - me.ay); }\nme.vy = vy; me.va = (me.at - me.pat) / dt;\n}\nif (!air) { me.ay = null; me.gOff = by - hAt(me.at); }\nme.py = by; me.pat = me.at; me.lt = t; me.pa = air;\nif (!air) {\nconst va = vAt(sec, idx), e = va - sp, pm = s[4] < -0.15 ? 0.4 : 1;\nif (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4 && va < VFREE) brake = Math.min(1, -e * 0.5);\nconst onT = R.KIND[idx] === 'takeoff';\nif (P.pl[sec] > 0 && onT && idx >= S[sec].b - P.pl[sec]) btn |= BTN.UP;\nif (P.pu[sec] > 0 && (R.KIND[idx] !== 'start' || (P.ph && P.ph[sec]))) {\nconst pk = P.pk || PUMP0, u = me.at;\nif ((P.pc && P.pc[sec]) || !R.PZ) { if ((H[look(1)] - H[look(3)]) / 2 > 0.03) pump = P.pu[sec]; }\nelse if (R.PZ.some(z => u >= z[0] + pk[0] && u <= z[1] + pk[1])) pump = P.pu[sec];\n}\nconst tk = P.tk[sec];\nif (tk && onT && S[sec].jump) {\nif (tk.s) whip = tk.s;\nif (tk.f) { pedal = 1; brake = 0; }\nif (tk.h && tk.q && tk.q.length && idx >= S[sec].b - 2) btn |= BTRICKS[tk.q[0][0]].b | (tk.lf ? BTN.LEFT : 0);\n}\nif (P.lg && P.lg[sec]) lean = P.lg[sec];\n} else {\nconst dp = wrapA(s[4] - me.prevP) * 30;\nme.rot += wrapA(s[4] - me.prevP);\nme.airT = s[12];\nconst k = me.airSec, aim = P.pt[k];\nlean = Math.max(-1, Math.min(1, 2.2 * (s[4] - aim) + 0.35 * dp));\nme.aim = aim;\nconst tk = P.tk[k], sa = P.sa ? P.sa[k] || 0 : 0;\nif (sa && !(tk && tk.s && Math.abs(s[S_.SPIN]) < 340)) st = Math.max(-1, Math.min(1, sa * (2.2 * e1 + 0.6 * e2)));\nif (tk) {\nlet free = false, pull = 0;\nif (tk.s) {\nconst a = Math.abs(s[S_.SPIN]);\nif (a >= (tk.sr || 3.3) * 100) me.let = true;\nif (!me.let) whip = tk.s;\nif (a > 5 && a < (tk.sr || 3.3) * 100 + 20) free = true;\n}\nif (tk.f) {\nconst f = s[12] > 0.3 && me.rot > -0.6 ? flyOn(by) : null, long = f && s[12] + f[1] > 3;\nif (long) {\nconst rem = Math.PI + 0.5 - me.rot;\nif (rem > 0) { free = true; const need = rem / Math.max(0.25, f[1] - 2.5); if (dp < need) pull = Math.max(-1, Math.min(0, -0.8 * (need - dp))); }\n} else if (me.rot > -0.6 && me.rot < 5 + 6.28 * ((tk.f | 0) - 1)) free = true;\n}\nif (tk.w && s[12] < (tk.wt || 1.5) * 0.25 + J.dt) whip = tk.w;\nif (free) lean = pull;\nconst q = tk.q;\nif (q && me.qi < q.length) {\nconst [c, n, gap] = q[me.qi], d = BTRICKS[c];\nif (me.qp >= 0) {\nconst held = (t - me.qp) / 60;\nif (d.turn ? held < 0.07 : held < n / 10) { btn |= d.b | (tk.lf ? BTN.LEFT : 0); if (d.whip) whip = tk.w || tk.s || 1; }\nelse { me.qp = -1; me.qo = true; }\n} else if (me.qo) {\nif (caught(s)) { me.qo = false; me.qc = s[12]; if (!d.turn || ++me.qn >= n) { me.qi++; me.qn = 0; } }\n} else if (s[12] >= Math.max(0.15, me.qc + (gap || 0) + J.dt)) {\nconst f = flyOn(by), need = d.turn ? d.turn : btrickTime(c, n);\nif (f && f[1] >= need + (tk.m === undefined ? 0.2 : tk.m)) { me.qp = t; btn |= d.b | (tk.lf ? BTN.LEFT : 0); if (d.whip) whip = tk.w || tk.s || 1; }\n}\n}\n}\n}\nme.prevP = s[4];\nme.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, Math.round(whip * 127)];\nreturn me.inp;\n};\nme.save = () => { const o = {}; for (const k in me) if (k !== 'P' && typeof me[k] !== 'function') o[k] = Array.isArray(me[k]) ? me[k].slice() : me[k]; return o; };\nme.load = o => { for (const k in o) me[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; };\nreturn me;\n}\n'use strict';\nlet l, SL, K, kidx, FF, fmt, g, R, H, S;\nconst clamp = (x, a, b) => Math.max(a, Math.min(b, x));\nfunction state() { return new Float64Array(l.memory.buffer, l.trails_game_state(g), SL); }\nasync function init(m) {\nconst { instance } = await WebAssembly.instantiate(m.wasm, {});\nl = instance.exports;\nm.land.forEach((b, i) => { const n = l.trails_alloc(b.byteLength); new Uint8Array(l.memory.buffer, n, b.byteLength).set(new Uint8Array(b)); if (!l.trails_land_data(i, n, b.byteLength)) throw new Error('land ' + i); });\ng = l.trails_game_new(1); SL = l.trails_state_len();\nconst txt = n => { const b = l.trails_buf(g); return new TextDecoder().decode(new Uint8Array(l.memory.buffer, b, n)); };\nK = JSON.parse(txt(l.trails_kinds_json(g))); kidx = Object.fromEntries(K.map((k, i) => [k.key, i]));\nFF = l.trails_world_sizes() & 65535; const wp = l.trails_world_flat(g, 1); fmt = new Float64Array(l.memory.buffer, wp, 1)[0];\naddLine(m.route, m.setup);\n}\nfunction addLine(route, setup) {\nR = route;\nconst d = Math.hypot(R.X[0] - R.start.x, R.Z[0] - R.start.z), n = Math.floor(d);\nif (n >= 2) {\nconst X = [], Z = [], KI = [], W = [];\nfor (let i = 0; i < n; i++) { const f = i / d; X.push(R.start.x + (R.X[0] - R.start.x) * f); Z.push(R.start.z + (R.Z[0] - R.start.z) * f); KI.push('start'); W.push(0); }\nR.X = X.concat(Array.from(R.X)); R.Z = Z.concat(Array.from(R.Z)); R.KIND = KI.concat(Array.from(R.KIND));\nR.W = R.W ? W.concat(Array.from(R.W)) : null;\n}\nR.length = R.X.length;\nconst arr = [fmt, 2, 0, 0, 0];\nlet c = 0;\nfor (const f of R.pieces) {\nconst ki = kidx[f.kind]; if (ki === undefined) continue; c++;\nconst p = K[ki].params.map(q => { const v = f.params && f.params[q.key]; return Math.min(q.max, Math.max(q.min, v !== undefined ? v : q.default)); });\narr.push(c, ki, f.x, f.z, f.heading); for (let h = 0; h < FF - 5; h++) arr.push(h < p.length ? p[h] : 0);\n}\nconst h = arr.length * 8 + 8, a = l.trails_alloc(h), dd = a + 7 & -8;\nnew Float64Array(l.memory.buffer, dd, arr.length).set(arr);\nl.trails_draft(g, dd, arr.length); l.trails_dealloc(a, h); l.trails_draft_apply(g);\nconst su = setup || { tricks: 511, bike: 0, tunes: {} };\nif (su.bike) l.trails_bike_select(g, su.bike);\nfor (const [i, v] of Object.entries(su.tunes || {})) l.trails_tune(g, +i, v);\nl.trails_set_tricks(g, su.tricks);\nH = new Float64Array(R.length); for (let i = 0; i < R.length; i++) H[i] = l.trails_draft_height(g, R.X[i], R.Z[i]);\nS = sections();\nR.PZ = pumpZones();\n}\nfunction sections() {\nconst N = R.length, out = [];\nlet a = 0, nl = -1;\nconst nextLand = new Int32Array(N).fill(-1);\nfor (let i = N - 1; i >= 0; i--) { if (R.KIND[i] === 'landing') nl = i; nextLand[i] = nl; }\nconst isT = i => i < N && R.KIND[i] === 'takeoff';\nfor (let i = 0; i < N; i++) {\nconst lip = isT(i) && !isT(i + 1);\nif (lip || i - a >= 40 || i === N - 1) {\nlet pt = 0;\nif (lip) { const q = nextLand[i], j = q >= 0 && q - i < 45 ? q : Math.min(N - 5, i + 12); pt = clamp(Math.atan2(H[Math.min(N - 1, j + 4)] - H[j], 4), -0.7, 0.2); }\nout.push({ a, b: i, jump: lip, pt: +pt.toFixed(3) });\na = i + 1;\n}\n}\nreturn out;\n}\nfunction pumpZones() {\nconst N = R.length, st = 0.05, n = Math.floor((N - 1) / st) + 1, h = new Float64Array(n), e = 10;\nfor (let i = 0; i < n; i++) { const u = i * st, j = Math.min(N - 2, Math.floor(u)), f = u - j; h[i] = l.trails_draft_height(g, R.X[j] + (R.X[j + 1] - R.X[j]) * f, R.Z[j] + (R.Z[j + 1] - R.Z[j]) * f); }\nconst tk = [];\nfor (let i = 0; i < N; i++) if (R.KIND[i] === 'takeoff' && (i === 0 || R.KIND[i - 1] !== 'takeoff')) { let b = i; while (b + 1 < N && R.KIND[b + 1] === 'takeoff') b++; tk.push([i, b + 1]); }\nconst nearT = u => tk.some(q => u >= q[0] - 0.3 && u <= q[1] + 1.5), out = [];\nlet a = -1;\nfor (let i = 0; i < n; i++) {\nconst c = (h[Math.max(0, i - e)] - 2 * h[i] + h[Math.min(n - 1, i + e)]) / 0.25 > 0.06 && !nearT(i * st);\nif (c && a < 0) a = i;\nif ((!c || i === n - 1) && a >= 0) {\nif ((i - a) * st >= 0.8) { let p = a; for (let m = a; m <= i; m++) if (h[m] < h[p]) p = m; const z = [a * st, i * st, p * st].map(v => +v.toFixed(2)); if (!tk.some(q => q[0] - z[1] < 2.5 && q[0] > z[2])) out.push(z); }\na = -1;\n}\n}\nreturn out;\n}\nfunction spawn() { l.trails_set_spawn_at(g, R.start.x, R.start.z, R.start.heading, 0); l.trails_game_reset(g); }\nconst STUCK = 180;\nfunction tailBrake(s) { const v = s[8], p = s[4]; if (s[12] > 0 || v <= 0) return 0; if (Math.abs(p) >= 0.15) return p > 0 ? 70 : 40; return v > 1.5 ? 70 : 127; }\nfunction tailInp(s, inp, halt) {\nconst n = R.length, k = Math.max(0, n - 6), h = Math.atan2(R.Z[n - 1] - R.Z[k], R.X[n - 1] - R.X[k]), v = s[8], air = s[12] > 0;\nconst st = Math.round((air ? 0 : clamp(2 * wrapA(h - s[3]), -1, 1)) * 127), ln = air ? inp[3] : 0;\nreturn halt ? [0, tailBrake(s), st, ln, 0, 0, 0] : [v < 6 ? 127 : 0, v > 9 ? 40 : 0, st, ln, 0, 0, 0];\n}\nfunction Ep(P, jit) {\nspawn();\nconst s = state(), N = R.length;\nconst E = { P, jit: jit || null, N, t: 0, idx: 0, prog: 0, seq: s[16], stall: 0, crash: 0, end: 'timeout', done: null,\nmaxT: Math.min(120000, Math.round(N / 2.5 * 60) + 600), vr: new Float32Array(N), pending: null, landT: -1e9,\nprogAt: 0, progT: 0, jl: [], game: 0, train: 0, xp: 0, streak: 0, airP: 0, tail: -1, calm: 0, halt: 0, held: -1, vTail: 0, bigLand: -1 };\nE.rider = makeRider(R, H, S, P, E.jit);\nreturn E;\n}\nfunction go(E, stop) {\nif (E.done) return E.done;\nconst N = E.N, rider = E.rider;\nlet s = state();\nfor (; E.t < E.maxT; E.t++) {\nconst t = E.t;\nif (stop && stop(E, s)) return null;\nconst air = s[12] > 0;\nlet inp = rider.step(s, t);\nconst idx = E.idx = rider.idx;\nif (rider.landed && s[14] > 2) E.bigLand = idx;\nif (idx > E.prog) { for (let i = E.prog + 1; i <= idx; i++) E.vr[i] = Math.abs(s[8]); E.prog = idx; }\nE.calm = air ? 0 : E.calm + 1;\nif (idx >= N - 3 && E.tail < 0) { E.tail = t; E.vTail = +Math.abs(s[8]).toFixed(2); }\nif (E.tail >= 0) {\nif (!E.halt && (E.calm >= 30 || (!air && s[8] < -0.3))) E.halt = 1;\nif (E.held < 0 && E.halt && !air && Math.abs(s[8]) < 0.5 && Math.abs(s[4]) < 0.15) E.held = t;\nif (((E.held >= 0 && t - E.held >= 60) || t - E.tail >= 420) && !E.pending) { E.end = 'finish'; return fin(E, s); }\ninp = E.held >= 0 ? [0, 127, 0, 0, 0, 0, 0] : tailInp(s, inp, E.halt);\n} else if (rider.off > (E.bigLand >= 0 && idx - E.bigLand < 40 ? 15 : Math.max(7, R.W && R.W.length === N ? R.W[idx] + 1 : 0)) && !air) { E.end = 'off'; return fin(E, s); }\nif (rider.landed) E.landT = t;\nif (E.prog > E.progAt) { E.progAt = E.prog; E.progT = t; } else if (E.tail < 0 && t - E.progT > STUCK) { E.end = 'stuck'; return fin(E, s); }\nl.trails_game_step(g, inp[0], inp[1], inp[2], inp[3], inp[4], inp[5], inp[6]);\ns = state();\nif (s[13] > 0) { E.crash = s[13]; E.end = 'crash'; E.pending = null; return fin(E, s); }\nif (s[12] > 0) E.airP = s[4];\nif (s[16] !== E.seq) {\nE.seq = s[16];\nif ((s[15] | 0) > 0) {\nconst k = rider.airSec, lp = landPoints(s, E.streak), i = Math.min(N - 3, Math.max(2, idx)), sl = Math.atan2(H[i + 2] - H[i - 2], 4);\nE.streak = lp.streak;\nE.pending = { t, e: { k, i: idx, a: +s[14].toFixed(2), h: +s[20].toFixed(2), g: lp.g, p: lp.p, train: lp.train, m: lp.m, xp: lp.xp, extra: lp.extra, got: lp.got,\ndp: +(E.airP - sl).toFixed(3), sl: +sl.toFixed(4), imp: +s[23].toFixed(2), mis: +(s[22] || 0).toFixed(3), t } };\n}\n}\nconst pd = E.pending;\nif (pd && t - pd.t >= 30) { E.jl.push(pd.e); E.game += pd.e.p; E.train += pd.e.train; E.xp += pd.e.xp; E.pending = null; }\nif (E.tail < 0 && Math.abs(s[8]) < 0.6 && !(s[12] > 0)) { if (++E.stall > 150) { E.end = 'stopped'; return fin(E, s); } } else E.stall = 0;\n}\nreturn fin(E, state());\n}\nfunction summary(E, s, final) {\nconst rider = E.rider, t = E.t, prog = E.prog;\nconst sec = rider.sec, crashSec = E.crash ? (s[12] > 0 || t - E.landT < 60 ? rider.airSec : sec) : sec;\nconst pace = 0.05 * Math.min(20, E.vr[Math.max(0, prog - 5)]);\nconst vEnd = E.tail >= 0 ? E.vTail : +Math.abs(s[8]).toFixed(2), vAvg = +(prog / Math.max(1, t) * 60).toFixed(2);\nreturn { fit: prog + pace + E.game / 1000, prog, crash: E.crash, end: final ? E.end : 'riding', ticks: t, sec, crashSec,\ngame: E.game, train: E.train, xp: E.xp, streak: E.streak, jl: E.jl.slice(), vEnd, vAvg };\n}\nfunction fin(E, s) { return E.done = summary(E, s, true); }\nconst PG = 4096, PW = PG / 4, KP = new Set();\nlet BN = 0, BZ = null, BO = null, BB = null, BB32 = null, BH = 0, clean = false;\nfunction takeBase() {\nconst m32 = new Int32Array(l.memory.buffer), n = m32.length / PW;\nlet c = 0, h = 2166136261;\nBN = n; BZ = new Uint8Array(n); BO = new Int32Array(n);\nfor (let p = 0; p < n; p++) { let z = 1; for (let i = p * PW, e = i + PW; i < e; i++) { const v = m32[i]; h = Math.imul(h ^ v, 16777619); if (v !== 0) z = 0; } BZ[p] = z; if (!z) BO[p] = c++; }\nBB = new Uint8Array(c * PG); BB32 = new Int32Array(BB.buffer);\nconst m = new Uint8Array(l.memory.buffer);\nfor (let p = 0; p < n; p++) if (!BZ[p]) BB.set(m.subarray(p * PG, p * PG + PG), BO[p] * PG);\nBH = h >>> 0;\n}\nfunction baseIs(m32, p) {\nconst o = p * PW;\nif (p >= BN || BZ[p]) { for (let i = o; i < o + PW; i++) if (m32[i] !== 0) return false; return true; }\nconst b = BO[p] * PW; for (let i = 0; i < PW; i++) if (m32[o + i] !== BB32[b + i]) return false; return true;\n}\nfunction toBase(m, p) { if (p >= BN || BZ[p]) m.fill(0, p * PG, p * PG + PG); else m.set(BB.subarray(BO[p] * PG, BO[p] * PG + PG), p * PG); }\nfunction snapMem() {\nconst ps = Int32Array.from([...KP].sort((a, b) => a - b)), m = new Uint8Array(l.memory.buffer), d = new Uint8Array(ps.length * PG);\nfor (let i = 0; i < ps.length; i++) d.set(m.subarray(ps[i] * PG, ps[i] * PG + PG), i * PG);\nreturn { ps, d, len: m.length };\n}\nfunction putMem(sn) {\nif (sn) { const have = l.memory.buffer.byteLength; if (have < sn.len) l.memory.grow(Math.ceil((sn.len - have) / 65536)); }\nconst m = new Uint8Array(l.memory.buffer), inS = new Set();\nif (sn) for (let i = 0; i < sn.ps.length; i++) { const p = sn.ps[i]; inS.add(p); KP.add(p); m.set(sn.d.subarray(i * PG, i * PG + PG), p * PG); }\nif (clean) { for (const p of KP) if (!inS.has(p)) toBase(m, p); return; }\nconst m32 = new Int32Array(l.memory.buffer), n = m32.length / PW;\nfor (let p = 0; p < n; p++) if (!inS.has(p) && !baseIs(m32, p)) { toBase(m, p); KP.add(p); }\nclean = true;\n}\nfunction rogue() { const m32 = new Int32Array(l.memory.buffer), n = m32.length / PW, out = []; for (let p = 0; p < n; p++) if (!KP.has(p) && !baseIs(m32, p)) out.push(p); return out; }\nfunction save(E) {\nconst e = {};\nfor (const k in E) if (k !== 'rider' && k !== 'P' && k !== 'done') e[k] = E[k];\ne.vr = E.vr.slice(); e.jl = E.jl.slice(); e.pending = E.pending ? { t: E.pending.t, e: E.pending.e } : null;\nreturn { mem: snapMem(), e, r: E.rider.save() };\n}\nfunction load(n, P, jit) {\nputMem(n.mem);\nconst E = { ...n.e, P, jit: jit || null, done: null };\nE.vr = n.e.vr.slice(); E.jl = n.e.jl.slice(); E.pending = n.e.pending ? { t: n.e.pending.t, e: n.e.pending.e } : null;\nE.rider = makeRider(R, H, S, P, E.jit); E.rider.load(n.r);\nreturn E;\n}\nfunction fromBase(P, stop) {\nputMem(null);\nconst E = Ep(P), r = go(E, stop);\nfor (const p of rogue()) KP.add(p);\nreturn stop ? E : r;\n}\nfunction calib(plans) { for (const P of plans) fromBase(P); return { list: [...KP], hash: BH, size: BN * PG }; }\nfunction selftest(P, Q) {\nconst full = fromBase(P), half = Math.max(1, full.ticks >> 1), E = fromBase(P, E => E.t >= half);\nif (E.done) return { ok: true, short: true };\nconst n = save(E), X = Ep(Q || P); go(X, X => X.t >= half + 240); for (const p of rogue()) KP.add(p);\nconst r = go(load(n, P));\nconst ok = r.prog === full.prog && r.ticks === full.ticks && r.game === full.game && r.end === full.end && r.jl.length === full.jl.length;\nreturn { ok, a: [full.prog, full.ticks, full.game, full.end], b: [r.prog, r.ticks, r.game, r.end] };\n}\nconst kids = new Map();\nfunction rollOne(node, P, jit, a1, a2, keep) {\nlet kid = null, kt = 0;\nconst E = node ? load(node, P, jit) : (putMem(null), Ep(P, jit));\nconst stop = (E, s) => {\nif (keep && !kid && a1 >= 0 && E.rider.peek(s) >= a1) { kid = save(E); kt = E.t; }\nif (E.rider.idx >= a2) return true;\nreturn (keep ? !!kid : a1 >= 0 && E.rider.idx >= a1) && !(s[12] > 0) && E.t - Math.max(E.landT, kt) >= 45 && !E.pending;\n};\nconst end = go(E, stop), r = end || summary(E, state(), false);\nr.kid = keep ? !!kid : false; r.v = +Math.abs(state()[8]).toFixed(2);\nreturn { r, kid };\n}\nconst failed = err => ({ fit: -1e9, prog: 0, end: 'error', crash: 1, crashSec: 0, sec: 0, jl: [], game: 0, train: 0, xp: 0, streak: 0, ticks: 0, vAvg: 0, kid: false, v: 0, error: String(err) });\nfunction roll(m) {\nfor (let lot = 0; ; lot++) {\nconst out = [], got = [];\nlet broke = false;\nm.plans.forEach((P, i) => {\nlet r;\ntry {\nconst one = rollOne(m.node, P, null, m.a1, m.a2, true);\nr = one.r;\nif (one.kid) got.push([m.bid + ':' + i, one.kid]);\nif (m.jits && m.jits.length && r.kid) {\nlet worst = null;\nfor (const j of m.jits) { const x = rollOne(m.node, P, j, m.a1, m.a2, false).r; if (!worst || x.prog < worst.prog || (x.prog === worst.prog && x.game < worst.game)) worst = x; }\nr.worst = { prog: worst.prog, end: worst.end, game: worst.game, crash: worst.crash };\n}\n} catch (err) { broke = true; clean = false; r = failed(err); }\nout.push(r);\n});\nconst bad = rogue();\nfor (const p of bad) KP.add(p);\nif ((!bad.length && !broke) || lot >= 3) { for (const [k, v] of got) kids.set(k, v); return out; }\nfor (const [k] of got) kids.delete(k);\n}\n}\nfunction trace(P) {\nputMem(null); clean = false;\nconst E = Ep(P), pts = [];\nconst r = go(E, (E, s) => { if (E.t % 6 === 0) pts.push(+E.rider.at.toFixed(1), +s[1].toFixed(2)); return false; });\nreturn { r, pts };\n}\nonmessage = async e => {\nconst m = e.data;\nif (m.type !== 'roll' && m.type !== 'take' && m.type !== 'clear') clean = false;\ntry {\nif (m.type === 'init') {\nawait init(m); takeBase();\npostMessage({ type: 'ready', id: m.id, secs: S, length: R.length, geo: { X: Array.from(R.X), Z: Array.from(R.Z), KIND: Array.from(R.KIND), W: R.W ? Array.from(R.W) : null, H: Array.from(H), PZ: R.PZ } });\n} else if (m.type === 'eval') { const out = m.plans.map(p => { putMem(null); clean = false; return go(Ep(p, m.jit)); }); postMessage({ type: 'evals', id: m.id, out }); }\nelse if (m.type === 'trace') postMessage({ type: 'trace', id: m.id, ...trace(m.plan) });\nelse if (m.type === 'calib') postMessage({ type: 'calib', id: m.id, ...calib(m.plans) });\nelse if (m.type === 'pages') { for (const p of m.list) KP.add(p); postMessage({ type: 'pages', id: m.id, test: selftest(m.plans[0], m.plans[1]) }); }\nelse if (m.type === 'snapat') { const full = fromBase(m.P), E = fromBase(m.P, E => E.t >= full.ticks >> 1); postMessage({ type: 'snapat', id: m.id, full, node: E.done ? null : save(E) }); }\nelse if (m.type === 'snaptest') postMessage({ type: 'snaptest', id: m.id, r: go(load(m.node, m.P)) });\nelse if (m.type === 'roll') postMessage({ type: 'roll', id: m.id, out: roll(m) });\nelse if (m.type === 'take') postMessage({ type: 'take', id: m.id, nodes: m.keys.map(k => kids.get(k) || null) });\nelse if (m.type === 'clear') { kids.clear(); postMessage({ type: 'clear', id: m.id }); }\n} catch (err) { postMessage({ type: 'error', id: m.id, error: String(err && err.stack || err) }); }\n};\n";
const SIM_ID = (() => { let h = 2166136261; for (let i = 0; i < WORKER_SRC.length; i++) h = Math.imul(h ^ WORKER_SRC.charCodeAt(i), 16777619) >>> 0; return h.toString(36); })();
async function gameFiles() {
const a = assets();
if (!a.wasm || a.land.some(u => !u)) throw new Error(tx('Không thấy file vật lý của game. Hãy tải lại trang game.', "The game's physics files were not found. Reload the game's page."));
const wasm = await (await fetch(a.wasm)).arrayBuffer();
const land = await Promise.all(a.land.map(u => fetch(u).then(r => r.arrayBuffer())));
return { wasm, land };
}
class Pool {
constructor(n, make) {
const url = make ? null : URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
this.ws = Array.from({ length: n }, () => (make ? make() : new Worker(url)));
this.seq = 0; this.waiting = new Map(); this.closed = false;
this.ws.forEach(w => w.addEventListener('error', e => { if (e.preventDefault) e.preventDefault(); this.failAll(new Error('worker: ' + (e.message || 'error'))); }));
}
failAll(err) { for (const [, rej] of this.waiting) rej(err); this.waiting.clear(); }
call(w, msg, transfer) {
if (this.closed) return Promise.reject(new Error('pool closed'));
return new Promise((resolve, reject) => {
const id = ++this.seq;
const h = e => {
if (e.data.id !== id) return;
w.removeEventListener('message', h);
this.waiting.delete(id);
if (e.data.type === 'error') reject(new Error(e.data.error)); else resolve(e.data);
};
this.waiting.set(id, err => { w.removeEventListener('message', h); reject(err); });
w.addEventListener('message', h);
w.postMessage({ ...msg, id }, transfer || []);
});
}
async init(route, setup, files) {
const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'init', wasm: files.wasm.slice(0), land: files.land.map(b => b.slice(0)), route, setup })));
return r[0];
}
async calib(plans) {
const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'calib', plans })));
const all = new Set();
for (const x of r) for (const p of x.list) all.add(p);
const list = [...all];
const q = await Promise.all(this.ws.map(w => this.call(w, { type: 'pages', list, plans })));
const same = r.every(x => x.hash === r[0].hash && x.size === r[0].size);
let cross = true;
if (same && this.ws.length > 1) {
const a = await this.call(this.ws[0], { type: 'snapat', P: plans[0] });
if (a.node) {
const f = a.full, b = (await this.call(this.ws[this.ws.length - 1], { type: 'snaptest', node: a.node, P: plans[0] })).r;
cross = b.prog === f.prog && b.ticks === f.ticks && b.game === f.game && b.end === f.end;
}
}
return (this.snapOk = same && cross && q.every(x => x.test && x.test.ok));
}
roll(wi, msg) { return this.call(this.ws[wi], { type: 'roll', ...msg }).then(r => r.out); }
take(wi, keys) { return this.call(this.ws[wi], { type: 'take', keys }).then(r => r.nodes); }
clearKids() { return Promise.all(this.ws.map(w => this.call(w, { type: 'clear' }))); }
async evalAll(plans, jit) {
const n = this.ws.length, parts = Array.from({ length: n }, () => []);
plans.forEach((p, i) => parts[i % n].push(i));
const res = new Array(plans.length);
await Promise.all(parts.map(async (ix, wi) => {
if (!ix.length) return;
const r = await this.call(this.ws[wi], { type: 'eval', plans: ix.map(i => plans[i]), jit });
r.out.forEach((o, k) => { res[ix[k]] = o; });
}));
return res;
}
trace(plan) { return this.call(this.ws[0], { type: 'trace', plan }); }
close() { this.closed = true; this.ws.forEach(w => w.terminate()); this.failAll(new Error('pool closed')); }
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = a => a[Math.floor(Math.random() * a.length)];
const clonePlan = p => JSON.parse(JSON.stringify(p));
const clampV = v => clamp(v, 2, 18);
const planFits = (p, secs) => !!p && ['v', 'pt', 'pl', 'pu', 'tk'].every(k => Array.isArray(p[k]) && p[k].length === secs.length)
&& ['vs', 'lg', 'sa', 'ph', 'pc'].every(k => p[k] === undefined || (Array.isArray(p[k]) && p[k].length === secs.length));
const CASED_COST = 200;
const done = r => r.end === 'finish';
const far = r => (done(r) ? Infinity : r.prog);
const judged = r => (r.game || 0) - CASED_COST * (r.jl || []).filter(e => e.g === 5).length;
const beats = (a, b) => !b || far(a) > far(b) || (far(a) === far(b) && (judged(a) !== judged(b) ? judged(a) > judged(b)
: Math.abs((a.vAvg || 0) - (b.vAvg || 0)) > 0.05 ? a.vAvg > b.vAvg : a.fit > b.fit + 0.01));
const aliveAt = r => r.end === 'riding' || r.end === 'finish';
const BEAM = 6, SWEEP_TRIES = 72, MAX_BACKS = 12;
const LEANS = [0, 0.3, 0.6, 1, -0.3, -0.6], AIR_STEERS = [0, 0.15, 0.3, 0.5, 0.8, 1];
const setPer = (p, key, k, v) => { if (!p[key]) { if (!v) return; p[key] = p.v.map(() => 0); } p[key][k] = v; };
const JITS = [{ dv: 0.3, dt: 0 }, { dv: -0.3, dt: 0 }, { dv: 0, dt: 0.06 }];
const BOOK_ROWS = 6000;
const TRICK_PARTS = {
F: { unlock: UNLOCK.flip, worth: 300 + 6 * XP_W, air: 0.8 }, S: { unlock: UNLOCK.spin, worth: 200 + 4 * XP_W, air: 0.7 },
S2: { unlock: UNLOCK.spin, worth: 400 + 4 * XP_W + EXTRA_W, air: 1.2 }, W: { unlock: UNLOCK.whip, worth: 100 + 2 * XP_W, air: 0.45 },
T: { unlock: UNLOCK.tailwhip, worth: 5 * XP_W, air: 0.85 }, B: { unlock: UNLOCK.barspin, worth: 3 * XP_W, air: 0.6 },
L: { unlock: UNLOCK.table, worth: 5 * XP_W, air: 0.8 }, G: { unlock: UNLOCK.tbog, worth: 3 * XP_W, air: 0.6 }, X: { unlock: UNLOCK.xup, worth: 4 * XP_W, air: 0.7 },
};
const partsOf = tk => {
if (!tk) return [];
const out = [];
if (tk.f) out.push('F');
if (tk.s) out.push((tk.sr || 3.3) > 5.5 ? 'S2' : 'S');
if (tk.w) out.push('W');
for (const [c] of tk.q || []) if (!out.includes(c)) out.push(c);
return out;
};
const GOT_KEY = { F: 'flip', S: 'spin', S2: 'spin', W: 'whip', T: 'tailwhip', B: 'barspin', L: 'table', G: 'tbog', X: 'xup' };
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
function drawTricks(rows, air, mask) {
const w = bookWeights(rows, air, mask), has = c => w[c] > 0;
const sum = Object.values(w).reduce((a, x) => a + x, 0) || 1, want = c => has(c) && Math.random() < Math.min(0.85, 1.6 * w[c] / sum + 0.08);
const tk = {};
let left = air - 0.35;
if (want('F') && left > 0.6) { tk.f = 1; left -= 0.35; }
if (want('S2') && left > 0.9) { tk.s = Math.random() < 0.5 ? -1 : 1; tk.sr = +(6.6 + Math.random() * 0.6).toFixed(2); left -= 0.6; }
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
function nudgeTricks(tk, rows, air, mask) {
if (!tk || Math.random() < 0.15) return drawTricks(rows, air, mask);
const t = JSON.parse(JSON.stringify(tk));
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
this.gen = ok ? mem.gen || 0 : 0;
this.hist = ok ? (mem.hist || []).slice(-400) : [];
this.fragile = new Set(ok ? mem.fragile || [] : []);
this.best = (await this.pool.evalAll([this.plan]))[0];
if (!done(this.best)) { const f = freshPlan(this.secs), r = (await this.pool.evalAll([f]))[0]; if (beats(r, this.best)) { this.plan = f; this.best = r; } }
const slow = freshPlan(this.secs), wild = clonePlan(this.plan);
this.secs.forEach((s, k) => { if (s.jump) wild.tk[k] = { f: 1, q: [['B', 1, 0], ['T', 1, 0], ['L', 3, 0]] }; });
wild.v = wild.v.map(v => clampV(v + 2));
await this.pool.calib([this.plan, slow, wild]);
return { fromMemory: !!ok, best: this.best };
}
stop() { this.running = false; }
close() { this.stop(); if (this.pool) this.pool.close(); this.pool = null; }
airOf(j) { return Math.max(0, ...((this.best && this.best.jl) || []).filter(e => e.k === j).map(e => e.a)); }
onHill(k) { const s = this.secs[k], K = this.geo && this.geo.KIND; if (!K) return false; for (let i = s.a; i <= s.b; i++) if (K[i] === 'start') return true; return false; }
horizon(a, b, fragile) {
if (fragile) {
const wa = a.worst ? aliveAt(a.worst) && !a.worst.crash : aliveAt(a), wb = b.worst ? aliveAt(b.worst) && !b.worst.crash : aliveAt(b);
if (wa !== wb) return wa ? 1 : -1;
}
const la = aliveAt(a), lb = aliveAt(b);
if (la !== lb) return la ? 1 : -1;
if (!la) return a.prog !== b.prog ? a.prog - b.prog : a.fit - b.fit;
const ja = judged(a), jb = judged(b);
if (ja !== jb) return ja - jb;
return a.fit - b.fit;
}
trickFor(p, k, wide) {
const air = this.airOf(k), mask = this.setup.tricks;
if (!air || Math.random() > 0.45 * Math.min(1.5, wide)) return;
p.tk[k] = Math.random() < 0.5 ? drawTricks(this.book, air, mask) : nudgeTricks(p.tk[k], this.book, air, mask);
}
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
if (Math.random() < 0.2 * wide) p.pu[k] = pick([0, 0.5, 0.8, 1]);
if (Math.random() < 0.08 * wide) setPer(p, 'pc', k, p.pc && p.pc[k] ? 0 : 1);
if (this.onHill(k) && Math.random() < 0.2 * wide) { setPer(p, 'ph', k, p.ph && p.ph[k] ? 0 : 1); if (p.ph && p.ph[k] && !p.pu[k]) p.pu[k] = 1; }
if (Math.random() < 0.12 * wide) setPer(p, 'lg', k, pick(LEANS));
if (s.jump) {
if (Math.random() < 0.25 * wide) setPer(p, 'sa', k, pick(AIR_STEERS));
this.trickFor(p, k, wide);
if (p.tk[k] && p.tk[k].f && Math.random() < 0.4) p.pl[k] = 1 + Math.floor(Math.random() * 5);
}
return p;
}
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
p.tk[k] = Math.random() < 0.6 ? null : p.tk[k];
}
p.pu[k] = Math.random() < 0.3 ? pick([0.5, 0.8, 1]) : 0;
setPer(p, 'pc', k, Math.random() < 0.3 ? 1 : 0);
if (this.onHill(k)) setPer(p, 'ph', k, p.pu[k] && Math.random() < 0.5 ? 1 : 0);
if (Math.random() < 0.4) setPer(p, 'lg', k, pick(LEANS));
return p;
}
firstTries(nd, k, wide, n, wild) {
const s = this.secs[k], out = [{ p: clonePlan(nd.plan), same: true }];
if (nd.plan.v[k] < VFREE || (nd.plan.vs && nd.plan.vs[k])) { const p = clonePlan(nd.plan); if (p.vs) p.vs[k] = null; p.v[k] = 18; out.push({ p }); }
if (this.onHill(k) && !(nd.plan.ph && nd.plan.ph[k] && nd.plan.pu[k] >= 1)) { const p = clonePlan(nd.plan); setPer(p, 'ph', k, 1); p.pu[k] = 1; out.push({ p }); }
{ const p = clonePlan(nd.plan); setPer(p, 'pc', k, p.pc && p.pc[k] ? 0 : 1); if (!p.pu[k]) p.pu[k] = 1; out.push({ p }); }
if (s.jump) {
for (const dv of [-1.2, -0.6, 0.6, 1.2, 1.8]) for (const da of [-0.1, 0, 0.1]) {
const p = clonePlan(nd.plan), u = p.vs && p.vs[k];
if (u) { u[u.length - 1] = clampV(u[u.length - 1] + dv * wide); p.v[k] = u[u.length - 1]; } else p.v[k] = clampV(p.v[k] + dv * wide);
p.pt[k] += da;
out.push({ p });
}
if (nd.plan.tk[k]) { const p = clonePlan(nd.plan); p.tk[k] = null; out.push({ p }); }
}
for (let i = 0; i < n; i++) out.push({ p: Math.random() < wild ? this.wildTry(nd.plan, k) : this.secTry(nd.plan, k, wide) });
return out;
}
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
for (const key of ['lg', 'sa', 'ph', 'pc']) { const w = one(); if (w[key] || p[key]) setPer(p, key, k, w[key] ? w[key][k] : 0); }
return { p };
}
async rollAll(cs, a1, a2, jits) {
const pool = this.pool, W = pool.ws.length, per = Math.ceil(cs.length / W), jobs = [];
for (let wi = 0; wi < W; wi++) {
const part = cs.slice(wi * per, (wi + 1) * per);
if (!part.length) continue;
jobs.push((async () => {
for (let i = 0; i < part.length;) {
let j = i; while (j < part.length && part[j].nd === part[i].nd) j++;
const bid = `${++this.bid}`, group = part.slice(i, j);
const out = await pool.roll(wi, { node: group[0].nd.n, plans: group.map(c => c.p), a1, a2, bid, jits });
group.forEach((c, q) => { c.r = out[q]; c.wi = wi; c.key = `${bid}:${q}`; });
i = j;
}
})());
}
await Promise.all(jobs);
this.tries += cs.length;
}
learnBook(j, cs) {
const ref = this.airOf(j);
for (const c of cs) {
const tk = c.p.tk[j], r = c.r;
if (!tk || c.same || !r) continue;
const e = r.jl.find(q => q.k === j), fell = !e || (r.crash && r.crashSec === j);
if (!e && !ref) continue;
for (const part of partsOf(tk)) this.book.push([e ? e.a : ref, part, !fell && e && e.got[GOT_KEY[part]] ? 1 : 0]);
}
if (this.book.length > BOOK_ROWS) this.book.splice(0, this.book.length - BOOK_ROWS);
this.bookDirty = true;
}
async sweep(wide) {
const S = this.secs, K = S.length, pool = this.pool;
let beam = [{ n: null, plan: clonePlan(this.plan), inc: true }], k = 0, backs = 0, bestEnd = null;
const beams = [beam], widen = new Map(), fails = {}, t0 = performance.now();
this.tries = 0; this.bid = this.bid || 0;
while (k < K && this.running) {
const a1 = k + 1 < K ? S[k + 1].a : -1, a2 = k + 2 < K ? S[k + 2].a : this.N + 10, w = wide * (widen.get(k) || 1);
const fr = this.fragile.has(k), jits = fr ? JITS : null;
const n1 = Math.max(12, Math.ceil(SWEEP_TRIES / beam.length)), cs = [];
const front = done(this.best) ? K : this.best.crashSec, wild = k >= front - 1 && k <= front ? 0.5 : widen.has(k) ? 0.3 : 0.1;
for (const nd of beam) for (const c of this.firstTries(nd, k, w, n1, wild)) cs.push({ nd, ...c });
await this.rollAll(cs, a1, a2, jits);
if (!this.running) return null;
const more = [];
for (const nd of beam) {
const mine = cs.filter(c => c.nd === nd).sort((x, y) => this.horizon(y.r, x.r, fr));
const el = mine.slice(0, Math.max(2, Math.ceil(mine.length / 5))).map(c => c.p);
for (let i = 0; i < Math.ceil(n1 / 2); i++) more.push({ nd, ...this.eliteTry(el, k) });
}
await this.rollAll(more, a1, a2, jits);
if (!this.running) return null;
const all = cs.concat(more);
if (S[k].jump) this.learnBook(k, all);
for (const c of all) if (c.r.end !== 'riding' && (!bestEnd || beats(c.r, bestEnd.r))) bestEnd = c;
if (this.on.progress) this.on.progress({ k, K, backs, tries: this.tries, ms: performance.now() - t0 });
if (a1 < 0) break;
const ok = all.filter(c => c.r.kid).sort((x, y) => this.horizon(y.r, x.r, fr));
if (!ok.length) {
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
const full = (await pool.evalAll([bestEnd.p]))[0];
const improved = beats(full, this.best);
if (improved) { this.plan = bestEnd.p; this.best = full; }
return { improved, full, backs, ms: performance.now() - t0 };
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
markFragile(k) { if (k >= 0 && k < this.secs.length) this.fragile.add(k); }
}
const LINE = 'trailsai.line.', LIB = 'trailsai.lines', BOOK = 'trailsai.book', LINE_FORMAT = 'trails-ai-line';
const lib = {
list: () => readJSON(LIB, []),
get(id) { const m = readJSON(LINE + id, null); return m && m.format === LINE_FORMAT && m.version === 3 ? m : null; },
put(mem) {
mem.savedAt = Date.now();
if (!writeJSON(LINE + mem.id, mem)) return false;
const b = mem.best, row = { id: mem.id, name: mem.name, start: mem.line.start, length: mem.line.length, game: b ? b.game : 0, done: !!(b && b.end === 'finish'), real: mem.realBest || 0, savedAt: mem.savedAt };
writeJSON(LIB, lib.list().filter(o => o.id !== mem.id).concat([row]));
return true;
},
rename(id, name) { const m = lib.get(id); if (m) { m.name = String(name).slice(0, 40); lib.put(m); } },
forget(id) { keep.removeItem(LINE + id); writeJSON(LIB, lib.list().filter(o => o.id !== id)); },
nextName: () => tx(`Đường ${lib.list().length + 1}`, `Line ${lib.list().length + 1}`),
};
function newMemory(route) {
const { start, X, Z, KIND, W, pieces, kinds, length, back } = route;
return { format: LINE_FORMAT, version: 3, id: start.id, name: lib.nextName(), line: { start, X: Array.from(X), Z: Array.from(Z), KIND: Array.from(KIND), W: W ? Array.from(W) : null, pieces, kinds, length, back: !!back },
plan: null, best: null, sim: null, gen: 0, hist: [], fragile: [], rides: [], realBest: 0, setup: null, createdAt: Date.now() };
}
const loadBook = mask => { const b = readJSON(BOOK, null); return b && b.version === 2 && Array.isArray(b[mask]) ? b[mask] : []; };
function saveBook(mask, rows) { const b = readJSON(BOOK, null) || { version: 2 }; if (b.version !== 2) return; b[mask] = rows.slice(-BOOK_ROWS); writeJSON(BOOK, b); }
function migrateOld() {
let n = 0;
for (const k of keep.keys()) {
if (!k.startsWith('trailsai.v2.')) continue;
const id = k.slice(12);
if (lib.get(id)) continue;
const m = readJSON(k, null), L = m && m.line, P = m && m.plan;
if (!L || !P || !Array.isArray(L.X) || L.practice || L.drill || L.aim || L.tour !== undefined || !Array.isArray(P.v)) continue;
const mem = newMemory({ ...L, W: L.W || null });
mem.name = tx(`Đường cũ ${++n}`, `Old line ${n}`);
const hr = i => (Array.isArray(P.hr) ? P.hr[i] : 1.5);
const TK = { 16: i => ({ s: -1, sr: hr(i) }), 17: i => ({ s: 1, sr: hr(i) }), 18: () => ({ f: 1 }), 19: i => ({ w: -1, wt: hr(i) }), 20: i => ({ w: 1, wt: hr(i) }),
22: i => ({ f: 1, w: -1, wt: hr(i) }), 23: i => ({ f: 1, w: 1, wt: hr(i) }), 24: () => ({ f: 1, s: -1, sr: 3.3 }), 25: () => ({ f: 1, s: 1, sr: 3.3 }) };
const plan = { v: P.v.slice(), pt: P.pt.slice(), pl: P.pl.slice(), pu: P.pu.slice(), tk: P.v.map((_, i) => (TK[P.mv && P.mv[i]] || (() => null))(i)) };
for (const key of ['vs', 'lg', 'sa', 'ph', 'pk']) if (P[key] !== undefined) plan[key] = P[key];
if (!P.pz) plan.pc = P.v.map(() => 1);
if (!P.as) plan.as = false;
mem.plan = plan;
lib.put(mem);
}
return n;
}
const ui = { say() {}, log() {}, update() {} };
const AIDRIVE = 'trailsai.drive', RESUME = 'trailsai.resume';
const ses = {
want: false, mem: null, R: null, H: null, secs: null, learner: null, files: null, busy: false, error: null,
aiDrive: (() => { try { return keep.getItem(AIDRIVE) !== '0'; } catch { return true; } })(),
paused: false, pausedAt: null, still: 0, ride: null, last: null, rides: 0, t0: 0, tries: 0, rate: 0, update: false,
};
const workerCount = () => clamp((navigator.hardwareConcurrency || 4) - 2, 2, 8);
const keepBest = b => b && { end: b.end, prog: b.prog, game: b.game, train: b.train, xp: b.xp, vAvg: b.vAvg, crashSec: b.crashSec,
jl: b.jl.map(e => ({ k: e.k, a: e.a, g: e.g, p: e.p, got: e.got })) };
function saveMem() {
const L = ses.learner, m = ses.mem;
if (!L || !m || !L.best) return;
m.plan = L.plan; m.best = keepBest(L.best); m.gen = L.gen; m.hist = L.hist.slice(-400); m.fragile = [...L.fragile];
m.setup = L.setup; m.sim = SIM_ID;
if (!lib.put(m)) ui.log(tx('<b>Không lưu được bộ nhớ</b> (bộ nhớ trình duyệt đầy?).', '<b>Could not save the memory</b> (browser storage full?).'));
if (L.bookDirty) { saveBook(L.setup.tricks, L.book); L.bookDirty = false; }
}
async function openLine(id) {
ses.busy = true; ui.update();
try {
let mem = id ? lib.get(id) : null, found = null;
if (!mem) {
const me = bikeNow();
if (!me) throw new Error(tx('Chưa thấy xe trong game (hãy ngồi lên xe).', 'No bike in the game yet (get on your bike).'));
ui.say(tx('Đang tìm đường ở chỗ xe đứng…', 'Finding the line where the bike is…'));
found = await lineAt(me, lib.list());
if (!found) throw new Error(tx('Không thấy đường nào ở chỗ xe đứng. Đưa xe tới đầu một đường rồi bấm Bắt đầu.', 'No line where the bike is. Take it to the start of a line and press Start.'));
mem = found.route ? (lib.get(found.id) || newMemory(found.route)) : lib.get(found.id);
}
if (ses.mem && ses.mem.id === mem.id && ses.learner) return;
closeLine();
if (lineStale(mem.line)) {
const r = await buildRoute(mem.line.start, mem.line.back);
if (r) { const fresh = newMemory(r); fresh.name = mem.name; fresh.rides = mem.rides; mem = fresh; ui.log(tx('Đường này đã bị sửa trong game: AI dò lại và học lại từ đầu.', 'This line has been changed in the game: the AI traces it again and learns it afresh.')); }
}
if (!mem.line.W) mem.line.W = await widthsOf(mem.line);
ses.mem = mem;
const L = ses.learner = new Learner({
progress: p => { ses.tries += p.tries - (ses.lastTries || 0); ses.lastTries = p.tries; ui.update(); },
better: b => { ui.log(tx(`Tìm được cách đi tốt hơn: <b>${b.game} điểm</b>${b.end === 'finish' ? ', về đích' : `, tới ${b.prog} m`}.`, `Found a better way: <b>${b.game} points</b>${b.end === 'finish' ? ', to the end' : `, to ${b.prog} m`}.`)); },
saved: () => { ses.lastTries = 0; saveMem(); ui.update(); },
});
const setup = riderSetup();
L.book = loadBook(setup.tricks);
ses.files = ses.files || await gameFiles();
ui.say(tx('Đang nạp đường vào bộ mô phỏng…', 'Loading the line into the simulation…'));
const got = await L.prepare(mem.line, setup, ses.files, workerCount(), mem.plan ? mem : null);
const g = L.geo;
ses.R = { X: g.X, Z: g.Z, KIND: g.KIND, W: g.W, PZ: g.PZ, length: g.X.length }; ses.H = g.H; ses.secs = L.secs;
if (!mem.plan) lib.put(Object.assign(mem, { plan: L.plan, best: keepBest(L.best), setup, sim: SIM_ID }));
ui.log(got.fromMemory ? tx(`Mở <b>${esc(mem.name)}</b> từ thư viện: ${L.best.game} điểm trong mô phỏng${L.best.end === 'finish' ? ', về đích' : ''}. Học tiếp.`, `Opened <b>${esc(mem.name)}</b> from the library: ${L.best.game} points in the simulation${L.best.end === 'finish' ? ', to the end' : ''}. Learning on.`)
: tx(`Đường mới <b>${esc(mem.name)}</b> (${mem.line.length} m, ${L.secs.filter(s => s.jump).length} cú nhảy). Bắt đầu học.`, `New line <b>${esc(mem.name)}</b> (${mem.line.length} m, ${L.secs.filter(s => s.jump).length} jumps). Learning starts.`));
if (!L.pool.snapOk) throw new Error(tx('Trạng thái vật lý không lưu lại được trên máy này, AI không học được.', 'The physics state cannot be saved on this computer, so the AI cannot learn.'));
ses.t0 = Date.now(); ses.tries = 0;
if (ses.want) L.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
} finally { ses.busy = false; ui.update(); }
}
function closeLine() {
stopRide(null);
if (ses.learner) { saveMem(); ses.learner.close(); }
ses.learner = null; ses.mem = null; ses.R = null;
}
async function start() {
if (ses.want) return;
if (!live.ex || !live.g) { ui.say(tx('AI chưa gắn được vào game. Hãy tải lại trang game.', "The AI is not hooked into the game. Reload the game's page.")); return; }
ses.want = true; ses.paused = false; ui.update();
try { await openLine(ses.mem ? ses.mem.id : null); } catch (err) { ses.want = false; ui.say(err.message || String(err)); ui.update(); return; }
const L = ses.learner;
if (!L.running) L.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
ui.say(ses.aiDrive ? tx('AI đang học và lái. Bấm phím lái bất kỳ để lấy lại xe.', 'The AI is learning and riding. Press any ride key to take the bike back.') : tx('AI đang học ở nền (không lái xe thật).', 'The AI is learning in the background (not riding for real).'));
nextRide(500);
}
const letGo = () => { stopRide(null); clearTimeout(rideTimer); if (live.drive && live.drive.hold) live.drive = null; };
function stop() {
ses.want = false; ses.paused = false;
letGo();
if (ses.learner) { ses.learner.stop(); saveMem(); }
ui.say(tx('Đã dừng. Bộ nhớ của đường đã được lưu.', 'Stopped. The line\'s memory is saved.')); ui.update();
}
function setAiDrive(on) {
ses.aiDrive = on;
try { keep.setItem(AIDRIVE, on ? '1' : '0'); } catch { /* storage blocked */ }
if (!on) letGo(); else if (ses.want) { ses.paused = false; nextRide(500); }
ui.update();
}
let rideTimer = 0;
function nextRide(ms) { clearTimeout(rideTimer); rideTimer = setTimeout(rideOnce, ms); }
async function getUp() { if (!(liveState()[13] > 0)) return; key('KeyR', 'r'); await sleep(500); }
async function rideOnce() {
if (!ses.want || !ses.aiDrive || ses.paused || ses.busy || share.busy || ses.ride || !ses.learner || !ses.R) return;
if (ses.update && ses.rides > 0) { applyUpdate(); return; }
await getUp();
const st = ses.mem.line.start, L = ses.learner;
live.ex.trails_set_spawn_at(live.g, st.x, st.z, st.heading, 0);
live.ex.trails_game_reset(live.g);
const R = ses.R, N = R.length, plan = clonePlan(L.plan), rider = makeRider(R, ses.H, ses.secs, plan);
const d = ses.ride = { plan, rider, known: L.plan, t: 0, seq: null, streak: 0, game: 0, train: 0, xp: 0, lands: [], pending: null, far: -1, farT: 0, calm: 0, coast: null, bigLand: -1, swaps: 0, expect: L.best };
const swap = () => {
const p = L.plan;
if (p === d.known) return;
d.known = p;
const upto = Math.min(ses.secs.length - 1, Math.max(rider.sec, rider.airSec) + 1), same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
for (const k of ['as', 'pk']) if (!same(p[k], plan[k])) return;
for (const k of ['v', 'pt', 'pl', 'pu', 'tk', 'vs', 'lg', 'sa', 'ph', 'pc']) for (let i = 0; i <= upto; i++) if (!same(p[k] && p[k][i], plan[k] && plan[k][i])) return;
for (const k of Object.keys(plan)) delete plan[k];
Object.assign(plan, clonePlan(p));
d.swaps++; d.expect = L.best;
};
d.step = () => {
try {
const s = liveState(), t = d.t;
if (d.seq === null) d.seq = s[16];
if (s[13] > 0) { setTimeout(() => endRide('crash'), 0); return null; }
if (s[16] !== d.seq) {
d.seq = s[16];
if ((s[15] | 0) > 0) { const lp = landPoints(s, d.streak); d.streak = lp.streak; d.pending = { t, e: { k: rider.airSec, i: rider.idx, a: +s[14].toFixed(2), g: lp.g, p: lp.p, train: lp.train, xp: lp.xp, got: lp.got } }; }
}
if (d.pending && t - d.pending.t >= 30) { const e = d.pending.e; d.lands.push(e); d.game += e.p; d.train += e.train; d.xp += e.xp; d.pending = null; ui.update(); }
if (t % 30 === 0) swap();
d.calm = s[12] > 0 ? 0 : d.calm + 1;
let inp;
if (!d.coast && rider.idx >= N - 3) { const k = Math.max(0, N - 6); d.coast = { h: Math.atan2(R.Z[N - 1] - R.Z[k], R.X[N - 1] - R.X[k]), t0: t, halt: false }; }
if (d.coast) {
const c = d.coast, v = s[8], air = s[12] > 0;
if (!c.halt && (d.calm >= 30 || (!air && v < -0.3))) c.halt = true;
if ((c.halt && !air && Math.abs(v) < 0.5 && Math.abs(s[4]) < 0.15) || (!air && t - c.t0 > 420)) { if (!d.pending) setTimeout(() => endRide('finish'), 0); return [0, 127, 0, 0, 0, 0, 0]; }
const stv = air ? 0 : clamp(2 * wrapA(c.h - s[3]), -1, 1), own = rider.step(s, d.t++), ln = air ? own[3] : 0, p = s[4];
const brake = air || v <= 0 ? 0 : Math.abs(p) >= 0.15 ? (p > 0 ? 70 : 40) : v > 1.5 ? 70 : 127;
inp = c.halt ? [0, brake, Math.round(stv * 127), ln, 0, 0, 0] : [v < 6 ? 127 : 0, v > 9 ? 40 : 0, Math.round(stv * 127), ln, 0, 0, 0];
} else {
inp = rider.step(s, d.t++).slice();
if (rider.landed && s[14] > 2) d.bigLand = rider.idx;
if (rider.off > (d.bigLand >= 0 && rider.idx - d.bigLand < 40 ? 18 : 12) && !(s[12] > 0)) { setTimeout(() => endRide('off'), 0); return null; }
if (rider.idx > d.far || s[12] > 0) { d.far = Math.max(d.far, rider.idx); d.farT = t; } else if (t - d.farT > 180) { setTimeout(() => endRide('stuck'), 0); return null; }
}
return inp;
} catch (err) { console.error(err); setTimeout(() => endRide('error'), 0); return null; }
};
live.drive = d;
ui.update();
d.watch = setInterval(() => { if (live.drive !== d) { clearInterval(d.watch); return; } if (liveState()[13] > 0) endRide('crash'); }, 250);
}
const END_WORDS = { crash: ['ngã', 'fell'], off: ['lạc khỏi đường', 'went off the line'], stuck: ['bị kẹt', 'got stuck'], finish: ['về đích', 'rode to the end'], error: ['lỗi', 'error'], player: ['bạn cầm lái', 'you took over'] };
function stopRide(why) {
const d = ses.ride;
if (!d) return null;
clearInterval(d.watch);
if (live.drive === d) live.drive = null;
ses.ride = null;
return d;
}
async function endRide(why) {
const d = stopRide(why);
if (!d) return;
const L = ses.learner, m = Math.max(0, d.rider.idx - (L ? L.N - ses.mem.line.length : 0));
if (why === 'finish') live.drive = { hold: true, step: () => [0, 127, 0, 0, 0, 0, 0] };
ses.rides++;
const rec = { at: Date.now(), end: why, m, game: d.game, train: d.train, xp: d.xp, lands: d.lands.map(e => [e.k, e.g, e.p, trickText(e.got)]), swaps: d.swaps };
ses.last = rec;
if (ses.mem) { ses.mem.rides = (ses.mem.rides || []).concat([rec]).slice(-10); if (why === 'finish') ses.mem.realBest = Math.max(ses.mem.realBest || 0, d.game); }
ui.log(tx(`<b>Lái thật:</b> ${END_WORDS[why][0]} sau ${m} m, <b>${d.game} điểm</b> (Train ${d.train}, kỹ năng ${d.xp}).`, `<b>Real ride:</b> ${END_WORDS[why][1]} after ${m} m, <b>${d.game} points</b> (Train ${d.train}, skill ${d.xp}).`));
if (L && why !== 'player' && d.expect) {
const sim = d.expect, newly = [];
const mark = k => { if (k >= 0 && !L.fragile.has(k)) { L.markFragile(k); newly.push(k + 1); } };
if ((why === 'crash' || why === 'off' || why === 'stuck') && (sim.end === 'finish' || sim.prog > d.rider.idx + 10)) mark(why === 'crash' && d.rider.airSec >= 0 && d.rider.airT > 0 ? d.rider.airSec : d.rider.sec);
for (const e of d.lands) { const s = (sim.jl || []).find(q => q.k === e.k); if (e.g >= 4 && s && s.g <= 3) mark(e.k); }
if (newly.length) ui.log(tx(`Mô phỏng lạc quan quá ở đoạn ${newly.join(', ')}: AI sẽ học cách đi chắc hơn ở đó.`, `The simulation was too hopeful at section ${newly.join(', ')}: the AI will learn a safer way there.`));
if (lineStale(ses.mem.line)) ui.log(tx('<b>Đường trong game đã khác bộ nhớ</b> (có người sửa). Lần mở sau AI sẽ dò lại.', '<b>The line in the game differs from the memory</b> (someone changed it). The AI traces it again next time it opens it.'));
}
saveMem(); ui.update();
if (why === 'finish' && shareDue() && ses.mem) { await shareGood(ses.mem.line.start, m, d.game, ui.log); ui.update(); }
if (ses.want && ses.aiDrive && !ses.paused) nextRide(why === 'finish' ? 1500 : 2500);
}
playerKeys.onKey = () => {
if (!ses.want || ses.paused) return;
if (live.drive && live.drive.hold) live.drive = null;
const had = !!ses.ride;
stopRide('player');
clearTimeout(rideTimer);
ses.paused = true; ses.still = 0; const me = bikeNow(); ses.pausedAt = me ? { x: me.x, z: me.z } : null;
if (had || ses.aiDrive) ui.say(tx('Bạn đang cầm lái, AI vẫn học tiếp. Đưa xe tới đầu đường (đường này hay đường khác) rồi đứng yên 3 giây: AI sẽ lái tiếp.', 'You have the bike; the AI goes on learning. Take it to the start of a line (this one or another) and stand still 3 seconds: the AI rides on.'));
ui.update();
};
const STILL = 2.5, MOVED = 25;
setInterval(async () => {
if (!ses.want || ses.busy || ses.ride || !(ses.paused || !ses.aiDrive) || !ses.mem) return;
const me = bikeNow();
if (!me || me.air || me.down || me.v > 0.3) { ses.still = 0; return; }
ses.still += 0.5;
if (ses.still < STILL || Date.now() - playerKeys.last < 2000) return;
ses.still = 0;
const st = ses.mem.line.start, dStart = Math.hypot(me.x - st.x, me.z - st.z), dPaused = ses.pausedAt ? Math.hypot(me.x - ses.pausedAt.x, me.z - ses.pausedAt.z) : Infinity;
if (dStart < START_NEAR && Math.abs(wrapA(me.heading - st.heading)) < 1.2) {
if (ses.paused && ses.aiDrive) { ses.paused = false; ui.say(tx('Xe ở đầu đường: AI lái tiếp.', 'The bike is at the start: the AI rides on.')); nextRide(300); }
return;
}
if (dStart < MOVED || dPaused < MOVED) return;
try {
saveMem();
await openLine(null);
if (!ses.learner.running) ses.learner.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
ses.paused = false; ses.pausedAt = null;
if (ses.aiDrive) nextRide(500);
} catch (err) { ui.say(err.message || String(err)); }
}, 500);
const RAW = 'https://raw.githubusercontent.com/ngotrongduong/trails-ai/main/dist/trails-ai.js';
function applyUpdate() {
saveMem();
try { keep.setItem(RESUME, JSON.stringify({ id: ses.mem && ses.want ? ses.mem.id : null, at: Date.now() })); } catch { /* storage blocked */ }
location.reload();
}
async function checkUpdate() {
if (!window.__taiDirect) return;
try {
const code = await (await fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' })).text();
const kept = localStorage.getItem('trailsai.code');
if (code && kept && code !== kept && code.includes('TrailsAI')) { localStorage.setItem('trailsai.code', code); ses.update = true; ui.update(); }
} catch { /* offline */ }
}
setInterval(checkUpdate, 20 * 60e3);
async function resume() {
const r = readJSON(RESUME, null);
keep.removeItem(RESUME);
if (!r || !r.id || Date.now() - r.at > 5 * 60e3 || !lib.get(r.id)) return;
for (let i = 0; i < 120 && !(live.ex && live.g && bikeNow()); i++) await sleep(1000);
ses.mem = lib.get(r.id);
start();
}
const SHARE = 'trailsai.share', SHARE_AT = 'trailsai.share.at', SHARE_EVERY = 5 * 60e3, SHARE_CUTS = 6;
const share = { on: (() => { try { return keep.getItem(SHARE) !== '0'; } catch { return true; } })(), busy: false };
const shareAt = () => +(keep.getItem(SHARE_AT) || 0) || 0;
const shareDue = () => share.on && !share.busy && Date.now() - shareAt() >= SHARE_EVERY;
function setShare(on) { share.on = on; try { keep.setItem(SHARE, on ? '1' : '0'); } catch { /* storage blocked */ } }
const key = (code, k, shiftKey) => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: k, code, shiftKey: !!shiftKey, bubbles: true })); };
const until = async (f, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) { const v = f(); if (v) return v; } return null; };
const sharePanel = () => { const c = [...document.querySelectorAll('.rp-caps')].find(e => e.textContent === 'Share this run'); return c && c.parentElement; };
const replayBtn = (sel, text) => [...document.querySelectorAll(sel + ' button')].find(b => b.textContent.trim() === text);
const segs = () => document.querySelectorAll('.rp-shots-track .rp-seg').length;
const pickOpt = (group, text) => {
const g = [...document.querySelectorAll('.rp-group')].find(e => { const n = e.querySelector('.rp-group-name'); return n && n.textContent.startsWith(group); });
const b = g && [...g.querySelectorAll('.rp-opt')].find(e => e.textContent.trim() === text && !e.disabled);
if (b && !b.classList.contains('on')) b.click();
};
async function filmRun() {
const video = replayBtn('.rp-tools', 'Video');
if (!video) return false;
video.click();
if (!(await until(() => replayBtn('.rp-panel', 'Make video'), 3000))) return false;
pickOpt('Size', '720p');
pickOpt('Frames a second', '30');
await sleep(400);
const make = replayBtn('.rp-panel', 'Make video');
if (!make) return false;
make.click();
const end = await until(() => replayBtn('.rp-making', 'Back to the edit') || replayBtn('.rp-making', 'Back'), 5 * 60e3);
if (!end) { const c = replayBtn('.rp-making', 'Cancel'); if (c) c.click(); await sleep(1000); return false; }
const made = end.textContent.trim() === 'Back to the edit';
if (made) end.click();
return made;
}
async function editRun() {
const edit = await until(() => replayBtn('.rp-actions', 'Edit'), 4000);
if (!edit) return { cuts: 0, film: false };
edit.click();
const auto = await until(() => replayBtn('.rp-tools', 'Auto edit'), 3000);
if (!auto) return { cuts: 0, film: false };
auto.click();
await sleep(300);
const tm = [...document.querySelectorAll('.rp-time')].map(e => e.textContent.match(/of\s+(\d+):(\d+)/)).find(Boolean);
const secs = tm ? +tm[1] * 60 + +tm[2] : 0, step = Math.floor(secs / SHARE_CUTS);
if (step >= 1) {
for (let i = 0; i < secs + 2; i++) key('ArrowLeft', 'ArrowLeft', true);
for (let i = 1; i < SHARE_CUTS && segs() - 1 < SHARE_CUTS; i++) {
for (let j = 0; j < step; j++) key('ArrowRight', 'ArrowRight', true);
key('KeyK', 'k');
await sleep(150);
}
}
const cuts = Math.max(0, segs() - 1);
let film = false;
try { film = await filmRun(); } catch (err) { console.error(err); }
const sh = await until(() => replayBtn('.rp-tools', 'Share'), 3000);
if (sh) sh.click();
return { cuts, film };
}
async function shareRun(title) {
try {
key('KeyL', 'l');
if (!(await until(sharePanel, 8000))) throw new Error(tx('game không mở bảng chia sẻ (cần đang ở trong game và có mạng)', 'the game did not open its share panel (it needs to be riding, online)'));
let ed = { cuts: 0, film: false };
try { ed = await editRun(); } catch (err) { console.error(err); }
if (!(await until(sharePanel, 4000))) throw new Error(tx('game không mở lại bảng chia sẻ sau khi cắt video', 'the game did not open its share panel again after the edit'));
const field = sharePanel().querySelector('input.rp-field');
if (field) { field.value = title; field.dispatchEvent(new Event('input', { bubbles: true })); }
const sw = sharePanel().querySelector('.rp-switch');
if (sw && !sw.classList.contains('on')) sw.click();
if (!sharePanel().querySelector('.rp-url')) {
const make = await until(() => [...sharePanel().querySelectorAll('button')].find(b => b.textContent === 'Make the link'), 3000);
if (!make) throw new Error(tx('không thấy nút “Make the link”', 'no “Make the link” button'));
make.click();
}
const got = await until(() => { const p = sharePanel(); return p && (p.querySelector('.rp-url') || p.querySelector('.rp-error')); }, 180e3);
if (!got) throw new Error(tx('3 phút chưa có link', 'no link after 3 minutes'));
if (got.classList.contains('rp-error')) throw new Error(got.textContent);
return { link: 'https://' + got.textContent.trim(), ...ed };
} finally {
const p = sharePanel(), x = p && p.querySelector('.rp-panel-close'), shut = () => !document.body.classList.contains('replaying');
if (x) x.click();
if (!(await until(shut, 1500))) { key('KeyP', 'p'); await until(shut, 3000); }
}
}
async function shareGood(st, m, pts, say) {
share.busy = true;
try { keep.setItem(SHARE_AT, String(Date.now())); } catch { /* storage blocked */ }
try {
const { link, cuts, film } = await shareRun(`AI Trails · ${m} m · ${pts} pts`.slice(0, 60));
const ws = cap.ws;
let invited = false;
if (ws && ws.readyState === 1 && st && num(st.x) && num(st.z)) {
ws.send(JSON.stringify({ t: 'chat', text: `My AI just rode this line to the end, no falls, ${pts} pts. Watch: ${link} · come ride it!`.slice(0, 200), invite: { x: st.x, z: st.z, heading: st.heading || 0 } }));
invited = true;
}
say(tx(`<b>Đã chia sẻ lượt chạy</b> (${m} m, ${pts} điểm): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>.${cuts ? ` Video cắt ${cuts} lần camera.` : ''}${film ? ' Đã làm thành video 720p.' : ''}${invited ? ' Đã mời mọi người trong chat.' : ' Chưa gửi được lời mời (game chưa kết nối máy chủ).'}`,
`<b>Shared the ride</b> (${m} m, ${pts} points): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>.${cuts ? ` ${cuts} camera cuts.` : ''}${film ? ' Made into a 720p video.' : ''}${invited ? ' Invited everyone in chat.' : ' Could not invite in chat (not connected).'}`));
} catch (err) {
say(tx(`<b>Chưa chia sẻ được:</b> ${esc(err && err.message || err)}. Thử lại ở lượt đẹp sau 5 phút nữa.`, `<b>Could not share:</b> ${esc(err && err.message || err)}. Trying again on a good ride in 5 minutes.`));
} finally { share.busy = false; }
}
const CSS = `
#tai{position:fixed;top:12px;right:12px;width:310px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;z-index:2147483646;
font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8ece6;background:rgba(22,26,22,.93);border:1px solid #3c463b;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45)}
#tai *{box-sizing:border-box}
#tai .h{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:move;border-bottom:1px solid #2f372e;user-select:none}
#tai .h b{flex:1;font-size:14px;letter-spacing:.2px}
#tai .h .dot{width:9px;height:9px;border-radius:50%;background:#59625a}
#tai .h .dot.on{background:#6fdc6f;box-shadow:0 0 8px #6fdc6f}
#tai .h button{all:unset;cursor:pointer;color:#aab3a8;padding:0 4px;font-size:16px}
#tai .b{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:9px}
#tai.min .b{display:none}
#tai .line{display:flex;align-items:baseline;gap:6px}
#tai .line .name{font-weight:600;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tai .line .len{color:#97a196;font-size:12px}
#tai .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#tai .st{background:#262d25;border-radius:7px;padding:6px 8px}
#tai .st small{display:block;color:#97a196;font-size:11px}
#tai .st span{font-size:16px;font-weight:600}
#tai .go{all:unset;cursor:pointer;text-align:center;padding:10px;border-radius:8px;font-weight:700;font-size:15px;background:#3f9c46;color:#fff}
#tai .go.stop{background:#a8473f}
#tai .go[disabled]{opacity:.55;cursor:wait}
#tai .say{color:#d6dcd3;min-height:18px}
#tai h4{margin:2px 0 0;font-size:11px;font-weight:600;color:#97a196;text-transform:uppercase;letter-spacing:.5px}
#tai .jumps,#tai .log,#tai .libl{display:flex;flex-direction:column;gap:3px}
#tai .jumps div{display:flex;gap:6px;font-size:12px}
#tai .jumps .n{color:#97a196;width:28px}
#tai .jumps .t{flex:1}
#tai .jumps .p{color:#f0c96a;font-variant-numeric:tabular-nums}
#tai .g1{color:#7fe08a}#tai .g2{color:#a6e39a}#tai .g3{color:#e5d37a}#tai .g4,#tai .g5{color:#f08a7a}
#tai .log{max-height:150px;overflow:auto;font-size:12px;color:#c5ccc2}
#tai .log a{color:#8fc7ff}
#tai details summary{cursor:pointer;color:#aab3a8}
#tai .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0}
#tai .sw{all:unset;cursor:pointer;padding:3px 10px;border-radius:12px;background:#3a4339;font-size:12px}
#tai .sw.on{background:#3f9c46}
#tai .libl div{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;border-top:1px solid #2f372e}
#tai .libl .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tai .libl .nm.cur{font-weight:700;color:#9fe39a}
#tai .libl button{all:unset;cursor:pointer;color:#aab3a8;padding:0 3px}
#tai .upd{all:unset;cursor:pointer;text-align:center;padding:7px;border-radius:8px;background:#2f6fb3;color:#fff;font-weight:600}
`;
const GRADE_VI = ['', 'Buttery', 'Clean', 'Sketchy', 'Flat', 'Cased'];
let panel = null;
const $ = s => panel.querySelector(s);
function buildPanel() {
if (panel) { panel.style.display = ''; return; }
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
panel = document.createElement('div');
panel.id = 'tai';
panel.innerHTML = `
<div class="h"><span class="dot"></span><b>AI Trails</b><button class="mn" title="">–</button></div>
<div class="b">
<div class="line"><span class="name"></span><span class="len"></span><button class="sw ren" title="">✎</button></div>
<div class="stats">
<div class="st"><small class="l-sim"></small><span class="v-sim">–</span></div>
<div class="st"><small class="l-real"></small><span class="v-real">–</span></div>
<div class="st"><small class="l-gen"></small><span class="v-gen">–</span></div>
<div class="st"><small class="l-rate"></small><span class="v-rate">–</span></div>
</div>
<button class="go"></button>
<div class="say"></div>
<button class="upd" hidden></button>
<h4 class="l-jumps"></h4><div class="jumps"></div>
<h4 class="l-last"></h4><div class="last"></div>
<h4 class="l-log"></h4><div class="log"></div>
<details><summary class="l-more"></summary>
<div class="row"><span class="l-drive"></span><button class="sw drive"></button></div>
<div class="row"><span class="l-share"></span><button class="sw shr"></button></div>
<div class="row"><span class="l-lang"></span><button class="sw lang"></button></div>
<h4 class="l-lib"></h4><div class="libl"></div>
</details>
</div>`;
document.body.appendChild(panel);
$('.go').onclick = () => { if (ses.want) stop(); else start(); };
$('.mn').onclick = () => panel.classList.toggle('min');
$('.drive').onclick = () => setAiDrive(!ses.aiDrive);
$('.shr').onclick = () => { setShare(!share.on); update(); };
$('.lang').onclick = () => { lang = lang === 'vi' ? 'en' : 'vi'; try { keep.setItem(LANG, lang); } catch { /* storage blocked */ } update(); };
$('.ren').onclick = () => { if (!ses.mem) return; const n = prompt(tx('Tên mới cho đường này:', 'A new name for this line:'), ses.mem.name); if (n && n.trim()) { ses.mem.name = n.trim().slice(0, 40); saveMem(); update(); } };
$('.upd').onclick = applyUpdate;
$('.libl').onclick = e => {
const b = e.target.closest('button'); if (!b) return;
const id = b.dataset.id, row = lib.list().find(o => o.id === id); if (!row) return;
if (b.dataset.do === 'ren') { const n = prompt(tx('Tên mới cho đường này:', 'A new name for this line:'), row.name); if (n && n.trim()) { if (ses.mem && ses.mem.id === id) { ses.mem.name = n.trim().slice(0, 40); saveMem(); } else lib.rename(id, n.trim()); } }
if (b.dataset.do === 'del' && confirm(tx(`Quên hẳn “${row.name}”? AI sẽ mất mọi thứ đã học trên đường này.`, `Forget “${row.name}” for good? The AI loses all it learned on this line.`))) { if (ses.mem && ses.mem.id === id) { stop(); closeLine(); } lib.forget(id); }
update();
};
const h = $('.h');
h.onpointerdown = e => {
if (e.target.closest('button')) return;
const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
const mv = ev => { panel.style.left = clamp(ev.clientX - dx, 0, innerWidth - 60) + 'px'; panel.style.top = clamp(ev.clientY - dy, 0, innerHeight - 30) + 'px'; panel.style.right = 'auto'; };
const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
addEventListener('pointermove', mv); addEventListener('pointerup', up);
};
panel.addEventListener('keydown', e => e.stopPropagation());
update();
}
const pts = n => (num(n) ? Math.round(n).toLocaleString('vi-VN') : '–');
function update() {
if (!panel) return;
const L = ses.learner, m = ses.mem, b = L && L.best;
const set = (s, t) => { const e = $(s); if (e.textContent !== t) e.textContent = t; };
set('.l-sim', tx('Điểm tốt nhất (mô phỏng)', 'Best points (simulation)'));
set('.l-real', tx('Lái thật tốt nhất', 'Best real ride'));
set('.l-gen', tx('Lượt học', 'Sweeps'));
set('.l-rate', tx('Thử mỗi giây', 'Tries a second'));
set('.l-jumps', tx('Trick từng cú nhảy (lượt tốt nhất)', 'Tricks of each jump (best ride)'));
set('.l-last', tx('Lượt lái thật gần nhất', 'Last real ride'));
set('.l-log', tx('Nhật ký', 'Log'));
set('.l-more', tx('Cài đặt & thư viện đường', 'Settings & library'));
set('.l-drive', tx('AI lái xe thật', 'AI rides for real'));
set('.l-share', tx('Chia sẻ video (5 phút/lần)', 'Share a video (every 5 min)'));
set('.l-lang', tx('Ngôn ngữ', 'Language'));
set('.l-lib', tx('Thư viện đường', 'Library of lines'));
$('.mn').title = tx('Thu gọn', 'Fold'); $('.ren').title = tx('Đổi tên', 'Rename');
set('.name', m ? m.name : tx('Chưa chọn đường', 'No line yet'));
set('.len', m ? `${m.line.length} m` : '');
set('.v-sim', b ? `${pts(b.game)}${b.end === 'finish' ? '' : ` · ${b.prog} m`}` : '–');
set('.v-real', m && m.realBest ? pts(m.realBest) : '–');
set('.v-gen', L ? String(L.gen) : '–');
const secs = ses.t0 ? (Date.now() - ses.t0) / 1000 : 0;
set('.v-rate', L && secs > 5 && L.running ? String(Math.round(ses.tries / secs)) : '–');
const go = $('.go');
go.textContent = ses.busy ? tx('Đang chuẩn bị…', 'Getting ready…') : ses.want ? tx('■ Dừng', '■ Stop') : tx('▶ Bắt đầu', '▶ Start');
go.classList.toggle('stop', ses.want); go.disabled = ses.busy;
$('.dot').classList.toggle('on', !!(L && L.running));
const up = $('.upd'); up.hidden = !ses.update; up.textContent = tx('⟳ Có bản mới — Cập nhật ngay', '⟳ A newer AI — update now');
for (const [s, on] of [['.drive', ses.aiDrive], ['.shr', share.on]]) { const e = $(s); e.classList.toggle('on', on); e.textContent = on ? tx('Bật', 'On') : tx('Tắt', 'Off'); }
set('.lang', lang === 'vi' ? 'Tiếng Việt' : 'English');
const J = b ? b.jl : [];
const jh = J.map((e, i) => `<div><span class="n">#${i + 1}</span><span class="t">${esc(trickText(e.got) || tx('không trick', 'no trick'))} <span class="g${e.g}">${GRADE_VI[e.g]}</span></span><span class="p">${pts(e.p)}</span></div>`).join('')
|| `<div>${tx('Chưa có cú nhảy nào.', 'No jumps yet.')}</div>`;
if ($('.jumps').innerHTML !== jh) $('.jumps').innerHTML = jh;
const d = ses.ride, last = ses.last;
const lh = d ? tx(`Đang lái: ${d.lands.length} cú nhảy, ${pts(d.game)} điểm`, `Riding: ${d.lands.length} jumps, ${pts(d.game)} points`)
: last ? tx(`${END_WORDS[last.end][0]} sau ${last.m} m, ${pts(last.game)} điểm`, `${END_WORDS[last.end][1]} after ${last.m} m, ${pts(last.game)} points`) : tx('Chưa lái lượt nào.', 'No ride yet.');
set('.last', lh);
const rows = lib.list().sort((a, b) => b.savedAt - a.savedAt);
const bh = rows.map(o => `<div><span class="nm${m && m.id === o.id ? ' cur' : ''}" title="${esc(o.id)}">${esc(o.name)}</span><span>${pts(o.game)}</span><button data-do="ren" data-id="${esc(o.id)}" title="${tx('Đổi tên', 'Rename')}">✎</button><button data-do="del" data-id="${esc(o.id)}" title="${tx('Quên đường này', 'Forget this line')}">✕</button></div>`).join('')
|| `<div>${tx('Chưa có đường nào. Đưa xe tới đầu một đường rồi bấm Bắt đầu.', 'No lines yet. Take the bike to the start of a line and press Start.')}</div>`;
if ($('.libl').innerHTML !== bh) $('.libl').innerHTML = bh;
}
const logRows = [];
Object.assign(ui, {
say(t) { if (panel) $('.say').textContent = t; },
log(html) {
const t = new Date().toTimeString().slice(0, 5);
logRows.unshift(`<div><span style="color:#7c867a">${t}</span> ${html}</div>`);
logRows.length = Math.min(logRows.length, 40);
if (panel) $('.log').innerHTML = logRows.join('');
},
update,
});
setInterval(update, 2000);
async function open() {
await keep.ready;
if (!document.body) await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true }));
buildPanel();
const n = migrateOld();
if (n) ui.log(tx(`Đã chuyển ${n} đường đã học từ bản AI cũ vào thư viện.`, `Moved ${n} lines learned by the old AI into the library.`));
ui.say(tx('Đưa xe tới đầu đường muốn học rồi bấm ▶ Bắt đầu.', 'Take the bike to the start of the line to learn and press ▶ Start.'));
keep.onError = () => ui.log(tx('<b>Không ghi được vào bộ nhớ trình duyệt.</b>', '<b>Could not write to the browser storage.</b>'));
if (window.__taiNewer) { ses.update = true; update(); }
resume();
}
window.TrailsAI = { open: buildPanel, newer() { ses.update = true; update(); }, ses, lib };
open();
})();
