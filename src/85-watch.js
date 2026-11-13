  // ---------------------------------------------------------------- watching the AI learn
  // A screen over the game (the 👁 button of the panel): the part of the line the AI is learning, seen from the side or
  // from above, and every try of its last round there played again all at once, each bike where its own plan took it
  // (hundreds at a time): the ones kept for the next section in gold, falls in red, rides round a jump in violet, the
  // others pale blue. Below it the whole line: the part being learned and how far the best ride gets. The workers
  // record where the bike goes only while this screen is open (see rollOne in the worker).
  const WCSS = `
#taiw{position:fixed;left:12px;bottom:12px;width:min(calc(100vw - 350px),1200px);height:46vh;min-width:420px;display:flex;flex-direction:column;z-index:2147483645;
  font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8ece6;background:rgba(14,17,14,.93);border:1px solid #3c463b;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45)}
#taiw.big{width:calc(100vw - 350px);height:calc(100vh - 24px);max-width:none}
#taiw .wh{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #2f372e;user-select:none}
#taiw .wh b{flex:1;font-size:13px}
#taiw .wh button{all:unset;cursor:pointer;color:#aab3a8;padding:1px 7px;font-size:12px;border-radius:10px;background:#262d25}
#taiw .wh button.x,#taiw .wh button.bg{background:none;font-size:14px}
#taiw canvas{flex:1;width:100%;min-height:0;display:block}
`;
  // (the worker records a point of 4 numbers every 3 steps: TR_EVERY)
  const TR_STEP = 3, TR_N = 4, SPEEDS = [1, 2, 4], TRAIL = 36, HOLD = 40;
  const KIND_COLOR = { start: '#8a948a', takeoff: '#e8a548', air: '#e8a548', landing: '#5aa6e8', pump: '#6fc777', berm: '#c49a6c', flat: '#7d887c' };
  const RIDE_COLOR = { kept: '#ffd34d', crash: '#ff5a4f', round: '#c27dff', other: 'rgba(160,208,255,.55)' };
  // half the width of the line where a piece does not say (as HALF_W in the worker)
  const VIEW_HALF_W = { start: 2, takeoff: 0.75, air: 0.75, landing: 1.7, pump: 1.2, flat: 1, berm: 2.5 };
  const watch = { on: false, el: null, cv: null, cur: null, next: null, t: 0, last: 0, raf: 0, speed: 0, top: false };
  // a round of tries from the learner (on.round): the newest waits until the one playing has been seen once
  function watchRound(r) { if (watch.on) watch.next = r; }
  function setWatch(on) {
    watch.on = on;
    if (ses.learner) ses.learner.watch = on;
    ui.update();
    if (!on) { if (watch.el) watch.el.style.display = 'none'; cancelAnimationFrame(watch.raf); watch.cur = watch.next = null; return; }
    if (!watch.el) {
      const style = document.createElement('style');
      style.textContent = WCSS;
      document.head.appendChild(style);
      const el = watch.el = document.createElement('div');
      el.id = 'taiw';
      el.innerHTML = `<div class="wh"><b></b><button class="vw"></button><button class="sp"></button><button class="bg">⤢</button><button class="x">✕</button></div><canvas></canvas>`;
      document.body.appendChild(el);
      watch.cv = el.querySelector('canvas');
      el.querySelector('.x').onclick = () => setWatch(false);
      el.querySelector('.bg').onclick = () => el.classList.toggle('big');
      el.querySelector('.sp').onclick = () => { watch.speed = (watch.speed + 1) % SPEEDS.length; };
      el.querySelector('.vw').onclick = () => { watch.top = !watch.top; };
      el.addEventListener('keydown', e => e.stopPropagation());
    }
    watch.el.style.display = '';
    watch.last = 0;
    cancelAnimationFrame(watch.raf);
    watch.raf = requestAnimationFrame(drawWatch);
  }
  const halfW = (R, i) => (R.W && R.W[i] > 0 ? R.W[i] : VIEW_HALF_W[R.KIND[i]] || 1.5);
  // a round made ready to draw: how long it plays, the part of the line it covers (from the side: metres along the
  // line and heights; from above: the map turned so that the line runs left to right)
  function prepRound(r) {
    const H = ses.H, R = ses.R;
    if (!H || !R) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, len = 0;
    for (const q of r.rides) {
      const tr = q.tr;
      len = Math.max(len, tr.length / TR_N);
      for (let i = 0; i < tr.length; i += TR_N) { const u = tr[i], y = tr[i + 1]; if (u < x0) x0 = u; if (u > x1) x1 = u; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (!(x1 > x0)) return null;
    x0 = Math.max(0, x0 - 4); x1 = Math.min(H.length - 1, x1 + 4);
    const a = Math.floor(x0), b = Math.ceil(x1);
    for (let i = a; i <= b; i++) { if (H[i] < y0) y0 = H[i]; if (H[i] > y1) y1 = H[i]; }
    // from above: turned by the way the line goes from a to b, about its middle
    const ang = Math.atan2(R.Z[b] - R.Z[a], R.X[b] - R.X[a]), co = Math.cos(ang), si = Math.sin(ang);
    const cx = (R.X[a] + R.X[b]) / 2, cz = (R.Z[a] + R.Z[b]) / 2;
    const turn = (x, z) => [(x - cx) * co + (z - cz) * si, -(x - cx) * si + (z - cz) * co];
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    const grow = (p, q) => { if (p < p0) p0 = p; if (p > p1) p1 = p; if (q < q0) q0 = q; if (q > q1) q1 = q; };
    for (let i = a; i <= b; i++) { const [p, q] = turn(R.X[i], R.Z[i]), w = halfW(R, i); grow(p, q - w); grow(p, q + w); }
    for (const q of r.rides) for (let i = 0; i < q.tr.length; i += TR_N) { const [p, s] = turn(q.tr[i + 2], q.tr[i + 3]); grow(p, s); }
    const order = r.rides.map(q => ({ ...q, kind: q.kept ? 'kept' : q.end === 'crash' ? 'crash' : q.round ? 'round' : 'other' }));
    const rank = { other: 0, round: 1, crash: 2, kept: 3 };
    order.sort((u, v) => rank[u.kind] - rank[v.kind]);
    const n = c => order.filter(q => q.kind === c).length;
    return { ...r, rides: order, len, x0, x1, a, b, y0: y0 - 1, y1: y1 + 2, turn, p0: p0 - 2, p1: p1 + 2, q0: q0 - 2, q1: q1 + 2,
      nKept: n('kept'), nCrash: n('crash'), nRound: n('round') };
  }
  const groundAt = (H, u) => { const i = clamp(Math.floor(u), 0, H.length - 2), f = clamp(u - i, 0, 1); return H[i] + (H[i + 1] - H[i]) * f; };
  // the ground of metres a..b of the line from the side: filled below, its top coloured by the kind of piece
  function drawGround(g, H, K, a, b, sx, sy, bottom) {
    g.beginPath(); g.moveTo(sx(a), bottom);
    for (let u = a; u <= b; u += 0.5) g.lineTo(sx(u), sy(groundAt(H, u)));
    g.lineTo(sx(b), bottom); g.closePath();
    g.fillStyle = '#26301f'; g.fill();
    g.lineWidth = 2.5;
    for (let i = Math.floor(a); i < Math.ceil(b); i++) {
      const u0 = Math.max(a, i), u1 = Math.min(b, i + 1);
      g.strokeStyle = KIND_COLOR[K[i]] || '#7d887c';
      g.beginPath(); g.moveTo(sx(u0), sy(groundAt(H, u0))); g.lineTo(sx(u1), sy(groundAt(H, u1))); g.stroke();
    }
  }
  // metres a..b of the line from above, as wide as its pieces, coloured by their kind (pt(i): point i on the screen,
  // k: screen pixels a metre)
  function drawTrack(g, R, a, b, pt, k, thin) {
    g.lineCap = 'round';
    for (let i = a; i < b; i++) {
      const [x, y] = pt(i), [x2, y2] = pt(i + 1);
      g.strokeStyle = KIND_COLOR[R.KIND[i]] || '#7d887c'; g.globalAlpha = thin ? 0.9 : 0.45;
      g.lineWidth = thin ? 3 : Math.max(2, 2 * halfW(R, i) * k);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    }
    g.globalAlpha = 1;
    if (thin) return;
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.setLineDash([4, 6]);
    g.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = pt(i); if (i === a) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
    g.setLineDash([]);
  }
  function drawWatch(now) {
    if (!watch.on) return;
    watch.raf = requestAnimationFrame(drawWatch);
    const cv = watch.cv, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, HT = cv.clientHeight;
    if (!W || !HT) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(HT * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(HT * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, HT);
    const L = ses.learner, H = ses.H, R = ses.R, sp = SPEEDS[watch.speed], el = watch.el;
    el.querySelector('.wh b').textContent = tx('Xem AI tập', 'Watch the AI learn');
    el.querySelector('.vw').textContent = watch.top ? tx('Nhìn từ trên ↔ ngang', 'From above ↔ side') : tx('Nhìn ngang ↔ từ trên', 'From the side ↔ above');
    el.querySelector('.sp').textContent = `▶ ${sp}×`;
    el.querySelector('.sp').title = tx('Tốc độ phát lại', 'Playback speed');
    g.fillStyle = '#c5ccc2'; g.font = '13px system-ui,sans-serif';
    if (!L || !H || !R) { g.fillText(tx('Bấm ▶ Bắt đầu để AI học, rồi xem nó tập ở đây.', 'Press ▶ Start for the AI to learn, and watch it here.'), 16, 28); return; }
    // the clock of the round playing, in recorded points; the next round once this one has been seen
    const dt = watch.last ? Math.min(0.1, (now - watch.last) / 1000) : 0;
    watch.last = now;
    watch.t += dt * 60 * sp / TR_STEP;
    if (watch.next && (!watch.cur || watch.t > watch.cur.len + HOLD)) { const p = prepRound(watch.next); watch.next = null; if (p) { watch.cur = p; watch.t = 0; } }
    else if (watch.cur && watch.t > watch.cur.len + HOLD * 2) watch.t = 0;
    const c = watch.cur, best = L.best, K = R.KIND, N = H.length;
    const ovH = Math.max(46, HT * 0.17), mainH = HT - ovH - 8, pad = 14;
    // the whole line below (from the side, or from above): the part being learned, how far the best ride gets
    {
      const top = mainH + 14, bot = HT - 6, bestAt = best ? (best.end === 'finish' ? N - 1 : best.prog) : -1;
      if (watch.top) {
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (let i = 0; i < N; i++) { a0 = Math.min(a0, R.X[i]); a1 = Math.max(a1, R.X[i]); b0 = Math.min(b0, R.Z[i]); b1 = Math.max(b1, R.Z[i]); }
        const k = Math.min((W - 2 * pad) / Math.max(1, a1 - a0), (bot - top) / Math.max(1, b1 - b0));
        const ox = (W - (a1 - a0) * k) / 2, oy = top + ((bot - top) - (b1 - b0) * k) / 2;
        const pt = i => [ox + (R.X[i] - a0) * k, oy + (R.Z[i] - b0) * k];
        drawTrack(g, R, 0, N - 1, pt, k, true);
        if (c) { g.strokeStyle = '#ffd34d'; g.lineWidth = 6; g.globalAlpha = 0.6; g.beginPath(); for (let i = c.a; i <= c.b; i++) { const [x, y] = pt(i); if (i === c.a) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); g.globalAlpha = 1; }
        if (bestAt >= 0) { const [x, y] = pt(Math.round(bestAt)); g.fillStyle = best.end === 'finish' ? '#7fe08a' : '#ff8a7a'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
      } else {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (H[i] < lo) lo = H[i]; if (H[i] > hi) hi = H[i]; }
        const sx = u => pad + u / (N - 1) * (W - 2 * pad), sy = y => bot - (y - lo) / Math.max(1, hi - lo) * (bot - top);
        drawGround(g, H, K, 0, N - 1, sx, sy, bot);
        if (c) { g.fillStyle = 'rgba(255,211,77,.18)'; g.fillRect(sx(c.x0), top - 8, Math.max(2, sx(c.x1) - sx(c.x0)), bot - top + 8); }
        if (bestAt >= 0) { g.strokeStyle = best.end === 'finish' ? '#7fe08a' : '#ff8a7a'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx(bestAt), top - 10); g.lineTo(sx(bestAt), bot); g.stroke(); }
      }
    }
    if (!c) { g.fillStyle = '#c5ccc2'; g.fillText(L.running ? tx('Đang đợi đợt thử đầu tiên…', 'Waiting for the first round of tries…') : tx('AI đang không học. Bấm ▶ Bắt đầu.', 'The AI is not learning. Press ▶ Start.'), 16, 28); return; }
    // the part of the line this round tried, and where each bike went: from the side (heights drawn up to 4 times
    // their length scale) or from above (true to scale)
    let at;
    if (watch.top) {
      const k = Math.min((W - 2 * pad) / (c.p1 - c.p0), (mainH - 70) / (c.q1 - c.q0));
      const ox = (W - (c.p1 - c.p0) * k) / 2, oy = 52 + ((mainH - 70) - (c.q1 - c.q0) * k) / 2;
      const scr = (x, z) => { const [p, q] = c.turn(x, z); return [ox + (p - c.p0) * k, oy + (q - c.q0) * k]; };
      drawTrack(g, R, c.a, c.b, i => scr(R.X[i], R.Z[i]), k, false);
      at = (tr, j) => scr(tr[j * TR_N + 2], tr[j * TR_N + 3]);
    } else {
      const kx = (W - 2 * pad) / (c.x1 - c.x0), ky = Math.min((mainH - 60) / (c.y1 - c.y0), kx * 4);
      const mid = (c.y0 + c.y1) / 2, yc = mainH - 12 - (mainH - 60) / 2 - 8;
      const sx = u => pad + (u - c.x0) * kx, sy = y => yc - (y - mid) * ky;
      drawGround(g, H, K, c.x0, c.x1, sx, sy, mainH);
      at = (tr, j) => [sx(tr[j * TR_N]), sy(tr[j * TR_N + 1])];
    }
    const f = Math.floor(watch.t);
    for (const q of c.rides) {
      const tr = q.tr, n = tr.length / TR_N;
      if (!n) continue;
      const i = Math.min(f, n - 1), from = Math.max(0, i - TRAIL), col = RIDE_COLOR[q.kind];
      g.strokeStyle = col; g.globalAlpha = q.kind === 'other' ? 0.35 : 0.8; g.lineWidth = q.kind === 'kept' ? 2 : 1;
      g.beginPath();
      for (let j = from; j <= i; j++) { const [x, y] = at(tr, j); if (j === from) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      g.globalAlpha = 1;
      const [x, y] = at(tr, i);
      if (f >= n - 1 && q.kind === 'crash') { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); continue; }
      g.fillStyle = col; g.beginPath(); g.arc(x, y, q.kind === 'kept' ? 4 : 2.5, 0, Math.PI * 2); g.fill();
    }
    // what is going on, and what the colours are
    g.fillStyle = '#e8ece6'; g.font = '600 13px system-ui,sans-serif';
    g.fillText(tx(`Lượt học ${c.gen + 1} · đoạn ${c.k + 1}/${c.K}${c.backs ? ` · đã lùi lại ${c.backs} lần` : ''}`, `Sweep ${c.gen + 1} · section ${c.k + 1}/${c.K}${c.backs ? ` · backed up ${c.backs} times` : ''}`), 16, 22);
    g.font = '12px system-ui,sans-serif'; g.fillStyle = '#c5ccc2';
    g.fillText(tx(`${c.rides.length} xe thử cùng lúc · ${c.nKept} giữ lại · ${c.nCrash} ngã · ${c.nRound} né cú nhảy · ${pts(c.tries)} lần thử trong lượt này`,
      `${c.rides.length} bikes at once · ${c.nKept} kept · ${c.nCrash} fell · ${c.nRound} went round a jump · ${pts(c.tries)} tries this sweep`), 16, 40);
    if (best) {
      const s = tx(`Tốt nhất: ${pts(rideShow(best))} điểm trình diễn · ${best.end === 'finish' ? 'về đích' : `tới ${best.prog} m`} · ${rideTricks(best)} trick · nhiều nhất ${rideMost(best)} trick một cú`,
        `Best: ${pts(rideShow(best))} show points · ${best.end === 'finish' ? 'to the end' : `to ${best.prog} m`} · ${rideTricks(best)} tricks · at most ${rideMost(best)} in one jump`);
      g.fillStyle = '#f0c96a'; g.textAlign = 'right'; g.fillText(s, W - 16, 22); g.textAlign = 'left';
    }
    let lx = 16;
    for (const [k, vi, en] of [['kept', 'giữ lại cho đoạn sau', 'kept for the next section'], ['crash', 'ngã', 'fell'], ['round', 'né cú nhảy', 'went round a jump'], ['other', 'các xe khác', 'the others']]) {
      g.fillStyle = RIDE_COLOR[k]; g.beginPath(); g.arc(lx + 4, mainH - 4, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#aab3a8'; const t = tx(vi, en); g.fillText(t, lx + 12, mainH); lx += 24 + g.measureText(t).width;
    }
  }
