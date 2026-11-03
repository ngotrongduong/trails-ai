// Gathers the jumps of every lesson in lessons/ into experience/jumps.json: for each jump a line's best ride got
// over, the jump's shape and the plan used on it. The AI downloads this one file to borrow what worked on similar
// jumps when it starts a new line. A GitHub workflow runs this after every change to lessons/.
// usage: node tools/gather-experience.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'lessons');
const VERSION = 1;
const num = v => typeof v === 'number' && Number.isFinite(v);
const KEYS = ['v', 'dpt', 'pl', 'pu'];

const jumps = [];
let lines = 0;
for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
  const id = m && m.line && m.line.start && m.line.start.id;
  const J = m && m.jumps;
  if (typeof id !== 'string' || !J || J.version !== VERSION || !Array.isArray(J.list)) continue;
  let n = 0;
  for (const j of J.list) {
    if (!j || !Array.isArray(j.f) || j.f.length !== 8 || !j.f.every(num) || !KEYS.every(k => num(j[k]))) continue;
    jumps.push({ id, f: j.f, v: j.v, dpt: j.dpt, pl: j.pl, pu: j.pu });
    n++;
  }
  if (n) lines++;
}
fs.mkdirSync(path.join(root, 'experience'), { recursive: true });
fs.writeFileSync(path.join(root, 'experience', 'jumps.json'), JSON.stringify({ format: 'trails-ai-experience', version: VERSION, lines, jumps }) + '\n');
console.log(`${jumps.length} jumps from ${lines} line(s)`);
