  // ---------------------------------------------------------------- the line
  // A line is the way from a start along the pieces the game has loaded: points a metre apart (X, Z), the kind of
  // piece under each (KIND: start, takeoff, landing, air over a gap, pump, flat, berm) and half its width (W), with
  // the pieces near it that the physics needs.
  const PHYS_KINDS = ['start', 'takeoff', 'landing', 'pump', 'flat', 'berm'];
  // A line may turn in the air: off a takeoff, a landing turned up to TURN_MAX rad from it (115°) within TURN_REACH m,
  // each radian of turn counted as TURN_COST m further off. The way through the air then bends round from the lip's way
  // to the landing's (when it turns TURN_BEND rad and more), so the rider steers round it in flight.
  const TURN_MAX = 2.0, TURN_REACH = 60, TURN_COST = 10, TURN_BEND = 0.75;
  // Off a takeoff anything but a landing counts JUMP_OTHER m further off (a landing it can reach wins over the next lip).
  const JUMP_OTHER = 10;
  // A fork: the line could go on to up to FORK_WAYS takeoffs or landings counted within FORK_MARGIN m of the nearest.
  // The AI tries up to FORK_LINES ways a line may go (see the drive) and learns on the one that rides furthest best.
  const FORK_MARGIN = 12, FORK_WAYS = 3, FORK_LINES = 5;
  // Between pieces a line may cross bare ground (the game's own lines do, a landing to the next takeoff over the hill):
  // up to GROUND_REACH m on, turned up to GROUND_DH rad, no further to the side than GROUND_LAT a metre on, counted as
  // GROUND_COST m further off than a piece that follows on at once. Off the end of a piece onto a landing so is a drop.
  const GROUND_REACH = 30, GROUND_DH = 0.7, GROUND_LAT = 0.35, GROUND_COST = 5, GUIDE_REACH = 60;
  // The way lines are traced: a line kept from an older way (lower LINE_V) is traced again when opened (see the drive).
  // 2: turns in the air, bare ground between pieces, drops, the game's own laid-out lines.
  const LINE_V = 2;
  const assets = () => {
    const names = performance.getEntriesByType('resource').map(e => e.name);
    const pick = re => names.find(n => re.test(n));
    return {
      wasm: pick(/trails-[^/]+\.wasm/),
      land: [pick(/red-rock-study[^/]*\.bin/), pick(/grinnell-southeast-shoulder[^/]*\.bin/),
        pick(/connected-assembly-residual[^/]*\.bin/), pick(/connected-assembly-influence[^/]*\.bin/)],
    };
  };
  // the game's physics on the main thread, with no terrain: only for laying out pieces
  let eng = null;
  async function engine() {
    if (eng) return eng;
    const a = assets();
    if (!a.wasm) throw new Error(tx('Không thấy file vật lý của game. Hãy tải lại trang game.', "The game's physics file was not found. Reload the game's page."));
    const { instance } = await WAI(await (await fetch(a.wasm)).arrayBuffer(), {});
    const l = instance.exports, g = l.trails_game_new(1);
    const txt = n => { const b = l.trails_buf(g); return new TextDecoder().decode(new Uint8Array(l.memory.buffer, b, n)); };
    const K = JSON.parse(txt(l.trails_kinds_json(g))), FF = l.trails_world_sizes() & 65535;
    const wp = l.trails_world_flat(g, 1), fmt = new Float64Array(l.memory.buffer, wp, 1)[0];
    const kidx = Object.fromEntries(K.map((k, i) => [k.key, i]));
    const layout = f => {
      const arr = [fmt, 2, 0, 0, 0], ki = kidx[f.kind];
      const p = K[ki].params.map(q => { const v = f.params && f.params[q.key]; return Math.min(q.max, Math.max(q.min, v !== undefined ? v : q.default)); });
      arr.push(1, ki, f.x, f.z, f.heading);
      for (let h = 0; h < FF - 5; h++) arr.push(h < p.length ? p[h] : 0);
      const h = arr.length * 8 + 8, c = l.trails_alloc(h), d = c + 7 & -8;
      new Float64Array(l.memory.buffer, d, arr.length).set(arr);
      const n = l.trails_layout_alone(g, d, arr.length);
      l.trails_dealloc(c, h);
      return JSON.parse(txt(n));
    };
    eng = { K, kidx, layout };
    return eng;
  }
  // a piece as laid out on its own (kept: tracing a line lays out hundreds)
  const layouts = new WeakMap();
  function layOf(e, p) {
    if (!layouts.has(p)) { let lay = null; try { lay = e.layout(p); } catch { lay = null; } layouts.set(p, lay); }
    return layouts.get(p);
  }
  // points [x, z, kind, half width] along a line, from point k0 on, as one point every metre
  function resample(raw, k0) {
    const X = [], Z = [], KIND = [], W = [];
    let px = raw[k0][0], pz = raw[k0][1];
    X.push(px); Z.push(pz); KIND.push(raw[k0][2]); W.push(raw[k0][3] || 0);
    for (let i = k0 + 1; i < raw.length; i++) {
      const [qx, qz, kd, hw] = raw[i];
      let d = Math.hypot(qx - px, qz - pz);
      if (d < 1e-6) continue;
      while (d >= 1) {
        px += (qx - px) / d; pz += (qz - pz) / d;
        X.push(px); Z.push(pz); KIND.push(kd); W.push(hw || 0);
        d = Math.hypot(qx - px, qz - pz);
      }
    }
    return { X, Z, KIND, W };
  }
  // The line from start (x, z, heading) along the pieces the game has loaded; back: ridden the wrong way round, from
  // start back along the pieces that lead to it (a landing then ridden up as a takeoff, a takeoff down as a landing).
  // opt.guide: the laid-out line to follow ({ name, ids }; null none; left out, the start's longest one). opt.pick:
  // at the n-th fork the line meets (see FORK_MARGIN), the pick[n]-th way (0: the nearest, as the default line goes).
  // The route carries its forks (where in its chain, how many ways) and its pieces' ids in order (ids).
  async function buildRoute(start, back, opt = {}) {
    const e = await engine();
    const near = allPieces().filter(p => e.kidx[p.kind] !== undefined && Math.hypot(p.x - start.x, p.z - start.z) < 2500);
    const segs = [];
    for (const p of near) {
      if (!PHYS_KINDS.includes(p.kind)) continue;
      const lay = layOf(e, p);
      if (!lay || !lay.path || lay.path.length < 2) continue;
      const ro = lay.runOut || lay.exit, li = lay.leadIn || [p.x, p.z, p.heading];
      segs.push({ p, pts: lay.path.map(q => [q[1], q[2]]), end: [ro[0], ro[1], ro[2]], lead: [li[0], li[1], li[2]] });
    }
    // first piece: the one the start sits on
    let cur = null, best = 6;
    for (const s of segs) {
      for (let i = 1; i < s.pts.length; i++) {
        const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((start.x - ax) * dx + (start.z - az) * dz) / L2, 0, 1);
        const d = Math.hypot(start.x - (ax + dx * t), start.z - (az + dz * t));
        const hd = Math.abs(wrapA(Math.atan2(dz, dx) + (back ? Math.PI : 0) - start.heading));
        if (d + hd * 2 < best) { best = d + hd * 2; cur = s; }
      }
    }
    if (!cur) return null;
    const design = opt.guide !== undefined ? opt.guide : !back && cap.routes && cap.routes[start.id] ? cap.routes[start.id][0] : null;
    const guide = design ? design.ids : null, byId = new Map(segs.map(s => [s.p.id, s])), pick = opt.pick || [], forks = [];
    let gk = 0;
    const chain = [], used = new Set(), gapAfter = [];
    while (cur && chain.length < 600) {
      chain.push(cur); used.add(cur);
      let nxt = null, gap = 0;
      const cands = [];
      for (const s of segs) {
        if (used.has(s)) continue;
        // (back: the piece s whose end leads onto this one, as forward this one would go on to s)
        const a = back ? s : cur, b = back ? cur : s;
        const [ex, ez, eh] = a.end, jump = a.p.kind === 'takeoff', land = b.p.kind === 'landing', [lx, lz, lh] = b.lead;
        const dx = lx - ex, dz = lz - ez, f = dx * Math.cos(eh) + dz * Math.sin(eh), lat = -dx * Math.sin(eh) + dz * Math.cos(eh), dh = Math.abs(wrapA(lh - eh));
        // (from a takeoff a landing up to 250 m on still joins, a big jump down a long hill flies that far; anything
        // else only up to 40 m, and nearer pieces always win; a berm's way in and out lie over the flats beside it)
        const maxF = jump ? (land ? 250 : 40) : GROUND_REACH;
        if (f < -3.5 || f > maxF) continue;
        // (a landing turned from the takeoff's way, up to TURN_MAX, near enough to steer round to in the air: a line
        // that turns in flight; counted as further off the more it turns, so a landing straight ahead at the same
        // distance wins)
        const turn = jump && land && dh > 0.75, ground = !jump && f > 3.5;
        if (turn) { if (dh > TURN_MAX || f < 2 || Math.hypot(f, lat) > TURN_REACH || Math.abs(lat) > 3 + 1.3 * f) continue; }
        else if (ground) { if (dh > GROUND_DH || Math.abs(lat) > 1.5 + GROUND_LAT * f) continue; }
        else {
          if (Math.abs(lat) > 1.5 + Math.min(40, Math.max(0, f)) * (jump ? 0.45 : 0.3)) continue;
          if (dh > (jump ? 0.75 : 0.65)) continue;
        }
        const sc = Math.abs(f) + Math.abs(lat) * 2 + dh * (turn ? TURN_COST : 3) + (ground ? GROUND_COST : 0) + (jump && !land ? JUMP_OTHER : 0);
        // (gap: 1 a flight, off a takeoff or dropping off the end of something onto a landing; 2 bare ground)
        cands.push({ s, sc, gap: jump || (ground && land) ? 1 : ground ? 2 : 0 });
      }
      cands.sort((a, b) => a.sc - b.sc);
      // A fork: other takeoffs or landings it could go on to, counted at most FORK_MARGIN m further off than the
      // nearest, each over 3 m from the ones before it (not the same jump laid twice). Not on a laid-out line.
      let way = 0;
      if (cands.length && !guide) {
        const ways = [cands[0]];
        for (const c of cands.slice(1)) {
          if (ways.length >= FORK_WAYS || c.sc > cands[0].sc + FORK_MARGIN) break;
          if (!['takeoff', 'landing'].includes(c.s.p.kind) || !(cur.p.kind === 'takeoff' || ['takeoff', 'landing'].includes(cands[0].s.p.kind))) continue;
          if (ways.every(w => Math.hypot(w.s.lead[0] - c.s.lead[0], w.s.lead[1] - c.s.lead[1]) > 3)) ways.push(c);
        }
        if (ways.length > 1) { way = Math.min(ways.length - 1, pick[forks.length] || 0); forks.push({ at: chain.length - 1, n: ways.length }); }
        nxt = ways[way].s; gap = ways[way].gap;
      } else if (cands.length) { nxt = cands[0].s; gap = cands[0].gap; }
      // A takeoff laid on top of a flat, part way along it: the bike rides up it there, whatever lies past it
      // (cur.cut: how far along the flat its foot is).
      if (!back && cur.p.kind !== 'takeoff' && !way) {
        let along = Infinity, on = null;
        for (const s of segs) {
          if (used.has(s) || s.p.kind !== 'takeoff') continue;
          const [lx, lz, lh] = s.lead;
          let run = 0;
          for (let i = 1; i < cur.pts.length; i++) {
            const [ax, az] = cur.pts[i - 1], [bx, bz] = cur.pts[i];
            const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
            const t = ((lx - ax) * dx + (lz - az) * dz) / L, off = Math.abs((lz - az) * dx - (lx - ax) * dz) / L;
            if (t >= 0 && t <= L && off < 1.5 && Math.abs(wrapA(lh - Math.atan2(dz, dx))) < 0.65 && run + t > 1 && run + t < along) { along = run + t; on = s; }
            run += L;
          }
        }
        if (on) { cur.cut = along; nxt = on; gap = 0; }
      }
      // The game's own line from this start, when its builder laid one out: its pieces in order. The line goes on to the
      // next of them it can reach (a landing up to 250 m off a takeoff, anything else up to GUIDE_REACH m over the
      // ground), whichever way it lies; a piece other than a takeoff that follows on at once and leads nearer comes first.
      if (guide) {
        for (let k = gk; k < guide.length; k++) if (guide[k] === cur.p.id) { gk = k + 1; break; }
        while (gk < guide.length && !byId.has(guide[gk])) gk++;
        const g = gk < guide.length ? byId.get(guide[gk]) : null;
        if (g && !used.has(g) && nxt !== g) {
          const [ex, ez, eh] = cur.end, jump = cur.p.kind === 'takeoff', [lx, lz] = g.lead, dx = lx - ex, dz = lz - ez;
          const f = dx * Math.cos(eh) + dz * Math.sin(eh), d = Math.hypot(dx, dz);
          const toward = nxt && !jump && gap === 0 && nxt.p.kind !== 'takeoff' && Math.hypot(lx - nxt.end[0], lz - nxt.end[1]) < d - 1;
          if (f > -3.5 && d < (jump && g.p.kind === 'landing' ? 250 : GUIDE_REACH) && !toward) {
            delete cur.cut; nxt = g; gap = jump || (g.p.kind === 'landing' && d > 3.5) ? 1 : d > 3.5 ? 2 : 0;
          }
        }
      }
      gapAfter.push(nxt ? gap : 0);
      cur = nxt;
    }
    const raw = [], flip = { takeoff: 'landing', landing: 'takeoff' };
    let hw = 0, n0 = 0;
    const add = (x, z, kd) => raw.push([x, z, kd, hw]);
    chain.forEach((s, ci) => {
      hw = s.p.params && s.p.params.width > 0 ? s.p.params.width / 2 : 0;
      if (back) {
        const kd = flip[s.p.kind] || s.p.kind;
        add(s.end[0], s.end[1], ci && gapAfter[ci - 1] ? gapAfter[ci - 1] === 2 ? 'flat' : 'air' : kd);
        for (let i = s.pts.length - 1; i >= 0; i--) add(s.pts[i][0], s.pts[i][1], kd);
      } else if (s.cut !== undefined) {
        let run = 0;
        add(s.pts[0][0], s.pts[0][1], s.p.kind);
        for (let i = 1; i < s.pts.length; i++) {
          const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], L = Math.hypot(bx - ax, bz - az) || 1;
          if (run + L >= s.cut) { const t = (s.cut - run) / L; add(ax + (bx - ax) * t, az + (bz - az) * t, s.p.kind); break; }
          add(bx, bz, s.p.kind); run += L;
        }
      } else {
        for (const q of s.pts) add(q[0], q[1], s.p.kind);
        add(s.end[0], s.end[1], gapAfter[ci] === 1 ? 'air' : s.p.kind);
        const nx = chain[ci + 1];
        // (bare ground between two pieces: ridden over as flat)
        if (gapAfter[ci] === 2 && nx) add(nx.pts[0][0], nx.pts[0][1], 'flat');
        // (a flight that turns: a curve from the lip's way round to the landing's, as the rider steers it)
        if (gapAfter[ci] === 1 && nx) {
          const [x0, z0, h0] = s.end, [x1, z1] = nx.pts[0], h1 = nx.lead[2], c = Math.hypot(x1 - x0, z1 - z0);
          if (Math.abs(wrapA(h1 - h0)) > TURN_BEND && c > 2) {
            const k = 0.4 * c, n = Math.ceil(c);
            for (let i = 1; i < n; i++) {
              const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3;
              add(a * x0 + b * (x0 + k * Math.cos(h0)) + d * (x1 - k * Math.cos(h1)) + e * x1,
                a * z0 + b * (z0 + k * Math.sin(h0)) + d * (z1 - k * Math.sin(h1)) + e * z1, 'air');
            }
          }
        }
      }
      if (!ci) n0 = raw.length;
    });
    // the line starts on the first piece, at the point nearest the start
    let k0 = 0, d0 = Infinity;
    raw.forEach((q, i) => { const d = Math.hypot(q[0] - start.x, q[1] - start.z); if (i < n0 && d < d0) { d0 = d; k0 = i; } });
    const { X, Z, KIND, W } = resample(raw, k0);
    if (X.length < 20) return null;
    // the pieces the physics needs: everything close to the line
    const cell = 32, grid = new Map();
    for (let i = 0; i < X.length; i += 4) {
      const key = Math.floor(X[i] / cell) + ',' + Math.floor(Z[i] / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    const nearLine = (x, z, r) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell), n = Math.ceil(r / cell);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (const i of grid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(X[i] - x, Z[i] - z) < r) return true;
      return false;
    };
    const pieces = near.filter(p => nearLine(p.x, p.z, p.kind === 'shape' || p.kind === 'ground' ? 70 : 35));
    const kinds = {};
    chain.forEach(s => { kinds[s.p.kind] = (kinds[s.p.kind] || 0) + 1; });
    return { start: { id: start.id, x: start.x, z: start.z, heading: start.heading }, X, Z, KIND, W, length: X.length, pieces, kinds, v: LINE_V, design: design ? design.name : null,
      forks, ids: chain.map(s => s.p.id) };
  }
  // The ways a line from start may go: each line laid out from it (longest first), the line by the pieces, then that
  // line taking another way at one fork after another (breadth first: the first fork's other ways, then the second's,
  // ...), as long as each is another line; at most FORK_LINES in all. The first is buildRoute(start, back)'s.
  async function buildRoutes(start, back) {
    // (another line: other pieces, and not the same way over the ground within half a metre)
    const out = [], seen = new Set(), sameWay = (a, b) => a.length === b.length && Array.from(a.X).every((x, i) => Math.abs(x - b.X[i]) < 0.5 && Math.abs(a.Z[i] - b.Z[i]) < 0.5);
    const add = r => { const k = r && r.ids.join(','); if (!r || seen.has(k)) return false; seen.add(k); if (out.some(o => sameWay(o, r))) return false; out.push(r); return true; };
    for (const d of (!back && cap.routes && cap.routes[start.id]) || []) { if (out.length < FORK_LINES) add(await buildRoute(start, back, { guide: d })); }
    const base = await buildRoute(start, back, { guide: null });
    add(base);
    const q = base ? [{ pick: [], r: base }] : [];
    while (q.length && out.length < FORK_LINES) {
      const { pick, r } = q.shift();
      for (let j = pick.length; j < r.forks.length && out.length < FORK_LINES; j++) {
        for (let a = 1; a < r.forks[j].n && out.length < FORK_LINES; a++) {
          const p = pick.concat(new Array(j - pick.length).fill(0), [a]), v = await buildRoute(start, back, { guide: null, pick: p });
          if (add(v)) q.push({ pick: p, r: v });
        }
      }
    }
    return out;
  }
  // Half the width of the piece under each point of a line kept from before lines carried it: the widest piece whose
  // way passes within 2 m of the point, else 0.
  async function widthsOf(route) {
    const e = await engine(), segs = [];
    for (const p of route.pieces) {
      if (!PHYS_KINDS.includes(p.kind) || !(p.params && p.params.width > 0)) continue;
      const lay = layOf(e, p);
      if (lay && lay.path && lay.path.length > 1) segs.push({ hw: p.params.width / 2, pts: lay.path.map(q => [q[1], q[2]]) });
    }
    return Array.from(route.X, (x, i) => {
      const z = route.Z[i];
      let w = 0;
      for (const s of segs) {
        if (s.hw <= w) continue;
        for (let k = 1; k < s.pts.length; k++) {
          const [ax, az] = s.pts[k - 1], [bx, bz] = s.pts[k], dx = bx - ax, dz = bz - az;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 2) { w = s.hw; break; }
        }
      }
      return w;
    });
  }
  // The game holds every chunk a line's pieces sit in (so tracing it again finds them all).
  const lineLoaded = line => line.pieces.every(p => cap.chunks.has(Math.floor(p.x / 256) + ',' + Math.floor(p.z / 256)));
  // Two traces of a line are the same: the same points (within 5 cm) over the same kinds of piece.
  const sameLine = (a, b) => a.length === b.length && Array.from(a.X).every((x, i) => Math.abs(x - b.X[i]) < 0.05 && Math.abs(a.Z[i] - b.Z[i]) < 0.05 && a.KIND[i] === b.KIND[i]);
  // A line is out of date when the game now holds the chunk one of its pieces sits in, and the piece is gone or moved.
  function lineStale(line) {
    for (const p of line.pieces) {
      const got = cap.chunks.get(Math.floor(p.x / 256) + ',' + Math.floor(p.z / 256));
      if (got && !got.some(q => q.kind === p.kind && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- which line the bike is at
  // Where the bike is now and the way it faces (null before the game has a bike).
  function bikeNow() {
    if (!live.ex || !live.g) return null;
    const s = liveState();
    return Number.isFinite(s[0]) && Number.isFinite(s[2]) ? { x: s[0], z: s[2], heading: s[3], v: Math.abs(s[8]), air: s[12] > 0, down: s[13] > 0 } : null;
  }
  // The trail under the bike, the way it faces: of the pieces the game has loaded, the point nearest the bike (every
  // 2 m along each piece, within 20 m), ridden the piece's way or the wrong way round, whichever is nearer its heading.
  // The line starts there, or up to HERE_RUN metres back along it as far as no jump is in the way, so the bike has
  // speed by where it stood (from a stop it fell short of a jump 9 m on); back on a start hill, on its deck, where the
  // game's own start of it is. Its id: 'here-' and where it starts.
  const HERE_RUN = 40;
  async function lineHere(me) {
    const e = await engine();
    let c = null;
    for (const p of allPieces()) {
      if (!PHYS_KINDS.includes(p.kind) || e.kidx[p.kind] === undefined || Math.hypot(p.x - me.x, p.z - me.z) > 80) continue;
      const lay = layOf(e, p);
      if (!lay || !lay.path || lay.path.length < 2) continue;
      for (let i = 1; i < lay.path.length; i++) {
        const ax = lay.path[i - 1][1], az = lay.path[i - 1][2], bx = lay.path[i][1], bz = lay.path[i][2];
        const h = Math.atan2(bz - az, bx - ax), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
        for (let q = 0; q <= n; q++) {
          const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n, d = Math.hypot(x - me.x, z - me.z);
          if (d > 20) continue;
          for (const back of [false, true]) {
            const hh = wrapA(h + (back ? Math.PI : 0)), score = d + 8 * Math.abs(wrapA(hh - me.heading));
            if (!c || score < c.score) c = { x, z, h: hh, back, score };
          }
        }
      }
    }
    if (!c) return null;
    let x = c.x, z = c.z, h = c.h, back = c.back;
    const rb = await buildRoute({ id: 'back', x: c.x, z: c.z, heading: wrapA(c.h + Math.PI) }, !c.back);
    if (rb) {
      let k = 0;
      while (k + 1 < Math.min(rb.length, HERE_RUN + 1) && !['takeoff', 'landing', 'air', 'start'].includes(rb.KIND[k + 1])) k++;
      const gate = rb.KIND[k + 1] === 'start' && cap.starts
        .filter(o => Math.hypot(o.x - rb.X[k + 1], o.z - rb.Z[k + 1]) < 25 && Math.abs(wrapA(o.heading - c.h)) < 0.6)
        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
      if (gate) { x = gate.x; z = gate.z; h = gate.heading; back = false; }
      else if (k >= 3) { x = rb.X[k]; z = rb.Z[k]; h = Math.atan2(rb.Z[k - 1] - rb.Z[k], rb.X[k - 1] - rb.X[k]); }
    }
    const s = { id: gateId(x, z, h) || `here-${Math.round(x)}_${Math.round(z)}_${back ? 'b' : 'f'}`, x, z, heading: h };
    const r = await buildRoute(s, back);
    if (r) r.back = back;
    return r && r.length >= 25 ? r : null;
  }
  // the game's start a line from (x, z) going h starts at, if it is one: its id
  const gateId = (x, z, h) => { const o = cap.starts.find(o => Math.hypot(o.x - x, o.z - z) < 1 && Math.abs(wrapA(o.heading - h)) < 0.1); return o ? o.id : null; };
  // The line the bike is at (me: bikeNow): a line of the library whose start is within START_NEAR m of the bike and
  // faces its way (the nearest), else one of the game's starts there, else the trail under the bike (lineHere).
  // Gives back { id, route (null for one of the library: its memory has it), how }.
  const START_NEAR = 15;
  async function lineAt(me, library) {
    const close = (s, r) => Math.hypot(s.x - me.x, s.z - me.z) < r && Math.abs(wrapA(s.heading - me.heading)) < 1.2;
    const known = library.filter(o => close(o.start, START_NEAR)).sort((a, b) => Math.hypot(a.start.x - me.x, a.start.z - me.z) - Math.hypot(b.start.x - me.x, b.start.z - me.z))[0];
    if (known) return { id: known.id, route: null, how: 'library' };
    const gate = cap.starts.filter(s => close(s, START_NEAR)).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    if (gate) { const r = await buildRoute(gate); if (r) return { id: gate.id, route: r, how: 'start' }; }
    const r = await lineHere(me);
    return r ? { id: r.start.id, route: r, how: 'here' } : null;
  }
