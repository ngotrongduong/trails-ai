  // ---------------------------------------------------------------- where on the map the AI rides, for the player's levels
  // Two of the game's levels grow with where one rides, and the AI can ride there (the switch in the panel, roam.mode):
  // - 'explore', for OG: the map is cut into 500 m squares (the open world, x -1900..2100 and z -2000..2000, in 8 × 8,
  //   A1..H8; the eight countries round it the same, as "Dunes C4"), and riding 10 s or more in a new square, or a new
  //   country, counts. The AI rides each line till the square of its start has had ROAM_S s of riding (or for ROAM_MAX
  //   at most), then takes the bike to a start in a square no ride has had ROAM_S s in yet: in a country none has had
  //   them in first, else the nearest. The seconds are those of every ride the AI sees (its own and the player's, while
  //   it is loaded): what the player rode before is not known, so a square already counted may be ridden again. Lines
  //   the AI only came to exploring are not kept in its library.
  // - 'mine', for Builder: a run on the player's lines counts when another rider rides one (the player's own runs do
  //   not), so the AI rides the lines of the player's spot (its start hills), the next one every ROAM_MINE: the invites
  //   it sends (see sharing) bring other riders there.
  const ROAM = 'trailsai.roam', ROAM_S = 20, ROAM_MAX = 240e3, ROAM_MINE = 15 * 60e3, ROAM_TRIES = 5;
  const SQ_X0 = -1900, SQ_Z0 = -2000, SQ = 500, SQ_N = 8;
  const LANDS = [['Jungle', 'Dunes', 'Red rock'], ['Hardwoods', null, 'Farmland'], ['Ice fields', 'High peaks', 'Pine country']];
  const roam = (() => { const r = readJSON(ROAM, {}); return { mode: ['explore', 'mine'].includes(r.mode) ? r.mode : 'off', secs: r.secs && typeof r.secs === 'object' ? r.secs : {}, leg: null, skip: new Set(), me: null, k: 0 }; })();
  const saveRoam = () => writeJSON(ROAM, { mode: roam.mode, secs: roam.secs });
  // the game's square at (x, z), as it names it, and its country ('' for the open world); null off the map
  function squareAt(x, z) {
    const c = Math.floor((x - SQ_X0) / SQ), r = Math.floor((z - SQ_Z0) / SQ);
    if (c < -SQ_N || c >= 2 * SQ_N || r < -SQ_N || r >= 2 * SQ_N) return null;
    const land = LANDS[Math.floor(r / SQ_N) + 1][Math.floor(c / SQ_N) + 1] || '', m = v => ((v % SQ_N) + SQ_N) % SQ_N;
    const sq = String.fromCharCode(65 + m(c)) + (m(r) + 1);
    return { land, name: land ? `${land} ${sq}` : sq };
  }
  const landOf = name => (name.includes(' ') ? name.slice(0, name.lastIndexOf(' ')) : '');
  const sqDone = name => (roam.secs[name] || 0) >= ROAM_S;
  // the squares and countries ridden enough, as far as the AI has seen
  function roamCount() { const sq = Object.keys(roam.secs).filter(sqDone); return { squares: sq.length, lands: new Set(sq.map(landOf)).size }; }
  // every second the bike rides along: a second more for its square
  let roamTick = 0;
  setInterval(() => {
    const me = bikeNow();
    if (!me || me.down || !(me.v > 1)) return;
    const q = squareAt(me.x, me.z);
    if (!q) return;
    const was = sqDone(q.name);
    roam.secs[q.name] = (roam.secs[q.name] || 0) + 1;
    if (++roamTick % 15 === 0 || (!was && sqDone(q.name))) saveRoam();
  }, 1000);
  // the start hills of the player's spot (its owner is the player signed in to the game)
  function myStarts() {
    if (!roam.me) return [];
    const S = new Map(cap.starts.map(s => [s.id, s]));
    return (cap.spots || []).filter(sp => sp.owner === roam.me).flatMap(sp => sp.pieces.filter(id => S.has(id)).map(id => S.get(id)));
  }
  async function whoAmI() {
    if (roam.me) return roam.me;
    try { const r = await fetch('/api/auth/me', { credentials: 'same-origin' }); const j = await r.json(); roam.me = j && j.user && typeof j.user.username === 'string' ? j.user.username : null; } catch { roam.me = null; }
    return roam.me;
  }
  // where to go next: { s (a start), why } or null
  function roamNext() {
    if (roam.mode === 'mine') {
      const list = myStarts();
      if (!list.length) return null;
      const at = ses.mem ? list.findIndex(s => s.id === ses.mem.id) : -1, s = list[(at + 1) % list.length];
      return s && (!ses.mem || s.id !== ses.mem.id) ? { s, why: tx('đường của bạn', 'your line') } : null;
    }
    const me = bikeNow(), lands = new Set(Object.keys(roam.secs).filter(sqDone).map(landOf));
    let best = null;
    for (const s of cap.starts) {
      const q = squareAt(s.x, s.z);
      if (!q || sqDone(q.name) || roam.skip.has(q.name)) continue;
      const sc = (lands.has(q.land) ? 1e6 : 0) + (me ? Math.hypot(s.x - me.x, s.z - me.z) : 0);
      if (!best || sc < best.sc) best = { s, sc, q };
    }
    return best && { s: best.s, sq: best.q.name, why: lands.has(best.q.land) ? tx(`ô mới ${best.q.name}`, `new square ${best.q.name}`) : tx(`vùng mới ${best.q.land || 'vùng giữa'} (ô ${best.q.name})`, `new country ${best.q.land || 'Open world'} (square ${best.q.name})`) };
  }
  // Called before each real ride: whether the AI has taken the bike somewhere else instead (then it rides there next).
  async function roamStep() {
    if (roam.mode === 'off' || !ses.mem) return false;
    const now = Date.now(), id = ses.mem.id;
    if (!roam.leg || roam.leg.id !== id) roam.leg = { id, t0: now, had: true };
    if (roam.mode === 'explore') {
      const st = ses.mem.line.start, q = squareAt(st.x, st.z), late = now - roam.leg.t0 > ROAM_MAX;
      if (q && !sqDone(q.name) && !late) return false;
      if (q && !sqDone(q.name)) roam.skip.add(q.name);
    } else {
      if (!(await whoAmI())) return false;
      if (myStarts().some(s => s.id === id) && now - roam.leg.t0 < ROAM_MINE) return false;
    }
    for (let k = 0; k < ROAM_TRIES; k++) {
      const n = roamNext();
      if (!n) return false;
      try { await roamTo(n); return true; } catch (err) { if (n.sq) roam.skip.add(n.sq); else return false; ui.log(tx(`Không mở được đường ở ${esc(n.why)}: thử chỗ khác.`, `Could not open a line at ${esc(n.why)}: trying elsewhere.`)); }
    }
    return false;
  }
  // takes the bike to start s, waits for the game to load the ground there, opens the line
  async function roamTo(n) {
    const s = n.s, old = roam.leg;
    ses.busy = true; ui.update();
    try {
      closeLine();
      if (old && !old.had && roam.mode === 'explore') lib.forget(old.id);
      live.ex.trails_set_spawn_at(live.g, s.x, s.z, s.heading, 0);
      live.ex.trails_game_reset(live.g);
      ses.aiMoved = Date.now();
      const key = Math.floor(s.x / 256) + ',' + Math.floor(s.z / 256);
      for (let t = 0; t < 40 && !cap.chunks.has(key); t++) { await sleep(500); ses.aiMoved = Date.now(); }
      await sleep(1500); ses.aiMoved = Date.now();
      roam.leg = { id: s.id, t0: Date.now(), had: !!lib.get(s.id) };
    } finally { ses.busy = false; ui.update(); }
    ui.log(tx(`<b>Đi tới ${esc(n.why)}</b>.`, `<b>Off to ${esc(n.why)}</b>.`));
    await openLine(s.id);
  }
  function setRoam(mode) {
    roam.mode = mode; roam.leg = null; saveRoam();
    if (mode === 'mine') whoAmI().then(me => { if (!me) ui.log(tx('Chưa thấy tài khoản game của bạn (hãy đăng nhập trong game) nên chưa biết đường nào là của bạn.', 'No game account yet (sign in to the game), so the AI cannot tell which lines are yours.')); else if (!myStarts().length) ui.log(tx('Chưa thấy đường nào trong spot của bạn.', 'No lines in your spot yet.')); ui.update(); });
    ui.update();
  }
