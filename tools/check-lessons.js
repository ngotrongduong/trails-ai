// Checks every file in lessons/ before it is merged: valid JSON in the lesson format, named after its line,
// not too big. It only reads the files as data, so it is safe to run on anyone's pull request.
// Prints a table of the lessons with the score each one claims; the AI re-checks that score itself
// on every player's computer before using a lesson.
// usage: node tools/check-lessons.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'lessons');
const MAX_BYTES = 2 * 1024 * 1024;
const num = v => typeof v === 'number' && Number.isFinite(v);
const PLAN_KEYS = ['v', 'pt', 'mv', 'hr', 'pl', 'pu'];

function problems(file, m) {
  const out = [];
  const L = m && m.line, P = m && m.plan, S = L && L.start;
  if (!m || m.format !== 'trails-ai-lesson') out.push('format must be "trails-ai-lesson"');
  if (!S || typeof S.id !== 'string' || !num(S.x) || !num(S.z) || !num(S.heading)) return out.concat('line.start needs id, x, z, heading');
  if (path.basename(file, '.json') !== S.id) out.push(`file must be named ${S.id}.json`);
  const n = Array.isArray(L.X) ? L.X.length : 0;
  if (n < 20 || n > 20000) out.push('line.X must hold 20 to 20000 points');
  if (!Array.isArray(L.X) || !L.X.every(num) || !Array.isArray(L.Z) || L.Z.length !== n || !L.Z.every(num)) out.push('line.X and line.Z must be numbers of the same length');
  if (!Array.isArray(L.KIND) || L.KIND.length !== n || !L.KIND.every(k => typeof k === 'string')) out.push('line.KIND must be text, one per point');
  if (!Array.isArray(L.pieces) || L.pieces.length > 20000 || !L.pieces.every(p => p && typeof p.kind === 'string' && num(p.x) && num(p.z) && num(p.heading) && (!p.params || Object.values(p.params).every(num)))) out.push('line.pieces must be pieces with kind, x, z, heading and number params');
  if (!P || !Array.isArray(P.v) || !PLAN_KEYS.every(k => Array.isArray(P[k]) && P[k].length === P.v.length && P[k].every(num))) out.push(`plan needs ${PLAN_KEYS.join(', ')} as number lists of the same length`);
  if (P && P.vs !== undefined && (!Array.isArray(P.vs) || !Array.isArray(P.v) || P.vs.length !== P.v.length || !P.vs.every(q => q === null || (Array.isArray(q) && q.length <= 12 && q.every(num))))) out.push('plan.vs must hold, for every section, null or a list of up to 12 speeds');
  if (m.bestRun &&(!num(m.bestRun.fit) || !num(m.bestRun.prog))) out.push('bestRun needs fit and prog numbers');
  const J = m.jumps;
  if (J !== undefined && (!J || !num(J.version) || !Array.isArray(J.list) || J.list.length > 2000
    || !J.list.every(j => j && Array.isArray(j.f) && j.f.length === 8 && j.f.every(num) && ['v', 'dpt', 'pl', 'pu'].every(k => num(j[k])))))
    out.push('jumps needs a version and a list of jumps, each with f (8 numbers), v, dpt, pl and pu');
  return out;
}

let bad = 0;
const rows = [];
for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const file = path.join(dir, name);
  const size = fs.statSync(file).size;
  let m = null, errs = [];
  if (size > MAX_BYTES) errs.push(`file is ${size} bytes, the limit is ${MAX_BYTES}`);
  else {
    try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { errs.push('not valid JSON: ' + e.message); }
    if (m) errs = errs.concat(problems(name, m));
  }
  if (errs.length) { bad++; console.log(`✗ ${name}\n  - ${errs.join('\n  - ')}`); continue; }
  const b = m.bestRun || {};
  rows.push(`| ${m.line.start.id} | ${m.line.X.length} m | ${b.prog ?? '?'} m | ${b.fit !== undefined ? Math.round(b.fit) : '?'} | ${b.end ?? '?'} | ${m.gen ?? '?'} | ${m.setup ? m.setup.tricks : '?'} |`);
}
// brain/brain.json: the shared brain, a list of weights (22 inputs, 16 hidden, 4 outputs)
const BRAIN_SIZE = 22 * 16 + 16 * 4 + 4;
const brainFile = path.join(__dirname, '..', 'brain', 'brain.json');
if (fs.existsSync(brainFile)) {
  let m = null, errs = [];
  if (fs.statSync(brainFile).size > MAX_BYTES) errs.push('brain.json is too big');
  else { try { m = JSON.parse(fs.readFileSync(brainFile, 'utf8')); } catch (e) { errs.push('not valid JSON: ' + e.message); } }
  if (m && (m.format !== 'trails-ai-brain' || m.version !== 1)) errs.push('format must be "trails-ai-brain", version 1');
  if (m && (!Array.isArray(m.w) || m.w.length !== BRAIN_SIZE || !m.w.every(num))) errs.push(`w must be ${BRAIN_SIZE} numbers`);
  if (errs.length) { bad++; console.log(`✗ brain/brain.json\n  - ${errs.join('\n  - ')}`); }
  else console.log(`brain/brain.json: ${m.gen ?? '?'} rounds on ${Array.isArray(m.lines) ? m.lines.length : '?'} lines\n`);
}
console.log('| line | length | best ride | score | ended | rounds | tricks mask |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
if (bad) { console.log(`\n${bad} lesson file(s) need fixing.`); process.exit(1); }
console.log(`\nAll ${rows.length} lesson file(s) look right.`);
