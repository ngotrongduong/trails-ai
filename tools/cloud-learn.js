// Learns the shared lessons on further away from the game: on a computer with no game open, such as the GitHub
// workflow cloud-learn.yml. A lesson that rides better afterwards (in the game's own physics) is written back to
// lessons/.
//
// - The game's physics (its WebAssembly) and terrain files are downloaded from trailsthegame.com the way a browser
//   loading the game gets them (found from its home page), into a temporary folder: never into this repo, never
//   uploaded anywhere. Nothing else is asked of the game: no account, no connection to its server.
// - The AI runs as it does in the game, in a browser with no window (Playwright), on a local page that holds those
//   files under the same names; TrailsAI.learnLesson learns each lesson for the minutes given, on every CPU thread.
//
// usage: node tools/cloud-learn.js [--minutes 40] [--threads N] [--channel msedge] [lesson ids...]
//        (no ids: every lesson in lessons/; needs the playwright package: npm i playwright)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const minutes = +opt('minutes', 40), threads = +opt('threads', os.cpus().length), channel = opt('channel', '');
const GAME = 'https://trailsthegame.com';
// the files the AI's simulation loads (see assets() in src/trails-ai.js)
const WANT = [/^trails-[A-Za-z0-9_-]+\.wasm$/, /^red-rock-study[^/]*\.bin$/, /^grinnell-southeast-shoulder[^/]*\.bin$/,
  /^grinnell-connected-assembly-residual[^/]*\.bin$/, /^grinnell-connected-assembly-influence[^/]*\.bin$/];

// The game's files as its home page loads them: the scripts it names, and the scripts those import, read for the
// names of the physics and terrain files.
async function gameFiles(dir) {
  const html = await (await fetch(GAME + '/')).text();
  const queue = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], GAME + '/').href), seen = new Set(), names = new Set();
  while (queue.length && seen.size < 80) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const t = await (await fetch(u)).text();
    for (const m of t.matchAll(/[A-Za-z0-9_.-]+\.(?:wasm|bin)/g)) if (WANT.some(re => re.test(m[0]))) names.add(m[0]);
    for (const m of t.matchAll(/["'(`/]((?:assets\/)?[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)/g)) queue.push(new URL('/assets/' + m[1].replace(/^assets\//, ''), GAME).href);
  }
  const files = WANT.map(re => [...names].find(n => re.test(n)));
  if (files.some(f => !f)) throw new Error('game files not found: ' + files.join(', '));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) continue;
    const r = await fetch(`${GAME}/assets/${f}`);
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return files;
}

// A page on this computer with the game's files under their own names (the AI finds them among the files the page
// loaded) and the AI from dist/.
function serve(dir, files) {
  const page = `<!doctype html><meta charset="utf-8"><title>Trails AI</title><body><script>
window.__taiDirect = 1;
Promise.all(${JSON.stringify(files)}.map(f => fetch('/assets/' + f).then(r => r.arrayBuffer()))).then(() => {
  const s = document.createElement('script'); s.src = '/ai.js'; document.head.appendChild(s);
});
</script>`;
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const send = (type, body) => { res.writeHead(200, { 'content-type': type }); res.end(body); };
    if (u === '/') return send('text/html; charset=utf-8', page);
    if (u === '/ai.js') return send('text/javascript; charset=utf-8', fs.readFileSync(path.join(root, 'dist', 'trails-ai.js')));
    const f = u.startsWith('/assets/') && files.find(n => '/assets/' + n === u);
    if (f) return send(f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', fs.readFileSync(path.join(dir, f)));
    res.writeHead(404); res.end();
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

const pw = () => { try { return require('playwright'); } catch { return require('playwright-core'); } };

(async () => {
  const dir = path.join(os.tmpdir(), 'trails-ai-game');
  const files = await gameFiles(dir);
  console.log('game files:', files.join(', '));
  const lessonsDir = path.join(root, 'lessons');
  const ids = args.length ? args : fs.readdirSync(lessonsDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  const server = await serve(dir, files);
  const browser = await pw().chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.TrailsAI && window.TrailsAI.learnLesson, null, { timeout: 120000 });
  const report = [];
  for (const id of ids) {
    const file = path.join(lessonsDir, id + '.json');
    const raw = fs.readFileSync(file, 'utf8');
    console.log(`\n${id}: learning ${minutes} min on ${threads} threads`);
    const t0 = Date.now();
    let r;
    try { r = await page.evaluate(([raw, ms, n]) => window.TrailsAI.learnLesson(raw, ms, n), [raw, minutes * 60e3, threads]); } catch (e) { console.log('  failed:', e.message); continue; }
    const say = s => s ? `${s.prog} m, ${s.end}, ${s.game} game points${s.goal ? `, goal ${s.goal.n}/${s.goal.need}` : ''}, grades ${s.grades.join('')}` : '-';
    console.log(`  ${r.sweeps} sweeps in ${Math.round((Date.now() - t0) / 60e3)} min`);
    console.log(`  before: ${say(r.before)}`);
    console.log(`  after:  ${say(r.after)}`);
    if (r.improved) { fs.writeFileSync(file, JSON.stringify(r.lesson)); console.log('  better: lesson written'); }
    report.push({ id, improved: r.improved, before: r.before, after: r.after, sweeps: r.sweeps });
  }
  fs.writeFileSync(path.join(os.tmpdir(), 'trails-ai-cloud-report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
