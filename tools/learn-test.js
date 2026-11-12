// Learns a line in node, as the AI does in the page: node tools/learn-test.js <line.json> [sweeps] [workers] [plan.json]
// Prints the best ride after every sweep: how far, the points, and the tricks of every landing.
const fs = require('fs');
const { gameFiles, vmWorker, learner } = require('./node-sim');
(async () => {
  const file = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const route = file.route && file.route.X ? file.route : file.line;
  const sweeps = +(process.argv[3] || 3), workers = +(process.argv[4] || 4);
  const plan = process.argv[5] ? JSON.parse(fs.readFileSync(process.argv[5], 'utf8')) : null;
  const files = await gameFiles(), L = learner();
  let last = 0;
  const me = new L.Learner({ progress: p => { if (Date.now() - last > 15000) { last = Date.now(); console.log(`  section ${p.k + 1}/${p.K}, ${p.tries} tries, backed up ${p.backs}`); } } });
  const t0 = Date.now();
  const got = await me.prepare(route, { tricks: 511, bike: 0, tunes: {} }, files, workers, plan ? { plan } : null, vmWorker);
  const show = (b, label) => {
    console.log(`${label}: ${b.end} at ${b.prog}/${me.N} m, ${b.game} points (train ${b.train}, xp ${b.xp}), ${b.vAvg} m/s, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log('   ' + b.jl.map(e => `${e.g}${L.trickText(e.got) ? ':' + L.trickText(e.got) : ''}`).join(' | '));
  };
  console.log('saved states ok:', me.pool.snapOk, 'from memory:', got.fromMemory);
  show(me.best, 'start');
  for (let i = 0; i < sweeps; i++) {
    me.running = true;
    const r = await me.sweep(1 + i * 0.2);
    me.running = false;
    show(me.best, `sweep ${i + 1}${r && r.improved ? ' (better)' : ''}`);
  }
  console.log('book rows', me.book.length);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ plan: me.plan, best: me.best }));
  me.close();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
