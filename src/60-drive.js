  // ---------------------------------------------------------------- the session: one line at a time
  // Start: the AI finds the line at the bike (one of its library, a start of the game's, or the trail under the bike),
  // loads its memory or starts one, learns it in the workers without end, and rides it in the game with the best plan
  // it has, over and over: from the start of the line each time (the AI puts the bike there itself). A key the player
  // presses takes the bike back; the AI goes on learning. Brought to a stop somewhere else (or back at the start), the
  // bike is the AI's again: on the line there, which it loads (or starts) from its library.
  const ui = { say() {}, log() {}, update() {} };
  const AIDRIVE = 'trailsai.drive', RESUME = 'trailsai.resume';
  const ses = {
    want: false, mem: null, R: null, H: null, secs: null, learner: null, files: null, busy: false, error: null,
    aiDrive: (() => { try { return keep.getItem(AIDRIVE) !== '0'; } catch { return true; } })(),
    paused: false, pausedAt: null, still: 0, ride: null, last: null, rides: 0, t0: 0, tries: 0, rate: 0, update: false,
  };
  // learning workers: all the computer's threads but 2 for the game (a worker takes about 220 MB)
  const workerCount = () => Math.max(2, (navigator.hardwareConcurrency || 4) - 2);
  // the best ride in the simulation, as the memory keeps it (its landings without what only the search needs)
  const keepBest = b => b && { end: b.end, prog: b.prog, game: b.game, train: b.train, xp: b.xp, vAvg: b.vAvg, crashSec: b.crashSec, ticks: b.ticks, offM: b.offM || 0,
    jl: b.jl.map(e => ({ k: e.k, a: e.a, g: e.g, p: e.p, st: e.st || 0, got: e.got })) };
  function saveMem() {
    const L = ses.learner, m = ses.mem;
    if (!L || !m || !L.best) return;
    m.plan = L.plan; m.best = keepBest(L.best); m.gen = L.gen; m.hist = L.hist.slice(-400); m.fragile = [...L.fragile];
    m.setup = L.setup; m.sim = SIM_ID;
    if (!lib.put(m)) ui.log(tx('<b>Không lưu được bộ nhớ</b> (bộ nhớ trình duyệt đầy?).', '<b>Could not save the memory</b> (browser storage full?).'));
    if (L.bookDirty) { saveBook(L.setup.tricks, L.book); L.bookDirty = false; }
  }
  // Opens the line at the bike (or memory id from the library): its memory, its learner, and learning set going.
  async function openLine(id) {
    ses.busy = true; ui.update();
    try {
      let mem = id ? lib.get(id) : null, found = null;
      if (!mem) {
        const me = bikeNow();
        if (!me) throw new Error(tx('Chưa thấy xe trong game (hãy ngồi lên xe).', 'No bike in the game yet (get on your bike).'));
        ui.say(tx('Đang tìm đường ở chỗ xe đứng…', 'Finding the line where the bike is…'));
        found = await lineAt(me, lib.list());
        if (!found) throw new Error(tx('Không thấy đường nào ở chỗ xe đứng. Đưa xe tới đầu một đường rồi bấm Bắt đầu.', 'No line where the bike is. Take it to the start of a line and press Start.'));
        mem = found.route ? (lib.get(found.id) || newMemory(found.route)) : lib.get(found.id);
      }
      if (ses.mem && ses.mem.id === mem.id && ses.learner) return;
      closeLine();
      // a line of the library the game now has otherwise (pieces moved or gone): traced again, learned again
      if (lineStale(mem.line)) {
        const r = await buildRoute(mem.line.start, mem.line.back);
        if (r) { const fresh = newMemory(r); fresh.name = mem.name; fresh.rides = mem.rides; mem = fresh; ui.log(tx('Đường này đã bị sửa trong game: AI dò lại và học lại từ đầu.', 'This line has been changed in the game: the AI traces it again and learns it afresh.')); }
      }
      if (!mem.line.W) mem.line.W = await widthsOf(mem.line);
      ses.mem = mem;
      const L = ses.learner = new Learner({
        // (the learner counts its tries from 0 again every sweep)
        progress: p => { const was = ses.lastTries || 0; ses.tries += p.tries >= was ? p.tries - was : p.tries; ses.lastTries = p.tries; ui.update(); },
        better: b => {
          const n = rideTricks(b), c = rideCombo(b), sec = (b.ticks / 60).toFixed(1);
          ui.log(tx(`Tìm được cách đi tốt hơn: <b>${b.game} điểm</b>${b.end === 'finish' ? `, về đích trong ${sec} s` : `, tới ${b.prog} m`}, ${n} trick, combo dài nhất ×${c}.`,
            `Found a better way: <b>${b.game} points</b>${b.end === 'finish' ? `, to the end in ${sec} s` : `, to ${b.prog} m`}, ${n} tricks, longest combo ×${c}.`));
        },
        saved: () => { ses.lastTries = 0; saveMem(); ui.update(); },
        round: r => watchRound(r),
      });
      L.watch = watch.on;
      const setup = riderSetup();
      L.book = loadBook(setup.tricks);
      ses.files = ses.files || await gameFiles();
      ui.say(tx('Đang nạp đường vào bộ mô phỏng…', 'Loading the line into the simulation…'));
      const got = await L.prepare(mem.line, setup, ses.files, workerCount(), mem.plan ? mem : null);
      const g = L.geo;
      ses.R = { X: g.X, Z: g.Z, KIND: g.KIND, W: g.W, PZ: g.PZ, length: g.X.length }; ses.H = g.H; ses.secs = L.secs;
      if (!mem.plan) lib.put(Object.assign(mem, { plan: L.plan, best: keepBest(L.best), setup, sim: SIM_ID }));
      ui.log(got.fromMemory ? tx(`Mở <b>${esc(mem.name)}</b> từ thư viện: ${L.best.game} điểm trong mô phỏng${L.best.end === 'finish' ? ', về đích' : ''}. Học tiếp.`, `Opened <b>${esc(mem.name)}</b> from the library: ${L.best.game} points in the simulation${L.best.end === 'finish' ? ', to the end' : ''}. Learning on.`)
        : tx(`Đường mới <b>${esc(mem.name)}</b> (${mem.line.length} m, ${L.secs.filter(s => s.jump).length} cú nhảy). Bắt đầu học.`, `New line <b>${esc(mem.name)}</b> (${mem.line.length} m, ${L.secs.filter(s => s.jump).length} jumps). Learning starts.`));
      if (!L.pool.snapOk) throw new Error(tx('Trạng thái vật lý không lưu lại được trên máy này, AI không học được.', 'The physics state cannot be saved on this computer, so the AI cannot learn.'));
      ses.t0 = Date.now(); ses.tries = 0; ses.lastTries = 0; ses.rs = [];
      if (ses.want) L.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
    } finally { ses.busy = false; ui.update(); }
  }
  function closeLine() {
    stopRide(null);
    if (ses.learner) { saveMem(); ses.learner.close(); }
    ses.learner = null; ses.mem = null; ses.R = null;
  }
  async function start() {
    if (ses.want) return;
    if (!live.ex || !live.g) { ui.say(tx('AI chưa gắn được vào game. Hãy tải lại trang game.', "The AI is not hooked into the game. Reload the game's page.")); return; }
    ses.want = true; ses.paused = false; ui.update();
    try { await openLine(ses.mem ? ses.mem.id : null); } catch (err) { ses.want = false; ui.say(err.message || String(err)); ui.update(); return; }
    const L = ses.learner;
    if (!L.running) L.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
    ui.say(ses.aiDrive ? tx('AI đang học và lái. Bấm phím lái bất kỳ để lấy lại xe.', 'The AI is learning and riding. Press any ride key to take the bike back.') : tx('AI đang học ở nền (không lái xe thật).', 'The AI is learning in the background (not riding for real).'));
    nextRide(500);
  }
  const letGo = () => { stopRide(null); clearTimeout(rideTimer); if (live.drive && live.drive.hold) live.drive = null; };
  function stop() {
    ses.want = false; ses.paused = false;
    letGo();
    if (ses.learner) { ses.learner.stop(); saveMem(); }
    ui.say(tx('Đã dừng. Bộ nhớ của đường đã được lưu.', 'Stopped. The line\'s memory is saved.')); ui.update();
  }
  function setAiDrive(on) {
    ses.aiDrive = on;
    try { keep.setItem(AIDRIVE, on ? '1' : '0'); } catch { /* storage blocked */ }
    if (!on) letGo(); else if (ses.want) { ses.paused = false; nextRide(500); }
    ui.update();
  }

  // ---- riding the line in the game
  let rideTimer = 0;
  function nextRide(ms) { clearTimeout(rideTimer); rideTimer = setTimeout(rideOnce, ms); }
  // still lying where the last ride fell: the game's own "Ride again" (R) resets its bail screen too
  async function getUp() { if (!(liveState()[13] > 0)) return; key('KeyR', 'r'); await sleep(500); }
  async function rideOnce() {
    if (!ses.want || !ses.aiDrive || ses.paused || ses.busy || share.busy || ses.ride || !ses.learner || !ses.R) return;
    if (ses.update && ses.rides > 0) { applyUpdate(); return; }
    await getUp();
    const st = ses.mem.line.start, L = ses.learner;
    live.ex.trails_set_spawn_at(live.g, st.x, st.z, st.heading, 0);
    live.ex.trails_game_reset(live.g);
    if (inviteDue()) try { inviteNow(ui.log); } catch (err) { console.error(err); }
    const R = ses.R, N = R.length, plan = clonePlan(L.plan), rider = makeRider(R, ses.H, ses.secs, plan);
    const d = ses.ride = { plan, rider, known: L.plan, t: 0, seq: null, streak: 0, game: 0, train: 0, xp: 0, lands: [], pending: null, far: -1, farT: 0, calm: 0, coast: null, bigLand: -1, swaps: 0, expect: L.best };
    // a newer plan fits the bike where it is only if it rides the part already passed the same way: the game then
    // gets the states the simulation scored, so its score holds for the rest of this ride too
    const swap = () => {
      const p = L.plan;
      if (p === d.known) return;
      d.known = p;
      const upto = Math.min(ses.secs.length - 1, Math.max(rider.sec, rider.airSec) + 1), same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
      for (const k of ['as', 'pk']) if (!same(p[k], plan[k])) return;
      for (const k of ['v', 'pt', 'pl', 'pu', 'tk', 'vs', 'lg', 'sa', 'ph', 'pc']) for (let i = 0; i <= upto; i++) if (!same(p[k] && p[k][i], plan[k] && plan[k][i])) return;
      for (const k of Object.keys(plan)) delete plan[k];
      Object.assign(plan, clonePlan(p));
      d.swaps++; d.expect = L.best;
    };
    d.step = () => {
      try {
        const s = liveState(), t = d.t;
        if (d.seq === null) d.seq = s[16];
        if (s[13] > 0) { setTimeout(() => endRide('crash'), 0); return null; }
        if (s[16] !== d.seq) {
          d.seq = s[16];
          if ((s[15] | 0) > 0) { const lp = landPoints(s, d.streak); d.streak = lp.streak; d.pending = { t, e: { k: rider.airSec, i: rider.idx, a: +s[14].toFixed(2), g: lp.g, p: lp.p, train: lp.train, xp: lp.xp, got: lp.got } }; }
        }
        if (d.pending && t - d.pending.t >= 30) { const e = d.pending.e; d.lands.push(e); d.game += e.p; d.train += e.train; d.xp += e.xp; d.pending = null; ui.update(); }
        if (t % 30 === 0) swap();
        d.calm = s[12] > 0 ? 0 : d.calm + 1;
        let inp;
        if (!d.coast && rider.idx >= N - 3) { const k = Math.max(0, N - 6); d.coast = { h: Math.atan2(R.Z[N - 1] - R.Z[k], R.X[N - 1] - R.X[k]), t0: t, halt: false }; }
        if (d.coast) {
          // past the end: as the simulation, come down, brake to a stop where it is level, and hold it there
          const c = d.coast, v = s[8], air = s[12] > 0;
          if (!c.halt && (d.calm >= 30 || (!air && v < -0.3))) c.halt = true;
          if ((c.halt && !air && Math.abs(v) < 0.5 && Math.abs(s[4]) < 0.15) || (!air && t - c.t0 > 420)) { if (!d.pending) setTimeout(() => endRide('finish'), 0); return [0, 127, 0, 0, 0, 0, 0]; }
          const stv = air ? 0 : clamp(2 * wrapA(c.h - s[3]), -1, 1), own = rider.step(s, d.t++), ln = air ? own[3] : 0, p = s[4];
          const brake = air || v <= 0 ? 0 : Math.abs(p) >= 0.15 ? (p > 0 ? 70 : 40) : v > 1.5 ? 70 : 127;
          inp = c.halt ? [0, brake, Math.round(stv * 127), ln, 0, 0, 0] : [v < 6 ? 127 : 0, v > 9 ? 40 : 0, Math.round(stv * 127), ln, 0, 0, 0];
        } else {
          inp = rider.step(s, d.t++).slice();
          if (rider.landed && s[14] > 2) d.bigLand = rider.idx;
          if (rider.off > (d.bigLand >= 0 && rider.idx - d.bigLand < 40 ? 18 : 12) && !(s[12] > 0)) { setTimeout(() => endRide('off'), 0); return null; }
          if (rider.idx > d.far || s[12] > 0) { d.far = Math.max(d.far, rider.idx); d.farT = t; } else if (t - d.farT > 180) { setTimeout(() => endRide('stuck'), 0); return null; }
        }
        return inp;
      } catch (err) { console.error(err); setTimeout(() => endRide('error'), 0); return null; }
    };
    live.drive = d;
    ui.update();
    // after a bail the game stops stepping the bike, so the fall is watched for from outside too
    d.watch = setInterval(() => { if (live.drive !== d) { clearInterval(d.watch); return; } if (liveState()[13] > 0) endRide('crash'); }, 250);
  }
  const END_WORDS = { crash: ['ngã', 'fell'], off: ['lạc khỏi đường', 'went off the line'], stuck: ['bị kẹt', 'got stuck'], finish: ['về đích', 'rode to the end'], error: ['lỗi', 'error'], player: ['bạn cầm lái', 'you took over'] };
  // the ride ends (why: END_WORDS; null: ended by the AI itself, nothing to say)
  function stopRide(why) {
    const d = ses.ride;
    if (!d) return null;
    clearInterval(d.watch);
    if (live.drive === d) live.drive = null;
    ses.ride = null;
    return d;
  }
  async function endRide(why) {
    const d = stopRide(why);
    if (!d) return;
    const L = ses.learner, m = Math.max(0, d.rider.idx - (L ? L.N - ses.mem.line.length : 0));
    if (why === 'finish') live.drive = { hold: true, step: () => [0, 127, 0, 0, 0, 0, 0] };
    ses.rides++;
    const rec = { at: Date.now(), end: why, m, game: d.game, train: d.train, xp: d.xp, lands: d.lands.map(e => [e.k, e.g, e.p, trickText(e.got)]), swaps: d.swaps };
    ses.last = rec;
    const record = why === 'finish' && !!ses.mem && d.game > (ses.mem.realBest || 0);
    if (ses.mem) { ses.mem.rides = (ses.mem.rides || []).concat([rec]).slice(-10); if (why === 'finish') ses.mem.realBest = Math.max(ses.mem.realBest || 0, d.game);
      // (and the furthest real ride that did not get there, while none has)
      else if (why !== 'player') { const f = ses.mem.realFar; if (!f || m > f.m || (m === f.m && d.game > f.game)) ses.mem.realFar = { m, game: d.game }; } }
    ui.log(tx(`<b>Lái thật:</b> ${END_WORDS[why][0]} sau ${m} m, <b>${d.game} điểm</b> (Train ${d.train}, kỹ năng ${d.xp}).`, `<b>Real ride:</b> ${END_WORDS[why][1]} after ${m} m, <b>${d.game} points</b> (Train ${d.train}, skill ${d.xp}).`));
    // What the real ride shows: where it fell (or came down flat or cased) and the simulation of the same plan did not,
    // the simulation was too hopeful there: that section is fragile from now on (learned with room to spare).
    if (L && why !== 'player' && d.expect) {
      const sim = d.expect, newly = [];
      const mark = k => { if (k >= 0 && !L.fragile.has(k)) { L.markFragile(k); newly.push(k + 1); } };
      if ((why === 'crash' || why === 'off' || why === 'stuck') && (sim.end === 'finish' || sim.prog > d.rider.idx + 10)) mark(why === 'crash' && d.rider.airSec >= 0 && d.rider.airT > 0 ? d.rider.airSec : d.rider.sec);
      for (const e of d.lands) { const s = (sim.jl || []).find(q => q.k === e.k); if (e.g >= 4 && s && s.g <= 3) mark(e.k); }
      if (newly.length) ui.log(tx(`Mô phỏng lạc quan quá ở đoạn ${newly.join(', ')}: AI sẽ học cách đi chắc hơn ở đó.`, `The simulation was too hopeful at section ${newly.join(', ')}: the AI will learn a safer way there.`));
      if (lineStale(ses.mem.line)) ui.log(tx('<b>Đường trong game đã khác bộ nhớ</b> (có người sửa). Lần mở sau AI sẽ dò lại.', '<b>The line in the game differs from the memory</b> (someone changed it). The AI traces it again next time it opens it.'));
    }
    saveMem(); ui.update();
    if (record && shareDue()) { await shareGood(ses.mem.line.start, m, d.game, ui.log); ui.update(); }
    if (ses.want && ses.aiDrive && !ses.paused) nextRide(why === 'finish' ? 1500 : 2500);
  }

  // ---- the player takes the bike back, and gives it back
  playerKeys.onKey = () => {
    if (!ses.want || ses.paused) return;
    if (live.drive && live.drive.hold) live.drive = null;
    const had = !!ses.ride;
    stopRide('player');
    clearTimeout(rideTimer);
    ses.paused = true; ses.still = 0; const me = bikeNow(); ses.pausedAt = me ? { x: me.x, z: me.z } : null;
    if (had || ses.aiDrive) ui.say(tx('Bạn đang cầm lái, AI vẫn học tiếp. Đưa xe tới đầu đường (đường này hay đường khác) rồi đứng yên 3 giây: AI sẽ lái tiếp.', 'You have the bike; the AI goes on learning. Take it to the start of a line (this one or another) and stand still 3 seconds: the AI rides on.'));
    ui.update();
  };
  // Twice a second, while the AI is on but does not hold the bike (the player has it, or it only learns): a bike stood
  // still 2.5 s, no key pressed for 2 s, at the start of this line takes the AI back to riding; somewhere else (25 m or
  // more from where the player took it and from this line's start), it is on another line, which the AI opens.
  const STILL = 2.5, MOVED = 25;
  setInterval(async () => {
    if (!ses.want || ses.busy || ses.ride || !(ses.paused || !ses.aiDrive) || !ses.mem) return;
    const me = bikeNow();
    if (!me || me.air || me.down || me.v > 0.3) { ses.still = 0; return; }
    ses.still += 0.5;
    if (ses.still < STILL || Date.now() - playerKeys.last < 2000) return;
    ses.still = 0;
    const st = ses.mem.line.start, dStart = Math.hypot(me.x - st.x, me.z - st.z), dPaused = ses.pausedAt ? Math.hypot(me.x - ses.pausedAt.x, me.z - ses.pausedAt.z) : Infinity;
    if (dStart < START_NEAR && Math.abs(wrapA(me.heading - st.heading)) < 1.2) {
      if (ses.paused && ses.aiDrive) { ses.paused = false; ui.say(tx('Xe ở đầu đường: AI lái tiếp.', 'The bike is at the start: the AI rides on.')); nextRide(300); }
      return;
    }
    if (dStart < MOVED || dPaused < MOVED) return;
    try {
      saveMem();
      await openLine(null);
      if (!ses.learner.running) ses.learner.run().catch(err => { console.error(err); ui.log(tx('Lỗi khi học: ', 'Error while learning: ') + esc(err.message || err)); });
      ses.paused = false; ses.pausedAt = null;
      if (ses.aiDrive) nextRide(500);
    } catch (err) { ui.say(err.message || String(err)); }
  }, 500);

  // ---- updates: a newer AI from GitHub (the extension keeps its copy in trailsai.code and tells TrailsAI.newer).
  // While the AI runs, it takes the update itself between two rides: the memory saved, the page loaded again, and the
  // AI starting again on the same line (RESUME). Every 20 minutes it also asks GitHub itself.
  const RAW = 'https://raw.githubusercontent.com/ngotrongduong/trails-ai/main/dist/trails-ai.js';
  function applyUpdate() {
    saveMem();
    try { keep.setItem(RESUME, JSON.stringify({ id: ses.mem && ses.want ? ses.mem.id : null, at: Date.now() })); } catch { /* storage blocked */ }
    location.reload();
  }
  async function checkUpdate() {
    if (!window.__taiDirect) return;
    try {
      const code = await (await fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' })).text();
      const kept = localStorage.getItem('trailsai.code');
      if (code && kept && code !== kept && code.includes('TrailsAI')) { localStorage.setItem('trailsai.code', code); ses.update = true; ui.update(); }
    } catch { /* offline */ }
  }
  setInterval(checkUpdate, 20 * 60e3);
  // after an update: the line the AI was riding, opened again once the game has its bike
  async function resume() {
    const r = readJSON(RESUME, null);
    keep.removeItem(RESUME);
    if (!r || !r.id || Date.now() - r.at > 5 * 60e3 || !lib.get(r.id)) return;
    for (let i = 0; i < 120 && !(live.ex && live.g && bikeNow()); i++) await sleep(1000);
    ses.mem = lib.get(r.id);
    start();
  }
