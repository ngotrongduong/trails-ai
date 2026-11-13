  // ---------------------------------------------------------------- the game's engine, hooked
  // The game builds its physics with WebAssembly.instantiate. It gets the same engine back with one change: while the
  // AI rides, the AI's controls replace the player's on every physics step (live.drive.step). (Given bytes,
  // instantiate gives { module, instance }; given a compiled module, as the game does since 2026-11, the instance
  // alone, and the game gets the same shape back.)
  const WAI = WebAssembly.instantiate.bind(WebAssembly);
  // tricks, bike and tunes are what the game set for your rider: the simulation rides with the same
  const live = { ex: null, g: 0, SL: 0, drive: null, tricks: null, bike: 0, tunes: {}, steps: 0 };
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
    px.trails_game_step = (g, ...inp) => {
      if (g === live.g) {
        live.steps++;
        if (live.drive) { try { const o = live.drive.step(); if (o) inp = o; } catch (err) { live.drive = null; console.error(err); } }
      }
      return ex.trails_game_step(g, ...inp);
    };
    live.ex = ex; live.SL = ex.trails_state_len();
    return bare ? { exports: px } : { module: r.module, instance: { exports: px } };
  };
  const liveState = () => new Float64Array(live.ex.memory.buffer, live.ex.trails_game_state(live.g), live.SL);
  // the rider setup the simulation copies (all tricks when the game was not watched from the start)
  const riderSetup = () => ({ tricks: live.tricks === null ? 511 : live.tricks, bike: live.bike, tunes: { ...live.tunes } });

  // ---------------------------------------------------------------- what the game receives
  // The world data the game gets from its server: the pieces of every chunk of the map near the bike, the starts of
  // the lines, and the game's own socket (for the chat invite after a share).
  // routes: the lines builders laid out in their spots (a start and the pieces of its jumps in order), for each start
  // those from it, the one with the most pieces first: { [start id]: [{ name, ids }] }.
  // spots: each spot's owner and pieces (for the player's own lines: see roaming).
  const cap = { chunks: new Map(), held: new Set(), starts: [], routes: {}, spots: [], ws: null };
  const routesOf = spots => {
    const out = {};
    for (const sp of (spots && Array.isArray(spots.list) ? spots.list : [])) for (const l of sp.lines || []) {
      if (!l || typeof l.from !== 'string' || !Array.isArray(l.route) || l.route.length < 2) continue;
      (out[l.from] = out[l.from] || []).push({ name: String(l.name || sp.name || '').slice(0, 40) || null, ids: l.route.filter(id => typeof id === 'string') });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => b.ids.length - a.ids.length);
    return out;
  };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  const WRAPPED = Symbol('trailsai');
  function take(data) {
    if (typeof data !== 'string' || data.length < 8) return;
    let r;
    try { r = JSON.parse(data); } catch { return; }
    if (r.t === 'chunk' && Array.isArray(r.c)) cap.chunks.set(r.c.join(','), Array.isArray(r.pieces) ? r.pieces : []);
    else if (r.t === 'welcome') { if (Array.isArray(r.starts)) cap.starts = r.starts; if (r.spots) { cap.routes = routesOf(r.spots); cap.spots = (Array.isArray(r.spots.list) ? r.spots.list : []).map(sp => ({ owner: sp && sp.owner, pieces: sp && Array.isArray(sp.pieces) ? sp.pieces : [] })); } cap.held.clear(); }
    else if (r.t === 'startsdiff') {
      const m = new Map(cap.starts.map(s => [s.id, s]));
      for (const id of r.gone || []) m.delete(id);
      for (const s of r.put || []) m.set(s.id, s);
      cap.starts = [...m.values()];
    }
  }
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
      if (cap.ws !== this && typeof d === 'string') {
        cap.ws = this;
        const cur = desc.get.call(this);
        if (cur && !cur[WRAPPED]) desc.set.call(this, wrap(cur));
      }
      if (typeof d === 'string' && d.includes('"sub"')) {
        const r = JSON.parse(d);
        for (const c of r.add || []) cap.held.add(String(c));
        for (const c of r.drop || []) cap.held.delete(String(c));
      }
    } catch { /* ignore */ }
    return origSend.call(this, d);
  };
  // the pieces the game has loaded, all of them
  const allPieces = () => [...cap.chunks.values()].flat();

  // ---------------------------------------------------------------- the player's own keys
  // A key the player presses (a real one: the AI's own key presses, for the game's replay editor, are not trusted)
  // while the AI rides takes the bike back: the AI stops riding, goes on learning, and watches where the bike is
  // taken (see the session's line watch).
  const RIDE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR']);
  const playerKeys = { last: 0, onKey: null };
  window.addEventListener('keydown', e => {
    if (!e.isTrusted || !RIDE_KEYS.has(e.code)) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    playerKeys.last = Date.now();
    if (playerKeys.onKey) { try { playerKeys.onKey(e); } catch (err) { console.error(err); } }
  }, true);
