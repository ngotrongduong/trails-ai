  // ---------------------------------------------------------------- the library of lines
  // Every line the AI has ridden has its memory in this browser: the line itself (kept exact: rebuilt later from what
  // the game has loaded it could come out otherwise), the plan learned for it, its best ride in the simulation, the
  // sections where real rides showed the simulation too hopeful, and the last real rides. An index (LIB) lists them
  // all with what the panel and finding a line need, so no memory is read until its line is ridden.
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
    // (the player's own choice, from the panel, after asking)
    forget(id) { keep.removeItem(LINE + id); writeJSON(LIB, lib.list().filter(o => o.id !== id)); },
  };
  // A line's name: the one the player gave it in the old AI, else one made from its id, the same on every computer and
  // as the old AI named it (place, what is there, a number: "Đồi Thông 37").
  const NAME_PLACE = ['Đồi', 'Dốc', 'Suối', 'Rừng', 'Đèo', 'Bãi', 'Cồn', 'Gò', 'Núi', 'Lũng', 'Ghềnh', 'Bờ', 'Trảng', 'Truông', 'Động', 'Mỏm'];
  const NAME_WHAT = ['Thông', 'Gió', 'Mây', 'Sương', 'Nắng', 'Trăng', 'Cát', 'Rêu', 'Sỏi', 'Lau', 'Tre', 'Đá', 'Hoa', 'Sao', 'Mưa', 'Sóc'];
  const NAME_PLACE_EN = ['Hill', 'Slope', 'Creek', 'Forest', 'Pass', 'Flat', 'Dune', 'Mound', 'Peak', 'Valley', 'Rapids', 'Bank', 'Meadow', 'Heath', 'Cave', 'Crag'];
  const NAME_WHAT_EN = ['Pine', 'Wind', 'Cloud', 'Mist', 'Sun', 'Moon', 'Sand', 'Moss', 'Pebble', 'Reed', 'Bamboo', 'Stone', 'Flower', 'Star', 'Rain', 'Squirrel'];
  function nameOf(id) {
    const given = (readJSON('trailsai.names', null) || {})[id];
    if (given) return String(given).slice(0, 40);
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
    const p = h & 15, w = (h >>> 4) & 15, n = 10 + ((h >>> 8) % 90);
    return tx(`${NAME_PLACE[p]} ${NAME_WHAT[w]} ${n}`, `${NAME_WHAT_EN[w]} ${NAME_PLACE_EN[p]} ${n}`);
  }
  // A new memory for line route (see buildRoute).
  function newMemory(route) {
    const { start, X, Z, KIND, W, pieces, kinds, length, back } = route;
    return { format: LINE_FORMAT, version: 3, id: start.id, name: nameOf(String(start.id)), line: { start, X: Array.from(X), Z: Array.from(Z), KIND: Array.from(KIND), W: W ? Array.from(W) : null, pieces, kinds, length, back: !!back },
      plan: null, best: null, sim: null, gen: 0, hist: [], fragile: [], rides: [], realBest: 0, setup: null, createdAt: Date.now() };
  }
  // The trick book: what every trick tried off a jump did (see the learner), kept for each set of unlocked tricks
  const loadBook = mask => { const b = readJSON(BOOK, null); return b && b.version === 2 && Array.isArray(b[mask]) ? b[mask] : []; };
  function saveBook(mask, rows) { const b = readJSON(BOOK, null) || { version: 2 }; if (b.version !== 2) return; b[mask] = rows.slice(-BOOK_ROWS); writeJSON(BOOK, b); }

  // The memories of the AI before this one (trailsai.v2.<id>, one for every line it learned) become memories of the
  // library: the line as it was, the plan in the new shape (its speeds, pulls, pumps, angles; its trick a trick
  // program). The old memories stay where they are. Lines of the game's Training, practice lines, joined-up tours and
  // challenges are left out: this AI rides one line of the map at a time.
  // The old AI's move of a section (its MOVES, by number, and hr) as a trick program: 1-15 held moves (buttons held, a
  // lean, a steer or a whip, above hr m), 16-17 a 360 let go at hr × 100°, 18 a backflip, 19-20 a whip let go at
  // hr × 0.25 s, 22-25 a backflip with a whip or a 360 (its angle left alone up to 320° round, as the old AI did). The
  // manual (21) is not kept.
  const OLD_HELD = [null, { b: 16 }, { b: 32 }, { b: 48 }, { b: 24 }, { b: 40 }, { b: 8 }, { b: 4, ln: -1 }, { b: 4, ln: 1 }, { w: 1 }, { w: -1 },
    { b: 64, st: 1 }, { st: 1 }, { st: -1 }, { b: 8, st: 1 }, { b: 12, ln: -1 }];
  function oldMove(mv, hr) {
    mv |= 0;
    if (mv >= 1 && mv <= 15) return { hm: { ...OLD_HELD[mv], h: hr } };
    const o = { 16: { s: -1, sr: hr, sf: 320 }, 17: { s: 1, sr: hr, sf: 320 }, 18: { f: 1 }, 19: { w: -1, wt: hr }, 20: { w: 1, wt: hr },
      22: { f: 1, w: -1, wt: hr }, 23: { f: 1, w: 1, wt: hr }, 24: { f: 1, s: -1, sr: hr, sf: 320 }, 25: { f: 1, s: 1, sr: hr, sf: 320 } }[mv];
    return o || null;
  }
  function migrateOld() {
    let n = 0;
    // (the first test build named lines by number: they get their own names)
    for (const row of lib.list()) if (/^(Đường cũ|Old line|Đường|Line) \d+$/.test(row.name || '')) lib.rename(row.id, nameOf(String(row.id)));
    for (const k of keep.keys()) {
      if (!k.startsWith('trailsai.v2.')) continue;
      const id = k.slice(12);
      if (lib.get(id)) continue;
      const m = readJSON(k, null), L = m && m.line, P = m && m.plan;
      if (!L || !P || !Array.isArray(L.X) || L.practice || L.drill || L.aim || L.tour !== undefined || !Array.isArray(P.v)) continue;
      const mem = newMemory({ ...L, W: L.W || null });
      n++;
      const plan = { v: P.v.slice(), pt: P.pt.slice(), pl: P.pl.slice(), pu: P.pu.slice(), tk: P.v.map((_, i) => oldMove(P.mv && P.mv[i], Array.isArray(P.hr) ? P.hr[i] : 1.5)) };
      for (const key of ['vs', 'lg', 'sa', 'ph', 'pk']) if (P[key] !== undefined) plan[key] = P[key];
      // (an old plan without pz pumped where the ground falls away ahead; without as its jumps took the old sections)
      if (!P.pz) plan.pc = P.v.map(() => 1);
      if (!P.as) plan.as = false;
      mem.plan = plan;
      lib.put(mem);
    }
    return n;
  }
