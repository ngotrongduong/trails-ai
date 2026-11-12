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
    nextName: () => tx(`Đường ${lib.list().length + 1}`, `Line ${lib.list().length + 1}`),
  };
  // A new memory for line route (see buildRoute).
  function newMemory(route) {
    const { start, X, Z, KIND, W, pieces, kinds, length, back } = route;
    return { format: LINE_FORMAT, version: 3, id: start.id, name: lib.nextName(), line: { start, X: Array.from(X), Z: Array.from(Z), KIND: Array.from(KIND), W: W ? Array.from(W) : null, pieces, kinds, length, back: !!back },
      plan: null, best: null, sim: null, gen: 0, hist: [], fragile: [], rides: [], realBest: 0, setup: null, createdAt: Date.now() };
  }
  // The trick book: what every trick tried off a jump did (see the learner), kept for each set of unlocked tricks
  const loadBook = mask => { const b = readJSON(BOOK, null); return b && b.version === 2 && Array.isArray(b[mask]) ? b[mask] : []; };
  function saveBook(mask, rows) { const b = readJSON(BOOK, null) || { version: 2 }; if (b.version !== 2) return; b[mask] = rows.slice(-BOOK_ROWS); writeJSON(BOOK, b); }

  // The memories of the AI before this one (trailsai.v2.<id>, one for every line it learned) become memories of the
  // library: the line as it was, the plan in the new shape (its speeds, pulls, pumps, angles; its trick a trick
  // program). The old memories stay where they are. Lines of the game's Training, practice lines, joined-up tours and
  // challenges are left out: this AI rides one line of the map at a time.
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
      // (an old plan without pz pumped where the ground falls away ahead; without as its jumps took the old sections)
      if (!P.pz) plan.pc = P.v.map(() => 1);
      if (!P.as) plan.as = false;
      mem.plan = plan;
      lib.put(mem);
    }
    return n;
  }
