// Tests the simulation in node, with the game's own physics: node tools/sim-test.js <line.json> [plan.json]
// The game's files are fetched from trailsthegame.com into memory (never written to disk). The line file is a line
// memory of the AI (format trails-ai-line) or any { line } / { route } with start, X, Z, KIND, pieces.
// Checks that a saved state rides on exactly as a ride straight through, then rides a plain plan and the same plan
// with a trick program off every jump, and prints what every landing got.
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = 'https://trailsthegame.com';
const WANT = [/^trails-[A-Za-z0-9_-]+\.wasm$/, /^red-rock-study[^/]*\.bin$/, /^grinnell-southeast-shoulder[^/]*\.bin$/,
  /^grinnell-connected-assembly-residual[^/]*\.bin$/, /^grinnell-connected-assembly-influence[^/]*\.bin$/];
async function gameFiles() {
  const html = await (await fetch(GAME + '/')).text();
  const queue = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], GAME + '/').href), seen = new Set(), got = new Set();
  while (queue.length && seen.size < 80) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const t = await (await fetch(u)).text();
    for (const m of t.matchAll(/[A-Za-z0-9_.-]+\.(?:wasm|bin)/g)) if (WANT.some(re => re.test(m[0]))) got.add(m[0]);
    for (const m of t.matchAll(/["'(`/]((?:assets\/)?[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)/g)) queue.push(new URL('/assets/' + m[1].replace(/^assets\//, ''), GAME).href);
  }
  const files = WANT.map(re => [...got].find(n => re.test(n)));
  if (files.some(f => !f)) throw new Error('game files not found: ' + files.join(', '));
  const bufs = await Promise.all(files.map(async f => { const r = await fetch(`${GAME}/assets/${f}`); if (!r.ok) throw new Error(f + ' ' + r.status); return r.arrayBuffer(); }));
  return { wasm: bufs[0], land: bufs.slice(1) };
}
// a worker in a vm context: call(msg) posts a message and gives back its answer
function worker() {
  const src = ['sim/rider.js', 'sim/worker.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  let waiting = null;
  const ctx = { console, WebAssembly, TextDecoder, Math, JSON, Float64Array, Float32Array, Int32Array, Uint8Array, Set, Map, Object, Array, String, Number, Error, Promise,
    postMessage: d => { const w = waiting; waiting = null; if (w) w(d); } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  let id = 0;
  return msg => new Promise(res => { waiting = res; ctx.onmessage({ data: { ...msg, id: ++id } }); });
}
const words = e => `${e.g}@${e.a}s ${JSON.stringify(Object.fromEntries(Object.entries(e.got).filter(([, v]) => v)))} = ${e.p} (train ${e.train}, xp ${e.xp})`;
(async () => {
  const file = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const route = file.route && file.route.X ? file.route : file.line;
  const gf = await gameFiles(), call = worker();
  const meta = await call({ type: 'init', wasm: gf.wasm, land: gf.land, route, setup: { tricks: 511, bike: 0, tunes: {} } });
  if (meta.type === 'error') throw new Error(meta.error);
  const S = meta.secs, jumps = S.map((s, k) => (s.jump ? k : -1)).filter(k => k >= 0);
  console.log('line', meta.length, 'm,', S.length, 'sections,', jumps.length, 'jumps,', meta.geo.PZ.length, 'pump zones');
  const plain = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : { v: S.map(() => 10), pt: S.map(s => s.pt), pl: S.map(() => 0), pu: S.map(() => 0), tk: S.map(() => null) };
  const tricky = JSON.parse(JSON.stringify(plain));
  jumps.forEach(k => { tricky.tk[k] = { q: [['B', 2, 0], ['T', 1, 0]], m: 0.15 }; });
  const cal = await call({ type: 'calib', plans: [plain, tricky] });
  const st = await call({ type: 'pages', list: cal.list, plans: [plain, tricky] });
  console.log('saved states:', JSON.stringify(st.test));
  const ev = await call({ type: 'eval', plans: [plain, tricky] });
  for (const [name, r] of [['plain', ev.out[0]], ['tricks', ev.out[1]]]) {
    console.log(`${name}: ${r.end} at ${r.prog} m, ${r.game} points (train ${r.train}, xp ${r.xp}), ${r.vAvg} m/s`);
    for (const e of r.jl) console.log('   ', words(e));
  }
})().catch(err => { console.error(err); process.exit(1); });
