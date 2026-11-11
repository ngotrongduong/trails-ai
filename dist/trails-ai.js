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
const PHYS_KINDS = ['start', 'takeoff', 'landing', 'pump', 'flat', 'berm'];
const N_MOVES = 26;          // the moves the worker knows (index 0 = none); MANUAL is on the ground, the rest in the air
const SPIN_L = 16, SPIN_R = 17, FLIP = 18, WHIP_L = 19, WHIP_R = 20, MANUAL = 21;
const FLIP_WL = 22, FLIP_WR = 23, FLIP_SL = 24, FLIP_SR = 25;
const VFREE = 17.5;
const DRILL_GOALS = {
pumps: { name: 'Pumping', pedals: false, need: 6 }, laps: { name: 'Pump track', pedals: false },
clean4: { name: 'Jumping' }, clean3: { name: 'Pump & pull' }, boost: { name: 'Boost & racer (boost)' },
racer: { name: 'Boost & racer (racer)' }, finish: { name: 'Beginner line' }, manual: { name: 'Manual', need: 2 },
whip: { name: 'Whip', need: 2 }, spin: { name: '360' }, flip: { name: 'Backflip' }, tricks: { name: 'Trick line', need: 5 },
};
const STORE = 'trailsai.v2.';
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
let t = db.transaction(OS, 'readonly');
const ks = t.objectStore(OS).getAllKeys(), vs = t.objectStore(OS).getAll();
await done(t);
ks.result.forEach((k, i) => mem.set(k, vs.result[i]));
const moved = [];
for (let i = 0; i < LS.length; i++) if (ours(LS.key(i))) moved.push(LS.key(i));
if (moved.length) {
t = db.transaction(OS, 'readwrite');
for (const k of moved) { const v = LS.getItem(k); t.objectStore(OS).put(v, k); mem.set(k, v); }
await done(t);
for (const k of moved) LS.removeItem(k);
}
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
key: i => [...mem.keys()][i] ?? null,
get length() { return mem.size; },
listen: f => { listeners.push(f); },
};
return api;
})();
const NAMES = 'trailsai.names';
const MINE = 'trailsai.mine';
const NAME_PLACE = ['Đồi', 'Dốc', 'Suối', 'Rừng', 'Đèo', 'Bãi', 'Cồn', 'Gò', 'Núi', 'Lũng', 'Ghềnh', 'Bờ', 'Trảng', 'Truông', 'Động', 'Mỏm'];
const NAME_WHAT = ['Thông', 'Gió', 'Mây', 'Sương', 'Nắng', 'Trăng', 'Cát', 'Rêu', 'Sỏi', 'Lau', 'Tre', 'Đá', 'Hoa', 'Sao', 'Mưa', 'Sóc'];
const NAME_PLACE_EN = ['Hill', 'Slope', 'Creek', 'Forest', 'Pass', 'Flat', 'Dune', 'Mound', 'Peak', 'Valley', 'Rapids', 'Bank', 'Meadow', 'Heath', 'Cave', 'Crag'];
const NAME_WHAT_EN = ['Pine', 'Wind', 'Cloud', 'Mist', 'Sun', 'Moon', 'Sand', 'Moss', 'Pebble', 'Reed', 'Bamboo', 'Stone', 'Flower', 'Star', 'Rain', 'Squirrel'];
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const LANG = 'trailsai.lang';
let lang = (() => { try { return keep.getItem(LANG) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } })();
const tx = (vi, en) => (lang === 'en' ? en : vi);
const END_EN = { 'về đích': 'finished', 'ngã': 'fell', 'đang đi': 'still riding', 'hết giờ': 'out of time', 'lạc khỏi đường': 'off the line',
'đạt mốc': 'reached the mark', 'kẹt': 'stuck', 'đứng lại': 'came to a stop', 'lỗi': 'error' };
const endWord = e => tx(e, END_EN[e] || e);
const PICK_WAIT = ['Đang tìm đường gần bạn…', 'Looking for lines near you…'], PICK_NONE = ['Không thấy điểm xuất phát nào gần đây', 'No start nearby'];
const tl = (vi, en) => `<span data-vi="${esc(vi)}" data-en="${esc(en)}">${esc(tx(vi, en))}</span>`;
const tt = (vi, en) => `title="${esc(tx(vi, en))}" data-tvi="${esc(vi)}" data-ten="${esc(en)}"`;
function relabel(root) {
for (const e of root.querySelectorAll('[data-vi]')) e.textContent = e.dataset[lang];
for (const e of root.querySelectorAll('[data-tvi]')) e.title = lang === 'en' ? e.dataset.ten : e.dataset.tvi;
}
const givenNames = () => { try { return JSON.parse(keep.getItem(NAMES) || '{}') || {}; } catch { return {}; } };
const baseId = id => String(id).split('~')[0];
function lineName(id) {
const given = givenNames()[id];
if (given) return given;
if (String(id).includes('~')) return `${lineName(baseId(id))} · ${tx('thử thách', 'challenge')}`;
const drill = /^practice-(\d+)-(\d+)$/.exec(id);
if (drill) return `${tx('Đường tập', 'Practice')} ${drill[1]}${+drill[2] ? '-' + drill[2] : ''}`;
const tr = /^training-(\w+)$/.exec(id);
if (tr && DRILL_GOALS[tr[1]]) return `Training: ${DRILL_GOALS[tr[1]].name}`;
let h = 2166136261;
for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
const p = h & 15, w = (h >>> 4) & 15, n = 10 + ((h >>> 8) % 90);
return tx(`${NAME_PLACE[p]} ${NAME_WHAT[w]} ${n}`, `${NAME_WHAT_EN[w]} ${NAME_PLACE_EN[p]} ${n}`);
}
function setLineName(id, name) {
const all = givenNames(), n = String(name).trim().slice(0, 40);
if (n) all[id] = n; else delete all[id];
try { keep.setItem(NAMES, JSON.stringify(all)); } catch { /* storage blocked */ }
}
const REPO = 'ngotrongduong/trails-ai';
const LESSONS_URL = `https://raw.githubusercontent.com/${REPO}/main/lessons/`;
const LESSON_FORMAT = 'trails-ai-lesson';
const EXPERIENCE_URL = `https://raw.githubusercontent.com/${REPO}/main/experience/jumps.json`;
const JUMPS_VERSION = 1;
const TRICK_NAMES = {
flip: 'Backflip', spin: '360', whip: 'Whip', table: 'Table', tailwhip: 'Tailwhip',
barspin: 'Barspin', tbog: 'T-bog', xup: 'X-up', manual: 'Manual',
};
const WAI = WebAssembly.instantiate.bind(WebAssembly);
const live = { ex: null, g: 0, SL: 0, drive: null, tricks: null, bike: 0, tunes: {}, spawn: null, ws: null };
const WSS = WebSocket.prototype.send;
WebSocket.prototype.send = function (data) { if (typeof data === 'string') live.ws = this; return WSS.call(this, data); };
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
px.trails_keep_spawn = (g, x, z, h, v) => { if (mine(g)) live.spawn = { x, z, heading: h, v: v || 0 }; return ex.trails_keep_spawn(g, x, z, h, v); };
px.trails_game_step = (g, ...inp) => {
if (live.drive && g === live.g) {
try { const o = live.drive.step(); if (o) inp = o; } catch (err) { live.drive = null; console.error(err); }
}
const out = ex.trails_game_step(g, ...inp);
if ((!live.drive || seen.all) && g === live.g && seen.on) { try { watchStep(inp); } catch (err) { seen.on = false; console.error(err); } }
return out;
};
live.ex = ex; live.SL = ex.trails_state_len();
return bare ? { exports: px } : { module: r.module, instance: { exports: px } };
};
const liveState = () => new Float64Array(live.ex.memory.buffer, live.ex.trails_game_state(live.g), live.SL);
const riderSetup = () => ({ tricks: live.tricks === null ? 511 : live.tricks, bike: live.bike, tunes: { ...live.tunes } });
const SEEN_W = 12, SEEN_MAX = 60 * 180;
const seen = { on: true, all: false, f: [], ev: [], seq: null, down: false, fell: -1, still: 0, done: [] };
function endRide() {
if (seen.f.length) seen.done.push({ f: seen.f, ev: seen.ev });
if (seen.done.length > 4) seen.done.shift();
seen.f = []; seen.ev = []; seen.fell = -1;
}
function watchStep(inp) {
const s = liveState();
if (s[13] > 0 && seen.down && seen.fell < 0) return;
seen.still = Math.abs(s[8]) < 0.3 && !(s[12] > 0) ? seen.still + 1 : 0;
if (seen.still === 120) endRide();
if (seen.still >= 120) return;
if (seen.f.length) { const o = seen.f.length - SEEN_W, dx = s[0] - seen.f[o], dz = s[2] - seen.f[o + 1]; if (dx * dx + dz * dz > 64) endRide(); }
const n = seen.f.length / SEEN_W;
seen.f.push(s[0], s[2], s[4], Math.abs(s[8]), s[12] > 0 ? s[12] : 0, inp[4] || 0, inp[5] || 0, inp[6] || 0, s[48] || 0, s[3], inp[0] || 0, inp[1] || 0);
if (s[16] !== seen.seq) {
if (seen.seq !== null && s[15] > 0) seen.ev.push({ n, land: s[15] | 0, a: s[14], fv: s[44] || 0, sv: s[43] || 0, wv: s[41] || 0 });
seen.seq = s[16];
}
const down = s[13] > 0;
if (down && !seen.down) { seen.ev.push({ n, crash: 1 }); seen.fell = n; }
seen.down = down;
if ((seen.fell >= 0 && n - seen.fell >= 30) || n + 1 >= SEEN_MAX) endRide();
}
const cap = { chunks: new Map(), held: new Set(), starts: [], ws: null, pose: null, poseAt: 0, levels: null, levelsAt: 0, askedAt: 0 };
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
} else if (r.t === 'levels') {
cap.levels = r; cap.levelsAt = Date.now();
} else if (r.t === 'moved' && cap.levels && cap.levels.challenges && Array.isArray(r.challenges)) {
const list = cap.levels.challenges.list || [];
for (const c of r.challenges) {
const o = c && list.find(q => q.id === c.id);
if (o) Object.assign(o, { have: c.have, need: c.need === undefined ? o.need : c.need, done: !!(c.done || o.done) });
}
}
}
function askLevels() {
const ws = cap.ws;
if (!ws || ws.readyState !== 1 || Date.now() - (cap.askedAt || 0) < 60e3) return false;
cap.askedAt = Date.now();
ws.send(JSON.stringify({ t: 'levels' }));
return true;
}
const chDefs = {};
function objectAt(t, head) {
const i = t.indexOf(head);
if (i < 0) return null;
let depth = 0, j = i, q = false;
for (; j < t.length; j++) {
const c = t[j];
if (q) { if (c === '\\') j++; else if (c === '"') q = false; continue; }
if (c === '"') q = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break;
}
try { return JSON.parse(t.slice(i, j + 1).replace(/([{,])([A-Za-z_$][\w$]*):/g, '$1"$2":').replace(/:!0\b/g, ':true').replace(/:!1\b/g, ':false')); } catch { return null; }
}
async function challengeDefs(pools) {
const miss = pools.filter(p => !(p in chDefs));
if (!miss.length) return chDefs;
const urls = [...new Set(performance.getEntriesByType('resource').map(e => e.name).filter(n => /^https:\/\/trailsthegame\.com\/assets\/[^/?]+\.js$/.test(n)))];
for (const u of urls) {
if (miss.every(p => chDefs[p])) break;
let t = '';
try { t = await (await fetch(u)).text(); } catch { continue; }
for (const p of miss) if (!chDefs[p]) { const d = objectAt(t, `{id:"${p}"`); if (d && d.rule) chDefs[p] = d; }
}
for (const p of miss) if (!chDefs[p]) chDefs[p] = null;
return chDefs;
}
const TRICK_BIT = { whip: 1, spin: 2, flip: 4, manual: 8 };
const TRICK_WORD = { whip: 'whip', spin: '360', flip: 'backflip', manual: 'manual' };
function aimOf(rule, left, stats, wayGuess) {
const r = rule || {}, f = r.feat && typeof r.feat === 'object' ? r.feat : null;
let count = typeof r.count === 'string' ? r.count : null, bike = null;
const b = count && /^bike\.([a-z0-9]+)\.(.+)$/.exec(count);
if (b) { bike = b[1]; count = b[2]; }
const need = Math.max(1, left);
let A = null;
if (count) {
if (/^creator\.|^builder\./.test(count)) return { skip: tx('cần bạn tự làm (chia sẻ, đặt tên replay hay xây đường là việc của bạn)', 'yours to do (sharing, naming replays and building lines are up to you)') };
if (count === 'og.days') return { skip: tx('chỉ cần vào game đạp xe ở những ngày khác nhau, AI không làm nhanh hơn được', 'just ride on different days: the AI cannot make that go faster') };
const side = r.way === 'other' ? (stats && stats.whipSide === 'right' ? -1 : stats && stats.whipSide === 'left' ? 1 : wayGuess || -1) : 0;
A = {
'og.moving_s': { kind: 'ride' }, 'og.jumps': { kind: 'landed' }, 'flow.landed': { kind: 'landed' },
'flow.clean': { kind: 'clean' }, 'flow.buttery': { kind: 'buttery' },
'tricks.whip': { kind: 'whip', mk: 'whip', tricks: ['whip'], way: side }, 'tricks.spin': { kind: 'spin', mk: 'spin', tricks: ['spin'] },
'tricks.flip': { kind: 'flip', mk: 'flip', tricks: ['flip'] }, 'tricks.manual_m': { kind: 'manual', mk: 'manual', tricks: ['manual'] },
}[count] || null;
if (A) A = { ...A, need, guess: r.way === 'other' && !(stats && stats.whipSide) };
} else if (f && f.in === 'manual') A = { kind: 'manual1', mk: 'manual', tricks: ['manual'], need: f.min || 1, feat: true };
else if (f && f.in === 'landing') A = { kind: f.trick || 'spin', mk: f.trick || 'spin', tricks: [f.trick || 'spin'], min: f.min, need: 1, feat: true };
else if (f && f.in === 'line') {
if (f.trick) A = { kind: f.trick, mk: f.trick, tricks: [f.trick], min: f.min, need: f.n || 1, feat: true };
else if (f.kinds) A = { kind: 'kinds', mk: 'tricks', tricks: ['whip', 'spin', 'flip'], any: f.kinds, need: f.kinds, feat: true };
else if (f.all) A = { kind: 'all', mk: 'tricks', all: f.all, tricks: f.all.slice(), need: f.all.length, feat: true };
else if (f.every) A = { kind: 'row', mk: f.every === 'any' ? 'tricks' : f.every, every: f.every === 'any' ? 'whip' : f.every, tricks: [f.every === 'any' ? 'whip' : f.every], need: f.landings || 1, feat: true };
else A = { kind: 'row', need: f.landings || 1, feat: true };
}
if (!A) return { skip: tx('AI chưa hiểu thử thách này', 'the AI does not understand this challenge yet') };
if (bike) A.bike = bike;
return { aim: A };
}
const tricksLacking = (A, mask) => {
const miss = (A.tricks || []).filter(k => !(mask & TRICK_BIT[k]));
return A.any ? ((A.tricks.length - miss.length) >= A.any ? [] : miss) : miss;
};
const aimKey = A => `${A.kind}${A.every || ''}${A.min || ''}${A.way ? (A.way > 0 ? 'R' : 'L') : ''}${A.feat ? A.need : ''}`;
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
if (!a.wasm) throw new Error(tx('Không thấy file vật lý của game. Hãy tải lại trang game rồi mở AI lại.', "The game's physics file was not found. Reload the game's page, then open the AI again."));
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
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
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
const layouts = new WeakMap();
function layOf(e, p) {
if (!layouts.has(p)) { let lay = null; try { lay = e.layout(p); } catch { lay = null; } layouts.set(p, lay); }
return layouts.get(p);
}
async function buildRoute(start, src, land, back) {
const e = await engine();
const all = src || [...cap.chunks.values()].flat();
const near = all.filter(p => e.kidx[p.kind] !== undefined && Math.hypot(p.x - start.x, p.z - start.z) < 2500);
const segs = [];
for (const p of near) {
if (!PHYS_KINDS.includes(p.kind)) continue;
let lay;
try { lay = src || land !== undefined ? e.layout(p, land) : layOf(e, p); } catch { continue; }
if (!lay || !lay.path || lay.path.length < 2) continue;
const pts = lay.path.map(q => [q[1], q[2]]);
const ro = lay.runOut || lay.exit;
const li = lay.leadIn || [p.x, p.z, p.heading];
segs.push({ p, pts, end: [ro[0], ro[1], ro[2]], lead: [li[0], li[1], li[2]] });
}
let cur = null, best = 6;
for (const s of segs) {
for (let i = 1; i < s.pts.length; i++) {
const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
const t = Math.max(0, Math.min(1, ((start.x - ax) * dx + (start.z - az) * dz) / L2));
const d = Math.hypot(start.x - (ax + dx * t), start.z - (az + dz * t));
const hd = Math.abs(wrapA(Math.atan2(dz, dx) + (back ? Math.PI : 0) - start.heading));
if (d + hd * 2 < best) { best = d + hd * 2; cur = s; }
}
}
if (!cur) return null;
const chain = [];
const used = new Set();
let gapAfter = [];
while (cur && chain.length < 600) {
chain.push(cur); used.add(cur);
let nxt = null, score = Infinity;
for (const s of segs) {
if (used.has(s)) continue;
const a = back ? s : cur, b = back ? cur : s;
const [ex, ez, eh] = a.end, jump = a.p.kind === 'takeoff';
const [lx, lz, lh] = b.lead;
const dx = lx - ex, dz = lz - ez;
const f = dx * Math.cos(eh) + dz * Math.sin(eh);
const lat = -dx * Math.sin(eh) + dz * Math.cos(eh);
const dh = Math.abs(wrapA(lh - eh));
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
const t = ((lx - ax) * dx + (lz - az) * dz) / L;
const off = Math.abs((lz - az) * dx - (lx - ax) * dz) / L;
if (t >= 0 && t <= L && off < 1.5 && Math.abs(wrapA(lh - Math.atan2(dz, dx))) < 0.65 && run + t > 1 && run + t < along) { along = run + t; on = s; }
run += L;
}
}
if (on) { cur.cut = along; nxt = on; }
}
gapAfter.push(nxt && (back ? nxt : cur).p.kind === 'takeoff' ? 1 : 0);
cur = nxt;
}
const raw = [];
let hx = 0, hz = 0, hh = null;
const add = (x, z, kd, h) => {
if (src && hh !== null && (x - hx) * Math.cos(hh) + (z - hz) * Math.sin(hh) < 0.2) return;
if (hh !== null || src) { hh = h !== undefined ? h : raw.length ? Math.atan2(z - hz, x - hx) : 0; }
hx = x; hz = z; raw.push([x, z, kd, hw]);
};
let hw = 0;
let n0 = 0;
const flip = { takeoff: 'landing', landing: 'takeoff' };
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
add(s.end[0], s.end[1], gapAfter[ci] ? 'air' : s.p.kind, s.end[2]);
}
if (!ci) n0 = raw.length;
});
let k0 = 0, d0 = Infinity;
raw.forEach((q, i) => { const d = Math.hypot(q[0] - start.x, q[1] - start.z); if ((i < n0 || !src) && d < d0) { d0 = d; k0 = i; } });
const { X, Z, KIND, W } = resample(raw, k0);
if (X.length < 20) return null;
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
X, Z, KIND, W, length: X.length, pieces, kinds,
};
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
const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 2) { w = s.hw; break; }
}
}
return w;
});
}
const ONWARD_GAP = 60, ONWARD_R = 2.5;
function joinCurve(ex, ez, eh, x, z, h) {
const d = Math.hypot(x - ex, z - ez);
let best = null;
for (const k of [0.5, 0.8, 1.1, 1.5]) {
const L = Math.max(3, d * k), P = [[ex, ez]];
let px = ex, pz = ez, run = 0;
for (let i = 1; i <= 400; i++) {
const t = i / 400, t2 = t * t, t3 = t2 * t, a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, e = t3 - t2;
const qx = a * ex + b * L * Math.cos(eh) + c * x + e * L * Math.cos(h), qz = a * ez + b * L * Math.sin(eh) + c * z + e * L * Math.sin(h);
run += Math.hypot(qx - px, qz - pz); px = qx; pz = qz;
if (run >= 1) { P.push([qx, qz]); run -= 1; }
}
if (Math.hypot(x - P[P.length - 1][0], z - P[P.length - 1][1]) > 0.3) P.push([x, z]);
let rmin = Infinity, turn = 0;
for (let i = 2; i < P.length; i++) {
const da = Math.abs(wrapA(Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]) - Math.atan2(P[i - 1][1] - P[i - 2][1], P[i - 1][0] - P[i - 2][0])));
turn += da; if (da > 1e-6) rmin = Math.min(rmin, Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) / da);
}
if (!best || rmin > best.rmin * 1.15 || (rmin > best.rmin * 0.87 && P.length < best.P.length)) best = { P, rmin, turn };
}
return best;
}
function piecesNear(X, Z) {
const out = [];
for (const p of [...cap.chunks.values()].flat()) {
const r = p.kind === 'shape' || p.kind === 'ground' ? 70 : 35;
for (let i = 0; i < X.length; i += 3) if (Math.hypot(p.x - X[i], p.z - Z[i]) < r) { out.push(p); break; }
}
return out;
}
const ONWARD_CROSS = 30, ONWARD_RUN = 25;
async function onwardChoices(R, seen, max, o) {
const N = R.length, prof = o && o.prof, from = o ? Math.max(0, o.from | 0) : N - 1;
const headAt = i => { const a = Math.max(0, i === N - 1 ? N - 6 : i - 3), b = Math.min(N - 1, Math.max(a + 1, i === N - 1 ? i : i + 3)); return Math.atan2(R.Z[b] - R.Z[a], R.X[b] - R.X[a]); };
const onGround = i => i >= 2 && i < N - 2 && !['takeoff', 'landing', 'air'].includes(R.KIND && R.KIND[i]) && [-2, -1, 0, 1, 2].every(k => !prof.air[i + k]);
const exits = prof && prof.prog < N - 5 ? [] : [{ i: N - 1, x: R.X[N - 1], z: R.Z[N - 1], h: headAt(N - 1), gap: ONWARD_GAP }];
if (prof) for (let i = from; i < Math.min(N - 8, prof.prog - 5); i += 5) if (onGround(i)) exits.push({ i, x: R.X[i], z: R.Z[i], h: headAt(i), gap: ONWARD_CROSS });
const e = await engine(), cands = [];
for (const p of [...cap.chunks.values()].flat()) {
if (!PHYS_KINDS.includes(p.kind) || e.kidx[p.kind] === undefined || !exits.some(x => Math.hypot(p.x - x.x, p.z - x.z) <= x.gap + 30)) continue;
const lay = layOf(e, p);
if (!lay || !lay.path || lay.path.length < 2) continue;
for (const back of [false, true]) {
const c = [null, null];
for (let i = 1; i < lay.path.length; i++) {
const ax = lay.path[i - 1][1], az = lay.path[i - 1][2], bx = lay.path[i][1], bz = lay.path[i][2];
const h = Math.atan2(bz - az, bx - ax) + (back ? Math.PI : 0), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
for (let q = 0; q <= n; q++) {
const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n;
if (seen(x, z)) continue;
for (const xt of exits) {
const d = Math.hypot(x - xt.x, z - xt.z);
if (d < 3 || d > xt.gap) continue;
const b = Math.atan2(z - xt.z, x - xt.x), guess = d + 6 * (Math.abs(wrapA(b - xt.h)) + Math.abs(wrapA(h - b))) + (back ? 5 : 0), w = xt.i === N - 1 ? 0 : 1;
if (!c[w] || guess < c[w].guess) c[w] = { x, z, h, guess, back, xt };
}
}
}
for (const q of c) if (q) cands.push(q);
}
}
cands.sort((a, b) => a.guess - b.guess);
const out = [];
for (const c of cands.slice(0, 60)) {
const j = joinCurve(c.xt.x, c.xt.z, c.xt.h, c.x, c.z, c.h);
if (j.rmin >= ONWARD_R) c.j = j;
}
const ok = cands.filter(c => c.j).sort((a, b) => (a.j.P.length + 5 * a.j.turn) - (b.j.P.length + 5 * b.j.turn));
for (const c of ok.slice(0, 20)) {
const r = await buildRoute({ id: 'onward', x: c.x, z: c.z, heading: c.h }, undefined, undefined, c.back);
if (!r || r.length < 25) continue;
let old = 0, n = 0;
for (let i = 0; i < r.length; i += 4, n++) if (seen(r.X[i], r.Z[i])) old++;
if (old > n * 0.3) continue;
const cells = new Set();
for (let i = 0; i < r.length; i += 2) cells.add(Math.round(r.X[i] / 3) + ',' + Math.round(r.Z[i] / 3));
const P = c.j.P.slice(0, -1), xi = c.xt.i;
let at = xi;
if (prof && xi - from >= 8) {
for (let i = Math.max(from, xi - ONWARD_RUN); i <= xi - 8; i++) if (onGround(i)) { at = i; break; }
if (at === xi) for (let i = Math.max(from, xi - ONWARD_RUN) - 1; i >= from && i >= xi - 2 * ONWARD_RUN; i--) if (onGround(i)) { at = i; break; }
}
r.join = P.length; r.cells = cells; r.back = c.back; r.turn = Math.round(c.j.turn * 180 / Math.PI);
r.at = at; r.exit = xi; r.lead = xi - at; r.cross = xi < N - 1;
r.score = r.length - 0.5 * r.join - 8 * c.j.turn - (c.back && r.kinds.takeoff ? 150 : 0);
const twin = out.find(o => { let s = 0; for (const q of cells) if (o.cells.has(q)) s++; return s > cells.size * 0.5; });
if (twin) { if (twin.score >= r.score) continue; out.splice(out.indexOf(twin), 1); }
const RX = Array.from(R.X).slice(at, xi), RZ = Array.from(R.Z).slice(at, xi), JX = P.map(q => q[0]), JZ = P.map(q => q[1]);
r.X = RX.concat(JX, Array.from(r.X)); r.Z = RZ.concat(JZ, Array.from(r.Z));
r.KIND = (R.KIND ? Array.from(R.KIND).slice(at, xi) : RX.map(() => 'flat')).concat(P.map(() => 'flat'), Array.from(r.KIND)); r.length = r.X.length;
if (r.W) r.W = (R.W ? Array.from(R.W).slice(at, xi) : RX.map(() => 0)).concat(P.map(() => 0), Array.from(r.W));
const have = new Set(r.pieces);
for (const p of piecesNear(RX.concat(JX), RZ.concat(JZ))) if (!have.has(p)) { have.add(p); r.pieces.push(p); }
r.start = { id: 'onward', x: R.X[at], z: R.Z[at], heading: headAt(at) };
if (prof && prof.v[at] >= 0) r.start.v = prof.v[at];
out.push(r);
}
return out.sort((a, b) => b.score - a.score).slice(0, max);
}
function profileOf(run, N) {
if (!run || !run.trace) return null;
const tr = run.trace.tr, v = new Float32Array(N).fill(-1), air = new Uint8Array(N);
for (let i = 0; i < tr.length; i += 5) {
const j = Math.max(0, Math.min(N - 1, Math.floor(tr[i])));
if (v[j] < 0) v[j] = tr[i + 4];
if (tr[i + 3]) air[j] = 1;
}
for (let j = 1; j < N; j++) if (v[j] < 0) v[j] = v[j - 1];
return { v, air, prog: run.prog };
}
const HERE_RUN = 40;
async function lineHere(me) {
const e = await engine();
let c = null;
for (const p of [...cap.chunks.values()].flat()) {
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
let x = c.x, z = c.z, h = c.h, lead = 0, back = c.back;
const rb = await buildRoute({ id: 'back', x: c.x, z: c.z, heading: wrapA(c.h + Math.PI) }, undefined, undefined, !c.back);
if (rb) {
let k = 0;
while (k + 1 < Math.min(rb.length, HERE_RUN + 1) && !['takeoff', 'landing', 'air', 'start'].includes(rb.KIND[k + 1])) k++;
const gate = rb.KIND[k + 1] === 'start' && cap.starts
.filter(o => Math.hypot(o.x - rb.X[k + 1], o.z - rb.Z[k + 1]) < 25 && Math.abs(wrapA(o.heading - c.h)) < 0.6)
.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
if (gate) { x = gate.x; z = gate.z; h = gate.heading; back = false; lead = Math.round(Math.hypot(gate.x - c.x, gate.z - c.z)); }
else if (k >= 3) { x = rb.X[k]; z = rb.Z[k]; h = Math.atan2(rb.Z[k - 1] - rb.Z[k], rb.X[k - 1] - rb.X[k]); lead = k; }
}
const s = { id: `here-${Math.round(x)}_${Math.round(z)}_${back ? 'b' : 'f'}`, x, z, heading: h, back };
const r = await buildRoute(s, undefined, undefined, s.back);
return r && r.length >= 25 ? { s, r, lead } : null;
}
async function nextLine(R, seen) { return (await onwardChoices(R, seen, 1))[0] || null; }
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
const TOUR_LEGS = 6, TOUR_MAX = 1500;
async function extendRoute(route) {
if (route.practice || route.tour !== undefined) return route;
const g = ground();
let X = Array.from(route.X), Z = Array.from(route.Z), KIND = Array.from(route.KIND), W = route.W ? Array.from(route.W) : null, legs = 0;
const pieces = route.pieces.slice(), kinds = { ...route.kinds }, have = new Set(pieces.map(p => p.kind + p.x + ',' + p.z));
g.mark(route);
while (legs < TOUR_LEGS && X.length < TOUR_MAX) {
const r = await nextLine({ X, Z, length: X.length }, g.seen);
if (!r) break;
const ex = X[X.length - 1], ez = Z[Z.length - 1], from = Math.hypot(r.X[0] - ex, r.Z[0] - ez) < 0.5 ? 1 : 0;
X = X.concat(Array.from(r.X).slice(from)); Z = Z.concat(Array.from(r.Z).slice(from)); KIND = KIND.concat(Array.from(r.KIND).slice(from));
W = W && r.W ? W.concat(Array.from(r.W).slice(from)) : null;
for (const p of r.pieces) { const key = p.kind + p.x + ',' + p.z; if (!have.has(key)) { have.add(key); pieces.push(p); } }
for (const [k, n] of Object.entries(r.kinds || {})) kinds[k] = (kinds[k] || 0) + n;
g.mark(r); legs++;
}
return { ...route, X, Z, KIND, W: W && W.length === X.length ? W : undefined, length: X.length, pieces, kinds, tour: legs };
}
const PRACTICE_LAND = [1, 0.06, 9100, 9500], FLAT_LAND = [1, 0, 0, 0], PRACTICE_PIECES = 26;
function practicePieces(rnd, hard = 0) {
const R = (a, b) => a + rnd() * (b - a), I = (a, b) => Math.floor(R(a, b + 1));
const out = [{ kind: 'start', p: { height: R(3.6, 5), deck: 4, back: 8, width: 3.2 } }, { kind: 'flat', p: { len: R(6, 10), width: 2.8 } }];
let level = 0, turn = 0;
const takeoff = () => ({ kind: 'takeoff', p: { radius: R(6.5 - 2.5 * hard, 11 - 3 * hard), length: R(3.4, 4.6 + 2 * hard), width: 2.4, base: 3.2, height: level } });
const landing = (drop, o = {}) => { drop = Math.min(drop, 4 + level); const p = { kind: 'landing', p: { radius: R(18, 25), width: 4, height: level - drop }, carry: true, ...o }; level -= drop; return p; };
const inRow = 3 + Math.round(2 * hard);
const back = () => {
if (level < -0.1) out.push({ kind: 'pump', p: { len: R(12, 16), start: level, peak: level / 2, end: 0, width: 2.8 } });
level = 0;
out.push({ kind: 'flat', p: { len: R(3, 8), width: 2.8 } });
};
while (out.length < PRACTICE_PIECES) {
const pick = rnd(), jumps = 0.65 + 0.15 * hard;
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
if (out.length > 3 && out.slice(-2 * inRow).filter(p => p.kind === 'landing').length >= inRow) back();
}
back();
out.push({ kind: 'flat', p: { len: 15, width: 2.8 } });
return out;
}
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
if (u > 0 && raw.length) raw[raw.length - 1][2] = 'air';
for (const q of lay.path) raw.push([q[1], q[2], h.kind]);
raw.push([lay.exit[0], lay.exit[1], h.kind]);
if (!n0) n0 = raw.length;
pieces.push(f); kinds[h.kind] = (kinds[h.kind] || 0) + 1;
r = { x: lay.exit[0], z: lay.exit[1], heading: lay.exit[2], height: lay.exit[3] };
}
const ahead = q => (q[0] - spawn.x) * Math.cos(spawn.heading) + (q[1] - spawn.z) * Math.sin(spawn.heading) > 0.5;
let k0 = 0;
while (k0 < n0 && !ahead(raw[k0])) k0++;
const { X, Z, KIND } = resample([[spawn.x, spawn.z, 'start']].concat(raw.slice(k0)), 0);
return {
start: { id: `practice-${seed}-${lane}`, x: spawn.x, z: spawn.z, heading: spawn.heading },
X, Z, KIND, length: X.length, pieces, kinds, land: PRACTICE_LAND, practice: true,
};
}
async function trainingWorld() {
if (!live.ex || !live.g) return null;
const e = await engine(), ex = live.ex, sz = ex.trails_world_sizes(), FF = sz & 65535, HL = sz >>> 16 || 5;
const p = ex.trails_world_flat(live.g, 0);
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
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const MOVES = [null, { b: 16 }, { b: 32 }, { b: 48 }, { b: 24 }, { b: 40 }, { b: 8 }, { b: 4, ln: -1 }, { b: 4, ln: 1 }, { w: 1 }, { w: -1 }, { b: 64, st: 1 }, { st: 1 }, { st: -1 }, { b: 8, st: 1 }, { b: 12, ln: -1 },
{ spin: -1 }, { spin: 1 }, { flip: 1 }, { wt: -1 }, { wt: 1 }, { man: 1 },
{ flip: 1, wt: -1 }, { flip: 1, wt: 1 }, { flip: 1, spin: -1 }, { flip: 1, spin: 1 }];
const PUMP0 = [0.1, 0.2];
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
function aimGoal(A, x) {
const L = (x.jl || []).filter(e => !(x.crashT >= 0 && typeof e.t === 'number' && e.t > x.crashT - 30));
const way = e => !A.way || (A.way > 0 ? e.wv > 0 : e.wv < 0);
const has = (e, k) => (e.wv === undefined ? !A.way && !!(e.tr & (k === 'whip' ? 4 : k === 'spin' ? 2 : 1))
: k === 'whip' ? Math.abs(e.wv) >= 45 && way(e) : k === 'spin' ? Math.abs(e.sv) >= Math.max(300, A.min || 0) : Math.abs(e.fv) >= Math.max(270, A.min || 0));
let n = 0;
if (A.kind === 'whip' || A.kind === 'spin' || A.kind === 'flip') n = L.filter(e => has(e, A.kind)).length;
else if (A.kind === 'row') {
if (A.every) { let r = 0; for (const e of L) { r = has(e, A.every) ? r + 1 : 0; n = Math.max(n, r); } } else n = L.length;
} else if (A.kind === 'kinds') n = ['whip', 'spin', 'flip'].filter(k => L.some(e => has(e, k))).length;
else if (A.kind === 'all') n = A.all.filter(k => L.some(e => has(e, k))).length;
else if (A.kind === 'manual') n = x.manOk || 0;
else if (A.kind === 'manual1') n = x.manLong || 0;
else if (A.kind === 'ride') n = x.moving || 0;
else if (A.kind === 'clean') n = L.filter(e => e.g === 1 || e.g === 2).length;
else if (A.kind === 'buttery') n = L.filter(e => e.g === 1).length;
else n = L.length;
return { n: +Math.min(A.need, n).toFixed(2), need: A.need };
}
const GRADE_NAMES = ['', 'Buttery', 'Clean', 'Sketchy', 'Flat', 'Cased'];
const gradeCount = c => c.map((n, g) => (g && n ? `${n} ${GRADE_NAMES[g]}` : '')).filter(Boolean).join(', ') || tx('chưa có cú nhảy nào', 'no jumps yet');
const deg = r => Math.round(Math.abs(r) * 180 / Math.PI);
function landingTip(e, fits) {
if (e.g >= 4 && e.h < 0.5) return tx('Bị nảy khỏi mô rồi rơi xấu: qua đoạn này nên ép xe giữ bánh sát đất (pump) thay vì bay. Rơi xấu làm mất chuỗi nhân.', 'Bounced off a bump and came down badly: pump through here to keep the wheels on the ground instead of flying. A bad landing ends the streak.');
if (e.g === 5) return tx('Bay hụt, chạm mép hoặc mặt bằng trước dốc đáp: cần lấy đà nhanh hơn. Cased làm mất chuỗi nhân.', 'Came up short onto the lip or the flat before the landing: needs more speed. Cased ends the streak.');
if (e.g === 4) return tx('Rơi xuống chỗ bằng: bay quá xa (hoặc không có dốc đáp). Flat làm mất chuỗi nhân.', 'Came down on the flat: flew too far (or there is no landing). Flat ends the streak.');
if (e.g === 3) return e.dp < -0.12 ? tx(`Chúc đầu ${deg(e.dp)}° so với dốc đáp: giữ đầu xe ngẩng hơn.`, `Nose ${deg(e.dp)}° too far down for the landing: hold the front higher.`)
: e.dp > 0.12 ? tx(`Ngẩng đầu ${deg(e.dp)}° so với dốc đáp: hạ đầu xe theo dốc.`, `Nose ${deg(e.dp)}° too far up for the landing: bring the front down with the slope.`)
: tx('Chạm đất hơi mạnh: cần khớp dốc đáp hơn.', 'Landed a little hard: match the landing better.');
if (!e.tr) { const ok = fits.filter(f => e.a >= f.min).map(f => f.name); if (ok.length) return tx(`Bay đủ lâu cho ${ok.join(' hoặc ')} (theo sổ tay trick).`, `Enough air for ${ok.join(' or ')} (by the trick book).`); }
return '';
}
const trickWords = (tr, turn) =>[tr & 1 ? 'Backflip' : '', tr & 2 ? `Spin ${turn}` : '', tr & 4 ? 'Whip' : ''].filter(Boolean).join(' + ');
function makeRider(R, H, S, P) {
const N = R.length;
const me = { P, idx: 0, sec: 0, airSec: 0, off: 0, landed: false, wasAir: false, prevP: null, rot: 0, let: false, inp: [0, 0, 0, 0, 0, 0, 0],
py: 0, pat: 0, lt: -1, pa: false, vy: null, va: 0, ay: null, gOff: 0, la: -1 };
const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
const hAt = u => { const i = clamp(Math.floor(u), 0, N - 2), f = clamp(u - i, 0, 1); return H[i] + (H[i + 1] - H[i]) * f; };
const slopeAt = u => { const i = clamp(Math.round(u), 2, N - 3); return Math.atan2(H[i + 2] - H[i - 2], 4); };
const vAt = (P, k, i) => { const q = P.vs && P.vs[k]; return q && q.length ? q[Math.min(q.length - 1, Math.max(0, Math.floor((i - S[k].a) * q.length / (S[k].b - S[k].a + 1))))] : P.v[k]; };
const near = (bx, bz) => {
let bi = me.idx, bd = Infinity;
for (let i = Math.max(0, me.idx - 4); i < Math.min(N, me.idx + 45); i++) { const d = (R.X[i] - bx) ** 2 + (R.Z[i] - bz) ** 2; if (d < bd) { bd = d; bi = i; } }
return [bi, bd];
};
me.peek = s => near(s[0], s[2])[0];
me.step = (s, t) => {
const P = me.P;
const bx = s[0], by = s[1], bz = s[2], bh = s[3], sp = s[8], air = s[12] > 0;
if (me.prevP === null) me.prevP = s[4];
const [bi, bd] = near(bx, bz);
me.idx = bi;
while (me.sec < S.length - 1 && me.idx > S[me.sec].b) me.sec++;
me.off = Math.sqrt(bd);
{ const j = Math.min(N - 2, bi), dx = R.X[j + 1] - R.X[j], dz = R.Z[j + 1] - R.Z[j];
me.at = j + clamp(((bx - R.X[j]) * dx + (bz - R.Z[j]) * dz) / (dx * dx + dz * dz || 1), -0.5, 1.5); }
if (air && !me.wasAir) {
me.airSec = me.sec; me.rot = 0; me.let = false; me.p0 = s[4];
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
if (me.lt >= 0 && t > me.lt) {
const dt = (t - me.lt) / 60, vy = (by - me.py) / dt;
if (air && me.pa && me.vy !== null) { const a = (vy - me.vy) / dt; me.ay = me.ay === null ? a : me.ay + 0.25 * (a - me.ay); }
me.vy = vy; me.va = (me.at - me.pat) / dt;
}
if (!air) { me.ay = null; me.gOff = by - hAt(me.at); }
me.py = by; me.pat = me.at; me.lt = t; me.pa = air;
if (!air) {
const va = vAt(P, sec, idx), e = va - sp, pm = s[4] < -0.15 ? 0.4 : 1;
if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4 && va < VFREE) brake = Math.min(1, -e * 0.5);
if (P.pl && P.pl[sec] > 0 && R.KIND[idx] === 'takeoff' && idx >= S[sec].b - P.pl[sec]) btn |= 1;
if (P.pu && P.pu[sec] > 0 && R.KIND[idx] !== 'start') {
if (P.pz && R.PZ) { const pk = P.pk || PUMP0, u = me.at; if (R.PZ.some(z => u >= z[0] + pk[0] && u <= z[1] + pk[1])) pump = P.pu[sec]; }
else if ((H[look(1)] - H[look(3)]) / 2 > 0.03) pump = P.pu[sec];
}
const gm = MOVES[P.mv[sec] | 0];
if (gm && R.KIND[idx] === 'takeoff') { if (gm.spin) whip = gm.spin; if (gm.flip) { pedal = 1; brake = 0; } }
if (gm && gm.man && R.KIND[idx] !== 'takeoff' && !(s[46] > 0 && s[47] >= 0)) btn |= 1;
if (P.lg && P.lg[sec]) lean = P.lg[sec];
} else {
const dp = wrapA(s[4] - me.prevP) * 30;
me.rot += wrapA(s[4] - me.prevP);
let aim = P.pt[me.airSec];
const flyOn = () => {
if (me.vy === null) return null;
const ay = me.ay === null ? -9.8 : clamp(me.ay, -16, -3), h = 1 / 30;
let y = by, u = me.at, vy = me.vy;
for (let k = 0; k < 450; k++) { vy += ay * h; y += vy * h; u += me.va * h; if (u > N - 3) return null; if (vy < 0 && y - me.gOff <= hAt(u)) return [u, (k + 1) * h]; }
return null;
};
if (P.lp && typeof P.lp[me.airSec] === 'number') {
const f = flyOn();
if (f) { aim += clamp(slopeAt(f[0]) - P.lp[me.airSec], -0.35, 0.35); me.la = f[0]; }
}
lean = clamp(2.2 * (s[4] - aim) + 0.35 * dp, -1, 1);
me.aim = aim;
const mv = MOVES[P.mv[me.airSec] | 0];
const sa = P.sa ? P.sa[me.airSec] || 0 : 0;
if (sa && !(mv && mv.spin && Math.abs(s[48]) < 340)) st = clamp(sa * (2.2 * e1 + 0.6 * e2), -1, 1);
if (mv && (mv.spin || mv.flip || mv.wt)) {
let free = false, pull = 0;
if (mv.spin) {
const a = Math.abs(s[48]);
if (a >= P.hr[me.airSec] * 100) me.let = true;
if (!me.let) whip = mv.spin;
if (a > 5 && a < 320) free = true;
}
const f = mv.flip && s[12] > 0.3 && me.rot > -0.6 ? flyOn() : null, long = f && s[12] + f[1] > 3;
if (long) {
const rem = aim + 2 * Math.PI - (me.p0 + me.rot);
if (rem > 0.4) {
free = true;
const need = (rem - 0.2) / Math.max(0.25, f[1] - 1.5);
if (dp < need) pull = clamp(-0.8 * (need - dp), -1, 0);
}
} else if (mv.flip && me.rot > -0.6 && me.rot < 5) free = true;
if (mv.wt && s[12] < P.hr[me.airSec] * 0.25) whip = mv.wt;
if (free) lean = pull;
} else if (mv && !mv.man) {
const gnd = Math.max(H[look(3)], H[look(8)]);
if (s[12] > 0.1 && by - gnd > P.hr[me.airSec]) { btn = mv.b || 0; if (mv.ln !== undefined) lean = mv.ln; if (mv.st) st = mv.st; if (mv.w) whip = mv.w; }
}
}
me.prevP = s[4];
me.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, Math.round(whip * 127)];
me.want = air ? [0, 0, 0, me.aim, 1, P.sa ? P.sa[me.airSec] || 0 : 0] : [vAt(P, sec, idx), btn & 1, pump, 0, 0, 0];
}
return me.inp;
};
me.save = () => { const o = {}; for (const k in me) if (k !== 'P' && typeof me[k] !== 'function') o[k] = Array.isArray(me[k]) ? me[k].slice() : me[k]; return o; };
me.load = o => { for (const k in o) me[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; };
return me;
}
const BRAIN = { inp: 28, hid: 32, out: 5 };
BRAIN.size = BRAIN.inp * BRAIN.hid + BRAIN.hid * BRAIN.out + BRAIN.out;
const brainSpeed = o => 8 + (o > 0 ? 10 : 6) * o, speedOut = v => (v > 8 ? (v - 8) / 10 : (v - 8) / 6), BRAIN_TILT = 0.8;
function makeBrainRider(R, H, w) {
const N = R.length, NI = 28, NH = 32, NO = 5, AHEAD = [2, 4, 6, 8, 11, 14, 18, 22, 27, 33];
let nextTake = R.nextTake, nextLand = R.nextLand;
if (!nextTake) {
nextTake = new Int32Array(N).fill(-1); nextLand = new Int32Array(N).fill(-1);
let a = -1, b = -1;
for (let i = N - 1; i >= 0; i--) { if (R.KIND[i] === 'takeoff') a = i; if (R.KIND[i] === 'landing') b = i; nextTake[i] = a; nextLand[i] = b; }
}
const me = { idx: 0, sec: 0, airSec: 0, off: 0, landed: false, wasAir: false, prevP: null, prevY: null, vy: 0, landPt: 0, inp: [0, 0, 0, 0, 0, 0, 0] };
const x = new Float64Array(NI), h = new Float64Array(NH), o = new Float64Array(NO), W2 = NI * NH, B2 = W2 + NH * NO;
const look = d => Math.min(N - 1, me.idx + Math.max(1, Math.round(d)));
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
x[0] = sp / 10; x[1] = s[4]; x[2] = clamp(dp / 3, -3, 3); x[3] = air ? 1 : 0; x[4] = clamp(me.vy / 5, -3, 3); x[5] = clamp((by - gy) / 3, -2, 3);
for (let k = 0; k < 10; k++) x[6 + k] = clamp((H[look(AHEAD[k])] - gy) / 3, -3, 3);
x[16] = nt < 0 ? 1 : Math.min(1, (nt - idx) / 30);
x[17] = air ? me.landPt : nt >= 0 ? landSlope(nt) : 0;
x[18] = R.KIND[idx] === 'takeoff' ? 1 : 0; x[19] = R.KIND[idx] === 'landing' ? 1 : 0; x[20] = R.KIND[idx] === 'pump' ? 1 : 0; x[21] = 1;
const j = Math.min(N - 2, idx), dx = R.X[j + 1] - R.X[j], dz = R.Z[j + 1] - R.Z[j];
const hd = i => Math.atan2(R.Z[Math.min(N - 1, i + 2)] - R.Z[i], R.X[Math.min(N - 1, i + 2)] - R.X[i]);
x[22] = clamp(e1, -2, 2); x[23] = clamp(e2, -2, 2); x[24] = clamp(wrapA(hd(look(30)) - hd(look(10))), -2, 2);
x[25] = clamp(((bz - R.Z[j]) * dx - (bx - R.X[j]) * dz) / (Math.hypot(dx, dz) || 1) / 2, -3, 3);
x[26] = clamp(s[12] / 1.5, 0, 2); x[27] = nextLand[idx] < 0 ? 1 : Math.min(1, (nextLand[idx] - idx) / 30);
if (!w) { me.prevP = s[4]; me.seen = true; return me.inp; }
me.seen = false;
for (let j = 0; j < NH; j++) { let a = 0; for (let i = 0; i < NI; i++) a += x[i] * w[i * NH + j]; h[j] = Math.tanh(a); }
for (let k = 0; k < NO; k++) { let a = w[B2 + k]; for (let j = 0; j < NH; j++) a += h[j] * w[W2 + j * NO + k]; o[k] = Math.tanh(a); }
if (!air) {
const va = brainSpeed(o[0]), e = va - sp, pm = s[4] < -0.15 ? 0.4 : 1;
if (e > 0) pedal = Math.min(pm, e * 0.7 + 0.15); else if (e < -0.4 && va < VFREE) brake = Math.min(1, -e * 0.5);
if (o[1] > 0.5) btn |= 1;
if (o[2] > 0) pump = o[2];
} else {
lean = clamp(2.2 * (s[4] - (me.landPt + BRAIN_TILT * o[3])) + 0.35 * dp, -1, 1);
if (o[4] > 0) st = clamp(o[4] * (2.2 * e1 + 0.6 * e2), -1, 1);
}
me.prevP = s[4];
me.inp = [Math.round(pedal * 127), Math.round(brake * 127), Math.round(st * 127), Math.round(lean * 127), Math.round(pump * 127), btn, 0];
}
return me.inp;
};
me.x = x; me.o = o;
return me;
}
const BRAIN_ROW = BRAIN.inp + 7;
async function fitBrain(w, rows, epochs = 40) {
const NI = BRAIN.inp, NH = BRAIN.hid, NO = BRAIN.out, W2 = NI * NH, B2 = W2 + NH * NO, RW = BRAIN_ROW, n = rows.length / RW | 0;
const at = v => Math.atanh(clamp(v, -0.95, 0.95));
const T = new Float64Array(n * NO), M = new Float64Array(n * NO);
let pulls = 0;
for (let r = 0; r < n; r++) if (!(rows[r * RW + NI + 4] > 0) && rows[r * RW + NI + 1] > 0) pulls++;
const pullW = clamp((n - pulls) / Math.max(1, pulls) / 4, 1, 8);
for (let r = 0; r < n; r++) {
const q = r * RW + NI, air = rows[q + 4] > 0;
if (air) {
T[r * NO + 3] = at((rows[q + 3] - rows[q + 6]) / BRAIN_TILT); M[r * NO + 3] = 1;
T[r * NO + 4] = rows[q + 5] > 0 ? at(rows[q + 5]) : -0.5; M[r * NO + 4] = 1;
continue;
}
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
function freshBrain() {
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const w = new Array(BRAIN.size).fill(0);
for (let i = 0; i < BRAIN.inp * BRAIN.hid; i++) { const u = rnd() || 1e-9, v = rnd(); w[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.6; }
return w;
}
const workerSrc = `
'use strict';
let l,SL,K,kidx,FF,fmt;
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
{const d=Math.hypot(R.X[0]-R.start.x,R.Z[0]-R.start.z),n=Math.floor(d);
if(n>=2){const X=[],Z=[],KI=[];for(let i=0;i<n;i++){const f=i/d;X.push(R.start.x+(R.X[0]-R.start.x)*f);Z.push(R.start.z+(R.Z[0]-R.start.z)*f);KI.push('start')}
R.X=X.concat(Array.from(R.X));R.Z=Z.concat(Array.from(R.Z));R.KIND=KI.concat(Array.from(R.KIND));R.length=R.X.length;
if(R.W)R.W=X.map(()=>0).concat(Array.from(R.W));
if(R.lands)R.lands=R.lands.map(q=>[q[0]+n,q[1]+n])}}
const arr=[fmt,...(R.land||[2,0,0,0])];let n=0;
for(const f of R.pieces){const ki=kidx[f.kind];if(ki===undefined)continue;n++;
const p=K[ki].params.map(q=>{const v=f.params&&f.params[q.key];return Math.min(q.max,Math.max(q.min,v!==undefined?v:q.default))});
arr.push(n,ki,f.x,f.z,f.heading);for(let h=0;h<FF-5;h++)arr.push(h<p.length?p[h]:0)}
const h=arr.length*8+8,c=l.trails_alloc(h),d=c+7&-8;new Float64Array(l.memory.buffer,d,arr.length).set(arr);
l.trails_draft(g,d,arr.length);l.trails_dealloc(c,h);l.trails_draft_apply(g);
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
const STUCK=180;
const MOVES=${JSON.stringify(MOVES)},PUMP0=${JSON.stringify(PUMP0)};
const brainSpeed=${brainSpeed.toString()},BRAIN_TILT=${BRAIN_TILT},VFREE=${VFREE};
${makeRider.toString()}
${makeBrainRider.toString()}
${gamePoints.toString()}
${aimGoal.toString()}
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
const coach=()=>l.trails_coach?new Float64Array(l.memory.buffer,l.trails_coach(g),9):null;
function spawn(){l.trails_set_spawn_at(g,R.start.x,R.start.z,R.start.heading,R.start.v||0);l.trails_game_reset(g)}
const noPedals=inp=>{if(R.drill&&!R.drill.pedals)inp[0]=0;return inp};
function trickKinds(js){
let best=0;
const go=(i,got)=>{ if(i===js.length){ let n=0; for(const b of [1,2,4]) if(got&b) n++; if(n>best) best=n; return; }
go(i+1,got); for(const b of [1,2,4]) if((js[i].tr&b)&&!(got&b)) go(i+1,got|b); };
go(0,0);
return best;
}
function drillGoal(D,end,v,jl,manual,pumps,nl){
const fin=end==='về đích',seen=new Set(),big=jl.filter(e=>e.a>0.4&&!seen.has(e.k)&&seen.add(e.k)),ok=e=>e.g>0&&e.g<=2&&e.spot!==false;
const did=b=>big.filter(e=>(e.tr&b)&&e.g<=3).length,tr=n=>fin?Math.min(D.need,n):0;
const kinds=()=>trickKinds(big.filter(e=>e.tr&&e.g<=3));
const safe=e=>ok(e)&&(e.g===1||(e.imp<4.5&&e.mis<12));
const on=nl?Array.from({length:nl},(_,j)=>jl.find(e=>e.li===j)||null):big,okAt=e=>!!e&&(nl?safe(e):ok(e));
let first=0;while(first<on.length&&okAt(on[first]))first++;
const have={pumps,laps:fin?1:0,finish:fin?1:0,clean:first+0.1*on.slice(first).filter(okAt).length,
boost:big.filter(e=>ok(e)&&e.mis<12&&e.imp<6&&e.h>=1.02).length,racer:big.filter(e=>safe(e)&&e.h<=0.8).length,manual:Math.min(2,manual/60),
whip:tr(did(4)),spin:tr(did(2)),flip:tr(did(1)),
tricks:kinds()+(manual>=120?1:0)+(fin?1:0)}[D.kind]||0;
return {n:+Math.min(D.need,have).toFixed(2),need:D.need};
}
const zoneAt=u=>(R.PZ||[]).find(z=>u>=z[0]-1.2&&u<=z[1]+0.3)||null;
const newPush=u=>({from:u,to:u,z:zoneAt(u),since:null,kmh:null});
function landsOf(){
if(R.lands)return R.lands;if(R.LS)return R.LS;
const LS=[],N=R.length;for(let i=0;i<N;i++)if(R.KIND[i]==='landing'){if(LS.length&&LS[LS.length-1][1]===i-1)LS[LS.length-1][1]=i;else LS.push([i,i])}
return R.LS=LS;
}
function tailInp(s,inp,halt){
const n=R.length,k=Math.max(0,n-6),h=Math.atan2(R.Z[n-1]-R.Z[k],R.X[n-1]-R.X[k]),v=s[8],air=s[12]>0;
const st=Math.round((air?0:clamp(2*wrapA(h-s[3]),-1,1))*127),ln=air?inp[3]:0;
return noPedals(halt?[0,tailBrake(s),st,ln,0,0,0]:[v<6?127:0,v>9?40:0,st,ln,0,0,0]);
}
function tailBrake(s){const v=s[8],p=s[4];if(s[12]>0||v<=0)return 0;if(Math.abs(p)>=0.15)return p>0?70:40;return v>1.5?70:127}
function Ep(P,opt){
opt=opt||{};spawn();
const s=state(),N=R.length,c0=coach();
const E={P,N,until:opt.until||1e9,t:0,idx:0,prog:0,pts:0,seq:s[16],stall:0,crash:0,end:'hết giờ',done:null,
maxT:Math.min(120000,Math.round(N/2.5*60)+600),vr:new Float32Array(N),tricks:{},pending:null,manualM:0,landT:-1e9,jumps:0,landAt:-1,lastJ:-1,
progAt:0,progT:0,jl:[],game:0,streak:0,airP:0,tail:-1,calm:0,halt:0,held:-1,vTail:0,manRun:0,manBest:0,push:null,goodPumps:0,pumpGain:0,seenPump:c0?c0[0]:0,
crashT:-1,mc:0,mm:0,manOk:0,manLong:0,mov:0,
bigLand:-1,
tr:opt.rec?[]:null,ev:opt.rec?[]:null};
E.rider=opt.brain?makeBrainRider(R,H,opt.brain):makeRider(R,H,S,P);
return E;
}
function go(E,stop){
if(E.done)return E.done;
const N=E.N,rider=E.rider,PZ=R.PZ||[],LS=landsOf(),rec=!!E.tr;
let s=state();
for(;E.t<E.maxT;E.t++){
const t=E.t;
if(stop&&stop(E,s))return null;
const air=s[12]>0;
let inp=noPedals(rider.step(s,t));
if(PZ.length){const u=rider.at,c=!(s[12]>0.12)&&inp[4]>25&&!(inp[5]&1);
if(c&&!E.push)E.push=newPush(u);
const p=E.push;
if(p){if(c&&p.since===null)p.to=u;else if(p.since===null)p.since=0;else p.since++;if(c&&p.since!==null)p.since=27}
const q=coach();if(q&&q[0]!==E.seenPump){E.seenPump=q[0];E.pumpGain+=q[1];if(p)p.kmh=q[1]*3.6}
if(p&&p.since!==null&&(p.since>=27||p.kmh!==null)){const z=p.z;
if(z&&p.from>=z[0]-0.8&&p.from<=z[2]+0.2&&p.to<=z[1]+0.8&&p.to>=z[2]-0.2&&!(p.kmh!==null&&p.kmh<0.3))E.goodPumps++;
E.push=c?newPush(u):null}}
const idx=E.idx=rider.idx;if(rider.landed&&s[14]>2)E.bigLand=idx;if(idx>E.prog){for(let i=E.prog+1;i<=idx;i++)E.vr[i]=Math.abs(s[8]);E.prog=idx}
E.calm=air?0:E.calm+1;
if(idx>=N-3&&E.tail<0){if(R.drill){E.end='về đích';E.pts+=150;return fin(E,s)}E.tail=t;E.vTail=+Math.abs(s[8]).toFixed(2)}
if(E.tail>=0){
if(!E.halt&&(E.calm>=30||(!air&&s[8]<-0.3)))E.halt=1;
if(E.held<0&&E.halt&&!air&&Math.abs(s[8])<0.5&&Math.abs(s[4])<0.15)E.held=t;
if((E.held>=0&&t-E.held>=60)||t-E.tail>=420){E.end='về đích';E.pts+=150;return fin(E,s)}
inp=E.held>=0?noPedals([0,127,0,0,0,0,0]):tailInp(s,inp,E.halt);
}else if(rider.off>(E.bigLand>=0&&idx-E.bigLand<40?15:Math.max(7,R.W&&R.W.length===N?R.W[idx]+1:0))&&!air){E.end='lạc khỏi đường';E.pts-=20;return fin(E,s)}
if(idx>=E.until){E.end='đạt mốc';return fin(E,s)}
if(rider.landed){E.landT=t;if(s[14]>0.3)E.landAt=t}
if(E.landAt>=0&&t-E.landAt>=45){if(idx>E.lastJ+3){E.pts+=15;E.jumps++;E.lastJ=idx}E.landAt=-1}
if(E.prog>E.progAt){E.progAt=E.prog;E.progT=t}else if(E.tail<0&&t-E.progT>STUCK){E.end='kẹt';E.pts-=25;return fin(E,s)}
l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);
s=state();
if(rec&&t%2===0){const j=Math.min(N-2,idx),dx=R.X[j+1]-R.X[j],dz=R.Z[j+1]-R.Z[j];
const f=clamp(((s[0]-R.X[j])*dx+(s[2]-R.Z[j])*dz)/(dx*dx+dz*dz||1),-0.5,1.5);
E.tr.push(+(j+f).toFixed(2),+s[1].toFixed(2),+s[4].toFixed(3),s[12]>0?1:0,+Math.abs(s[8]).toFixed(1))}
if(s[13]>0){E.crash=s[13];E.crashT=t;E.end='ngã';E.pts-=25;E.pending=null;if(rec)E.ev.push({t,crash:E.crash});return fin(E,s)}
if(s[46]>0){E.mc++;E.mm+=Math.abs(s[8])/60}else{if(E.mc>=60){E.manOk+=E.mm;E.manLong=Math.max(E.manLong,E.mm)}E.mc=0;E.mm=0}
if(Math.abs(s[8])>1)E.mov++;
if(s[12]>0)E.airP=s[4];
if(s[16]!==E.seq){E.seq=s[16];
const got={};const fl=Math.abs(s[44]||0),spn=Math.abs(s[43]||0),wh=Math.abs(s[41]||0),tb=s[56]||0;
if(fl>=270)got.flip=Math.round(fl/360)||1;
if(spn>=300)got.spin=Math.max(1,Math.round(spn/360));
if(wh>=45)got.whip=wh;
if(tb&16)got.table=1;if(tb&32)got.tailwhip=Math.max(1,s[57]|0);if(tb&64)got.barspin=Math.max(1,s[58]|0);if(tb&128)got.tbog=1;if(tb&256)got.xup=1;
if(Object.keys(got).length)E.pending={got,t};
const gr=s[15]|0;
if(gr>0){const k=rider.airSec,gp=gamePoints(gr,s[44],s[43],s[41],E.streak),i=Math.min(N-3,Math.max(2,idx));
E.streak=gp.streak;E.game+=gp.p;
const sl=Math.atan2(H[i+2]-H[i-2],4),dp=E.airP-sl;
const rw=rider.at-0.45,fw=rider.at+0.55,ls=LS.find(q=>rw>=q[0]-4&&rw<=q[1]+3),spot=!!ls&&rw>=ls[0]+2&&(rw<=ls[1]-1.5||fw<=ls[1]+0.7),P=rider.P;
E.jl.push({k,i:idx,spot,li:R.lands&&ls?LS.indexOf(ls):-1,u:ls?+(rw-ls[0]).toFixed(2):null,a:+s[14].toFixed(2),h:+s[20].toFixed(2),d:+s[21].toFixed(1),g:gr,dp:+dp.toFixed(3),sl:+sl.toFixed(4),mis:+(s[22]||0).toFixed(3),imp:+s[23].toFixed(2),tr:gp.tr,sp:gp.turn,p:gp.p,m:gp.m,mv:P&&P.mv?P.mv[k]|0:0,
t,wv:Math.round(s[41]||0),sv:Math.round(s[43]||0),fv:Math.round(s[44]||0)});
if(rec)E.ev.push({t,land:gr,tr:gp.tr,sp:gp.turn,p:gp.p,m:gp.m})}
}
const pd=E.pending;
if(pd&&t-pd.t>=30){const k=Object.keys(pd.got);let p=0;for(const n of k){p+=n==='whip'?pd.got[n]:TP[n]*pd.got[n];E.tricks[n]=(E.tricks[n]||0)+(n==='whip'?1:pd.got[n])}
p*=1+0.5*(k.length-1);E.pts+=p;if(rec)E.ev.push({t:pd.t,got:pd.got,p:Math.round(p)});E.pending=null}
if(s[46]>0&&!(s[12]>0)){const m=Math.abs(s[8])/60;E.manualM+=m;E.pts+=m*10;if(++E.manRun>E.manBest)E.manBest=E.manRun}else E.manRun=0;
if(E.tail<0&&Math.abs(s[8])<0.6&&!(s[12]>0)){if(++E.stall>150){E.end='đứng lại';E.pts-=25;return fin(E,s)}}else E.stall=0;
}
return fin(E,state());
}
function summary(E,s,final){
const rider=E.rider,t=E.t,prog=E.prog,tricks={...E.tricks};
if(E.manualM>=2)tricks.manual=Math.round(E.manualM);
const sec=rider.sec,crashSec=E.crash?(s[12]>0||t-E.landT<60?rider.airSec:sec):sec;
const pace=0.05*Math.min(20,E.vr[Math.max(0,prog-5)]);
const vEnd=E.tail>=0?E.vTail:+Math.abs(s[8]).toFixed(2),vAvg=+(prog/Math.max(1,t)*60).toFixed(2);
const res={fit:prog+E.pts+pace,prog,pts:Math.round(E.pts),crash:E.crash,end:final?E.end:'đang đi',tricks,ticks:t,sec,crashSec,jumps:E.jumps,game:E.game,streak:E.streak,jl:E.jl.slice(),vEnd,vAvg,goodPumps:E.goodPumps,pumpGain:+E.pumpGain.toFixed(2)};
if(R.aim){const on=E.mc>=60?E.mm:0;res.goal=aimGoal(R.aim,{jl:E.jl,crashT:E.crashT,manOk:E.manOk+on,manLong:Math.max(E.manLong,on),moving:E.mov/60})}
else if(R.drill)res.goal=drillGoal(R.drill,final?E.end:'về đích',Math.abs(s[8]),E.jl,E.manBest,E.goodPumps,R.lands&&R.drill.kind==='clean'?R.lands.length:0);
return res;
}
function fin(E,s){
const res=summary(E,s,true);
if(E.tr)res.trace={tr:E.tr,ev:E.ev,H:Array.from(H,h=>+h.toFixed(2))};
return E.done=res;
}
function episode(P,opt){return go(Ep(P,opt))}
const PG=4096,PW=PG/4,KP=new Set();let BN=0,BZ=null,BO=null,BB=null,BB32=null,BH=0,clean=false;
function takeBase(){
const m32=new Int32Array(l.memory.buffer),n=m32.length/PW;let c=0,h=2166136261;
BN=n;BZ=new Uint8Array(n);BO=new Int32Array(n);
for(let p=0;p<n;p++){let z=1;for(let i=p*PW,e=i+PW;i<e;i++){const v=m32[i];h=Math.imul(h^v,16777619);if(v!==0)z=0}BZ[p]=z;if(!z)BO[p]=c++}
BB=new Uint8Array(c*PG);BB32=new Int32Array(BB.buffer);const m=new Uint8Array(l.memory.buffer);
for(let p=0;p<n;p++)if(!BZ[p])BB.set(m.subarray(p*PG,p*PG+PG),BO[p]*PG);
BH=h>>>0;
}
function baseIs(m32,p){const o=p*PW;if(p>=BN||BZ[p]){for(let i=o;i<o+PW;i++)if(m32[i]!==0)return false;return true}
const b=BO[p]*PW;for(let i=0;i<PW;i++)if(m32[o+i]!==BB32[b+i])return false;return true}
function toBase(m,p){if(p>=BN||BZ[p])m.fill(0,p*PG,p*PG+PG);else m.set(BB.subarray(BO[p]*PG,BO[p]*PG+PG),p*PG)}
function snapMem(){const ps=Int32Array.from([...KP].sort((a,b)=>a-b)),m=new Uint8Array(l.memory.buffer),d=new Uint8Array(ps.length*PG);
for(let i=0;i<ps.length;i++)d.set(m.subarray(ps[i]*PG,ps[i]*PG+PG),i*PG);return {ps,d,len:m.length}}
function putMem(sn){
if(sn){const have=l.memory.buffer.byteLength;if(have<sn.len)l.memory.grow(Math.ceil((sn.len-have)/65536))}
const m=new Uint8Array(l.memory.buffer),inS=new Set();
if(sn)for(let i=0;i<sn.ps.length;i++){const p=sn.ps[i];inS.add(p);KP.add(p);m.set(sn.d.subarray(i*PG,i*PG+PG),p*PG)}
if(clean){for(const p of KP)if(!inS.has(p))toBase(m,p);return}
const m32=new Int32Array(l.memory.buffer),n=m32.length/PW;
for(let p=0;p<n;p++)if(!inS.has(p)&&!baseIs(m32,p)){toBase(m,p);KP.add(p)}
clean=true;
}
function rogue(){const m32=new Int32Array(l.memory.buffer),n=m32.length/PW,out=[];for(let p=0;p<n;p++)if(!KP.has(p)&&!baseIs(m32,p))out.push(p);return out}
function save(E){
const e={};for(const k in E)if(k!=='rider'&&k!=='P'&&k!=='tr'&&k!=='ev'&&k!=='done')e[k]=E[k];
e.vr=E.vr.slice();e.jl=E.jl.slice();e.tricks={...E.tricks};e.pending=E.pending?{got:{...E.pending.got},t:E.pending.t}:null;e.push=E.push?{...E.push}:null;
return {mem:snapMem(),e,r:E.rider.save()};
}
function load(n,P){
putMem(n.mem);
const E={...n.e,P,done:null,tr:null,ev:null};
E.vr=n.e.vr.slice();E.jl=n.e.jl.slice();E.tricks={...n.e.tricks};E.pending=n.e.pending?{got:{...n.e.pending.got},t:n.e.pending.t}:null;E.push=n.e.push?{...n.e.push}:null;
E.rider=makeRider(R,H,S,P);E.rider.load(n.r);
return E;
}
function calib(plans){
for(const P of plans)fromBase(P);
return {list:[...KP],hash:BH,size:BN*PG};
}
function fromBase(P,stop){
use(0);putMem(null);
const E=Ep(P),r=go(E,stop);
for(const p of rogue())KP.add(p);
return stop?E:r;
}
function selftest(P,Q){
const full=fromBase(P),half=Math.max(1,full.ticks>>1),E=fromBase(P,E=>E.t>=half);
if(E.done)return {ok:true,short:true};
const n=save(E),X=Ep(Q||P);go(X,X=>X.t>=half+240);for(const p of rogue())KP.add(p);
const r=go(load(n,P));
const ok=r.prog===full.prog&&r.ticks===full.ticks&&r.game===full.game&&r.end===full.end&&Math.abs(r.fit-full.fit)<1e-9&&r.jl.length===full.jl.length;
return {ok,a:[full.prog,full.ticks,full.game,full.end],b:[r.prog,r.ticks,r.game,r.end]};
}
const kids=new Map();
function roll(m){
use(0);
for(let lot=0;;lot++){
const out=[],got=[];let broke=false;
m.plans.forEach((P,i)=>{
let kid=null,kt=0,r;
try{
let E;if(m.node)E=load(m.node,P);else{putMem(null);E=Ep(P)}
const stop=(E,s)=>{const idx=E.rider.idx;
if(!kid&&m.a1>=0&&E.rider.peek(s)>=m.a1){kid=save(E);kt=E.t}
if(idx>=m.a2)return true;
return !!kid&&!(s[12]>0)&&E.t-Math.max(E.landT,kt)>=45&&!E.pending&&E.landAt<0};
const end=go(E,stop);r=end||summary(E,state(),false);
r.kid=!!kid;r.v=+Math.abs(state()[8]).toFixed(2);
}catch(err){broke=true;clean=false;kid=null;r={fit:-1e9,prog:0,pts:0,end:'lỗi',crash:1,crashSec:0,sec:0,tricks:{},jl:[],game:0,streak:0,jumps:0,ticks:0,vAvg:0,kid:false,v:0,error:String(err)}}
if(kid)got.push([m.bid+':'+i,kid]);
out.push(r);
});
const bad=rogue();
for(const p of bad)KP.add(p);
if((!bad.length&&!broke)||lot>=3){for(const [k,v] of got)kids.set(k,v);return out}
}
}
function watchPlan(P,until,w){
spawn();
const D={v:()=>8,pt:i=>S[i].pt,mv:()=>0,hr:()=>1.5,pl:()=>0,pu:()=>0},Q={};
for(const k in D)Q[k]=S.map((_,i)=>P[k]&&typeof P[k][i]==='number'?P[k][i]:D[k](i));
if(P.vs)Q.vs=S.map((_,i)=>Array.isArray(P.vs[i])?P.vs[i]:null);
for(const k of ['as','pz','pk'])if(P[k]!==undefined)Q[k]=P[k];
if(P.lg)Q.lg=S.map((_,i)=>P.lg[i]||0);
if(P.sa)Q.sa=S.map((_,i)=>P.sa[i]||0);
let s=state();const N=R.length,rider=makeRider(R,H,S,Q),eye=makeBrainRider(R,H,null),me=w?makeBrainRider(R,H,w):null,rows=[];
let prog=0,progT=0,fell=false;
for(let t=0;t<18000;t++){
let inp=rider.step(s,t);eye.step(s,t);
if(me)inp=me.step(s,t);
noPedals(inp);
if(t%2===0&&eye.seen&&rider.want){for(const v of eye.x)rows.push(v);for(const v of rider.want)rows.push(v);rows.push(eye.landPt)}
if(rider.idx>prog){prog=rider.idx;progT=t}else if(t-progT>STUCK)break;
if(rider.idx>=Math.min(N-3,until))break;
if(rider.off>7&&!(s[12]>0))break;
l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);s=state();
if(s[13]>0){fell=true;break}
}
if(fell&&!me)rows.length=Math.max(0,rows.length-30*${BRAIN_ROW});
return {rows,prog};
}
function brainPlan(w){
spawn();
const N=R.length,K=S.length,me=makeBrainRider(R,H,w);
const Q={v:S.map(()=>8),pt:S.map(s=>s.pt),mv:S.map(()=>0),hr:S.map(()=>1.5),pl:S.map(()=>0),pu:S.map(()=>0),as:1};
const tk=makeRider(R,H,S,Q),z=()=>new Float64Array(K);
const aim=z(),went=z(),nv=z(),aimE=z(),wentE=z(),nE=z(),pu=z(),np=z(),pt=z(),na=z(),pl=z(),sa=z();
const maxT=Math.min(18000,Math.round(N/2.5*60)+600);
let s=state(),prog=0,progT=0,stall=0;
for(let t=0;t<maxT;t++){
const air=s[12]>0,inp=noPedals(me.step(s,t));tk.step(s,t);
const i=me.idx;if(i>prog){prog=i;progT=t}else if(t-progT>STUCK)break;
if(me.off>7&&!air||i>=N-3)break;
if(t%2===0){
if(!air){const k=tk.sec,a=clamp(brainSpeed(me.o[0]),2,18),v=Math.abs(s[8]);aim[k]+=a;went[k]+=v;nv[k]++;
if(i>=S[k].b-8){aimE[k]+=a;wentE[k]+=v;nE[k]++}
if((inp[5]&1)&&R.KIND[i]==='takeoff'&&i<=S[k].b)pl[k]=Math.max(pl[k],S[k].b-i+1);
if((H[Math.min(N-1,i+1)]-H[Math.min(N-1,i+3)])/2>0.03){pu[k]+=Math.max(0,me.o[2]);np[k]++}}
else{const k=tk.airSec;pt[k]+=me.landPt+BRAIN_TILT*me.o[3];sa[k]+=Math.max(0,me.o[4]);na[k]++}
}
l.trails_game_step(g,inp[0],inp[1],inp[2],inp[3],inp[4],inp[5],inp[6]);s=state();
if(s[13]>0)break;
if(Math.abs(s[8])<0.6&&!(s[12]>0)){if(++stall>150)break}else stall=0;
}
const plan=(v,n,vE)=>{const P=JSON.parse(JSON.stringify(Q));
for(let k=0;k<K;k++){
if(vE&&nE[k])P.v[k]=+clamp(vE[k]/nE[k],2,18).toFixed(3);
else if(n[k])P.v[k]=+clamp(v[k]/n[k],2,18).toFixed(3);
if(na[k])P.pt[k]=+(pt[k]/na[k]).toFixed(4);
P.pl[k]=Math.min(10,Math.round(pl[k]));
const p=np[k]?pu[k]/np[k]:0;P.pu[k]=p<0.05?0:+p.toFixed(2);
const a=na[k]?sa[k]/na[k]:0;if(a>=0.05){if(!P.sa)P.sa=S.map(()=>0);P.sa[k]=+a.toFixed(2)}
}
return P};
return {prog,plans:[plan(aim,nv),plan(went,nv),plan(aim,nv,aimE),plan(went,nv,wentE)]};
}
onmessage=async e=>{const m=e.data;
if(m.type!=='roll'&&m.type!=='take'&&m.type!=='clear')clean=false;
try{
if(m.type==='init'){await init(m);if(m.snap)takeBase();
const metas=lines.map(L=>({secs:L.S,length:L.R.length,geo:m.geo===false?null:{X:Array.from(L.R.X),Z:Array.from(L.R.Z),KIND:Array.from(L.R.KIND),H:Array.from(L.H),PZ:L.R.PZ}}));
postMessage({type:'ready',id:m.id,...metas[0],metas})}
else if(m.type==='eval'){use(0);const out=m.plans.map(p=>episode(p,{until:m.until}));postMessage({type:'evals',id:m.id,out})}
else if(m.type==='replay'){use(0);postMessage({type:'replay',id:m.id,r:episode(m.plan,{rec:true})})}
else if(m.type==='calib'){postMessage({type:'calib',id:m.id,...calib(m.plans)})}
else if(m.type==='pages'){for(const p of m.list)KP.add(p);postMessage({type:'pages',id:m.id,test:selftest(m.plans[0],m.plans[1])})}
else if(m.type==='snapat'){const full=fromBase(m.P),E=fromBase(m.P,E=>E.t>=full.ticks>>1);postMessage({type:'snapat',id:m.id,full,node:E.done?null:save(E)})}
else if(m.type==='snaptest'){use(0);postMessage({type:'snaptest',id:m.id,r:go(load(m.node,m.P))})}
else if(m.type==='roll'){postMessage({type:'roll',id:m.id,out:roll(m)})}
else if(m.type==='take'){const nodes=m.keys.map(k=>kids.get(k)||null);postMessage({type:'take',id:m.id,nodes})}
else if(m.type==='clear'){kids.clear();postMessage({type:'clear',id:m.id})}
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
this.waiting = new Map();
this.ws.forEach(w => w.addEventListener('error', e => { e.preventDefault(); this.failAll(new Error('worker: ' + (e.message || tx('lỗi', 'error')))); }));
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
async calib(plans) {
const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'calib', plans })));
const all = new Set();
for (const x of r) for (const p of x.list) all.add(p);
const list = [...all];
this.pages = list.length;
const q = await Promise.all(this.ws.map(w => this.call(w, { type: 'pages', list, plans })));
const same = r.every(x => x.hash === r[0].hash && x.size === r[0].size);
let cross = { ok: true };
if (same && this.ws.length > 1) {
const a = await this.call(this.ws[0], { type: 'snapat', P: plans[0] });
if (a.node) {
const f = a.full, b = (await this.call(this.ws[this.ws.length - 1], { type: 'snaptest', node: a.node, P: plans[0] })).r;
cross = { ok: b.prog === f.prog && b.ticks === f.ticks && b.game === f.game && b.end === f.end && Math.abs(b.fit - f.fit) < 1e-9, a: [f.prog, f.ticks, f.game], b: [b.prog, b.ticks, b.game] };
}
}
this.snapOk = same && cross.ok && q.every(x => x.test && x.test.ok);
this.snapTest = { same, cross, tests: q.map(x => x.test), hashes: [...new Set(r.map(x => x.hash))] };
return this.snapOk;
}
roll(wi, msg) { return this.call(this.ws[wi], { type: 'roll', ...msg }).then(r => r.out); }
take(wi, keys) { return this.call(this.ws[wi], { type: 'take', keys }).then(r => r.nodes); }
clearKids() { return Promise.all(this.ws.map(w => this.call(w, { type: 'clear' }))); }
async assets() {
const a = assets();
const wasm = await (await fetch(a.wasm)).arrayBuffer();
const land = await Promise.all(a.land.map(u => fetch(u).then(r => r.arrayBuffer())));
return { wasm, land };
}
async init(route, setup, snap) {
const { wasm, land } = await this.assets();
this.held = this.ws.map(() => [0]);
const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'init', wasm: wasm.slice(0), land: land.map(b => b.slice(0)), routes: [route], setup, snap })));
return r[0].metas[0];
}
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
brainPlan(w) { return this.call(this.ws[0], { type: 'brainplan', w }).then(r => ({ prog: r.prog, plans: r.plans })); }
watchPlans(items, until, brain) {
return Promise.all(items.map(({ line, plan }) => {
const wi = this.held.findIndex(h => h.includes(line));
return this.call(this.ws[wi], { type: 'watch', line: this.held[wi].indexOf(line), plan, until, brain }).then(r => ({ rows: r.rows, prog: r.prog }));
}));
}
close() { this.closed = true; this.ws.forEach(w => w.terminate()); this.failAll(new Error('pool closed')); }
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clonePlan = p => JSON.parse(JSON.stringify(p));
function freshPlan(secs) {
return { v: secs.map(() => 8), pt: secs.map(s => s.pt), mv: secs.map(() => 0), hr: secs.map(() => 1.5), pl: secs.map(() => 0), pu: secs.map(() => 0), as: 1 };
}
async function settleAir(pool, P) {
if (P.as !== undefined) return { plan: P, run: (await pool.evalAll([P]))[0] };
const two = [{ ...clonePlan(P), as: 0 }, { ...clonePlan(P), as: 1 }];
const runs = await pool.evalAll(two);
const i = beats(runs[1], runs[0]) ? 1 : 0;
return { plan: two[i], run: runs[i] };
}
const landSlopes = (run, n) => { const lp = new Array(n).fill(null); for (const e of (run && run.jl) || []) if (typeof e.sl === 'number' && e.k >= 0 && e.k < n && lp[e.k] === null) lp[e.k] = e.sl; return lp; };
const PLAN_KEYS = ['v', 'pt', 'mv', 'hr', 'pl', 'pu'];
const num = v => typeof v === 'number' && Number.isFinite(v);
const partsOk = (P, n) => (P.vs === undefined || (Array.isArray(P.vs) && P.vs.length === n && P.vs.every(q => q === null || (Array.isArray(q) && q.length <= 12 && q.every(num)))))
&& (P.lg === undefined || (Array.isArray(P.lg) && P.lg.length === n && P.lg.every(num)))
&& (P.sa === undefined || (Array.isArray(P.sa) && P.sa.length === n && P.sa.every(num)));
const planFits = (p, secs) => p && PLAN_KEYS.every(k => Array.isArray(p[k]) && p[k].length === secs.length) && partsOk(p, secs.length);
const done = r => r.end === 'về đích' && typeof r.game === 'number';
const goalN = r => (r.goal ? r.goal.n : 0);
const far = r => (done(r) ? Infinity : r.prog);
const faster = (a, b) => (typeof a.vAvg === 'number' && typeof b.vAvg === 'number' && Math.abs(a.vAvg - b.vAvg) > 0.05 ? a.vAvg > b.vAvg : null);
const CASED_COST = 200;
const judged = r => (r.game || 0) - CASED_COST * (r.jl || []).filter(e => e.g === 5).length;
const beats = (a, b) => !b || (goalN(a) !== goalN(b) ? goalN(a) > goalN(b) : far(a) > far(b) || (far(a) === far(b) && (done(a) && done(b) && judged(a) !== judged(b) ? judged(a) > judged(b)
: done(a) && done(b) && faster(a, b) !== null ? faster(a, b) : a.fit > b.fit + 0.01)));
const goalMet = r => !!(r && r.goal && r.goal.n >= r.goal.need);
const BEAM = 6, SWEEP_TRIES = 72, MAX_BACKS = 12;
const LEANS = [0, 0.3, 0.6, 1, -0.3, -0.6];
const setLean = (p, k, v) => { if (!p.lg) { if (!v) return; p.lg = p.v.map(() => 0); } p.lg[k] = v; };
const AIR_STEERS = [0, 0.15, 0.3, 0.5, 0.8, 1];
const setAirSteer = (p, k, v) => { if (!p.sa) { if (!v) return; p.sa = p.v.map(() => 0); } p.sa[k] = v; };
const aliveAt = r => r.end === 'đang đi' || r.end === 'về đích';
const BOOK = 'trailsai.trickbook', BOOK_ROWS = 4000;
function loadBook(mask) {
try { const b = JSON.parse(keep.getItem(BOOK) || 'null'); return b && b.version === 1 && Array.isArray(b[mask]) ? b[mask] : []; } catch { return []; }
}
function saveBook(mask, rows) {
try {
let b = JSON.parse(keep.getItem(BOOK) || 'null');
if (!b || b.version !== 1) b = { version: 1 };
b[mask] = rows.slice(-BOOK_ROWS);
keep.setItem(BOOK, JSON.stringify(b));
} catch { /* storage full or blocked */ }
}
const trickValue = tr => (tr & 1 ? 300 : 0) + (tr & 2 ? 200 : 0) + (tr & 4 ? 100 : 0);
const TRICK_MOVES = [FLIP, SPIN_L, SPIN_R, WHIP_L, WHIP_R, FLIP_WL, FLIP_WR, FLIP_SL, FLIP_SR];
const moveBit = m => { const o = m > 15 && MOVES[m]; return o ? (o.flip ? 1 : 0) | (o.spin ? 2 : 0) | (o.wt ? 4 : 0) : 0; };
const moveNeeds = m => { const b = moveBit(m); return (b & 1 ? TRICK_BIT.flip : 0) | (b & 2 ? TRICK_BIT.spin : 0) | (b & 4 ? TRICK_BIT.whip : 0); };
function bookMoves(rows, air, n, mask) {
const near = rows.filter(r => Math.abs(r[0] - air) <= 0.2);
let landed = 0;
for (const r of rows) if (r[2] && r[0] <= air + 0.1) landed |= r[3];
const tries = new Array(N_MOVES).fill(0), w = new Array(N_MOVES).fill(0);
for (const r of near) if (r[1] > 0 && r[1] < N_MOVES) tries[r[1]]++;
const all = near.length, can = m => m !== MANUAL && (mask === undefined || (moveNeeds(m) & mask) === moveNeeds(m));
for (let m = 1; m < N_MOVES; m++) {
if (!can(m)) continue;
let ok = 0, val = 0;
for (const r of near) if (r[1] === m && r[2] && r[3]) { ok++; val += trickValue(r[3]); }
const b = moveBit(m), prior = b ? trickValue(b) * ((landed & b) === b || !rows.length ? 1 : 0.5) : 40;
const est = ((ok + 1) / (tries[m] + 2)) * (ok ? val / ok : prior);
w[m] = est + 150 * Math.sqrt(Math.log(all + 2) / (tries[m] + 1)) * (b ? 1 : 0.25);
}
const out = TRICK_MOVES.filter(m => can(m) && tries[m] < 3).sort((a, b) => w[b] - w[a]).slice(0, n);
const sum = w.reduce((a, v) => a + v * v, 0);
while (out.length < n) {
let x = Math.random() * sum, pick = 0;
for (let m = 1; m < N_MOVES; m++) if (w[m]) { pick = m; x -= w[m] * w[m]; if (x <= 0) break; }
out.push(pick);
}
return out;
}
function bookSummary(rows) {
return [[1, 'Backflip'], [2, 'Spin'], [4, 'Whip']].map(([b, name]) => {
const got = rows.filter(r => r[2] && r[3] & b).map(r => r[0]).sort((x, y) => x - y);
if (!got.length) return { name, n: 0 };
const min = got[Math.floor(got.length * 0.1)], tries = rows.filter(r => r[0] >= min).length;
return { name, n: got.length, min, tries };
});
}
const DRILL_MOVES = { whip: [WHIP_L, WHIP_R], spin: [SPIN_L, SPIN_R], flip: [FLIP], tricks: [FLIP, SPIN_L, SPIN_R, WHIP_L, WHIP_R] };
const AIM_TRICKS = TRICK_MOVES;
function drillSeed(P, secs, D) {
if (DRILL_MOVES[D.kind]) secs.forEach((s, k) => { if (s.jump) P.v[k] = 13; });
if (D.kind === 'manual') secs.forEach((s, k) => { if (!s.jump) P.mv[k] = MANUAL; });
if (!D.pedals) { P.pz = 1; P.pu = P.pu.map(() => 1); P.v = P.v.map(() => 18); }
return P;
}
const clampV = v => Math.min(18, Math.max(2, v));
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
function lineStale(line) {
if (line.practice) return false;
for (const p of line.pieces) {
const got = cap.chunks.get(Math.floor(p.x / 256) + ',' + Math.floor(p.z / 256));
if (got && !got.some(q => q.kind === p.kind && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05)) return true;
}
return false;
}
async function communityLesson(id) {
try {
const r = await fetch(LESSONS_URL + encodeURIComponent(id) + '.json?t=' + Date.now(), { cache: 'no-store' });
return r.ok ? readLesson(await r.text(), id) : null;
} catch { return null; }
}
const JUMP_KEYS = ['v', 'dpt', 'pl', 'pu'];
const goodJump = j => j && typeof j.id === 'string' && Array.isArray(j.f) && j.f.length === JUMP_SCALE.length && j.f.every(num) && JUMP_KEYS.every(k => num(j[k]));
function localJumps() {
const out = [];
try {
for (let i = 0; i < keep.length; i++) {
const key = keep.key(i);
if (!key || !key.startsWith(STORE)) continue;
let m = null;
try { m = JSON.parse(keep.getItem(key)); } catch { continue; }
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
async function gatherJumps() {
const mine = localJumps(), have = new Set(mine.map(j => j.id));
return mine.concat((await communityJumps()).filter(j => !have.has(j.id)));
}
const JUMP_SCALE = [0.12, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.06];
const jumpDist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + ((v - b[i]) / JUMP_SCALE[i]) ** 2, 0));
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
function rideOn(ride, X, Z) {
const F = ride.f, n = F.length / SEEN_W, N = X.length, at = new Float64Array(n).fill(-1);
if (n < 60 || N < 20) return null;
let cur = -1, miss = 0;
for (let i = 0; i < n; i++) {
const o = i * SEEN_W, x = F[o], z = F[o + 1];
if (miss > 15) cur = -1;
let bi = -1, bd = 9;
for (let j = cur >= 0 ? Math.max(0, cur - 5) : 0, e = cur >= 0 ? Math.min(N, cur + 40) : N; j < e; j++) { const d = (X[j] - x) ** 2 + (Z[j] - z) ** 2; if (d < bd) { bd = d; bi = j; } }
if (bi < 0) { miss++; continue; }
const j = Math.min(N - 2, bi), dx = X[j + 1] - X[j], dz = Z[j + 1] - Z[j];
if (!(F[o + 4] > 0) && Math.abs(wrapA(F[o + 9] - Math.atan2(dz, dx))) > 1.2) { miss++; continue; }
at[i] = j + clamp(((x - X[j]) * dx + (z - Z[j]) * dz) / (dx * dx + dz * dz || 1), -0.5, 1.5);
cur = bi; miss = 0;
}
let best = null, s0 = -1, last = -1, gap = 0, u0 = 0, top = 0;
const close = () => { if (s0 >= 0 && top - u0 >= 30 && (!best || top - u0 > best.top - best.u0)) best = { s0, s1: last, u0, top }; s0 = -1; };
for (let i = 0; i < n; i++) {
if (at[i] < 0) { if (s0 >= 0 && ++gap > 30) close(); continue; }
if (s0 >= 0 && at[i] < top - 3) close();
if (s0 < 0) { s0 = i; u0 = top = at[i]; }
gap = 0; last = i; top = Math.max(top, at[i]);
}
close();
if (!best) return null;
const from = Math.ceil(best.u0), to = Math.floor(best.top), M = to - from + 1;
const sv = new Float64Array(M), sp = new Float64Array(M), c = new Float64Array(M), pull = new Array(M).fill(0);
let vt = 0, vn = 0;
for (let i = best.s0; i <= best.s1; i++) {
const o = i * SEEN_W, u = Math.round(at[i]) - from;
if (at[i] < 0 || u < 0 || u >= M || F[o + 4] > 0) continue;
const v = F[o + 3], pd = clamp(F[o + 10] / 127, 0, 1), br = clamp(F[o + 11] / 127, 0, 1);
sv[u] += br > 0.05 ? v - Math.max(0.4, 2 * br) : pd >= 0.95 ? v + 2.5 : pd > 0.15 ? v + (pd - 0.15) / 0.7 : v - 0.2;
sp[u] += clamp(F[o + 5] / 127, 0, 1); c[u]++; vt += v; vn++;
if (F[o + 6] & 1) pull[u] = 1;
}
if (!vn || vt / vn < 3) return null;
const jumps = [];
for (let i = best.s0 + 1; i <= best.s1; i++) {
const o = i * SEEN_W;
if (!(F[o + 4] > 0) || F[o - SEEN_W + 4] > 0 || at[i - 1] < 0) continue;
let e = i;
while (e < n && F[e * SEEN_W + 4] > 0) e++;
const L = ride.ev.find(q => q.land && Math.abs(q.n - e) <= 2);
if (!L || L.n > best.s1 + 30) continue;
let pt = 0, np = 0, dir = 0, big = 0, rel = null, relT = null, held = false;
for (let q = Math.max(best.s0, i - 60); q < L.n; q++) {
const w = F[q * SEEN_W + 7];
if (Math.abs(w) > big) { big = Math.abs(w); dir = Math.sign(w); }
if (Math.abs(w) > 20) held = true;
else if (held && rel === null && F[q * SEEN_W + 4] > 0) { rel = Math.abs(F[q * SEEN_W + 8]); relT = F[q * SEEN_W + 4]; }
if (q >= L.n - 8 && F[q * SEEN_W + 4] > 0) { pt += F[q * SEEN_W + 2]; np++; }
}
const ok = !ride.ev.some(e => e.crash && e.n >= L.n && e.n <= L.n + 30);
jumps.push({ up: +at[i - 1].toFixed(1), pt: np ? +(pt / np).toFixed(4) : null, g: L.land, a: +L.a.toFixed(2), ok, fv: Math.round(L.fv), sv: Math.round(L.sv), wv: Math.round(L.wv), dir, rel: rel === null ? null : Math.round(rel), relT: relT === null ? null : +relT.toFixed(2) });
}
const v = Array.from(sv, (x, u) => (c[u] ? +(x / c[u]).toFixed(2) : null)), pump = Array.from(sp, (x, u) => (c[u] ? +(x / c[u]).toFixed(2) : null));
return { from, to, v, pump, pull, jumps, at: Date.now() };
}
const playerTr = j => (Math.abs(j.fv) >= 270 ? 1 : 0) | (Math.abs(j.sv) >= 300 ? 2 : 0) | (Math.abs(j.wv) >= 45 ? 4 : 0);
const playerMove = j => {
const t = playerTr(j), l = j.dir < 0;
if (t & 1) return t & 2 ? (l ? FLIP_SL : FLIP_SR) : t & 4 ? (l ? FLIP_WL : FLIP_WR) : FLIP;
return t & 2 ? (l ? SPIN_L : SPIN_R) : t & 4 ? (l ? WHIP_L : WHIP_R) : 0;
};
const PLAYER = 'trailsai.player';
const playerAll = () => { try { return JSON.parse(keep.getItem(PLAYER) || '{}') || {}; } catch { return {}; } };
const playerRides = id => { const r = playerAll()[baseId(id)]; return Array.isArray(r) ? r : []; };
function keepPlayerRide(id, rec) {
const all = playerAll(), k = baseId(id);
all[k] = [rec].concat(Array.isArray(all[k]) ? all[k] : []).slice(0, 3);
for (const old of Object.keys(all).sort((a, b) => ((all[b][0] || {}).at || 0) - ((all[a][0] || {}).at || 0)).slice(30)) delete all[old];
try { keep.setItem(PLAYER, JSON.stringify(all)); } catch { /* storage full or blocked */ }
}
function applyPlayer(p, k, o) {
if (o.v !== undefined) {
p.v[k] = o.v;
if (o.vs) { if (!p.vs) p.vs = p.v.map(() => null); p.vs[k] = o.vs.slice(); } else if (p.vs) p.vs[k] = null;
}
if (o.pl !== undefined) p.pl[k] = o.pl;
if (o.pu !== undefined) p.pu[k] = o.pu;
if (o.pt !== undefined) p.pt[k] = o.pt;
if (o.mv !== undefined) p.mv[k] = o.mv;
if (o.hr !== undefined) p.hr[k] = o.hr;
}
let simHash = null;
function simId() {
if (simHash === null) { let h = 2166136261; for (let i = 0; i < workerSrc.length; i++) h = Math.imul(h ^ workerSrc.charCodeAt(i), 16777619) >>> 0; simHash = h.toString(36); }
return simHash;
}
class Trainer {
constructor(ui) { this.ui = ui; this.running = false; this.pool = null; }
key() { return STORE + (this.route ? this.route.start.id : 'none'); }
planOf(m) {
if (!m || !m.plan) return null;
if (planFits(m.plan, this.secs)) return m.plan;
const L = m.line, P = m.plan, n = P.v && P.v.length;
if (!this.route.tour || !L || L.tour !== undefined || !L.X || L.X.length >= this.route.length || !planFits(P, new Array(n))) return null;
for (let i = 0; i < L.X.length; i += 10) if (Math.abs(L.X[i] - this.route.X[i]) > 0.01 || Math.abs(L.Z[i] - this.route.Z[i]) > 0.01) return null;
const runIn = this.N - this.route.length, end = runIn + L.X.length - 1, out = freshPlan(this.secs);
let k = 0;
for (; k < Math.min(n - 1, this.secs.length); k++) {
if (this.secs[k].b >= end) break;
for (const key of PLAN_KEYS) out[key][k] = P[key][k];
if (P.vs && P.vs[k]) { if (!out.vs) out.vs = out.v.map(() => null); out.vs[k] = P.vs[k].slice(); }
if (P.sa && P.sa[k]) setAirSteer(out, k, P.sa[k]);
}
this.kept = k;
return out;
}
load() {
let mine = null;
try { mine = this.temp ? null : JSON.parse(keep.getItem(this.key()) || (this.route.aim && keep.getItem(STORE + baseId(this.route.start.id))) || 'null'); } catch { mine = null; }
this.kept = 0;
const plan = this.planOf(mine), ok = !!plan;
this.plan = ok ? clonePlan(plan) : freshPlan(this.secs);
this.gen = ok ? mine.gen : 0;
this.hist = ok ? (mine.hist || []) : [];
this.found = ok ? (mine.found || {}) : {};
this.best = null;
return { fromTrack: !!ok, kept: ok ? this.kept : 0 };
}
lesson() {
const { start, X, Z, KIND, pieces, kinds, length, land, practice, tour, drill, lands } = this.route;
const line = { start, X: Array.from(X), Z: Array.from(Z), KIND, pieces, kinds, length };
if (tour !== undefined) line.tour = tour;
if (practice) Object.assign(line, { land, practice });
if (drill) { line.drill = drill; if (lands) line.lands = lands; }
if (this.route.aim) line.aim = this.route.aim;
return { format: LESSON_FORMAT, version: 1, plan: this.plan, gen: this.gen, hist: this.hist.slice(-400), found: this.found, bestRun: this.best, sim: simId(), route: start, line, setup: this.setup, jumps: this.jumpRecord(), savedAt: Date.now() };
}
jumpRecord() {
const S = this.secs, P = this.plan, b = this.best, list = [];
if (b) S.forEach((s, k) => { if (s.f && s.b + 25 < b.prog) list.push({ f: s.f, v: +P.v[k].toFixed(3), dpt: +(P.pt[k] - s.pt).toFixed(4), pl: P.pl[k], pu: P.pu[k] }); });
return { version: JUMPS_VERSION, list };
}
save() {
if (this.temp) return;
if (this.takeStored()) return;
try { keep.setItem(this.key(), JSON.stringify(this.lesson())); } catch { /* storage full: keep training anyway */ }
}
takeStored(raw) {
let m = null;
try { m = JSON.parse(raw || keep.getItem(this.key()) || 'null'); } catch { m = null; }
if (!m || !this.best || !m.bestRun || m.sim !== simId() || !planFits(m.plan, this.secs) || JSON.stringify(m.setup) !== JSON.stringify(this.setup)) return false;
if (!beats(m.bestRun, this.best)) return false;
this.plan = m.plan; this.best = m.bestRun; this.gen = Math.max(this.gen, m.gen || 0);
return true;
}
async offer(m) {
const got = this.pool && this.planOf(m);
if (!got) return { fits: false };
const { plan, run } = await settleAir(this.pool, got);
const took = beats(run, this.best);
if (took) { this.plan = clonePlan(plan); this.best = run; this.save(); }
return { fits: true, took, run };
}
playerSecs(recs) {
const S = this.secs, runIn = this.N - this.route.length, G = this.geo || {}, out = S.map(() => []);
for (const rec of recs) S.forEach((s, k) => {
const a = s.a - runIn, b = s.b - runIn;
if (a < rec.from || b > rec.to || out[k].length >= 3) return;
const j = s.jump ? rec.jumps.find(q => Math.abs(q.up - b) <= 3) : null;
if (s.jump && !(j && j.ok)) return;
const mean = (arr, u0, u1, keep) => { let t = 0, c = 0; for (let u = u0; u <= u1; u++) { const x = arr[u - rec.from]; if (x !== null && x !== undefined && (!keep || keep(u))) { t += x; c++; } } return c ? t / c : null; };
const len = b - a + 1, n = len >= 16 ? Math.min(4, Math.round(len / 8)) : 1;
const vs = Array.from({ length: n }, (_, q) => mean(rec.v, a + Math.floor(q * len / n), a + Math.floor((q + 1) * len / n) - 1));
for (let q = 1; q < n; q++) if (vs[q] === null) vs[q] = vs[q - 1];
for (let q = n - 2; q >= 0; q--) if (vs[q] === null) vs[q] = vs[q + 1];
if (vs[0] === null) return;
const o = { v: +clampV(vs[n - 1]).toFixed(2), vs: n > 1 ? vs.map(v => +clampV(v).toFixed(2)) : null, pl: 0 };
for (let u = a; u <= b; u++) if (rec.pull[u - rec.from] && G.KIND && G.KIND[u + runIn] === 'takeoff') { o.pl = clamp(b - u, 1, 10); break; }
if (G.PZ) { const pu = mean(rec.pump, a, b, u => G.PZ.some(z => u + runIn >= z[0] && u + runIn <= z[1])); if (pu !== null) o.pu = pu < 0.15 ? 0 : +Math.min(1, pu).toFixed(2); }
if (j) {
if (j.pt !== null && Math.abs(j.fv) < 90) o.pt = j.pt;
if (this.setup.tricks) {
o.mv = playerMove(j);
if (o.mv === SPIN_L || o.mv === SPIN_R) o.hr = +clamp((j.rel !== null ? j.rel : Math.abs(j.sv)) / 100, 0.3, 2.8).toFixed(2);
else if ((o.mv === WHIP_L || o.mv === WHIP_R) && j.relT !== null) o.hr = +clamp(j.relT / 0.25, 0.3, 2.8).toFixed(2);
}
}
out[k].push(o);
});
return out;
}
async fromPlayer(recs) {
this.player = this.playerSecs(recs);
const all = clonePlan(this.plan), air = clonePlan(this.plan);
let secs = 0, jumps = 0, tricks = 0;
this.player.forEach((alt, k) => {
if (!alt.length) return;
const o = alt[0];
applyPlayer(all, k, o); applyPlayer(air, k, { pl: o.pl, pt: o.pt, mv: o.mv, hr: o.hr });
secs++; if (this.secs[k].jump) jumps++; if (o.mv) tricks++;
});
if (!secs) return { secs };
const runs = await this.pool.evalAll([all, air]), i = beats(runs[1], runs[0]) ? 1 : 0, run = runs[i], took = beats(run, this.best);
if (took) { this.plan = i ? air : all; this.best = run; this.save(); }
return { secs, jumps, tricks, run, took, air: !!i };
}
async prepare(route, workers) {
this.stop();
if (this.pool) this.pool.close();
this.route = route;
this.setup = riderSetup();
this.pool = new Pool(workers);
const meta = await this.pool.init(route, this.setup, true);
this.secs = meta.secs; this.N = meta.length; this.geo = meta.geo;
this.book = loadBook(this.setup.tricks); this.bookDirty = false;
const mem = this.load();
if (!mem.fromTrack && route.drill) drillSeed(this.plan, this.secs, route.drill);
({ plan: this.plan, run: this.best } = await settleAir(this.pool, this.plan));
const slow = freshPlan(this.secs), wild = clonePlan(this.plan);
if (this.setup.tricks) this.secs.forEach((s, k) => { if (s.jump) wild.mv[k] = TRICK_MOVES[k % TRICK_MOVES.length]; });
wild.v = wild.v.map(v => clampV(v + 2));
await this.pool.calib([this.plan, slow, wild]);
this.borrow = matchJumps(this.secs, this.library || [], route.start.id);
const alike = this.borrow.filter(Boolean);
mem.jumps = this.secs.filter(s => s.jump).length;
mem.alike = alike.length;
mem.lines = new Set(alike.map(b => b[0].j.id)).size;
mem.fresh = this.best; mem.from = 'fresh';
if (!mem.fromTrack && alike.length) {
const seed = clonePlan(this.plan);
this.borrow.forEach((b, k) => { if (b) applyJump(seed, this.secs[k], k, b[0].j); });
mem.seed = (await this.pool.evalAll([seed]))[0];
if (beats(mem.seed, this.best)) { this.plan = seed; this.best = mem.seed; mem.from = 'borrow'; }
}
if (!mem.fromTrack && this.brainW) {
const got = await this.pool.brainPlan(this.brainW);
const runs = await this.pool.evalAll(got.plans);
const bi = runs.reduce((b, r, i) => (beats(r, runs[b]) ? i : b), 0);
mem.brain = { prog: got.prog, run: runs[bi] };
if (beats(runs[bi], this.best)) { this.plan = got.plans[bi]; this.best = runs[bi]; mem.from = 'brain'; }
}
if (mem.kept && this.brainW) {
const got = await this.pool.brainPlan(this.brainW);
const mixes = got.plans.map(b => {
const p = clonePlan(this.plan);
for (let k = mem.kept; k < this.secs.length; k++) {
for (const key of PLAN_KEYS) p[key][k] = b[key][k];
if (p.vs) p.vs[k] = b.vs && b.vs[k] ? b.vs[k].slice() : null;
if (p.sa) p.sa[k] = 0;
}
return p;
});
const runs = await this.pool.evalAll(mixes);
const bi = runs.reduce((b, r, i) => (beats(r, runs[b]) ? i : b), 0);
if (beats(runs[bi], this.best)) { this.plan = mixes[bi]; this.best = runs[bi]; }
}
this.player = null;
const recs = this.temp ? [] : playerRides(route.start.id);
if (recs.length) { mem.player = await this.fromPlayer(recs); if (mem.player.took) mem.from = 'player'; }
return mem;
}
stop() { this.running = false; }
airOf(j) { return Math.max(0, ...((this.best && this.best.jl) || []).filter(e => e.k === j).map(e => e.a)); }
horizon(a, b) {
const ga = goalN(a), gb = goalN(b);
if (Math.abs(ga - gb) > 1e-9) return ga - gb;
const la = aliveAt(a), lb = aliveAt(b);
if (la !== lb) return la ? 1 : -1;
if (!la) return a.prog !== b.prog ? a.prog - b.prog : a.fit - b.fit;
const ja = judged(a), jb = judged(b);
if (ja !== jb) return ja - jb;
return a.fit - b.fit;
}
movesFor(k, n) {
const D = this.route.aim || this.route.drill, only = D && (this.route.aim && D.mk === 'tricks' ? AIM_TRICKS : DRILL_MOVES[D.mk || D.kind]);
if (only) return Array.from({ length: n }, () => only[Math.floor(Math.random() * only.length)]);
const air = this.airOf(k);
return this.setup.tricks && air ? bookMoves(this.book, air, n, this.setup.tricks) : null;
}
secTry(base, k, wide, move) {
const s = this.secs[k], p = clonePlan(base), D = this.route.aim || this.route.drill, dk = D && (D.mk || D.kind);
if (!p.vs) p.vs = p.v.map(() => null);
const sd = 1.0 * wide, u = p.vs[k];
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
if (Math.random() < 0.2 * wide) p.pu[k] = [0, 0.5, 0.8, 1][Math.floor(Math.random() * 4)];
if (Math.random() < 0.12 * wide) setLean(p, k, LEANS[Math.floor(Math.random() * LEANS.length)]);
if (s.jump && move !== undefined && move !== null) {
p.mv[k] = move;
if (moveBit(move) & 1 && Math.random() < 0.5) p.pl[k] = 1 + Math.floor(Math.random() * 5);
}
if (s.jump && Math.random() < 0.25 * wide) setAirSteer(p, k, AIR_STEERS[Math.floor(Math.random() * AIR_STEERS.length)]);
if (s.jump && (p.mv[k] | 0) && Math.random() < 0.6) p.hr[k] = +clamp(p.hr[k] + gauss() * 0.5 * wide, 0.3, 2.8).toFixed(2);
if (!s.jump && (dk === 'manual' || dk === 'tricks') && Math.random() < 0.3) p.mv[k] = p.mv[k] === MANUAL ? 0 : MANUAL;
return p;
}
wildTry(nd, k) {
const s = this.secs[k], p = clonePlan(nd.plan), r = (a, b) => a + Math.random() * (b - a);
const rv = () => Math.random() < 0.25 ? 18 : +r(3, 18).toFixed(2);
if (!p.vs) p.vs = p.v.map(() => null);
if (Math.random() < 0.5 && s.b - s.a >= 12) {
const n = 2 + Math.floor(Math.random() * 3);
p.vs[k] = Array.from({ length: n }, rv);
p.v[k] = p.vs[k][n - 1];
} else { p.vs[k] = null; p.v[k] = rv(); }
if (s.jump) {
p.pt[k] = Math.random() < 0.5 ? s.pt + r(-0.6, 0.4) : r(-1.2, 0.6);
p.pl[k] = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 6) : 0;
if (Math.random() < 0.5) setAirSteer(p, k, AIR_STEERS[Math.floor(Math.random() * AIR_STEERS.length)]);
}
p.pu[k] = Math.random() < 0.3 ? [0.5, 0.8, 1][Math.floor(Math.random() * 3)] : 0;
if (Math.random() < 0.4) setLean(p, k, LEANS[Math.floor(Math.random() * LEANS.length)]);
return { p };
}
firstTries(nd, k, wide, n, wild) {
const S = this.secs, s = S[k], out = [{ p: clonePlan(nd.plan), same: true }];
if (nd.plan.v[k] < VFREE || (nd.plan.vs && nd.plan.vs[k])) { const p = clonePlan(nd.plan); if (p.vs) p.vs[k] = null; p.v[k] = 18; out.push({ p }); }
if (s.jump) {
for (const dv of [-1.2, -0.6, 0.6, 1.2, 1.8]) for (const da of [-0.1, 0, 0.1]) {
const p = clonePlan(nd.plan), u = p.vs && p.vs[k];
if (u) { u[u.length - 1] = clampV(u[u.length - 1] + dv * wide); p.v[k] = u[u.length - 1]; } else p.v[k] = clampV(p.v[k] + dv * wide);
p.pt[k] += da;
out.push({ p });
}
for (const o of ((this.borrow && this.borrow[k]) || []).slice(0, 2)) { const p = clonePlan(nd.plan); applyJump(p, s, k, o.j); out.push({ p }); }
}
for (const o of (this.player && this.player[k]) || []) {
const p = clonePlan(nd.plan); applyPlayer(p, k, o); out.push({ p });
if (s.jump) { const q = clonePlan(nd.plan); applyPlayer(q, k, { pl: o.pl, pt: o.pt, mv: o.mv, hr: o.hr }); out.push({ p: q }); }
}
const moves = s.jump ? this.movesFor(k, n) : null;
for (let i = 0; i < n; i++) {
if (Math.random() < wild) { out.push(this.wildTry(nd, k)); continue; }
out.push({ p: this.secTry(nd.plan, k, wide, moves && Math.random() < 0.5 ? moves[i % moves.length] : undefined) });
}
return out;
}
eliteTry(el, k) {
const one = () => el[Math.floor(Math.random() * el.length)];
const p = clonePlan(one()), spread = f => { const xs = el.map(f); const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
const sv = Math.max(0.15, spread(q => q.v[k])), sp = Math.max(0.015, spread(q => q.pt[k]));
const from = one();
if (!p.vs) p.vs = p.v.map(() => null);
p.vs[k] = from.vs && from.vs[k] ? from.vs[k].map(v => +clampV(v + gauss() * sv).toFixed(2)) : null;
p.v[k] = p.vs[k] ? p.vs[k][p.vs[k].length - 1] : clampV(from.v[k] + gauss() * sv);
p.pt[k] = one().pt[k] + gauss() * sp;
p.pl[k] = one().pl[k]; p.pu[k] = one().pu[k];
const m = one(); p.mv[k] = m.mv[k]; p.hr[k] = clamp(m.hr[k] + gauss() * 0.15, 0.3, 2.8);
const w = one();
if (w.lg || p.lg) { if (!p.lg) p.lg = p.v.map(() => 0); p.lg[k] = w.lg ? w.lg[k] : 0; }
const a = one();
if (a.sa || p.sa) { if (!p.sa) p.sa = p.v.map(() => 0); p.sa[k] = a.sa ? a.sa[k] : 0; }
return { p };
}
async rollAll(cs, a1, a2) {
const pool = this.pool, W = pool.ws.length, per = Math.ceil(cs.length / W), jobs = [];
for (let wi = 0; wi < W; wi++) {
const part = cs.slice(wi * per, (wi + 1) * per);
if (!part.length) continue;
jobs.push((async () => {
for (let i = 0; i < part.length;) {
let j = i; while (j < part.length && part[j].nd === part[i].nd) j++;
const bid = `${++this.bid}`, group = part.slice(i, j);
const out = await pool.roll(wi, { node: group[0].nd.n, plans: group.map(c => c.p), a1, a2, bid });
group.forEach((c, q) => { c.r = out[q]; c.wi = wi; c.key = `${bid}:${q}`; });
i = j;
}
})());
}
await Promise.all(jobs);
this.tries += cs.length;
}
async sweep(wide) {
const S = this.secs, K = S.length, pool = this.pool;
let beam = [{ n: null, plan: clonePlan(this.plan), inc: true }], k = 0, backs = 0, bestEnd = null, last = null;
const beams = [beam], widen = new Map(), fails = {}, t0 = performance.now();
this.tries = 0; this.bid = this.bid || 0;
while (k < K && this.running) {
const a1 = k + 1 < K ? S[k + 1].a : -1, a2 = k + 2 < K ? S[k + 2].a : this.N + 10, w = wide * (widen.get(k) || 1);
const n1 = Math.max(12, Math.ceil(SWEEP_TRIES / beam.length)), cs = [];
const front = this.best.end === 'về đích' ? K : this.best.crashSec, wild = k >= front - 1 && k <= front ? 0.5 : widen.has(k) ? 0.3 : 0.1;
for (const nd of beam) for (const c of this.firstTries(nd, k, w, n1, wild)) cs.push({ nd, ...c });
await this.rollAll(cs, a1, a2);
if (!this.running) return null;
const more = [];
for (const nd of beam) {
const mine = cs.filter(c => c.nd === nd).sort((x, y) => this.horizon(y.r, x.r));
const el = mine.slice(0, Math.max(2, Math.ceil(mine.length / 5))).map(c => c.p);
for (let i = 0; i < Math.ceil(n1 / 2); i++) more.push({ nd, ...this.eliteTry(el, k) });
}
await this.rollAll(more, a1, a2);
if (!this.running) return null;
const all = cs.concat(more);
if (S[k].jump) this.learnBook(k, all);
for (const c of all) if (c.r.end !== 'đang đi' && (!bestEnd || beats(c.r, bestEnd.r))) bestEnd = c;
this.ui.progress({ gen: this.gen, best: this.best, mean: all.reduce((a, c) => a + c.r.fit, 0) / all.length, ms: performance.now() - t0, mode: 'sweep', label: tx(`đoạn ${k + 1}/${K}${backs ? `, lùi lại ${backs} lần` : ''}`, `section ${k + 1}/${K}${backs ? `, backed up ${backs} times` : ''}`), tries: this.tries });
if (a1 < 0) break;
const ok = all.filter(c => c.r.kid).sort((x, y) => this.horizon(y.r, x.r));
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
last = { k, r: sel[0].r };
k++; beams[k] = beam;
}
if (!this.running || !bestEnd) return { improved: false, stuck: last };
const full = (await pool.evalAll([bestEnd.p]))[0];
if (full.prog !== bestEnd.r.prog || full.game !== bestEnd.r.game || full.end !== bestEnd.r.end) {
this.drift = (this.drift || 0) + 1;
(this.drifts = this.drifts || []).push({ k, wi: bestEnd.wi, a: [bestEnd.r.prog, bestEnd.r.game, bestEnd.r.end, bestEnd.r.ticks], b: [full.prog, full.game, full.end, full.ticks], p: bestEnd.p, inc: !!bestEnd.nd.inc });
}
const improved = beats(full, this.best);
if (improved) { this.plan = bestEnd.p; this.best = full; }
return { improved, full, stuck: k < K - 1 ? k : null, backs, ms: performance.now() - t0 };
}
async run() {
if (this.running || !this.pool) return;
this.running = true;
try {
if (!this.pool.snapOk) throw new Error(tx('trạng thái vật lý không lưu lại được trên máy này', 'the physics state cannot be saved on this computer'));
let wide = 1;
while (this.running) {
const prev = this.best, r = await this.sweep(wide);
if (!this.running) break;
const improved = r && r.improved;
wide = improved ? 1 : Math.min(2.5, wide * 1.35);
const news = [];
for (const k of Object.keys(this.best.tricks)) if (!this.found[k]) { this.found[k] = this.gen + 1; news.push(TRICK_NAMES[k] || k); }
if (improved || news.length) this.ui.record(this.gen + 1, this.best, news, !improved, false, prev);
this.gen++;
if (this.bookDirty) { saveBook(this.setup.tricks, this.book); this.bookDirty = false; }
this.hist.push([this.gen, Math.round(this.best.fit), Math.round(r && r.full ? r.full.fit : this.best.fit), this.best.prog]);
this.ui.progress({ gen: this.gen, best: this.best, mean: this.best.fit, ms: r && r.ms || 0, mode: 'sweep', label: improved ? tx('vừa tìm được cách đi tốt hơn', 'just found a better way') : tx(`lượt dò thứ ${this.gen}, dò rộng hơn (×${wide.toFixed(1)})`, `sweep ${this.gen}, searching wider (×${wide.toFixed(1)})`), tries: this.tries });
this.save();
}
} catch (err) {
if (this.running && !(this.pool && this.pool.closed)) throw err;
} finally {
this.save();
if (this.bookDirty) { saveBook(this.setup.tricks, this.book); this.bookDirty = false; }
this.running = false;
}
}
learnBook(j, cs) {
const ref = this.airOf(j);
for (const c of cs) {
const mv = c.p.mv[j] | 0, r = c.r;
if (!mv || c.same || !r) continue;
const e = r.jl.find(q => q.k === j), fell = !e || (r.crash && r.crashSec === j);
if (!e && !ref) continue;
this.book.push([e ? e.a : ref, mv, fell ? 0 : 1, e ? e.tr : 0, e ? e.g : 0]);
}
if (this.book.length > BOOK_ROWS) this.book.splice(0, this.book.length - BOOK_ROWS);
this.bookDirty = true;
}
async bestRide() { return this.pool ? this.pool.replay(this.plan) : null; }
}
const BRAIN_KEY = 'trailsai.brain3';
const BRAIN_FORMAT = 'trails-ai-brain', BRAIN_VERSION = 3;
const BRAIN_URL = `https://raw.githubusercontent.com/${REPO}/main/brain/brain.json`;
const BRAIN_CAP = 400;   // metres of each line a brain is scored on (a long line would hold every round up)
const weightsOk = w => Array.isArray(w) && w.length === BRAIN.size && w.every(num);
const readBrain = raw => {
let m;
try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
return m && m.format === BRAIN_FORMAT && m.version === BRAIN_VERSION && weightsOk(m.w) ? m : null;
};
function truncLine(route, n) {
if (route.length <= n) return route;
const X = Array.from(route.X).slice(0, n), Z = Array.from(route.Z).slice(0, n);
const near = (x, z, r) => { for (let i = 0; i < n; i += 3) if (Math.hypot(X[i] - x, Z[i] - z) < r) return true; return false; };
const pieces = route.pieces.filter(p => near(p.x, p.z, p.kind === 'shape' || p.kind === 'ground' ? 70 : 35));
return { ...route, X, Z, KIND: route.KIND.slice(0, n), W: route.W ? Array.from(route.W).slice(0, n) : undefined, length: n, pieces };
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
try { m = readBrain(keep.getItem(BRAIN_KEY) || 'null'); } catch { m = null; }
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
save() { try { keep.setItem(BRAIN_KEY, JSON.stringify(this.record())); } catch { /* storage full: keep learning anyway */ } }
stop() { this.running = false; }
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
const all = this.trainIdx.concat(test ? [this.testIdx] : []);
const [b, f] = await this.rate([this.best, freshBrain()], all);
const part = (r, idx) => ({ fit: r.fit(idx), share: r.share(idx), runs: idx.map(i => r.runs[all.indexOf(i)]) });
this.score = part(b, this.trainIdx); this.base = part(f, this.trainIdx);
this.test = test ? part(b, [this.testIdx]) : null; this.testBase = test ? part(f, [this.testIdx]) : null;
}
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
async offer(w) {
if (!this.pool || !weightsOk(w)) return null;
const [r] = await this.rate([w], this.trainIdx);
const took = await this.keep(w, r);
return { took, share: r.share() };
}
async keep(w, r) {
if (!(r.fit() > this.score.fit + 1e-6)) return false;
this.best = w.slice(); this.mean = w.slice(); this.adam = null;
this.score = { fit: r.fit(), share: r.share(), runs: r.runs };
if (this.testIdx >= 0) { const [t] = await this.rate([this.best], [this.testIdx]); this.test = { fit: t.fit(), share: t.share(), runs: t.runs }; }
this.save();
return true;
}
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
if (rows.length < BRAIN_ROW * 200) return info;
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
Object.assign(info, { rows: rows.length / BRAIN_ROW | 0, share: bestR.share(), w: bestW, took: await this.keep(bestW, bestR) });
return info;
}
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
const css = `
#tai{position:fixed;top:64px;right:12px;width:330px;max-height:calc(100vh - 80px);overflow:auto;z-index:2147483000;
background:rgba(18,22,28,.94);color:#e8edf2;font:13px/1.4 system-ui,sans-serif;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:12px 14px}
#tai-open{position:fixed;top:104px;right:12px;z-index:2147483000;padding:7px 12px;border-radius:18px;border:1px solid #3a4554;
background:rgba(18,22,28,.9);color:#e8edf2;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
#tai-open:hover{background:#2f6fde;border-color:#2f6fde}
#tai h3{margin:0 0 6px;font-size:15px;display:flex;justify-content:space-between;align-items:center}
#tai .x{background:none;border:0;color:#9aa;font-size:18px;cursor:pointer}
#tai .lang{background:none;border:1px solid #3a4554;border-radius:6px;color:#9aa;font-size:11px;padding:1px 6px;margin-right:6px;cursor:pointer}
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
const CRASH_NAMES = ['', 'Cắm đầu', 'Đập xuống đất', 'Lật xe', 'Bay qua ghi-đông', 'Bắt chéo khi tiếp đất', 'Lộn quá đà', 'Không bắt kịp khung xe', 'Không bắt kịp ghi-đông', 'Tiếp đất nghiêng'];
const CRASH_EN = ['', 'Nose dive', 'Slammed into the ground', 'Flipped over', 'Over the bars', 'Landed crossed up', 'Over-rotated', 'Lost the frame', 'Lost the bars', 'Landed sideways'];
const trickText = got => Object.entries(got).map(([k, n]) => (TRICK_NAMES[k] || k) + (k === 'whip' ? ` ${Math.round(n)}°` : n > 1 ? ` ×${n}` : '')).join(' + ');
function showRide(run) {
const { tr, ev, H } = run.trace, F = 5, n = tr.length / F;
if (n < 2) return;
const box = document.createElement('div'); box.id = 'tai-view';
box.innerHTML = `<div class="card"><div class="bar"><b>${tx('Lượt chạy tốt nhất của AI', "The AI's best ride")} · ${run.prog} m · ${typeof run.game === 'number' ? run.game + tx(' điểm game', ' game points') : Math.round(run.fit) + tx(' điểm', ' points')}</b>
<button class="sp">${tx('Tốc độ', 'Speed')} ×1</button><button class="again">${tx('Xem lại', 'Replay')}</button><button class="close">${tx('Đóng', 'Close')}</button></div>
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
box.querySelector('.sp').onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; e.target.textContent = `${tx('Tốc độ', 'Speed')} ×${speed}`; };
function bike(bx, by, ang, crashed) {
x.save(); x.translate(bx, by); x.rotate(ang);
x.lineCap = 'round'; x.lineJoin = 'round';
x.strokeStyle = '#dfe7ef'; x.lineWidth = 3;
for (const wx of [-15, 15]) { x.beginPath(); x.arc(wx, 0, 10, 0, Math.PI * 2); x.stroke(); }
x.strokeStyle = '#4da3ff'; x.lineWidth = 4;
x.beginPath(); x.moveTo(-15, 0); x.lineTo(-3, -1); x.lineTo(11, -13); x.lineTo(15, 0); x.moveTo(-3, -1); x.lineTo(-6, -13); x.lineTo(11, -13); x.stroke();
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
const tick = Math.round(T);
const crashEv = ev.find(e => e.crash && e.t <= tick);
const tumble = crashEv ? Math.min(2.5, (tick - crashEv.t) / 25) : 0;
bike(X(d), Y(y) - 6, -pitch + tumble, !!crashEv);
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
x.fillText(e.crash ? `${tx('Ngã', 'Crash')}: ${tx(CRASH_NAMES, CRASH_EN)[e.crash] || tx('mất lái', 'lost control')}` : words, W / 2, 70 + k * 38 - age * 20);
});
x.globalAlpha = 1; x.textAlign = 'left';
x.fillStyle = 'rgba(10,14,20,.55)'; x.fillRect(12, Hh - 46, 420, 34);
x.fillStyle = '#e8edf2'; x.font = '16px system-ui';
x.fillText(`${Math.round(d)} m   ·   ${lands ? '' : 'trick '}${pts} ${tx('điểm', 'points')}   ·${Math.round(sp * 3.6)} km/h${air ? `   ·   ${tx('đang bay', 'in the air')}` : ''}`, 22, Hh - 23);
if (T >= (n - 1) * 2 + 60) {
x.fillStyle = 'rgba(10,14,20,.7)'; x.fillRect(W / 2 - 220, Hh / 2 - 40, 440, 64);
x.fillStyle = '#fff'; x.font = 'bold 20px system-ui'; x.textAlign = 'center';
x.fillText(tx(`Hết lượt: ${run.end} sau ${run.prog} m`, `Ride over: ${endWord(run.end)} after ${run.prog} m`), W / 2, Hh / 2); x.textAlign = 'left';
}
raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
}
function makePanel() {
const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
const el = document.createElement('div'); el.id = 'tai';
el.innerHTML = `
<h3>${tl('AI tự học Trails', 'Trails AI that learns')} <span><button class="lang" ${tt('Chuyển sang tiếng Anh', 'Switch to Vietnamese')}>${tx('EN', 'VI')}</button><button class="x" ${tt('Ẩn', 'Hide')}>×</button></span></h3>
<div class="st">${tx('Đang chuẩn bị…', 'Getting ready…')}</div>
<div class="row pk"><select class="pick"><option>${tx(...PICK_WAIT)}</option></select><button class="b g here" ${tt('Đường chỗ tôi đứng: thêm con đường dưới bánh xe, từ chỗ này, theo hướng tôi đang quay mặt', 'The line where I am: add the trail under the wheels, from here, the way I am facing')}>📍</button><button class="b g rename" ${tt('Đặt tên cho đường này', 'Name this line')}>✎</button><button class="b g refresh" ${tt('Tìm lại đường gần tôi', 'Look again for lines near me')}>↻</button></div>
<div class="row big"><button class="b learn" disabled>${tx('Học lái', 'Learn')}</button><button class="b drive" disabled>${tx('AI lái', 'AI rides')}</button></div>
<div class="row"><button class="b g chal" ${tt('AI đọc các thử thách đang mở trong game (Challenges), chọn đường hợp nhất cho từng cái, học rồi lái cho tới khi game tính xong', "The AI reads the game's open challenges (Challenges), picks the best line for each, learns it and rides until the game counts it done")}>${tx('🏆 Làm thử thách của game', "🏆 Do the game's challenges")}</button></div>
<div class="kv">
${tl('Đang làm', 'Doing')}<b class="k-now">–</b>
${tl('Đường này', 'This line')}<b class="k-line">${tx('chưa học', 'not learned')}</b>
${tl('Bộ não chung', 'Shared brain')}<b class="k-brain">–</b>
${tl('Học từ bạn', 'Learning from you')}<b class="k-me">–</b>
</div>
<div class="log"></div>
<details class="more"><summary>${tl('Chi tiết, xem lại và chia sẻ', 'Details, replays and sharing')}</summary>
<div class="sec">${tl('Bài học của đường này', "This line's lesson")}<small>${tl('Kế hoạch AI tự tìm cho riêng đường đang chọn.', 'The plan the AI found by itself for the chosen line.')}</small></div>
<div class="kv">
${tl('Vòng học', 'Rounds')}<b class="k-gen">0</b>
${tl('Đang tập', 'Practising')}<b class="k-mode">–</b>
${tl('Điểm cao nhất', 'Best score')}<b class="k-best">–</b>
${tl('Quãng đường tốt nhất', 'Furthest')}<b class="k-prog">–</b>
${tl('Lượt chạy tốt nhất', 'Best ride')}<b class="k-end">–</b>
${tl('Tốc độ học', 'Learning speed')}<b class="k-speed">–</b>
${tl('Mượn kinh nghiệm', 'Borrowed experience')}<b class="k-borrow">–</b>
</div>
<div class="k-tricks"></div>
<div class="sec">${tl('Xem lại từng cú nhảy', 'Every jump, one by one')}<small>${tl('Lượt tốt nhất, chấm như game chấm: kiểu tiếp đất, trick, điểm và chuỗi nhân.', 'The best ride, graded as the game grades it: landing, trick, points and streak.')}</small></div>
<div class="k-jumps"><div class="jr">${tl('Chưa có lượt nào.', 'No ride yet.')}</div></div>
<div class="k-book"></div>
<canvas width="600" height="180"></canvas>
<div class="row"><button class="b g watch" disabled>${tl('Xem lại lượt chạy tốt nhất', 'Watch the best ride')}</button></div>
<div class="row s"><button class="b g export" disabled>${tl('Lưu ra file', 'Save to a file')}</button><button class="b g import">${tl('Mở file', 'Open a file')}</button><button class="b g share" disabled>${tl('Chia sẻ GitHub', 'Share on GitHub')}</button></div>
<input type="file" accept=".json,application/json" class="file" hidden>
<div class="row"><button class="b g forget" disabled>${tl('Quên đường này, học lại từ đầu', 'Forget this line, learn it again')}</button></div>
<div class="row"><button class="b g watchme" ${tt('Khi bạn tự lái trên đường AI đã học hoặc đang học, AI ghi lại tốc độ, chỗ bạn nhấc xe, pump, góc xe khi bay và trick của bạn, rồi thử cách đó trong mô phỏng', 'When you ride a line the AI has learned or is learning, the AI notes your speed, where you lift the bike, your pumping, the pitch in the air and your tricks, then tries your way in the simulation')}>👀</button></div>
<div class="row"><button class="b g shareme" ${tt('Mỗi lượt AI lái về đích không ngã, cách lần trước ít nhất 10 phút: AI tạo link xem lại lượt đó bằng nút Share của game (hiện trên trang của bạn) và mời mọi người trong chat vào chạy đường đó', 'Every ride the AI takes to the end without a fall, 10 minutes after the last at least: the AI makes a link to watch it with the game’s Share (shown on your profile) and invites everyone in chat to ride that line')}>📣</button></div>
<div class="sec">${tl('Bộ não chung', 'Shared brain')}<small>${tl('Một mạng nơ-ron luyện trên nhiều đường cùng lúc để lái được cả đường chưa từng thấy. Đường đang chọn được để riêng làm bài kiểm tra. Bộ não cũng cho đường mới một cách bắt đầu.', 'A neural network trained on many lines at once, to ride lines it has never seen too. The chosen line is kept apart as its test. The brain also gives new lines a way to start.')}</small></div>
<div class="kv">
${tl('Vòng luyện', 'Rounds')}<b class="b-gen">0</b>
${tl('Luyện trên', 'Trains on')}<b class="b-lines">–</b>
${tl('Trên các đường luyện', 'On its training lines')}<b class="b-train">–</b>
${tl('Đường chưa từng thấy', 'Line never seen')}<b class="b-test">–</b>
${tl('Tốc độ luyện', 'Training speed')}<b class="b-speed">–</b>
</div>
<div class="row s"><button class="b g brain-export">${tl('Lưu bộ não', 'Save the brain')}</button><button class="b g brain-import">${tl('Mở bộ não', 'Open a brain')}</button><button class="b g brain-share">${tl('Chia sẻ GitHub', 'Share on GitHub')}</button></div>
<input type="file" accept=".json,application/json" class="bfile" hidden>
</details>`;
document.body.appendChild(el);
const $ = s => el.querySelector(s);
return { el, $ };
}
function main() {
const { el, $ } = makePanel();
const workers = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 2));
let routeCache = new Map(), choices = [], busy = false;
const mine = () => { try { return JSON.parse(keep.getItem(MINE) || '[]') || []; } catch { return []; } };
const say = t => { $('.st').textContent = t; };
const log = (html) => { const d = document.createElement('div'); d.innerHTML = html; $('.log').prepend(d); };
const fmtTricks = tr => Object.entries(tr || {}).map(([k, n]) => `<span class="tag">${TRICK_NAMES[k] || k}${k === 'whip' ? '' : k === 'manual' ? ' ' + n + ' m' : n > 1 ? ' ×' + n : ''}</span>`).join('') || `<span style="color:#7d8a97">${tx('chưa có trick nào', 'no tricks yet')}</span>`;
const ui = {
record(gen, run, news, onlyNews, borrowed, prev) {
if (news.length) log(`${tx(`<b>Vòng ${gen}:</b> lần đầu làm được`, `<b>Round ${gen}:</b> landed for the first time`)} ${news.map(n => `<span class="tag">${n}</span>`).join('')}`);
if (onlyNews) return;
const n = run.jl ? run.jl.length : run.jumps, pts = typeof run.game === 'number' ? `${run.game} ${tx('điểm game', 'game points')}` : `${Math.round(run.fit)} ${tx('điểm', 'points')}`;
const what = [];
if (prev && prev.jl && run.jl && prev.end === 'về đích' && run.end === 'về đích') {
const used = new Set();
run.jl.forEach((b, i) => {
const a = prev.jl.find(q => !used.has(q) && Math.abs(q.i - b.i) < 12);
if (!a) return;
used.add(a);
if (a.g !== b.g) what.push(`${tx('cú', 'jump')} ${i + 1}: ${GRADE_NAMES[a.g]} → ${GRADE_NAMES[b.g]}`);
if (b.tr && b.tr !== a.tr) what.push(`${tx('cú', 'jump')} ${i + 1}: ${trickWords(b.tr, b.sp)}`);
});
}
const up = what.length ? ` · ${what.slice(0, 4).join(', ')}` : '';
const kmh = v => (v * 3.6).toFixed(1);
const pace = typeof run.vAvg === 'number' ? tx(` · trung bình ${kmh(run.vAvg)} km/h${run.goodPumps ? `, ${run.goodPumps} cú pump đúng nhịp (+${kmh(run.pumpGain)} km/h)` : ''}`,
` · average ${kmh(run.vAvg)} km/h${run.goodPumps ? `, ${run.goodPumps} pumps on time (+${kmh(run.pumpGain)} km/h)` : ''}`) : '';
const goal = run.goal ? `${tx(' · mục tiêu bài tập', ' · drill goal')} ${run.goal.n}/${run.goal.need}${goalMet(run) ? ' ✓' : ''}` : '';
if (goalMet(run) && !goalMet(prev)) log(tx(`<b>Vòng ${gen}: AI đạt mục tiêu của bài tập trong mô phỏng.</b> Mở bài này trong Training rồi bấm “AI lái” để AI làm bài thật.`, `<b>Round ${gen}: the AI meets the drill's goal in the simulation.</b> Open this drill in Training and press “AI rides” for the AI to do it for real.`));
const was = prev && typeof prev.game === 'number' && run.end === 'về đích' && prev.end === 'về đích' ? tx(`, trước ${prev.game}`, `, before ${prev.game}`) : '';
log(tx(`Vòng ${gen}: kỷ lục mới ${run.prog} m (${pts}${was}, ${n} cú nhảy, ${run.end})`, `Round ${gen}: new best ${run.prog} m (${pts}${was}, ${n} jumps, ${endWord(run.end)})`) + `${pace}${goal}${up}${borrowed ? tx(' · <b>nhờ kinh nghiệm từ đường khác</b>', ' · <b>thanks to experience from other lines</b>') : ''}`);
},
progress(p) {
$('.k-gen').textContent = p.gen;
$('.k-mode').textContent = p.label || tx('dò từng đoạn', 'searching section by section');
showBest(p.best);
$('.k-speed').textContent = tx(`${(p.ms / 1000).toFixed(1)} s cho lượt dò này (${p.tries} lần thử, ${workers} luồng)`, `${(p.ms / 1000).toFixed(1)} s for this sweep (${p.tries} tries, ${workers} threads)`);
showBorrow();
draw();
},
brainProgress(p) {
$('.b-speed').textContent = tx(`${(p.ms / 1000).toFixed(1)} s / vòng (${p.tries} lượt chạy)`, `${(p.ms / 1000).toFixed(1)} s / round (${p.tries} rides)`);
showBrain();
if (p.improved) log(tx(`Bộ não vòng ${p.gen}: kỷ lục mới, đi được ${pct(brain.score.share)} quãng đường các đường luyện${brain.test ? `, ${brain.test.runs[0].prog} m trên đường chưa từng thấy` : ''}.`,
`Brain round ${p.gen}: new best, it rides ${pct(brain.score.share)} of the way on its training lines${brain.test ? `, ${brain.test.runs[0].prog} m on the line it never saw` : ''}.`));
},
};
const pct = v => `${Math.round(v * 100)}%`;
function showBrain() {
$('.b-gen').textContent = brain.gen;
$('.k-brain').textContent = !brain.gen ? tx('chưa luyện', 'not trained') : brain.score ? tx(`đi được ${pct(brain.score.share)} trên ${brain.trainIdx.length} đường`, `rides ${pct(brain.score.share)} of ${brain.trainIdx.length} lines`) : tx(`đã luyện ${brain.gen} vòng`, `trained ${brain.gen} rounds`);
if (!brain.lines) return;
$('.b-lines').textContent = `${brain.trainIdx.length} ${tx('đường', 'lines')}`;
$('.b-train').textContent = tx(`${pct(brain.score.share)} quãng đường (lúc mới: ${pct(brain.base.share)})`, `${pct(brain.score.share)} of the way (at first: ${pct(brain.base.share)})`);
const cap = brain.testIdx >= 0 ? Math.min(brain.lines[brain.testIdx].len, BRAIN_CAP) : 0;
$('.b-test').textContent = brain.test ? `${brain.test.runs[0].prog} / ${cap} m (${tx('lúc mới', 'at first')}: ${brain.testBase.runs[0].prog} m)` : '–';
}
function jumpReview(b) {
const jl = b && b.jl;
if (!jl) return `<div class="jr">${tx('Chưa có lượt nào được chấm.', 'No ride graded yet.')}</div>`;
if (!jl.length) return `<div class="jr">${tx('Lượt này chưa có cú nhảy nào được game tính.', 'The game counts no jump in this ride yet.')}</div>`;
const runIn = trainer.route ? trainer.N - trainer.route.length : 0, c =[0, 0, 0, 0, 0, 0], fits = bookSummary(trainer.book || []).filter(x => x.n);
let top = 1;
for (const e of jl) { c[e.g]++; top = Math.max(top, e.m); }
return `<div class="jr">${tx(`<b>${b.game} điểm</b> theo cách game tính`, `<b>${b.game} points</b> as the game counts them`)} · ${gradeCount(c)} · ${tx('chuỗi cao nhất', 'best streak')} ×${top}</div>` + jl.map((e, n) => {
const tip = landingTip(e, fits);
return `<div class="jr"><b>${n + 1}.</b> ${Math.max(0, e.i - runIn)} m · ${tx(`bay ${e.a.toFixed(2)} s, cao ${e.h.toFixed(1)} m, xa ${e.d.toFixed(1)} m`, `air ${e.a.toFixed(2)} s, ${e.h.toFixed(1)} m high, ${e.d.toFixed(1)} m long`)} · <span class="g${e.g}">${GRADE_NAMES[e.g]}</span>${e.tr ? ' · ' + trickWords(e.tr, e.sp) : ''} · <b>+${e.p}</b>${e.m > 1 ? ` (×${e.m})` : ''}${tip ? `<br><small>${tip}</small>` : ''}</div>`;
}).join('');
}
function bookText() {
if (!trainer.setup) return '';
if (!trainer.setup.tricks) return `<div class="jr">${tx('<b>Sổ tay trick:</b> tài khoản chưa mở khóa trick, nên AI chỉ tập tiếp đất đẹp và giữ chuỗi.', '<b>Trick book:</b> the account has not unlocked tricks, so the AI only practises clean landings and keeping the streak.')}</div>`;
const B = trainer.book || [];
return `<div class="jr">${tx(`<b>Sổ tay trick</b> (${B.length} lần thử)`, `<b>Trick book</b> (${B.length} tries)`)}: ${bookSummary(B).map(x => (x.n ? tx(`${x.name} làm được từ ${x.min.toFixed(2)} s bay (${x.n}/${x.tries} lần)`, `${x.name} landed from ${x.min.toFixed(2)} s of air (${x.n}/${x.tries})`) : tx(`${x.name} chưa làm được`, `${x.name} not landed yet`))).join(' · ')}</div>`;
}
function showBest(b) {
if (!b) return;
$('.k-best').textContent = typeof b.game === 'number' ? `${b.game} (${tx('cách game tính', 'as the game counts')})` : Math.round(b.fit);
$('.k-jumps').innerHTML = jumpReview(b);
$('.k-book').innerHTML = bookText();
$('.k-prog').textContent = `${b.prog} / ${trainer.N} m`;
$('.k-end').textContent = `${endWord(b.end)}, ${b.jumps} ${tx('cú nhảy', 'jumps')}${b.goal ? `${tx(' · mục tiêu bài tập', ' · drill goal')} ${b.goal.n}/${b.goal.need}${goalMet(b) ? ' ✓' : ''}` : ''}`;
$('.k-tricks').innerHTML = fmtTricks(b.tricks);
$('.watch').disabled = $('.export').disabled = $('.share').disabled = false;
showLine();
}
function showLine() {
const o = choices[+$('.pick').value];
let t = '–';
if (o && trainer.route && trainer.route.start.id === o.s.id && trainer.best) t = `${tx('AI đi được', 'AI rides')} ${trainer.best.prog} / ${trainer.N} m`;
else if (o) {
let m = null;
try { m = JSON.parse(keep.getItem(STORE + o.s.id) || 'null'); } catch { m = null; }
t = m && m.bestRun ? `${tx('AI đi được', 'AI rides')} ${m.bestRun.prog} m` : tx('chưa học', 'not learned');
}
$('.k-line').textContent = t;
}
const trainer = new Trainer(ui);
const brain = new BrainTrainer(ui);
function showBorrow() {
if (!trainer.borrow) return;
const alike = trainer.borrow.filter(Boolean).length, jumps = trainer.secs.filter(s => s.jump).length;
$('.k-borrow').textContent = alike ? tx(`${alike}/${jumps} cú nhảy giống (được thử ở mỗi lượt dò)`, `${alike}/${jumps} jumps alike (tried in every sweep)`) : tx('chưa có cú nhảy giống', 'no jumps alike yet');
}
function draw() {
const c = $('canvas'), x = c.getContext('2d'), h = trainer.hist;
x.clearRect(0, 0, c.width, c.height);
if (h.length < 2) return;
const max = Math.max(...h.map(r => r[1]), 1), min = Math.min(0, ...h.map(r => r[2]));
const X = i => 8 + (i / (h.length - 1)) * (c.width - 16), Y = v => c.height - 10 - (v - min) / (max - min) * (c.height - 24);
const line = (k, col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); h.forEach((r, i) => i ? x.lineTo(X(i), Y(r[k])) : x.moveTo(X(i), Y(r[k]))); x.stroke(); };
line(2, '#5d7085'); line(1, '#4da3ff');
x.fillStyle = '#9fb0c2'; x.font = '22px system-ui'; x.fillText(`${tx('cao nhất', 'best')} ${max}`, 12, 26);
}
async function findTracks() {
say(tx('Đang chờ game tải xong…', 'Waiting for the game to load…'));
for (let i = 0; i < 180 && !(live.g && cap.starts.length && cap.chunks.size); i++) await new Promise(r => setTimeout(r, 500));
say(tx('Đang tìm đường quanh bạn…', 'Looking for lines around you…'));
if (!cap.chunks.size) {
if (cap.ws && cap.ws.readyState === 1) {
say(tx('Đang lấy dữ liệu đường đua (game sẽ kết nối lại một lần)…', "Getting the trails' data (the game reconnects once)…"));
cap.ws.close();
for (let i = 0; i < 40 && cap.chunks.size < 4; i++) await new Promise(r => setTimeout(r, 500));
await new Promise(r => setTimeout(r, 2500));
} else {
say(tx('Chưa bắt được kết nối của game. Hãy đạp xe một chút rồi bấm nút ↻ cạnh danh sách đường.', "The game's connection has not been caught yet. Ride a little, then press ↻ next to the list of lines."));
return;
}
}
const me = await whereAmI();
if (!me) { say(tx('Chưa biết bạn đang ở đâu. Hãy đạp xe một chút rồi thử lại.', 'Where you are is not known yet. Ride a little, then try again.')); return; }
const starts = cap.starts.concat(mine().filter(m => !cap.starts.some(s => s.id === m.id)));
const near = starts.map(s => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) })).filter(o => o.d < 600).sort((a, b) => a.d - b.d).slice(0, 15);
const drills = await drillsNow();
choices = drills.map(r => ({ s: r.start, d: 0, drill: r })).concat(near);
listLines();
$('.learn').disabled = $('.drive').disabled = !choices.length;
showLine();
const dn = drills.map(r => DRILL_GOALS[r.drill.goal].name).join(' / ');
if (drills.length) say(tx(`Bạn đang mở bài tập “${dn}” trong Training: nó ở đầu danh sách. Bấm “Học lái” để AI tập bài này trong mô phỏng, rồi “AI lái” để AI làm bài thật.`, `You have the drill “${dn}” open in Training: it is at the top of the list. Press “Learn” for the AI to practise it in the simulation, then “AI rides” for the AI to do it for real.`));
else say(near.length ? tx(`Tìm thấy ${near.length} điểm xuất phát gần ${me.how}. Chọn đường (gần nhất ở trên cùng) rồi bấm “Học lái” hoặc “AI lái”.`, `Found ${near.length} starts near ${me.how === 'vị trí của bạn' ? 'you' : 'the part of the map loading'}. Pick a line (the nearest is at the top), then press “Learn” or “AI rides”.`)
: tx('Không có đường nào trong vòng 600 m. Hãy đến gần một đường rồi bấm ↻.', 'No line within 600 m. Get near a line, then press ↻.'));
}
let spawnSeen = live.spawn;
setInterval(async () => {
if (live.spawn === spawnSeen || busy || learning || live.drive || looping || starting) return;
spawnSeen = live.spawn;
const ds = await drillsNow();
if (ds.length ? !choices.some(o => o.drill && o.s.id === ds[0].start.id) : choices.some(o => o.drill)) findTracks();
}, 1500);
function listLines() {
const sel = $('.pick'), at = sel.value;
sel.innerHTML = choices.length ? choices.map((o, i) => `<option value="${i}">${i + 1}. ${esc(lineName(o.s.id))} · ${o.drill ? tx('bài tập đang mở', 'drill open now') : tx(`cách ${Math.round(o.d)} m`, `${Math.round(o.d)} m away`)}${hasMemory(o.s.id) ? tx(' · đã học', ' · learned') : ''}</option>`).join('')
: `<option>${tx(...PICK_NONE)}</option>`;
if (at && choices[+at]) sel.value = at;
}
async function addHere() {
if (busy || learning || live.drive || looping || starting) { say(tx('Hãy dừng học và dừng AI lái trước, rồi bấm 📍.', 'Stop learning and stop the AI riding first, then press 📍.')); return; }
const me = await whereAmI();
if (!me || me.how !== 'vị trí của bạn') { say(tx('Chưa biết bạn đang ở đâu. Hãy ngồi trên xe ở con đường bạn muốn, quay mặt theo hướng muốn đi, rồi bấm 📍.', 'Where you are is not known yet. Sit on the bike on the trail you want, face the way you want to go, then press 📍.')); return; }
say(tx('Đang dò con đường dưới bánh xe…', 'Tracing the trail under the wheels…'));
const got = await lineHere(me);
if (!got) { say(tx('Không thấy con đường nào trong vòng 20 m quanh bạn, hoặc đường dài chưa tới 25 m. Hãy đến gần hơn (game tải dần đường quanh bạn) rồi bấm 📍 lại.', 'No trail within 20 m of you, or it is shorter than 25 m. Get closer (the game loads the trails around you bit by bit), then press 📍 again.')); return; }
const { s, r, lead } = got;
try { keep.setItem(MINE, JSON.stringify([s].concat(mine().filter(q => q.id !== s.id)).slice(0, 100))); } catch { /* storage blocked */ }
routeCache.set(s.id, r);
choices = [{ s, d: Math.hypot(s.x - me.x, s.z - me.z) }].concat(choices.filter(o => o.s.id !== s.id));
listLines();
$('.pick').value = '0';
$('.learn').disabled = $('.drive').disabled = false;
showLine();
say(tx(`Đã thêm “${lineName(s.id)}” lên đầu danh sách: ${r.length} m${lead ? `, bắt đầu ${lead} m trước chỗ bạn đứng để lấy đà` : ' từ chỗ bạn đứng'}${s.back ? ', chạy ngược chiều đường' : ''}. Bấm “Học lái” để AI học đường này, hoặc “AI lái” để AI lái ngay.`,
`Added “${lineName(s.id)}” to the top of the list: ${r.length} m${lead ? `, starting ${lead} m before where you are for a run-up` : ' from where you are'}${s.back ? ', ridden against the line' : ''}. Press “Learn” for the AI to learn this line, or “AI rides” for it to ride now.`));
}
function renameLine() {
const o = choices[+$('.pick').value];
if (!o) return;
const got = prompt(tx('Tên cho đường này (để trống thì dùng lại tên AI đặt):', 'A name for this line (empty: the name the AI gave it):'), lineName(o.s.id));
if (got === null) return;
setLineName(o.s.id, got);
listLines();
say(tx(`Đường này giờ tên là “${lineName(o.s.id)}”.`, `This line is now called “${lineName(o.s.id)}”.`));
}
const hasMemory = id => { try { return !!keep.getItem(STORE + id); } catch { return false; } };
const savedLine = id => { try { const m = JSON.parse(keep.getItem(STORE + id) || 'null'); return m && m.line && m.line.X ? m.line : null; } catch { return null; } };
const sharedSeen = new Map();
async function useLesson(m, from, quiet) {
const r = await trainer.offer(m);
if (!r.fits) { if (!quiet) log(tx(`Bài học từ ${from} được học trên một bản đồ khác của đường này nên AI không dùng được.`, `The lesson from ${from} was learned on another map of this line, so the AI cannot use it.`)); return; }
if (r.took) { log(tx(`<b>Dùng bài học từ ${from}:</b> chạy được ${r.run.prog} m, ${Math.round(r.run.fit)} điểm, giỏi hơn AI đang có.`, `<b>Using the lesson from ${from}:</b> it rides ${r.run.prog} m, ${Math.round(r.run.fit)} points, better than the AI has.`)); showBest(trainer.best); draw(); }
else if (!quiet) log(tx(`Bài học từ ${from}: ${r.run.prog} m, ${Math.round(r.run.fit)} điểm. AI của bạn đang giỏi hơn nên giữ nguyên.`, `Lesson from ${from}: ${r.run.prog} m, ${Math.round(r.run.fit)} points. Your AI is better, so it keeps its own.`));
}
const introduced = new Set();
async function start() {
const o = choices[+$('.pick').value];
if (busy || !o) return false;
busy = true;
try {
releaseBrain(); releaseDrill();
const setupChanged = trainer.setup && JSON.stringify(trainer.setup) !== JSON.stringify(riderSetup());
if (!trainer.route || trainer.route.start.id !== o.s.id || setupChanged || !trainer.pool) {
say(tx('Đang dò đường đi từ điểm xuất phát…', 'Tracing the line from its start…'));
const shared = await communityLesson(o.s.id);
const bid = baseId(o.s.id);
let route = o.drill || routeCache.get(o.s.id) || savedLine(o.s.id) || routeCache.get(bid) || savedLine(bid);
if (route && lineStale(route)) { log(tx('Đường này đã được sửa trong game từ lần học trước, AI dò lại đường.', 'This line has been changed in the game since it was last learned: the AI traces it again.')); route = null; }
if (!route && shared && !lineStale(shared.line)) { route = shared.line; log(tx('Lấy bản đồ đường này từ bài học cộng đồng trên GitHub.', "Taking this line's map from the community lesson on GitHub.")); }
if (!route) route = await buildRoute(o.s, undefined, undefined, o.s.back);
else if (!route.W && !route.practice && !o.drill) route = { ...route, W: await widthsOf(route) };
if (!route) { say(tx('Không dò được đường từ điểm này (có thể chưa tải hết). Thử điểm khác hoặc đến gần hơn.', 'Could not trace a line from this start (it may not have loaded yet). Try another start or get closer.')); return false; }
if (route.tour === undefined && !route.practice) route = { ...route, tour: 0 };
if (o.s.aim) route = { ...route, start: { ...route.start, id: o.s.id }, aim: o.s.aim };
routeCache.set(o.s.id, route);
say(tx(`Đường dài ${route.length} m, ${route.pieces.length} chi tiết. Đang nạp vật lý vào ${workers} luồng (có thể mất vài chục giây)…`, `The line is ${route.length} m, ${route.pieces.length} pieces. Loading the physics into ${workers} threads (may take some tens of seconds)…`));
const t0 = performance.now();
trainer.library = await gatherJumps();
trainer.brainW = brain.gen ? brain.best.slice() : null;
const mem = await trainer.prepare(route, workers);
const kinds = Object.entries(route.kinds).map(([k, n]) => `${n} ${k}`).join(', ');
const took = mem.from !== 'fresh';
if (mem.fromTrack && introduced.has(o.s.id)) log(tx(`Quay lại học đường này (vòng ${trainer.gen}, đang đi được ${trainer.best.prog} m).`, `Back to learning this line (round ${trainer.gen}, riding ${trainer.best.prog} m).`));
else {
introduced.add(o.s.id);
log(tx(`Đường mới <b>${esc(lineName(o.s.id))}</b>: ${route.length} m (${kinds}). Nạp xong sau ${((performance.now() - t0) / 1000).toFixed(0)} s.`, `New line <b>${esc(lineName(o.s.id))}</b>: ${route.length} m (${kinds}). Loaded in ${((performance.now() - t0) / 1000).toFixed(0)} s.`));
log(mem.kept ? tx(`Nhớ lại ${trainer.gen} vòng đã học trên đường này (${mem.kept} đoạn đầu), học tiếp các đường nối thêm.`, `Remembering ${trainer.gen} rounds learned on this line (its first ${mem.kept} sections), learning on the lines joined after.`)
: mem.fromTrack ? tx(`Nhớ lại ${trainer.gen} vòng đã học trên đường này.`, `Remembering ${trainer.gen} rounds learned on this line.`)
: tx(`${took ? 'Bắt đầu học' : 'Bắt đầu học từ con số 0'} (đường chia thành ${trainer.secs.length} đoạn, ${mem.jumps} cú nhảy).`, `${took ? 'Starting to learn' : 'Starting to learn from scratch'} (the line is cut into ${trainer.secs.length} sections, ${mem.jumps} jumps).`));
if (!mem.fromTrack) log(tx('Nếu đường thật dài hơn thế, hãy đạp dọc theo đường cho game tải hết, rồi bấm “Quên đường này, học lại từ đầu” (trong mục Chi tiết).', 'If the real line is longer than that, ride along it so the game loads all of it, then press “Forget this line, learn it again” (under Details).'));
if (!trainer.library.length) log(tx('Chưa có kinh nghiệm cú nhảy từ đường nào khác. Học xong đường này thì những đường sau sẽ mượn được.', 'No jump experience from other lines yet. Once this line is learned, the next ones can borrow from it.'));
else if (!mem.alike) log(tx(`Kho kinh nghiệm có ${trainer.library.length} cú nhảy từ các đường khác, nhưng chưa cú nào giống cú nhảy của đường này.`, `The experience store has ${trainer.library.length} jumps from other lines, but none like this line's jumps yet.`));
else {
log(tx(`<b>Mượn kinh nghiệm:</b> ${mem.alike}/${mem.jumps} cú nhảy của đường này giống cú nhảy AI đã học ở ${mem.lines} đường khác. Mỗi khi bị kẹt ở một cú nhảy, AI thử cách đã thành công ở những cú giống nó.`, `<b>Borrowing experience:</b> ${mem.alike}/${mem.jumps} jumps of this line are like jumps the AI learned on ${mem.lines} other lines. Whenever it is stuck on a jump, the AI tries what worked on the ones like it.`));
if (mem.from === 'borrow') log(tx(`Bắt đầu bằng cách chạy mượn được: đi được ngay <b>${mem.seed.prog} m</b> (học từ con số 0 thì chỉ ${mem.fresh.prog} m).`, `Starting with the borrowed ride: it rides <b>${mem.seed.prog} m</b> at once (from scratch only ${mem.fresh.prog} m).`));
else if (mem.seed && beats(mem.seed, mem.fresh)) log(tx(`Mượn nguyên cả đường thì đi được ${mem.seed.prog} m (học từ con số 0: ${mem.fresh.prog} m).`, `Borrowing the whole line rides ${mem.seed.prog} m (from scratch: ${mem.fresh.prog} m).`));
else if (mem.seed) log(tx(`Mượn nguyên cả đường thì đi được ${mem.seed.prog} m, chưa hơn học từ con số 0 (${mem.fresh.prog} m), nên AI mượn dần từng cú nhảy.`, `Borrowing the whole line rides ${mem.seed.prog} m, no better than from scratch (${mem.fresh.prog} m), so the AI borrows jump by jump.`));
}
if (mem.brain) {
const b = mem.brain, at = r => `${r.prog} m, ${Math.round(r.fit)} ${tx('điểm', 'points')}`;
if (mem.from === 'brain') log(tx(`<b>Bắt đầu từ cách lái của bộ não chung:</b> bộ não đi được ${b.prog} m trên đường này. Chép cách lái đó thành bài học thì được ngay <b>${at(b.run)}</b> (học từ con số 0: ${at(mem.fresh)}${mem.seed ? `; mượn cú nhảy: ${at(mem.seed)}` : ''}).`,
`<b>Starting from the shared brain's riding:</b> the brain rides ${b.prog} m on this line. Copied into a lesson, that gives <b>${at(b.run)}</b> at once (from scratch: ${at(mem.fresh)}${mem.seed ? `; borrowing jumps: ${at(mem.seed)}` : ''}).`));
else log(tx(`Bộ não chung đi được ${b.prog} m trên đường này. Chép cách lái đó thành bài học thì được ${at(b.run)}, chưa hơn cách bắt đầu đang có (${at(trainer.best)}), nên không dùng.`, `The shared brain rides ${b.prog} m on this line. Copied into a lesson that gives ${at(b.run)}, no better than the start there is (${at(trainer.best)}), so it is not used.`));
}
if (route.drill) log(tx(`<b>Bài tập Training “${DRILL_GOALS[route.drill.goal].name}”:</b> AI tập trong mô phỏng cho tới khi đạt mục tiêu của bài${route.drill.pedals ? '' : ' (không được đạp, như trong game)'}.`, `<b>Training drill “${DRILL_GOALS[route.drill.goal].name}”:</b> the AI practises in the simulation until it meets the drill's goal${route.drill.pedals ? '' : ' (no pedalling, as in the game)'}.`));
else if (trainer.setup.tricks === 0) log(tx('Tài khoản của bạn chưa mở khóa trick trong game (game mở khi bạn đủ 200 cú nhảy và 5 đường), nên AI tập chạy hết đường mà không làm trick. Mở khóa xong, lần học sau AI sẽ tự tập trick.', 'Your account has not unlocked tricks in the game yet (the game unlocks them at 200 jumps and 5 lines), so the AI learns to ride the whole line without tricks. Once they are unlocked, the next learning practises tricks by itself.'));
}
const pm = mem.player;
if (pm && pm.secs) log(pm.took ? tx(`<b>Học từ cách bạn lái:</b> lái theo cách bạn ở ${pm.secs} đoạn${pm.jumps ? ` (${pm.jumps} cú nhảy)` : ''}${pm.air ? ', ở tốc độ của AI' : ''}, AI đi được ngay <b>${pm.run.prog} m</b>, giỏi hơn cách nó đang có. Mỗi lượt dò AI vẫn thử cách của bạn ở từng đoạn.`,
`<b>Learning from how you ride:</b> riding your way on ${pm.secs} section(s)${pm.jumps ? ` (${pm.jumps} jump(s))` : ''}${pm.air ? ', at the AI\'s speeds' : ''}, the AI rides <b>${pm.run.prog} m</b> at once, better than the way it had. Every sweep still tries your way section by section.`)
: tx(`<b>Học từ cách bạn lái:</b> AI có ${playerRides(o.s.id).length} lượt bạn lái đường này (${pm.secs} đoạn). Lái theo cả cách đó thì chưa hơn cách AI đang có (${pm.run.prog} m), nên mỗi lượt dò AI thử cách của bạn ở từng đoạn.`,
`<b>Learning from how you ride:</b> the AI has ${playerRides(o.s.id).length} ride(s) of yours on this line (${pm.secs} section(s)). Riding all of it your way is no better than the way it has (${pm.run.prog} m), so every sweep tries your way section by section.`));
if (shared) { sharedSeen.set(o.s.id, shared.savedAt); await useLesson(shared, tx('cộng đồng trên GitHub', 'the community on GitHub')); }
$('.k-gen').textContent = trainer.gen;
showBest(trainer.best);
showBorrow();
draw();
$('.forget').disabled = false;
}
if (!learning || cancel) return true;
say(tx('AI đang học đường này: thử, ngã, rút kinh nghiệm… Bạn có thể tiếp tục chơi.', 'The AI is learning this line: trying, falling, learning from it… You can keep playing.'));
busy = false;
await trainer.run();
} catch (err) {
say(tx('Lỗi: ', 'Error: ') + (err && err.message || err));
console.error(err);
return false;
} finally {
busy = false;
}
return true;
}
async function watch() {
if (!trainer.pool) { say(tx('Xem lại được khi AI đang học đường này (bấm “Học lái”).', 'A replay is possible while the AI learns this line (press “Learn”).')); return; }
say(tx('Đang dựng lại lượt chạy tốt nhất…', 'Rebuilding the best ride…'));
const r = await trainer.bestRide();
if (!r || !r.trace) return;
say(tx(`Lượt chạy tốt nhất: ${r.prog} m, ${Math.round(r.fit)} điểm, kết thúc: ${r.end}.`, `Best ride: ${r.prog} m, ${Math.round(r.fit)} points, ended: ${endWord(r.end)}.`));
showRide(r);
}
async function lineFor(s, tour) {
let route = routeCache.get(s.id) || savedLine(s.id);
if (route && lineStale(route)) route = null;
if (!route) route = await buildRoute(s, undefined, undefined, s.back);
if (route && tour) route = await extendRoute(route);
if (route) routeCache.set(s.id, route);
return route;
}
const BRAIN_LINES = 40, DRILLS = 12, NEW_DRILLS = 4;
async function brainLines() {
const o = choices[+$('.pick').value], at = o ? o.s : choices.length ? choices[0].s : null;
const most = BRAIN_LINES, real = most - DRILLS - NEW_DRILLS;
const testId = o ? o.s.id : null, got = new Map(), drills = [];
try {
for (let i = 0; i < keep.length; i++) {
const key = keep.key(i);
if (!key || !key.startsWith(STORE)) continue;
const id = key.slice(STORE.length), L = savedLine(id);
if (L && L.practice) drills.push(L);
else if (L && id !== testId && !lineStale(L)) got.set(id, L);
}
} catch { /* storage blocked */ }
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
const r = await practiceLine(seed, lane, drillLevel() * (lane % 4) / 3);
if (r && r.length >= 40) train.push(r);
}
return { train, test: o ? await lineFor(o.s) : null };
}
function releaseBrain() {
if (brain.running) brain.stop();
if (brain.pool) { brain.pool.close(); brain.pool = null; }
}
function releaseLine() {
if (trainer.running) trainer.stop();
if (trainer.pool) { trainer.pool.close(); trainer.pool = null; }
}
let distilledKey = null, brainTold = false;
async function brainStart() {
if (busy) return false;
busy = true;
try {
releaseLine(); releaseDrill();
const o = choices[+$('.pick').value];
if (!brain.pool || brain.testId !== (o ? o.s.id : null) || JSON.stringify(brain.setup) !== JSON.stringify(riderSetup())) {
say(tx('Đang gom các đường để luyện bộ não chung…', 'Gathering lines to train the shared brain…'));
const { train, test } = await brainLines();
if (train.length < 2) { log(tx('Bộ não chung cần ít nhất 2 đường gần đây để luyện, nên AI chỉ học đường đang chọn.', 'The shared brain needs at least 2 lines nearby to train on, so the AI only learns the chosen line.')); return false; }
say(tx(`Đang nạp ${train.length + (test ? 1 : 0)} đường vào ${workers} luồng cho bộ não chung (có thể mất một phút)…`, `Loading ${train.length + (test ? 1 : 0)} lines into ${workers} threads for the shared brain (may take a minute)…`));
const t0 = performance.now();
await brain.prepare(train, test, workers);
const real = train.filter(r => !r.practice), lens = real.map(r => r.length);
const secs = ((performance.now() - t0) / 1000).toFixed(0);
if (!brainTold) log(tx(`<b>Bộ não chung:</b> luyện trên ${train.length} đường: ${real.length} đường thật quanh bạn${real.length ? ` (dài ${Math.min(...lens)}–${Math.max(...lens)} m)` : ''} và ${train.length - real.length} bài tập kiểu Training AI tự tạo. Mỗi vòng thử trên ${Math.min(12, train.length)} đường lần lượt, mỗi đường chấm ${BRAIN_CAP} m đầu${test ? `. Đường đang chọn (${test.length} m) được để riêng, bộ não không bao giờ luyện trên nó` : ''}. Nạp xong sau ${secs} s.`,
`<b>Shared brain:</b> trains on ${train.length} lines: ${real.length} real lines around you${real.length ? ` (${Math.min(...lens)}–${Math.max(...lens)} m long)` : ''} and ${train.length - real.length} Training-style drills the AI made. Each round tries ${Math.min(12, train.length)} lines in turn, judging the first ${BRAIN_CAP} m of each${test ? `. The chosen line (${test.length} m) is kept apart: the brain never trains on it` : ''}. Loaded in ${secs} s.`));
brainTold = true;
const shared = await communityBrain();
if (shared) {
const r = await brain.offer(shared.w);
if (r) log(r.took ? tx(`<b>Dùng bộ não từ cộng đồng trên GitHub:</b> đi được ${pct(r.share)} quãng đường các đường của bạn, giỏi hơn bộ não đang có.`, `<b>Using the community brain from GitHub:</b> it rides ${pct(r.share)} of the way on your lines, better than the brain there is.`)
: tx(`Bộ não cộng đồng trên GitHub đi được ${pct(r.share)} quãng đường các đường của bạn, chưa hơn bộ não đang có.`, `The community brain from GitHub rides ${pct(r.share)} of the way on your lines, no better than the brain there is.`));
}
const plans = [];
let key = '';
brain.trainIdx.forEach(i => {
try { const m = JSON.parse(keep.getItem(STORE + brain.lines[i].id) || 'null'); if (m && m.plan && Array.isArray(m.plan.v)) { plans.push({ line: i, plan: m.plan }); key += `${brain.lines[i].id}:${m.gen};`; } } catch { /* skip it */ }
});
if (plans.length && key !== distilledKey) {
distilledKey = key;
say(tx(`Bộ não đang xem ${plans.length} bài học đã có để bắt chước…`, `The brain is watching ${plans.length} lessons to imitate…`));
const d = await brain.distill(plans);
if (d && d.share === undefined) log(tx('Chưa có bài học nào đi xa hơn bộ não trên đường của nó, nên bộ não không cần bắt chước.', 'No lesson rides further than the brain on its own line yet, so the brain has nothing to imitate.'));
else if (d) log(d.took ? tx(`<b>Bộ não đã bắt chước ${d.lines} bài học</b> (${d.rows} khoảnh khắc): giờ đi được ${pct(d.share)} quãng đường các đường luyện.`, `<b>The brain imitated ${d.lines} lessons</b> (${d.rows} moments): it now rides ${pct(d.share)} of the way on its training lines.`)
: tx(`Bộ não thử bắt chước ${d.lines} bài học nhưng chỉ đi được ${pct(d.share)}, chưa hơn bộ não đang có nên giữ nguyên.`, `The brain tried to imitate ${d.lines} lessons but only rides ${pct(d.share)}, no better than the brain there is, so it is kept.`));
}
showBrain();
}
if (!learning || cancel) return true;
say(tx('AI đang luyện bộ não chung trên nhiều đường cùng lúc, vài phút nữa sẽ quay lại đường này… Bạn có thể tiếp tục chơi.', 'The AI is training the shared brain on many lines at once, back to this line in a few minutes… You can keep playing.'));
busy = false;
await brain.run();
} catch (err) {
say(tx('Lỗi: ', 'Error: ') + (err && err.message || err));
console.error(err);
} finally {
busy = false;
}
return true;
}
const DRILL_TIME = 3 * 60e3, DRILLS_KEPT = 24, DRILL_KEY = 'trailsai.drill';
let drillT0 = 0;
const drill = new Trainer({
record() {},
progress(p) { if (learning && phase === 'drill') $('.k-now').textContent = `${tx('tập bài tập kiểu Training', 'practising a Training-style drill')}: ${p.best.prog} / ${drill.N} m`; },
});
function drillLevel(v) {
if (v === undefined) {
let s = null;
try { s = keep.getItem(DRILL_KEY); } catch { /* storage blocked */ }
return s !== null && num(+s) ? clamp(+s, 0, 1) : 0.3;
}
v = +clamp(v, 0, 1).toFixed(2);
try { keep.setItem(DRILL_KEY, String(v)); } catch { /* storage blocked */ }
return v;
}
function releaseDrill() {
if (drill.running) drill.stop();
if (drill.pool) { drill.pool.close(); drill.pool = null; }
}
function dropOldDrills() {
const all = [];
try {
for (let i = 0; i < keep.length; i++) {
const key = keep.key(i);
if (!key || !key.startsWith(STORE + 'practice-')) continue;
let at = 0;
try { at = JSON.parse(keep.getItem(key)).savedAt || 0; } catch { /* unreadable: goes first */ }
all.push([at, key]);
}
all.sort((a, b) => b[0] - a[0]).slice(DRILLS_KEPT).forEach(([, key]) => keep.removeItem(key));
} catch { /* storage blocked */ }
}
async function drillStart() {
if (busy) return false;
busy = true;
try {
releaseLine(); releaseBrain();
say(tx('AI đang tập các bài tập kiểu Training, vài phút nữa sẽ quay lại đường này… Bạn có thể tiếp tục chơi.', 'The AI is practising Training-style drills, back to this line in a few minutes… You can keep playing.'));
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
if (end || Date.now() - drillT0 >= DRILL_TIME) level = drillLevel(end ? level + 0.1 : drill.best.prog < drill.N / 2 ? level - 0.1 : level);
dropOldDrills();
}
const lv = `${Math.round(level0 * 100)}%${level !== level0 ? ` → ${Math.round(level * 100)}%` : ''}`;
if (n) log(tx(`<b>Tập ${n} bài tập kiểu Training</b> (độ khó ${lv}): về đích ${done}/${n} bài, ${jumps} cú nhảy vượt được đã vào kho kinh nghiệm.`, `<b>Practised ${n} Training-style drills</b> (difficulty ${lv}): finished ${done}/${n}, and ${jumps} jumps cleared went into the experience store.`));
} catch (err) {
say(tx('Lỗi: ', 'Error: ') + (err && err.message || err));
console.error(err);
} finally {
busy = false;
releaseDrill();
}
return true;
}
const BRAIN_TIME = 5 * 60e3;
let learning = false, cancel = false, phase = null, brainT0 = 0, loopId = 0;
function showNow() {
$('.k-now').textContent = !learning ? tx('nghỉ', 'resting') : phase === 'brain' ? tx('luyện bộ não chung', 'training the shared brain') : phase === 'drill' ? tx('tập bài tập kiểu Training', 'practising a Training-style drill') : tx('học đường này', 'learning this line');
const b = $('.learn');
b.textContent = learning ? tx('Dừng học', 'Stop learning') : tx('Học lái', 'Learn');
b.classList.toggle('on', learning);
}
async function learnLoop(my) {
while (learning && my === loopId) {
cancel = false; phase = 'line'; showNow();
if (!(await start())) { learning = false; break; }
}
if (my === loopId) { phase = null; showNow(); }
}
setInterval(() => {
if (!learning) return;
const now = Date.now();
if (phase === 'drill' && drill.running) {
if (now - drillT0 > DRILL_TIME || (drill.best && drill.best.end === 'về đích')) drill.stop();
} else if (phase === 'brain' && brain.running) {
if (!brainT0) brainT0 = now;
else if (now - brainT0 > BRAIN_TIME) brain.stop();
}
}, 2000);
async function learnButton() {
if (learning) {
learning = false; cancel = true; loopId++; trainer.stop(); brain.stop(); drill.stop(); phase = null; showNow();
say(tx('Đã dừng học. Những gì AI học được đã được lưu, bấm “Học lái” để học tiếp.', 'Learning stopped. What the AI learned is saved; press “Learn” to go on.'));
return;
}
if (!choices[+$('.pick').value]) return;
learning = true; showNow();
for (let i = 0; i < 600 && (busy || trainer.running || brain.running); i++) await new Promise(r => setTimeout(r, 200));
if (learning) learnLoop(++loopId);
}
function lineChanged() {
showLine();
if (!learning) return;
cancel = true; trainer.stop(); brain.stop(); drill.stop();
}
let badge = null, starting = false, looping = false;
const driveLabel = on => { $('.drive').textContent = on ? tx('Dừng AI lái', 'Stop AI riding') : tx('AI lái', 'AI rides'); $('.drive').classList.toggle('on', on); };
function stopDrive(why, byPlayer, park) {
if (byPlayer) { looping = false; driveLabel(false); }
if (live.drive && live.drive.hold) { live.drive = null; if (badge) { badge.remove(); badge = null; } return; }
if (!live.drive) return;
const d = live.drive;
live.drive = null;
if (badge) { badge.remove(); badge = null; }
if (d.cleanup) d.cleanup();
const m = Math.max(0, d.base + d.rider.idx), e = Math.max(0, d.expect - d.runIn);
const extra = (d.legs ? tx(`, đi tiếp sang ${d.legs} đường khác`, `, rode on to ${d.legs} other lines`) : '') + (d.tricks ? `, ${d.tricks} trick` : '') + (d.swaps ? tx(`, dùng ${d.swaps} cách mới học được giữa chừng`, `, used ${d.swaps} new ways learned on the way`) : '');
log(tx(`<b>${d.who} lái thật:</b> ${why} sau ${m} m${extra}.`, `<b>${d.who} rode for real:</b> ${why} after ${m} m${extra}.`));
if (d.grades) log(tx(`Game chấm: ${gradeCount(d.grades)}, <b>${d.game} điểm</b> (cách game tính trong train), chuỗi cao nhất ×${d.top}.`, `The game graded: ${gradeCount(d.grades)}, <b>${d.game} points</b> (as the game counts them in trains), best streak ×${d.top}.`));
if (!byPlayer && !d.legs) {
if (lineStale(d.route)) log(tx('<b>Bản đồ trong mô phỏng không còn khớp với game</b> (đường đã được sửa). Bấm “Quên đường này, học lại từ đầu” để AI dò lại đường.', "<b>The simulation's map no longer matches the game</b> (the line has been changed). Press “Forget this line, learn it again” for the AI to trace it again."));
else if (Math.abs(m - e) > 15) log(tx(`Lượt thật lệch so với mô phỏng (dự đoán ${e} m), dù bản đồ vẫn khớp.`, `The real ride went otherwise than the simulation (it expected ${e} m), though the map still matches.`));
else log(tx(`Đúng như mô phỏng dự đoán (${e} m).`, `Just as the simulation expected (${e} m).`));
}
if (park && !byPlayer && shareOn && !sharing && Date.now() - shareAt() >= SHARE_EVERY) shareGood(d, m);
try {
const past = JSON.parse(keep.getItem(DRIVES) || '[]');
past.push({ at: Date.now(), id: d.route && d.route.start ? d.route.start.id : null, why, m, expect: e, legs: d.legs, tricks: d.tricks, game: d.game || 0, lands: d.lands || [], coast: d.coastAt === undefined ? null : d.coastAt });
keep.setItem(DRIVES, JSON.stringify(past.slice(-10)));
} catch { /* the rides are only notes */ }
if (looping) {
say(tx(`${d.who} lái thật: ${why} sau ${m} m. Lái lại từ đầu đường sau 3 giây với những gì mới học được (bấm “Dừng AI lái” để dừng hẳn).`, `${d.who} rode for real: ${why} after ${m} m. Riding again from the start of the line in 3 seconds with what it has just learned (press “Stop AI riding” to stop for good).`));
const rideAgain = () => {
if (!looping) return;
if (sharing) { setTimeout(rideAgain, 1000); return; }
if (live.drive && live.drive.hold) { live.drive = null; if (badge) { badge.remove(); badge = null; } }
if (!live.drive) aiDrive();
};
setTimeout(rideAgain, 3000);
} else say(tx(`${d.who} lái thật: ${why} sau ${m} m${extra}.`, `${d.who} rode for real: ${why} after ${m} m${extra}.`));
if (park) {
live.drive = { hold: true, step: () => [0, 127, 0, 0, 0, 0, 0] };
badge = document.createElement('div'); badge.id = 'tai-badge';
badge.innerHTML = tx(`Đã dừng: ${why}<small>AI giữ phanh${looping ? ', lái lại từ đầu đường sau 3 giây' : ''} · bấm “Dừng AI lái” để lấy lại tay lái</small>`, `Stopped: ${why}<small>The AI holds the brakes${looping ? ', riding again from the start of the line in 3 seconds' : ''} · press “Stop AI riding” to take the bike back</small>`);
document.body.appendChild(badge);
}
}
function driveButton() {
if (live.drive || looping) { if (chOn) chStop(); stopDrive(tx('bạn đã dừng AI', 'you stopped the AI'), true); return; }
looping = true; ridden = false; driveLabel(true);
aiDrive();
}
let ridden = false;
const cant = msg => {
if (looping && ridden) { say(msg + tx(' AI thử lại sau 5 giây.', ' The AI tries again in 5 seconds.')); setTimeout(() => { if (looping && !live.drive) aiDrive(); }, 5000); return; }
say(msg); looping = false; driveLabel(false);
};
async function getUp(always) {
if (!always && !(liveState()[13] > 0)) return;
starting = true;
for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: 'r', code: 'KeyR', bubbles: true }));
await new Promise(r => setTimeout(r, 500));
starting = false;
}
function driveLesson(ctx, P, expect, vEnd) {
const now = !P, geo = now ? trainer.geo : ctx.geo, secs = now ? trainer.secs : ctx.secs;
const R = { X: geo.X, Z: geo.Z, KIND: geo.KIND, length: geo.X.length, PZ: geo.PZ };
const plan = clonePlan(now ? trainer.plan : P);
const rider = makeRider(R, geo.H, secs, plan);
const d = { who: 'AI', route: now ? trainer.route : ctx.route, rider, expect, vEnd, tricks: 0, swaps: 0 };
d.profP = (now ? trainer.pool : ctx.pool).replay(plan).then(r => { if (!plan.lp) plan.lp = landSlopes(r, secs.length); return profileOf(r, R.length); }).catch(() => null);
if (now) d.takeNewer = swapper(trainer, plan, rider, secs, () => { d.swaps++; d.expect = trainer.best.prog; });
ride(d, R);
}
function swapper(T, plan, rider, secs, took) {
let known = T.plan;
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
return () => {
const p = T.plan;
if (p === known || !T.running) return;
known = p;
const upto = Math.min(secs.length - 1, Math.max(rider.sec, rider.airSec) + 1);
for (const k of PLAN_KEYS) for (let i = 0; i <= upto; i++) if (p[k][i] !== plan[k][i]) return;
for (let i = 0; i <= upto; i++) if (!same(p.vs && p.vs[i], plan.vs && plan.vs[i]) || ((p.lg && p.lg[i]) || 0) !== ((plan.lg && plan.lg[i]) || 0) || ((p.sa && p.sa[i]) || 0) !== ((plan.sa && plan.sa[i]) || 0)) return;
for (const k of ['pz', 'pk', 'as']) if (!same(p[k], plan[k])) return;
for (const k of PLAN_KEYS) plan[k] = p[k].slice();
if (p.vs) plan.vs = p.vs.map(q => (q ? q.slice() : null)); else delete plan.vs;
if (p.lg) plan.lg = p.lg.slice(); else delete plan.lg;
if (p.sa) plan.sa = p.sa.slice(); else delete plan.sa;
plan.lp = landSlopes(T.best, secs.length);
took();
};
}
let rideCtx = null;
async function lineCtx(o) {
if (rideCtx && rideCtx.id === o.s.id && JSON.stringify(rideCtx.setup) === JSON.stringify(riderSetup())) return rideCtx;
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
if (!live.ex || !live.g) return cant(tx('AI chưa gắn được vào game. Hãy tải lại trang game rồi bấm nút AI lại.', "The AI is not hooked into the game yet. Reload the game's page, then press the AI button again."));
let o = choices[+$('.pick').value];
if (!o) return cant(tx('Hãy chọn một đường trong danh sách trước đã.', 'Pick a line in the list first.'));
const styles = o.drill && (o.drill.drill.kind === 'boost' || o.drill.drill.kind === 'racer');
if (styles) {
await getUp(true);
const ask = ((document.body.innerText || '').match(/now:\s*(boost|racer)/i) || [])[1];
const i = ask ? choices.findIndex(c => c.drill && c.drill.drill.kind === ask.toLowerCase()) : -1;
if (i >= 0 && choices[i] !== o) { o = choices[i]; $('.pick').value = String(i); log(tx(`Game đang hỏi kiểu <b>${ask}</b>: AI lái bài học “${esc(lineName(o.s.id))}”.`, `The game is asking for <b>${ask}</b>: the AI rides the lesson “${esc(lineName(o.s.id))}”.`)); }
}
starting = true;
let go = null;
try {
say(tx('AI đang thử đường này trong mô phỏng trước khi lái…', 'The AI is trying this line in the simulation before riding…'));
const ctx = await lineCtx(o);
if (!ctx) return cant(tx('Không dò được đường từ điểm này (có thể chưa tải hết). Thử điểm khác hoặc đến gần hơn.', 'Could not trace a line from this start (it may not have loaded yet). Try another start or get closer.'));
const w = brain.best.slice();
const [bs] = await ctx.pool.evalBrains([w], [[0, 0]]);
let ls = null, P = null;
const setup = JSON.stringify(riderSetup());
if (trainer.route && trainer.route.start.id === o.s.id && trainer.best && JSON.stringify(trainer.setup) === setup) ls = trainer.best;
else {
let m = null;
try { m = JSON.parse(keep.getItem(STORE + o.s.id) || 'null'); } catch { m = null; }
if (m && planFits(m.plan, ctx.secs) && JSON.stringify(m.setup) === setup) ({ plan: P, run: ls } = await settleAir(ctx.pool, m.plan));
}
const better = (a, b) => a.prog > b.prog || (a.prog === b.prog && a.fit >= b.fit);
const lesson = ls && (!!ls.goal || better(ls, bs));
log(ls ? tx(`AI lái bằng <b>${lesson ? 'bài học của đường này' : 'bộ não chung'}</b>: trong mô phỏng bài học đi được ${ls.prog} m, bộ não ${bs.prog} m.`, `The AI rides with <b>${lesson ? "this line's lesson" : 'the shared brain'}</b>: in the simulation the lesson rides ${ls.prog} m, the brain ${bs.prog} m.`)
: tx(`Đường này chưa có bài học, nên <b>bộ não chung</b> lái (trong mô phỏng đi được ${bs.prog} m). Bấm “Học lái” để AI học đường này.`, `This line has no lesson yet, so the <b>shared brain</b> rides (in the simulation it rides ${bs.prog} m). Press “Learn” for the AI to learn this line.`));
go = lesson ? () => driveLesson(ctx, P, ls.prog, ls.vEnd) : () => {
const geo = ctx.geo, R = { X: geo.X, Z: geo.Z, KIND: geo.KIND, length: geo.X.length };
ride({ who: tx('Bộ não', 'The brain'), route: ctx.route, rider: makeBrainRider(R, geo.H, w), expect: bs.prog, vEnd: 8, tricks: 0, swaps: 0 }, R);
};
} catch (err) {
cant(tx('Lỗi: ', 'Error: ') + (err && err.message || err)); console.error(err);
} finally { starting = false; }
if (!go || !looping) return;
if (o.drill && !(await drillsNow()).some(r => r.start.id === baseId(o.s.id))) return cant(tx(`Hãy mở bài “${DRILL_GOALS[o.drill.drill.goal].name}” trong Training (bấm Ride) rồi bấm “AI lái”.`, `Open the drill “${DRILL_GOALS[o.drill.drill.goal].name}” in Training (press Ride), then press “AI rides”.`));
if (!styles) await getUp(!!o.drill);
go();
}
let chOn = false, chRun = 0, chWay = -1;
const chBad = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chLabel = () => { const b = $('.chal'); if (b) { b.textContent = chOn ? tx('Dừng làm thử thách', 'Stop the challenges') : tx('🏆 Làm thử thách của game', "🏆 Do the game's challenges"); b.classList.toggle('on', chOn); } };
function chStop(why) {
if (!chOn) return;
chOn = false; chRun++; chLabel();
if (why) say(why);
}
const lessonOf = id => { try { return JSON.parse(keep.getItem(STORE + id) || 'null'); } catch { return null; } };
const PERIOD_WORD = { day: 'hôm nay', week: 'tuần này', event: 'sự kiện' }, PERIOD_EN = { day: 'today', week: 'this week', event: 'event' };
async function chList() {
const L = cap.levels && cap.levels.challenges;
if (!L || !Array.isArray(L.list)) return [];
const defs = await challengeDefs(L.list.map(c => c.pool));
const ends = c => (c.period === 'day' ? L.dayEnds : c.period === 'week' ? L.weekEnds : (L.event && L.event.ends) || Infinity);
return L.list.filter(c => !c.done && ends(c) > Date.now()).map(c => {
const d = defs[c.pool];
return { c, text: d ? d.text : c.pool, ...(d ? aimOf(d.rule, c.need - c.have, cap.levels.stats, chWay) : { skip: tx('AI chưa hiểu thử thách này', 'the AI does not understand this challenge yet') }), ends: ends(c) };
}).sort((a, b) => a.ends - b.ends || b.c.xp - a.c.xp);
}
function chScore(A, o) {
const id = baseId(o.s.id), m = lessonOf(`${id}~${aimKey(A)}`) || lessonOf(id), b = m && m.bestRun;
const L = o.drill || routeCache.get(id) || savedLine(id) || (m && m.line) || null;
const g = b ? aimGoal(A, { jl: b.jl || [], crashT: b.crash ? b.ticks : -1, manOk: (b.tricks && b.tricks.manual) || 0, manLong: 0, moving: (b.ticks || 0) / 60 }) : null;
return { o, got: g ? g.n : 0, sec: b ? (b.ticks || 0) / 60 + 5 : 0, jumps: L && L.kinds ? (L.kinds.takeoff || 0) : 0, learned: !!(b && b.prog >= 50) };
}
function chPickLine(c, A, cands) {
const S = cands.map(o => chScore(A, o)).filter(x => !chBad.has(`${c.id}|${baseId(x.o.s.id)}`) && !(A.kind === 'row' && x.jumps && x.jumps < A.need));
const rate = x => (A.feat ? Math.min(x.got, A.need) : x.got / Math.max(1, x.sec));
S.sort((a, b) => rate(b) - rate(a) || (b.learned - a.learned) || (b.jumps - a.jumps) || (a.o.d - b.o.d));
return S[0] || null;
}
const WORLD_TRICKS = 'trailsai.worldtricks';
const worldTricks = v => {
try { if (v !== undefined) keep.setItem(WORLD_TRICKS, String(v)); return +(keep.getItem(WORLD_TRICKS) || 0) || 0; } catch { return v || 0; }
};
function backToRiding() {
const b = [...document.querySelectorAll('button')].find(e => /^Back to riding/.test((e.innerText || '').trim()) && e.getBoundingClientRect().width > 0);
if (b) b.click();
return !!b;
}
async function chPlan() {
const list = await chList(), ds = await drillsNow(), training = ds.length > 0;
const world = training ? worldTricks() : worldTricks(live.tricks || 0);
for (const ch of list) {
if (ch.skip) continue;
const A = ch.aim;
if (chBad.has(`${ch.c.id}|*`)) continue;
const lack = tricksLacking(A, world);
if (!lack.length) {
if (training) return { ch, back: true };
const cands = choices.filter(o => !String(o.s.id).includes('~') && !o.drill);
const got = chPickLine(ch.c, A, cands);
if (got) return { ch, A, o: got.o, score: got };
continue;
}
const tl = ds.find(r => r.drill && r.drill.goal === 'tricks');
if (tl && !chBad.has('tricks|*')) return { ch, A, o: { s: tl.start, d: 0, drill: tl }, unlock: true };
const need = lack.map(k => TRICK_WORD[k]).join(', ');
return { ch, wait: tx(`“${ch.text}” cần ${need}, mà tài khoản của bạn chưa mở khóa trick ngoài đường. Hãy mở <b>Training → Trick line</b> và bấm Ride it, rồi Ride: AI làm bài này (backflip, 360, whip rồi manual trong một lượt) để game mở khóa trick, rồi tự làm thử thách ngoài đường.`,
`“${ch.text}” needs ${need}, and your account has not unlocked tricks on the trails yet. Open <b>Training → Trick line</b> and press Ride it, then Ride: the AI does this drill (backflip, 360, whip then manual in one ride) so the game unlocks tricks, then does the challenge on the trails by itself.`) };
}
return null;
}
const chNow = id => ((cap.levels && cap.levels.challenges && cap.levels.challenges.list) || []).find(q => q.id === id);
async function challengeButton() {
if (chOn) { chStop(tx('Đã dừng làm thử thách. AI vẫn học/lái nếu đang bật; bấm “Dừng AI lái” để lấy lại tay lái.', 'Challenges stopped. The AI still learns or rides if that is on; press “Stop AI riding” to take the bike back.')); return; }
if (!live.ex || !live.g) { say(tx('AI chưa gắn được vào game. Hãy tải lại trang game rồi bấm nút AI lại.', "The AI is not hooked into the game yet. Reload the game's page, then press the AI button again.")); return; }
chOn = true; chLabel(); chBad.clear();
const my = ++chRun;
try { await chLoop(my); } catch (err) { console.error(err); say(tx('Lỗi: ', 'Error: ') + (err && err.message || err)); }
if (my === chRun) chStop();
}
async function chLoop(my) {
const on = () => chOn && my === chRun;
say(tx('Đang đọc thử thách của bạn từ game…', 'Reading your challenges from the game…'));
if (!cap.levels || Date.now() - cap.levelsAt > 60e3) {
askLevels();
for (let i = 0; i < 20 && on() && !(cap.levels && Date.now() - cap.levelsAt < 60e3); i++) await sleep(500);
}
if (!cap.levels) { say(tx('Chưa đọc được thử thách từ game. Hãy mở trang Challenges trong game một lần rồi bấm 🏆 lại.', "The challenges could not be read from the game yet. Open the game's Challenges page once, then press 🏆 again.")); return; }
if (!choices.some(o => !o.drill)) await findTracks();
const list = await chList();
if (!list.length) { say(tx('Bạn đã làm xong mọi thử thách đang mở 🎉', 'You have done every open challenge 🎉')); return; }
log(`${tx('<b>Thử thách đang mở', '<b>Open challenges')} (${list.length}):</b> ${list.map(x => `${esc(x.text)} (${x.c.have}/${x.c.need}, ${tx(PERIOD_WORD, PERIOD_EN)[x.c.period] || x.c.period})${x.skip ? ` · ${x.skip}` : tricksLacking(x.aim, live.tricks || 0).length ? tx(' · chưa mở khóa trick, làm trong Training', ' · tricks not unlocked, done in Training') : ''}`).join(' · ')}`);
let waitSaid = '';
while (on()) {
const p = await chPlan();
if (!on()) return;
if (!p) { say(tx('Không còn thử thách nào AI tự làm được lúc này (những cái còn lại cần bạn tự làm, xem nhật ký).', 'No challenge is left that the AI can do by itself now (the rest are yours to do, see the log).')); return; }
if (p.wait) {
if (waitSaid !== p.wait) { say(p.wait.replace(/<[^>]+>/g, '')); log(p.wait); waitSaid = p.wait; }
await sleep(3000); continue;
}
waitSaid = '';
if (p.back) {
if (live.drive || looping) stopDrive(tx('quay lại đường', 'back to the trails'), true);
log(tx('Trick đã mở khóa ngoài đường: AI bấm “Back to riding” để làm thử thách trên đường thật.', 'Tricks are unlocked on the trails: the AI presses “Back to riding” to do the challenges on a real trail.'));
if (!backToRiding()) { say(tx('Hãy bấm “Back to riding” trong game để AI làm thử thách trên đường thật.', 'Press “Back to riding” in the game for the AI to do the challenges on a real trail.')); await sleep(3000); continue; }
await sleep(4000);
await findTracks();
continue;
}
await chDo(p, on);
}
}
async function chDo(p, on) {
const { ch, A } = p, c0 = ch.c, plain = A.kind === 'ride' || !!p.unlock;
const base = p.o, id = plain ? base.s.id : `${baseId(base.s.id)}~${aimKey(A)}`;
const o = plain ? base : { s: { ...base.s, id, aim: A }, d: base.d };
if (base.drill && !plain) o.drill = { ...base.drill, start: { ...base.drill.start, id }, aim: A };
if (p.unlock) log(tx(`<b>Trick line</b>: để làm “${esc(ch.text)}” ngoài đường, AI làm bài này trước (backflip, 360, whip rồi manual, cả bốn trong một lượt không ngã) để game mở khóa trick cho tài khoản.`, `<b>Trick line</b>: to do “${esc(ch.text)}” on the trails, the AI first does this drill (backflip, 360, whip then manual, all four in one ride without falling) so the game unlocks tricks for the account.`));
else log(tx(`<b>Thử thách “${esc(ch.text)}”</b> (${c0.have}/${c0.need}): AI chọn ${base.drill ? 'bài tập Training đang mở' : `đường <b>${esc(lineName(baseId(base.s.id)))}</b> (cách ${Math.round(base.d)} m${p.score && p.score.got ? `, bài học cũ ở đó đã được ${p.score.got} mỗi lượt` : ''})`}${A.way ? `, whip về phía ${A.way > 0 ? 'phải' : 'trái'}` : ''}.`,
`<b>Challenge “${esc(ch.text)}”</b> (${c0.have}/${c0.need}): the AI picks ${base.drill ? 'the open Training drill' : `the line <b>${esc(lineName(baseId(base.s.id)))}</b> (${Math.round(base.d)} m away${p.score && p.score.got ? `, its old lesson there already gets ${p.score.got} a ride` : ''})`}${A.way ? `, whipping to the ${A.way > 0 ? 'right' : 'left'}` : ''}.`));
choices = [o].concat(choices.filter(q => q.s.id !== id));
listLines(); $('.pick').value = '0'; $('.learn').disabled = $('.drive').disabled = false; showLine();
if ((live.drive || looping) && !(live.drive && live.drive.route && live.drive.route.start && live.drive.route.start.id === id)) stopDrive(tx('chuyển sang thử thách mới', 'on to a new challenge'), true);
if (!learning) await learnButton(); else lineChanged();
const t0 = Date.now(), mine = () => trainer.route && trainer.route.start.id === id ? trainer.best : null;
const learnFor = A.kind === 'ride' ? 0 : p.unlock ? 300e3 : 180e3, ok = b => !!(b && b.goal && (p.unlock ? goalMet(b) : b.goal.n > 0));
while (on() && Date.now() - t0 < learnFor) {
const b = mine();
if (b && b.goal && (goalMet(b) || (!p.unlock && !A.feat && b.goal.n > 0 && Date.now() - t0 > 45e3))) break;
if (!learning && Date.now() - t0 > 5e3) break;
if (!p.unlock && b && b.prog < 30 && Date.now() - t0 > 60e3) break;
await sleep(2000);
}
if (!on()) return;
if (!p.unlock && mine() && mine().prog < 30 && Date.now() - t0 > 60e3) {
log(tx(`Đường <b>${esc(lineName(baseId(base.s.id)))}</b>: sau 1 phút học, chưa lượt thử nào đi được 30 m (${mine().prog} m, ${esc(mine().end || '')}): AI chọn đường khác.`, `Line <b>${esc(lineName(baseId(base.s.id)))}</b>: after a minute of learning no try rides 30 m yet (${mine().prog} m, ${esc(endWord(mine().end || ''))}): the AI picks another line.`));
chBad.add(`${c0.id}|${baseId(base.s.id)}`);
return;
}
if (!learning && learnFor && !mine()) {
log(tx(`Không dò được đường <b>${esc(lineName(baseId(base.s.id)))}</b> từ chỗ này (game chưa tải hết): AI chọn đường khác.`, `Could not trace the line <b>${esc(lineName(baseId(base.s.id)))}</b> from here (the game has not loaded all of it): the AI picks another line.`));
chBad.add(p.unlock ? 'tricks|*' : `${c0.id}|${baseId(base.s.id)}`);
return;
}
const b = mine();
if (p.unlock && !ok(b)) log(tx(`Trong mô phỏng AI chưa làm đủ Trick line (${b && b.goal ? b.goal.n : 0}/${b && b.goal ? b.goal.need : 5}, thường thiếu cú 360): AI vẫn lái thật để tập, và học tiếp ở nền.`, `In the simulation the AI does not do all of the Trick line yet (${b && b.goal ? b.goal.n : 0}/${b && b.goal ? b.goal.need : 5}, usually the 360 is missing): the AI rides for real anyway to practise, and learns on in the background.`));
else if (learnFor && !ok(b)) {
log(tx(`Sau ${Math.round(learnFor / 60e3)} phút trong mô phỏng, ${p.unlock ? 'AI chưa làm được Trick line' : `đường này chưa làm được “${esc(ch.text)}” (${b && b.goal ? b.goal.n : 0}/${A.need})`}: AI thử cách khác.`, `After ${Math.round(learnFor / 60e3)} minutes in the simulation, ${p.unlock ? 'the AI cannot do the Trick line yet' : `this line does not do “${esc(ch.text)}” yet (${b && b.goal ? b.goal.n : 0}/${A.need})`}: the AI tries another way.`));
chBad.add(p.unlock ? 'tricks|*' : `${c0.id}|${baseId(base.s.id)}`);
if (base.drill && !p.unlock) chBad.add(`${c0.id}|*`);
return;
}
if (p.unlock && ok(b)) log(tx('Trong mô phỏng AI đã làm được Trick line: AI làm bài thật, vẫn học tiếp ở nền.', 'In the simulation the AI does the Trick line: it does it for real, still learning in the background.'));
else if (learnFor) log(tx(`Trong mô phỏng mỗi lượt được <b>${b.goal.n}/${A.need}</b>${A.feat ? '' : ' (cộng dồn qua các lượt)'}: AI lái thật, vẫn học tiếp ở nền.`, `In the simulation each ride gets <b>${b.goal.n}/${A.need}</b>${A.feat ? '' : ' (added up over rides)'}: the AI rides for real, still learning in the background.`));
if (!looping) driveButton();
if (p.unlock) {
let tU = Date.now(), told = false;
while (on()) {
await sleep(4000);
const offer = [...document.querySelectorAll('button')].some(e => /^Unlock tricks$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().width > 0);
if (offer) {
tU = Date.now();
if (!told) {
told = true;
const m = tx('Game đề nghị mở khóa trick ngay (nút “Unlock tricks”) hoặc tập tiếp (“Keep going”). Đây là lựa chọn của bạn, AI không tự bấm. Bấm <b>Unlock tricks</b> để AI làm ngay các thử thách trick ngoài đường (trick làm trong Training không được tính cho thử thách); bấm <b>Keep going</b> để AI tập tiếp cho tới khi tự làm được cả bốn trick.',
'The game offers to unlock tricks now (the “Unlock tricks” button) or to keep practising (“Keep going”). That is your choice: the AI does not press it. Press <b>Unlock tricks</b> for the AI to do the trick challenges on the trails at once (tricks done in Training do not count for challenges); press <b>Keep going</b> for the AI to keep practising until it lands all four tricks by itself.');
say(m.replace(/<[^>]+>/g, '')); log(m);
}
continue;
}
told = false;
if (!looping) { chStop(); return; }
if (!(await drillsNow()).some(r => r.drill && r.drill.goal === 'tricks')) {
log(tx('<b>✓ Xong Trick line</b>: game đã chuyển khỏi bài này, trick được mở khóa ngoài đường. AI quay lại đường thật để làm thử thách.', '<b>✓ Trick line done</b>: the game has moved on from this drill, and tricks are unlocked on the trails. The AI goes back to a real trail to do the challenges.'));
stopDrive('xong Trick line', true);
if (learning) await learnButton();
await sleep(2000);
backToRiding();
await sleep(4000);
await findTracks();
return;
}
if (Date.now() - tU > 20 * 60e3) { log(tx('Lái Trick line 20 phút chưa xong: AI dừng cách này.', 'Riding the Trick line for 20 minutes has not finished it: the AI stops trying this way.')); chBad.add('tricks|*'); stopDrive(tx('chưa xong Trick line', 'Trick line not finished'), true); return; }
}
return;
}
let have = (chNow(c0.id) || c0).have, tGain = Date.now(), asked = Date.now();
while (on()) {
await sleep(4000);
if (!looping) { chStop(); return; }
const c = chNow(c0.id);
if (!c || c.done) { log(tx(`<b>✓ Xong thử thách “${esc(ch.text)}”</b> (+${c0.xp} XP).`, `<b>✓ Challenge “${esc(ch.text)}” done</b> (+${c0.xp} XP).`)); say(tx(`Xong “${ch.text}”! AI chuyển sang thử thách tiếp theo.`, `“${ch.text}” done! The AI moves on to the next challenge.`)); return; }
if (c.have > have) { have = c.have; tGain = Date.now(); say(tx(`Thử thách “${ch.text}”: ${c.have}/${c.need}.`, `Challenge “${ch.text}”: ${c.have}/${c.need}.`)); }
const side = A.guess && cap.levels && cap.levels.stats && cap.levels.stats.whipSide;
if (side) {
log(tx(`Game giờ đã biết bạn hay whip về phía ${side === 'left' ? 'trái' : 'phải'}, nên “${esc(ch.text)}” là whip về phía <b>${side === 'left' ? 'phải' : 'trái'}</b>: AI học lại theo chiều đó.`, `The game now knows you mostly whip to the ${side === 'left' ? 'left' : 'right'}, so “${esc(ch.text)}” means whipping to the <b>${side === 'left' ? 'right' : 'left'}</b>: the AI learns it again that way.`));
return;
}
if (Date.now() - asked > 120e3 && askLevels()) asked = Date.now();
if (Date.now() - tGain > 6 * 60e3) {
log(tx(`Lái 6 phút mà game chưa tính thêm cho “${esc(ch.text)}”${base.drill ? ' (có thể game không tính trick làm trong Training cho thử thách này)' : ''}: AI thử cách khác.`, `Riding 6 minutes and the game has counted nothing more for “${esc(ch.text)}”${base.drill ? ' (the game may not count tricks done in Training for this challenge)' : ''}: the AI tries another way.`));
if (A.guess) chWay = -chWay;
else { chBad.add(`${c0.id}|${baseId(base.s.id)}`); if (base.drill) chBad.add(`${c0.id}|*`); }
return;
}
}
}
const ONWARD_LEGS = 200, ONWARD_OPTS = 3, ONWARD_LEAD = 30, ONWARD_KEEP = 15, LEG_WORKERS = Math.max(2, Math.floor(workers / 2));
const quiet = new Proxy({}, { get: () => () => {} });
function newLeg(route, d, n) {
const T = new Trainer(quiet), leg = { route, T };
T.temp = true; T.library = trainer.library || []; T.brainW = brain.gen ? brain.best.slice() : null;
T.prepare(route, n || LEG_WORKERS).then(() => {
if (d.over) { T.pool.close(); return; }
T.run().catch(err => console.error(err));
}).catch(err => { if (!d.over) console.error(err); leg.failed = true; });
return leg;
}
function worth(leg) {
const T = leg.T, b = T.best, lr = leg.route;
if (leg.failed || !T.geo || !b) return null;
const runIn = T.N - lr.length, on = b.prog - runIn - (lr.lead || 0) - lr.join;
if (b.end !== 'về đích' && on < 20) return null;
return b.prog - runIn + (b.end === 'về đích' ? 50 : 0) + b.game / 100;
}
const stopLeg = l => { l.T.stop(); if (l.T.pool) l.T.pool.close(); };
function ride(d, R) {
ridden = true;
const st = d.route.start;
d.runIn = Math.max(0, R.length - d.route.length);
d.base = -d.runIn; d.legs = 0; d.bigLand = -1;
const drill = d.route.drill;
if (!drill) {
live.ex.trails_set_spawn_at(live.g, st.x, st.z, st.heading, 0);
live.ex.trails_game_reset(live.g);
}
let t = 0, seq = null, rider = d.rider, cur = null, coast = null, finding = null, calm = 0;
let far = -1, farT = 0;
const { mark, seen } = ground();
let ahead = [];
const tried = new Set();
const live1 = () => ahead.filter(l => !l.failed);
const look = () => {
if (finding || d.over || d.route.practice || d.route.drill || d.legs >= ONWARD_LEGS || live1().length >= ONWARD_OPTS) return;
const from = R, v = cur ? cur.T.best && cur.T.best.vEnd : d.vEnd, at = rider.idx + ONWARD_LEAD;
finding = (async () => {
try {
const prof = await d.profP;
const got = await onwardChoices(from, seen, ONWARD_OPTS, { from: at, prof });
for (const r of got) {
if (d.over || from !== R || live1().length >= ONWARD_OPTS) break;
if (ahead.some(l => { let s = 0; for (const q of r.cells) if (l.route.cells.has(q)) s++; return s > r.cells.size * 0.5; })) continue;
if (r.start.v === undefined) r.start.v = Math.max(0, v || 0);
ahead.push(newLeg(r, d, Math.max(2, Math.floor((learning ? LEG_WORKERS : workers - 1) / ONWARD_OPTS))));
}
} catch (err) { console.error(err); } finally { finding = null; }
})();
};
const finder = setInterval(look, 2000);
d.ways = () => ahead.map(l => ({ m: l.route.length, at: l.route.at, exit: l.route.exit, join: l.route.join, back: !!l.route.back, turn: l.route.turn, v: l.route.start.v, ready: !!l.T.geo, best: l.T.best && [l.T.best.prog, l.T.best.end, l.T.best.game], worth: worth(l), failed: !!l.failed }));
const stays = i => Math.max(0, Math.min(R.length, cur ? (cur.T.best ? cur.T.best.prog - (cur.T.N - cur.route.length) : 0) : d.expect) - i);
d.cleanup = () => {
d.over = true; clearInterval(finder);
for (const l of ahead.concat(cur ? [cur] : [])) stopLeg(l);
};
mark(R); look();
const handOver = (leg, s) => {
const T = leg.T, g = T.geo, R2 = { X: g.X, Z: g.Z, KIND: g.KIND, length: g.X.length, PZ: g.PZ };
const plan = clonePlan(T.plan), r2 = makeRider(R2, g.H, T.secs, plan);
d.takeNewer = swapper(T, plan, r2, T.secs, () => d.swaps++); d.who = 'AI';
d.profP = T.pool.replay(plan).then(r => { if (!plan.lp) plan.lp = landSlopes(r, T.secs.length); return profileOf(r, R2.length); }).catch(() => null);
let bi = 0, bd = Infinity;
for (let i = 0; i < Math.min(R2.length, 80); i++) { const q = (R2.X[i] - s[0]) ** 2 + (R2.Z[i] - s[2]) ** 2; if (q < bd) { bd = q; bi = i; } }
r2.idx = bi;
const b = T.best, lr = leg.route, runIn = T.N - lr.length, onNew = lr.length - (lr.lead || 0) - lr.join;
const left = stays(lr.at);
const got = Math.max(0, b.prog - runIn - (lr.lead || 0) - lr.join), kmh = (lr.start.v * 3.6).toFixed(0);
log(tx(`Đi tiếp sang đường thứ ${d.legs + 2} (chọn 1 trong ${ahead.length} hướng AI đã thử)${lr.cross ? `, rẽ ngang khi đường đang đi còn ${R.length - lr.exit} m` : ''}: ${lr.join} m đường cong nối, quay ${lr.turn}°${lr.back ? ', chạy ngược chiều đường' : ''}, vào cua ở ${kmh} km/h; trong mô phỏng ${b.end === 'về đích' ? 'đi hết' : `đi được ${got} m của`} đường mới dài ${onNew} m${lr.cross ? ` (đi thẳng tiếp chỉ được ${left} m)` : ''}.`,
`Riding on to line ${d.legs + 2} (1 of ${ahead.length} ways the AI tried)${lr.cross ? `, turning off with ${R.length - lr.exit} m of the line left` : ''}: ${lr.join} m of curve to join it, turning ${lr.turn}°${lr.back ? ', ridden against the line' : ''}, into the curve at ${kmh} km/h; in the simulation it rides ${b.end === 'về đích' ? 'all' : `${got} m`} of the new line, ${onNew} m long${lr.cross ? ` (riding straight on gets only ${left} m)` : ''}.`));
if (cur) stopLeg(cur);
for (const l of ahead) if (l !== leg) stopLeg(l);
ahead = []; tried.clear();
cur = leg; mark(leg.route);
d.base += (coast ? coast.at : rider.idx) - bi; d.legs++; coast = null;
R = R2; rider = d.rider = r2; far = bi; farT = t; d.bigLand = -1;
look();
};
d.step = () => {
try {
const s = liveState();
if (seq === null) seq = s[16];
if (s[13] > 0) { setTimeout(() => stopDrive(tx('ngã', 'fell')), 0); return null; }
if (s[16] !== seq) {
seq = s[16];
if ((s[56] | 0) & 0x1f0 || Math.abs(s[44] || 0) >= 270 || Math.abs(s[43] || 0) >= 300 || Math.abs(s[41] || 0) >= 45) d.tricks++;
const gr = s[15] | 0;
(d.lands = d.lands || []).push([rider.idx, +(rider.off || 0).toFixed(1), +(s[14] || 0).toFixed(2), gr]);
if (gr > 0) {
const gp = gamePoints(gr, s[44], s[43], s[41], d.streak || 0);
d.streak = gp.streak; d.game = (d.game || 0) + gp.p; d.top = Math.max(d.top || 1, gp.m);
(d.grades = d.grades || [0, 0, 0, 0, 0, 0])[gr]++;
}
}
if (d.takeNewer && t % 30 === 0) d.takeNewer();
calm = s[12] > 0 ? 0 : calm + 1;
if (!(s[12] > 0) && (!coast || t - coast.t0 < 10)) {
let best = null, bw = -Infinity;
for (const l of ahead) {
const lr = l.route, at = Math.min(lr.at, R.length - 3);
if (rider.idx < at) continue;
const v = worth(l);
if (v !== null && v > stays(lr.at) + (lr.cross ? ONWARD_KEEP : 0) && v > bw) { bw = v; best = l; }
}
if (best) handOver(best, s);
}
ahead = ahead.filter(l => {
const at = Math.min(l.route.at, R.length - 3);
if (coast ? t - coast.t0 < 10 : rider.idx <= at + 3) return true;
if (!l.route.cross) { const lr = l.route, i = (lr.lead || 0) + lr.join; tried.add(Math.round(lr.X[i] / 6) + ',' + Math.round(lr.Z[i] / 6)); }
stopLeg(l); return false;
});
let inp;
if (!coast && rider.idx >= R.length - 3) {
const n = R.length, k = Math.max(0, n - 6);
coast = { h: Math.atan2(R.Z[n - 1] - R.Z[k], R.X[n - 1] - R.X[k]), at: rider.idx, t0: t, halt: false };
d.coastAt = rider.idx;
}
if (coast) {
const v = s[8], air = s[12] > 0;
if (!coast.halt && (calm >= 30 || (!air && v < -0.3))) coast.halt = true;
if ((coast.halt && !air && Math.abs(v) < 0.5 && Math.abs(s[4]) < 0.15) || (!air && t - coast.t0 > 420) || coast.parked) {
if (!coast.parked) {
coast.parked = true;
const why = tried.size ? tx(`${tried.size} hướng đi tiếp AI tìm thấy đều không qua được trong mô phỏng`, `the ${tried.size} ways on the AI found all fail in the simulation`) : tx('không còn thấy đường nào phía trước', 'no trail ahead any more');
setTimeout(() => stopDrive(why, false, true), 0);
}
return [0, 127, 0, 0, 0, 0, 0];
}
const st = air ? 0 : clamp(2 * wrapA(coast.h - s[3]), -1, 1), own = rider.step(s, t++), ln = air ? own[3] : 0;
const p = s[4], brake = air || v <= 0 ? 0 : Math.abs(p) >= 0.15 ? (p > 0 ? 70 : 40) : v > 1.5 ? 70 : 127;
inp = coast.halt ? [0, brake, Math.round(st * 127), ln, 0, 0, 0] : [v < 6 ? 127 : 0, v > 9 ? 40 : 0, Math.round(st * 127), ln, 0, 0, 0];
} else {
inp = rider.step(s, t++).slice();
if (rider.landed && s[14] > 2) d.bigLand = rider.idx;
if (rider.off > (d.bigLand >= 0 && rider.idx - d.bigLand < 40 ? 18 : 12) && !(s[12] > 0)) { setTimeout(() => stopDrive(tx('lạc khỏi đường', 'off the line')), 0); return null; }
if (rider.idx > far || s[12] > 0) { far = Math.max(far, rider.idx); farT = t; }
else if (t - farT > 180) { setTimeout(() => stopDrive(tx('bị kẹt (3 giây không tiến thêm được mét nào, chắc xe chạm vào vách)', 'stuck (not a metre further in 3 seconds: the bike is probably against a wall)')), 0); return null; }
}
if (drill && !drill.pedals) inp[0] = 0;
if (badge && t % 15 === 0) {
const m = Math.max(0, d.base + (coast ? coast.at : rider.idx));
badge.firstChild.textContent = coast ? tx(`Không còn hướng đi tiếp, đang dừng lại · ${m} m`, `No way on left, stopping · ${m} m`)
: tx(`${d.who} đang lái · ${m} m${d.legs ? ` · đường thứ ${d.legs + 1}` : ''}${ahead.length ? ` · đang thử ${ahead.length} hướng đi tiếp` : ''}${d.swaps ? ` · học thêm ${d.swaps} lần` : ''}`,
`${d.who} is riding · ${m} m${d.legs ? ` · line ${d.legs + 1}` : ''}${ahead.length ? ` · trying ${ahead.length} ways on` : ''}${d.swaps ? ` · learned ${d.swaps} times more` : ''}`);
}
return inp;
} catch (err) {
console.error(err);
setTimeout(() => stopDrive(tx('lỗi: ', 'error: ') + (err && err.message || err)), 0);
return null;
}
};
live.drive = d;
const watchBail = setInterval(() => {
if (live.drive !== d) { clearInterval(watchBail); return; }
if (liveState()[13] > 0) { clearInterval(watchBail); stopDrive(tx('ngã', 'fell')); }
}, 250);
badge = document.createElement('div'); badge.id = 'tai-badge';
badge.innerHTML = tx(`${d.who} đang lái<small>${learning ? 'Vẫn đang học ở nền · ' : ''}bấm “Dừng AI lái” để lấy lại tay lái</small>`, `${d.who} is riding<small>${learning ? 'Still learning in the background · ' : ''}press “Stop AI riding” to take the bike back</small>`);
document.body.appendChild(badge);
driveLabel(true);
say(tx(`${d.who} đang lái xe của bạn${learning ? ' và vẫn học tiếp ở nền' : ''} (bạn cần đang ngồi trên xe, không đi bộ). Ngã hay hết đường thì AI lái lại từ đầu; bấm “Dừng AI lái” để lấy lại tay lái.`,
`${d.who} is riding your bike${learning ? ' and still learning in the background' : ''} (you need to be on the bike, not walking). After a fall or at the end of the trail the AI rides again from the start; press “Stop AI riding” to take the bike back.`));
}
el.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
const opener = document.createElement('button');
opener.id = 'tai-open'; opener.textContent = '🤖 AI'; opener.style.display = 'none';
opener.title = tx('Mở lại bảng AI', 'Show the AI panel again');
document.body.appendChild(opener);
const showPanel = on => { el.style.display = on ? '' : 'none'; opener.style.display = on ? 'none' : ''; };
opener.onclick = () => { opener.blur(); showPanel(true); };
$('.x').onclick = () => showPanel(false);
$('.lang').onclick = () => {
lang = lang === 'en' ? 'vi' : 'en';
try { keep.setItem(LANG, lang); } catch { /* storage blocked */ }
relabel(el);
$('.lang').textContent = tx('EN', 'VI');
const again = [showNow, () => driveLabel(looping || !!live.drive), chLabel, showBrain, showLine, showBorrow, showMe, showShare, () => { opener.title = tx('Mở lại bảng AI', 'Show the AI panel again'); }, draw, () => trainer.best && showBest(trainer.best)];
for (const f of again) try { f(); } catch { /* nothing to show yet */ }
if (choices.length) listLines();
else for (const o of $('.pick').options) o.textContent = PICK_WAIT.includes(o.textContent) ? tx(...PICK_WAIT) : PICK_NONE.includes(o.textContent) ? tx(...PICK_NONE) : o.textContent;
say(tx('AI giờ nói tiếng Việt.', 'The AI speaks English now.'));
};
$('.refresh').onclick = () => findTracks();
$('.rename').onclick = () => renameLine();
$('.here').onclick = () => addHere().catch(err => { say(tx('Lỗi: ', 'Error: ') + (err && err.message || err)); console.error(err); });
$('.learn').onclick = () => learnButton();
$('.drive').onclick = () => driveButton();
$('.chal').onclick = () => challengeButton();
$('.watch').onclick = () => watch();
$('.pick').onchange = () => lineChanged();
showNow();
showBrain();
function saveBrainFile() {
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...brain.record(), adam: null })], { type: 'application/json' }));
a.download = 'brain.json';
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
$('.brain-export').onclick = () => { saveBrainFile(); say(tx('Đã lưu bộ não vào file brain.json (trong thư mục Tải xuống).', 'The brain is saved in the file brain.json (in your Downloads folder).')); };
$('.brain-share').onclick = () => {
saveBrainFile();
window.open(`https://github.com/${REPO}/upload/main/brain`, '_blank', 'noopener');
log(tx('Đã lưu file <b>brain.json</b>. Trên trang GitHub vừa mở, kéo file đó vào rồi bấm nút xanh ở cuối trang (Propose changes). Cần tài khoản GitHub.', 'Saved the file <b>brain.json</b>. On the GitHub page just opened, drag that file in, then press the green button at the bottom of the page (Propose changes). Needs a GitHub account.'));
};
$('.brain-import').onclick = () => $('.bfile').click();
$('.bfile').onchange = async () => {
const f = $('.bfile').files[0];
$('.bfile').value = '';
if (!f) return;
const m = readBrain(await f.text());
if (!m) { say(tx('File này không phải bộ não của AI Trails.', 'This file is not a Trails AI brain.')); return; }
if (!brain.pool) { say(tx('Bộ não từ file cần được chạy thử trên các đường của bạn trước. Bấm “Học lái”, đợi tới lúc AI luyện bộ não chung, rồi mở file lại.', 'The brain from the file must be tried on your lines first. Press “Learn”, wait until the AI trains the shared brain, then open the file again.')); return; }
const r = await brain.offer(m.w);
log(r.took ? tx(`<b>Dùng bộ não từ file:</b> đi được ${pct(r.share)} quãng đường các đường của bạn, giỏi hơn bộ não đang có.`, `<b>Using the brain from the file:</b> it rides ${pct(r.share)} of the way on your lines, better than the brain there is.`)
: tx(`Bộ não từ file đi được ${pct(r.share)} quãng đường các đường của bạn, chưa hơn bộ não đang có nên giữ nguyên.`, `The brain from the file rides ${pct(r.share)} of the way on your lines, no better than the brain there is, so it is kept.`));
showBrain();
};
$('.forget').onclick = async () => {
if (!trainer.route || !confirm(tx('Xóa những gì AI đã học trên đường này?', 'Delete what the AI has learned on this line?'))) return;
stopDrive(tx('bạn đã dừng AI', 'you stopped the AI'), true);
cancel = true;
trainer.stop();
for (let i = 0; i < 300 && trainer.running; i++) await new Promise(r => setTimeout(r, 100));
const key = trainer.key();
try { keep.removeItem(key); } catch { /* ignore */ }
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
log(learning ? tx('Đã xóa trí nhớ của đường này. AI dò lại đường và học lại từ đầu.', 'Forgot this line. The AI traces it again and learns it from scratch.') : tx('Đã xóa trí nhớ của đường này. Bấm “Học lái” để AI dò lại đường và học lại từ đầu.', 'Forgot this line. Press “Learn” for the AI to trace it again and learn it from scratch.'));
say(learning ? tx('Đã xóa, AI đang học lại từ đầu.', 'Deleted: the AI is learning again from scratch.') : tx('Đã xóa. Bấm “Học lái” để học lại từ đầu.', 'Deleted. Press “Learn” to learn again from scratch.'));
};
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
say(tx(`Đã lưu bài học vào file ${lessonFile()} (trong thư mục Tải xuống).`, `The lesson is saved in the file ${lessonFile()} (in your Downloads folder).`));
};
$('.share').onclick = () => {
if (!trainer.route) return;
saveFile();
window.open(`https://github.com/${REPO}/upload/main/lessons`, '_blank', 'noopener');
log(tx(`Đã lưu file <b>${lessonFile()}</b>. Trên trang GitHub vừa mở, kéo file đó vào rồi bấm nút xanh ở cuối trang (Propose changes). Cần tài khoản GitHub.`, `Saved the file <b>${lessonFile()}</b>. On the GitHub page just opened, drag that file in, then press the green button at the bottom of the page (Propose changes). Needs a GitHub account.`));
};
$('.import').onclick = () => $('.file').click();
$('.file').onchange = async () => {
const f = $('.file').files[0];
$('.file').value = '';
if (!f) return;
const m = readLesson(await f.text());
if (!m) { say(tx('File này không phải bài học của AI Trails.', 'This file is not a Trails AI lesson.')); return; }
const id = m.line.start.id;
if (trainer.route && trainer.route.start.id === id && trainer.pool) { await useLesson(m, tx('file', 'the file')); return; }
if (hasMemory(id)) { say(tx('Bài học này của một đường khác. Chọn đường đó, bấm “Học lái”, rồi mở file lại.', 'This lesson is for another line. Pick that line, press “Learn”, then open the file again.')); return; }
try { keep.setItem(STORE + id, JSON.stringify({ ...m, bestRun: null })); } catch { say(tx('Trình duyệt hết chỗ lưu.', 'The browser has no room left to save.')); return; }
say(tx('Đã nhập bài học. Đến gần đường đó, chọn nó trong danh sách rồi bấm “Học lái”.', 'Lesson imported. Get near that line, pick it in the list, then press “Learn”.'));
};
let failTold = 0;
keep.onError = err => {
if (Date.now() - failTold < 60e3) return;
failTold = Date.now();
log(tx(`<b>Trình duyệt không lưu được</b> những gì AI vừa học (${esc(err && err.name || err)}). Ổ đĩa có thể đã đầy.`, `<b>The browser could not save</b> what the AI just learned (${esc(err && err.name || err)}). The disk may be full.`));
};
keep.listen((key, value) => {
if (!trainer.route || key !== trainer.key() || !value) return;
if (trainer.takeStored(value)) { log(tx(`Nhận bài học giỏi hơn từ một tab khác: ${trainer.best.prog} m, ${Math.round(trainer.best.fit)} điểm.`, `Got a better lesson from another tab: ${trainer.best.prog} m, ${Math.round(trainer.best.fit)} points.`)); showBest(trainer.best); }
});
setInterval(async () => {
if (!trainer.running || !trainer.route) return;
const id = trainer.route.start.id, m = await communityLesson(id);
if (!m || sharedSeen.get(id) === m.savedAt) return;
sharedSeen.set(id, m.savedAt);
await useLesson(m, tx('cộng đồng trên GitHub', 'the community on GitHub'), true);
}, 10 * 60 * 1000);
const WATCH = 'trailsai.watchme';
let watchOn = (() => { try { return keep.getItem(WATCH) !== '0'; } catch { return true; } })(), meRides = 0, meBusy = false;
seen.on = watchOn;
function showMe() {
$('.k-me').textContent = !watchOn ? tx('tắt', 'off') : meRides ? tx(`đã ghi ${meRides} lượt bạn lái`, `${meRides} ride(s) of yours noted`) : tx('đang xem bạn lái', 'watching you ride');
$('.watchme').textContent = tx(`👀 Học từ cách tôi lái: ${watchOn ? 'bật' : 'tắt'}`, `👀 Learn from how I ride: ${watchOn ? 'on' : 'off'}`);
}
$('.watchme').onclick = () => {
watchOn = !watchOn; seen.on = watchOn;
if (!watchOn) { seen.f = []; seen.ev = []; seen.done.length = 0; }
try { keep.setItem(WATCH, watchOn ? '1' : '0'); } catch { /* storage blocked */ }
showMe();
say(watchOn ? 'AI sẽ xem bạn lái trên những đường nó biết và học theo.' : 'AI không xem bạn lái nữa.');
};
const SHARE = 'trailsai.share', SHARE_AT = 'trailsai.share.at', SHARE_EVERY = 10 * 60e3, DRIVES = 'trailsai.drives';
let shareOn = (() => { try { return keep.getItem(SHARE) !== '0'; } catch { return true; } })(), sharing = false;
const shareAt = () => +(keep.getItem(SHARE_AT) || 0) || 0;
const press = (code, key) => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true })); };
const until = async (f, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(r => setTimeout(r, 250))) { const v = f(); if (v) return v; } return null; };
const sharePanel = () => { const c = [...document.querySelectorAll('.rp-caps')].find(e => e.textContent === 'Share this run'); return c && c.parentElement; };
function showShare() {
$('.shareme').textContent = tx(`📣 Tự chia sẻ lượt chạy đẹp (10 phút/lần): ${shareOn ? 'bật' : 'tắt'}`, `📣 Share good rides (every 10 min): ${shareOn ? 'on' : 'off'}`);
}
$('.shareme').onclick = () => {
shareOn = !shareOn;
try { keep.setItem(SHARE, shareOn ? '1' : '0'); } catch { /* storage blocked */ }
showShare();
say(shareOn ? tx('Mỗi lượt AI lái về đích không ngã sẽ được chia sẻ (cách nhau ít nhất 10 phút), kèm lời mời mọi người vào chạy.', 'Every ride the AI takes to the end without a fall is shared (10 minutes apart at least), with an invite for everyone to come and ride.')
: tx('AI không tự chia sẻ lượt chạy nữa.', 'The AI no longer shares its rides.'));
};
async function shareRun(title) {
try {
press('KeyL', 'l');
if (!(await until(sharePanel, 8000))) throw new Error(tx('game không mở bảng chia sẻ (cần đang ở trong game và có mạng)', 'the game did not open its share panel (it needs to be riding, online)'));
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
return 'https://' + got.textContent.trim();
} finally {
const p = sharePanel(), x = p && p.querySelector('.rp-panel-close'), shut = () => !document.body.classList.contains('replaying');
if (x) x.click();
if (!(await until(shut, 1500))) { press('KeyP', 'p'); await until(shut, 3000); }
}
}
async function shareGood(d, m) {
sharing = true;
try { keep.setItem(SHARE_AT, String(Date.now())); } catch { /* storage blocked */ }
try {
const pts = d.game || 0, st = d.route.start;
const link = await shareRun(`AI Trails · ${m} m · ${pts} pts`.slice(0, 60));
const ws = live.ws;
let invited = false;
if (ws && ws.readyState === 1 && st && num(st.x) && num(st.z)) {
ws.send(JSON.stringify({ t: 'chat', text: `My AI just rode this line to the end, no falls, ${pts} pts. Watch: ${link} · come ride it!`.slice(0, 200), invite: { x: st.x, z: st.z, heading: st.heading || 0 } }));
invited = true;
}
log(tx(`<b>Đã chia sẻ lượt chạy</b> (${m} m, ${pts} điểm): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>${invited ? '. Đã mời mọi người trong chat vào chạy đường này.' : '. Chưa gửi được lời mời vào chat (game chưa kết nối máy chủ).'} Lần chia sẻ sau: sớm nhất 10 phút nữa.`,
`<b>Shared the ride</b> (${m} m, ${pts} points): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>${invited ? '. Invited everyone in chat to ride this line.' : '. Could not invite in chat (the game is not connected to its server).'} Next share: 10 minutes from now at the earliest.`));
} catch (err) {
log(tx(`<b>Chưa chia sẻ được lượt chạy:</b> ${esc(err && err.message || err)}. AI thử lại ở lượt đẹp sau 10 phút nữa.`, `<b>Could not share the ride:</b> ${esc(err && err.message || err)}. The AI tries again on a good ride 10 minutes from now.`));
} finally { sharing = false; }
}
const lineGeo = new Map();
function knownLines() {
const out = new Map();
if (trainer.route && !trainer.temp) out.set(baseId(trainer.route.start.id), { X: trainer.route.X, Z: trainer.route.Z });
try {
for (let i = 0; i < keep.length; i++) {
const key = keep.key(i);
if (!key || !key.startsWith(STORE) || out.has(baseId(key.slice(STORE.length)))) continue;
if (!lineGeo.has(key)) {
let m = null;
try { m = JSON.parse(keep.getItem(key)); } catch { m = null; }
const L = m && m.line;
lineGeo.set(key, L && Array.isArray(L.X) && Array.isArray(L.Z) && L.X.length >= 20 ? { X: L.X, Z: L.Z } : null);
}
if (lineGeo.get(key)) out.set(baseId(key.slice(STORE.length)), lineGeo.get(key));
}
} catch { /* storage blocked */ }
return out;
}
function bookFromPlayer(rec) {
const mask = riderSetup().tricks;
const rows = mask ? rec.jumps.filter(j => playerMove(j)).map(j => [j.a, playerMove(j), j.ok ? 1 : 0, playerTr(j), j.g]) : [];
if (!rows.length) return 0;
if (trainer.book && trainer.setup && trainer.setup.tricks === mask) { trainer.book.push(...rows); if (trainer.running) trainer.bookDirty = true; else saveBook(mask, trainer.book); }
else saveBook(mask, loadBook(mask).concat(rows));
return rows.length;
}
async function learnRide(ride) {
const F = ride.f, n = F.length / SEEN_W;
let len = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (let i = 0; i < n; i++) {
const x = F[i * SEEN_W], z = F[i * SEEN_W + 1];
if (i) len += Math.hypot(x - F[(i - 1) * SEEN_W], z - F[(i - 1) * SEEN_W + 1]);
x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
}
if (len < 30) return;
const got = [];
for (const [id, L] of knownLines()) {
let near = false;
for (let i = 0; i < L.X.length && !near; i += 5) near = L.X[i] > x0 - 5 && L.X[i] < x1 + 5 && L.Z[i] > z0 - 5 && L.Z[i] < z1 + 5;
const rec = near && rideOn(ride, L.X, L.Z);
if (rec) { keepPlayerRide(id, rec); got.push({ id, rec }); }
}
if (!got.length) return;
meRides++; showMe();
const main = got.reduce((a, b) => (b.rec.to - b.rec.from > a.rec.to - a.rec.from ? b : a)), rec = main.rec;
const what = rec.jumps.filter(j => playerTr(j)).map(j => trickWords(playerTr(j), 180 * Math.round(Math.abs(j.sv) / 180))).join(', ');
const booked = bookFromPlayer(rec);
let txt = tx(`<b>Học từ cách bạn lái:</b> bạn vừa lái ${rec.to - rec.from} m trên <b>${esc(lineName(main.id))}</b>${got.length > 1 ? ` (đoạn này cũng thuộc ${got.length - 1} đường khác AI biết)` : ''}${rec.jumps.length ? `, ${rec.jumps.length} cú nhảy` : ''}${what ? ` (${what})` : ''}.${booked ? ` Thêm ${booked} lần thử trick vào sổ tay trick.` : ''}`,
`<b>Learning from how you ride:</b> you just rode ${rec.to - rec.from} m of <b>${esc(lineName(main.id))}</b>${got.length > 1 ? ` (this stretch is part of ${got.length - 1} other line(s) the AI knows too)` : ''}${rec.jumps.length ? `, ${rec.jumps.length} jump(s)` : ''}${what ? ` (${what})` : ''}.${booked ? ` ${booked} trick attempt(s) added to the trick book.` : ''}`);
const now = trainer.running && trainer.secs && trainer.pool && !trainer.pool.closed && !trainer.temp && got.find(o => o.id === baseId(trainer.route.start.id));
let r = null;
if (now) try { r = await trainer.fromPlayer(playerRides(now.id)); } catch (err) { if (trainer.pool && !trainer.pool.closed) console.error(err); }
if (r) {
const as = r.run && `${r.run.prog} m${typeof r.run.game === 'number' ? tx(`, ${r.run.game} điểm game`, `, ${r.run.game} game points`) : ''}`;
if (!r.secs) txt += tx(' Bạn chưa đi trọn đoạn nào của đường AI đang học, nên chưa có gì để thử.', ' You have not ridden a whole section of the line the AI is learning, so there is nothing to try yet.');
else if (r.took) { txt += tx(` Lái theo cách bạn ở ${r.secs} đoạn của đường AI đang học${r.air ? ' (cách bạn qua các cú nhảy, ở tốc độ của AI)' : ''}, trong mô phỏng AI đi được <b>${as}</b>, giỏi hơn trước: AI học tiếp từ đó.`,
` Riding your way on ${r.secs} section(s) of the line the AI is learning${r.air ? ' (how you took the jumps, at the AI\'s speeds)' : ''}, the AI rides <b>${as}</b> in the simulation, better than before: it learns on from there.`); showBest(trainer.best); draw(); }
else txt += tx(` Lái theo cách bạn ở ${r.secs} đoạn của đường AI đang học, trong mô phỏng AI đi được ${as}, chưa hơn cách AI đang có. Mỗi lượt dò AI vẫn thử cách của bạn ở từng đoạn.`,
` Riding your way on ${r.secs} section(s) of the line the AI is learning, the AI rides ${as} in the simulation, no better than the way it has. Every sweep still tries your way section by section.`);
} else txt += tx(' Lần tới học những đường này, AI sẽ thử cách của bạn.', ' Next time it learns these lines, the AI will try your way.');
log(txt);
}
setInterval(async () => {
if (live.drive && !seen.all && seen.f.length) endRide();
if (meBusy || !seen.done.length) return;
meBusy = true;
try { while (seen.done.length) await learnRide(seen.done.shift()); } catch (err) { console.error(err); } finally { meBusy = false; }
}, 1000);
showMe(); showShare();
async function learnLesson(raw, ms, n) {
const m = readLesson(raw);
if (!m) throw new Error('not a lesson');
const su = m.setup || {};
live.tricks = num(su.tricks) ? su.tricks : 0; live.bike = su.bike || 0; live.tunes = { ...(su.tunes || {}) };
keep.setItem(STORE + m.line.start.id, JSON.stringify(m));
trainer.library = await gatherJumps();
trainer.brainW = null;
await trainer.prepare(m.line, n || workers);
const before = trainer.best, gen0 = trainer.gen;
const timer = setTimeout(() => trainer.stop(), ms);
try { await trainer.run(); } finally { clearTimeout(timer); }
const after = trainer.best, lesson = trainer.lesson();
trainer.pool.close();
const sum = r => r && { prog: r.prog, end: r.end, game: r.game, goal: r.goal || null, grades: (r.jl || []).map(e => e.g) };
return { lesson, before: sum(before), after: sum(after), improved: beats(after, before), sweeps: trainer.gen - gen0 };
}
window.TrailsAI = {
learnLesson,
open() { showPanel(true); },
newer() { log(tx('<b>Có bản AI mới.</b> Bấm F5 để dùng (những gì AI đã học vẫn còn nguyên).', '<b>A new AI is out.</b> Press F5 to use it (what the AI has learned stays).')); },
cap, seen, learnRide, trainer, brain, drill, buildRoute, practiceLine, findTracks, onwardChoices, profileOf, ground, engine, live, drive: driveButton, learn: learnButton, gatherJumps, fitBrain, freshBrain, shareRun, shareGood,
};
if (window.__taiNewer) window.TrailsAI.newer();
setTimeout(findTracks, 1500);
}
const start = () => keep.ready.then(main);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
