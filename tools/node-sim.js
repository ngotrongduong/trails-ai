// The AI's simulation in node, for the tests: the game's files fetched from trailsthegame.com into memory (never
// written to disk), learning workers as vm contexts that answer messages as a Web Worker does, and the learner
// (src/40-learn.js with the pool, src/30-pool.js) loaded with them.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
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
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const WORKER = () => read('sim/rider.js') + '\n' + read('sim/worker.js');
// a learning worker in a vm context, with the Web Worker's postMessage / message events
function vmWorker() {
  const ls = new Set();
  const ctx = { console, WebAssembly, TextDecoder, performance,
    postMessage: d => setImmediate(() => { for (const f of [...ls]) f({ data: d }); }) };
  vm.createContext(ctx);
  vm.runInContext(WORKER(), ctx);
  return {
    addEventListener: (t, f) => { if (t === 'message') ls.add(f); },
    removeEventListener: (t, f) => ls.delete(f),
    postMessage: d => setImmediate(() => ctx.onmessage({ data: d })),
    terminate() {},
  };
}
// the learner: Learner and Pool from the page's code, with what they use from the rest of it
function learner() {
  const ctx = { console, performance, Math, JSON, setTimeout };
  vm.createContext(ctx);
  const head = `const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),tx=(vi,en)=>en;const assets=()=>({});`;
  const pool = read('30-pool.js').replace("/*@WORKER_SRC@*/''", JSON.stringify(WORKER()));
  vm.runInContext(head + read('sim/rider.js') + pool + read('40-learn.js') + ';this.Learner=Learner;this.beats=beats;this.drawTricks=drawTricks;this.trickText=trickText;', ctx);
  return ctx;
}
module.exports = { gameFiles, vmWorker, learner };
