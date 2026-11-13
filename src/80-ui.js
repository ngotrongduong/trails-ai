  // ---------------------------------------------------------------- the panel
  // One button (Start / Stop), the line and how far the AI has got with it, the tricks of every jump of its best ride,
  // the last real ride, a short log; the settings and the library folded away below.
  const CSS = `
#tai{position:fixed;top:12px;right:12px;width:310px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;z-index:2147483646;
  font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8ece6;background:rgba(22,26,22,.93);border:1px solid #3c463b;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45)}
#tai *{box-sizing:border-box}
#tai .h{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:move;border-bottom:1px solid #2f372e;user-select:none}
#tai .h b{flex:1;font-size:14px;letter-spacing:.2px}
#tai .h .dot{width:9px;height:9px;border-radius:50%;background:#59625a}
#tai .h .dot.on{background:#6fdc6f;box-shadow:0 0 8px #6fdc6f}
#tai .h button{all:unset;cursor:pointer;color:#aab3a8;padding:0 4px;font-size:16px}
#tai .b{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:9px}
#tai.min .b{display:none}
#tai .line{display:flex;align-items:baseline;gap:6px}
#tai .line .name{font-weight:600;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tai .line .len{color:#97a196;font-size:12px}
#tai .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#tai .st{background:#262d25;border-radius:7px;padding:6px 8px}
#tai .st small{display:block;color:#97a196;font-size:11px}
#tai .st span{font-size:16px;font-weight:600}
#tai .go{all:unset;cursor:pointer;text-align:center;padding:10px;border-radius:8px;font-weight:700;font-size:15px;background:#3f9c46;color:#fff}
#tai .go.stop{background:#a8473f}
#tai .go[disabled]{opacity:.55;cursor:wait}
#tai .say{color:#d6dcd3;min-height:18px}
#tai h4{margin:2px 0 0;font-size:11px;font-weight:600;color:#97a196;text-transform:uppercase;letter-spacing:.5px}
#tai .jumps,#tai .log,#tai .libl{display:flex;flex-direction:column;gap:3px}
#tai .jumps div{display:flex;gap:6px;font-size:12px}
#tai .jumps .n{color:#97a196;width:28px}
#tai .jumps .t{flex:1}
#tai .jumps .p{color:#f0c96a;font-variant-numeric:tabular-nums}
#tai [hidden]{display:none}
#tai .g1{color:#7fe08a}#tai .g2{color:#a6e39a}#tai .g3{color:#e5d37a}#tai .g4,#tai .g5{color:#f08a7a}
#tai .log{max-height:150px;overflow:auto;font-size:12px;color:#c5ccc2}
#tai .log a{color:#8fc7ff}
#tai details summary{cursor:pointer;color:#aab3a8}
#tai .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0}
#tai .sw{all:unset;cursor:pointer;padding:3px 10px;border-radius:12px;background:#3a4339;font-size:12px}
#tai .sw.on{background:#3f9c46}
#tai .roamst{display:block;color:#97a196;font-size:11px}
#tai .libl div{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;border-top:1px solid #2f372e}
#tai .libl .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tai .libl .nm.cur{font-weight:700;color:#9fe39a}
#tai .libl button{all:unset;cursor:pointer;color:#aab3a8;padding:0 3px}
#tai .upd{all:unset;cursor:pointer;text-align:center;padding:7px;border-radius:8px;background:#2f6fb3;color:#fff;font-weight:600}
`;
  const GRADE_VI = ['', 'Buttery', 'Clean', 'Sketchy', 'Flat', 'Cased'];
  let panel = null;
  const $ = s => panel.querySelector(s);
  function buildPanel() {
    if (panel) { panel.style.display = ''; return; }
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    panel = document.createElement('div');
    panel.id = 'tai';
    panel.innerHTML = `
<div class="h"><span class="dot"></span><b>AI Trails</b><button class="eye" title="">👁</button><button class="mn" title="">–</button></div>
<div class="b">
  <div class="line"><span class="name"></span><span class="len"></span><button class="sw ren" title="">✎</button></div>
  <div class="stats">
    <div class="st"><small class="l-sim"></small><span class="v-sim">–</span></div>
    <div class="st"><small class="l-real"></small><span class="v-real">–</span></div>
    <div class="st"><small class="l-gen"></small><span class="v-gen">–</span></div>
    <div class="st"><small class="l-rate"></small><span class="v-rate">–</span></div>
  </div>
  <button class="go"></button>
  <div class="say"></div>
  <button class="upd" hidden></button>
  <h4 class="l-ways"></h4><div class="jumps ways"></div>
  <h4 class="l-jumps"></h4><div class="jumps"></div>
  <h4 class="l-last"></h4><div class="last"></div>
  <h4 class="l-log"></h4><div class="log"></div>
  <details><summary class="l-more"></summary>
    <div class="row"><span class="l-drive"></span><button class="sw drive"></button></div>
    <div class="row"><span class="l-share"></span><button class="sw shr"></button></div>
    <div class="row"><span class="l-roam"></span><button class="sw roam"></button></div>
    <small class="roamst"></small>
    <div class="row"><span class="l-lang"></span><button class="sw lang"></button></div>
    <h4 class="l-lib"></h4><div class="libl"></div>
  </details>
</div>`;
    document.body.appendChild(panel);
    $('.go').onclick = () => { if (ses.want) stop(); else start(); };
    $('.mn').onclick = () => panel.classList.toggle('min');
    $('.eye').onclick = () => setWatch(!watch.on);
    $('.drive').onclick = () => setAiDrive(!ses.aiDrive);
    $('.shr').onclick = () => { setShare(!share.on); update(); };
    $('.roam').onclick = () => setRoam({ off: 'explore', explore: 'mine', mine: 'off' }[roam.mode]);
    $('.lang').onclick = () => { lang = lang === 'vi' ? 'en' : 'vi'; try { keep.setItem(LANG, lang); } catch { /* storage blocked */ } update(); };
    $('.ren').onclick = () => { if (!ses.mem) return; const n = prompt(tx('Tên mới cho đường này:', 'A new name for this line:'), ses.mem.name); if (n && n.trim()) { ses.mem.name = n.trim().slice(0, 40); saveMem(); update(); } };
    $('.upd').onclick = applyUpdate;
    $('.libl').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.dataset.id, row = lib.list().find(o => o.id === id); if (!row) return;
      if (b.dataset.do === 'ren') { const n = prompt(tx('Tên mới cho đường này:', 'A new name for this line:'), row.name); if (n && n.trim()) { if (ses.mem && ses.mem.id === id) { ses.mem.name = n.trim().slice(0, 40); saveMem(); } else lib.rename(id, n.trim()); } }
      if (b.dataset.do === 'del' && confirm(tx(`Quên hẳn “${row.name}”? AI sẽ mất mọi thứ đã học trên đường này.`, `Forget “${row.name}” for good? The AI loses all it learned on this line.`))) { if (ses.mem && ses.mem.id === id) { stop(); closeLine(); } lib.forget(id); }
      update();
    };
    // the header drags the panel about
    const h = $('.h');
    h.onpointerdown = e => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { panel.style.left = clamp(ev.clientX - dx, 0, innerWidth - 60) + 'px'; panel.style.top = clamp(ev.clientY - dy, 0, innerHeight - 30) + 'px'; panel.style.right = 'auto'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    // keys typed into the panel are not the game's
    panel.addEventListener('keydown', e => e.stopPropagation());
    update();
  }
  const pts = n => (num(n) ? Math.round(n).toLocaleString('vi-VN') : '–');
  function update() {
    if (!panel) return;
    const L = ses.learner, m = ses.mem, b = L && L.best;
    const set = (s, t) => { const e = $(s); if (e.textContent !== t) e.textContent = t; };
    set('.l-sim', tx('Điểm tốt nhất (mô phỏng)', 'Best points (simulation)'));
    set('.l-real', tx('Lái thật tốt nhất', 'Best real ride'));
    set('.l-gen', tx('Lượt học', 'Sweeps'));
    set('.l-rate', tx('Thử mỗi giây', 'Tries a second'));
    set('.l-jumps', tx('Trick từng cú nhảy (lượt tốt nhất)', 'Tricks of each jump (best ride)'));
    set('.l-last', tx('Lượt lái thật gần nhất', 'Last real ride'));
    set('.l-log', tx('Nhật ký', 'Log'));
    set('.l-more', tx('Cài đặt & thư viện đường', 'Settings & library'));
    set('.l-drive', tx('AI lái xe thật', 'AI rides for real'));
    set('.l-share', tx('Chia sẻ lượt kỷ lục, mời mọi người', 'Share record rides, invite everyone'));
    set('.l-lang', tx('Ngôn ngữ', 'Language'));
    set('.l-lib', tx('Thư viện đường', 'Library of lines'));
    $('.mn').title = tx('Thu gọn', 'Fold'); $('.ren').title = tx('Đổi tên', 'Rename'); $('.eye').title = tx('Xem AI tập', 'Watch the AI learn');
    $('.eye').style.color = watch.on ? '#ffd34d' : '';
    set('.name', m ? m.name : tx('Chưa chọn đường', 'No line yet'));
    set('.len', m ? `${m.line.length} m` : '');
    set('.v-sim', b ? `${pts(b.game)} · ${tx('trình diễn', 'show')} ${pts(rideShow(b))}${b.end === 'finish' ? '' : ` · ${b.prog} m`}${rideTricks(b) ? ` · ${rideTricks(b)} trick` : ''}${b.man >= 1 ? ` · Manual ${b.man.toFixed(1)} s` : ''}` : '–');
    set('.v-real', m && m.realBest ? pts(m.realBest) : m && m.realFar ? `${pts(m.realFar.game)} · ${m.realFar.m} m` : '–');
    set('.v-gen', L ? String(L.gen) : '–');
    // tries a second over the last half minute
    const now = Date.now(), rs = ses.rs = (ses.rs || []).filter(q => now - q[0] <= 30e3).concat([[now, ses.tries]]);
    const span = (now - rs[0][0]) / 1000, dn = ses.tries - rs[0][1];
    set('.v-rate', L && L.running && span >= 4 && dn >= 0 ? String(Math.round(dn / span)) : '–');
    const go = $('.go');
    go.textContent = ses.busy ? tx('Đang chuẩn bị…', 'Getting ready…') : ses.want ? tx('■ Dừng', '■ Stop') : tx('▶ Bắt đầu', '▶ Start');
    go.classList.toggle('stop', ses.want); go.disabled = ses.busy;
    $('.dot').classList.toggle('on', !!(L && L.running));
    const up = $('.upd'); up.hidden = !ses.update; up.textContent = tx('⟳ Có bản mới — Cập nhật ngay', '⟳ A newer AI — update now');
    for (const [s, on] of [['.drive', ses.aiDrive], ['.shr', share.on]]) { const e = $(s); e.classList.toggle('on', on); e.textContent = on ? tx('Bật', 'On') : tx('Tắt', 'Off'); }
    set('.lang', lang === 'vi' ? 'Tiếng Việt' : 'English');
    // where the AI rides (see roaming)
    set('.l-roam', tx('AI đi đâu', 'Where the AI rides'));
    const rb = $('.roam'), rc = roamCount();
    rb.classList.toggle('on', roam.mode !== 'off');
    set('.roam', { off: tx('Ở đường này', 'This line'), explore: tx('Khám phá ô mới (OG)', 'New squares (OG)'), mine: tx('Đường của bạn (Builder)', 'Your lines (Builder)') }[roam.mode]);
    set('.roamst', roam.mode === 'explore' ? tx(`AI đã thấy chạy đủ ở ${rc.squares} ô, ${rc.lands}/9 vùng. Mỗi ô ${ROAM_S} giây rồi đi tiếp.`, `The AI has seen enough riding in ${rc.squares} squares, ${rc.lands} of 9 countries. ${ROAM_S} s in each, then on.`)
      : roam.mode === 'mine' ? tx(`Lái lần lượt các đường trong spot của bạn (${myStarts().length} đường), mỗi đường ${ROAM_MINE / 60e3} phút; lời mời trong chat đưa người khác tới chạy.`, `Rides your spot's lines in turn (${myStarts().length}), ${ROAM_MINE / 60e3} min each; the chat invites bring others to ride them.`) : '');
    // the jumps of the best ride
    const J = b ? b.jl : [];
    const jh = J.map((e, i) => `<div><span class="n">#${i + 1}</span><span class="t">${esc(trickText(e.got) || tx('không trick', 'no trick'))} <span class="g${e.g}">${GRADE_VI[e.g]}</span></span><span class="p">${pts(e.p)}</span></div>`).join('')
      || `<div>${tx('Chưa có cú nhảy nào.', 'No jumps yet.')}</div>`;
    if ($('.jumps:not(.ways)').innerHTML !== jh) $('.jumps:not(.ways)').innerHTML = jh;
    // the ways the line forks into (see the drive): what each got, the one being learned
    const W = m && m.ways && m.ways.length > 1 ? m.ways : null;
    $('.l-ways').hidden = $('.ways').hidden = !W;
    set('.l-ways', tx('Các ngã rẽ của đường', 'The ways this line forks'));
    const wh = W ? W.map((w, i) => {
      const cur = i === m.way, what = w.design ? esc(w.design) : w.at ? tx(`rẽ ở mét ${w.at}`, `parts at ${w.at} m`) : tx('đường đầu tiên', 'first way');
      const st = cur && m.trying ? tx('đang thử', 'trying') : cur ? tx('đang học', 'learning') : w.tried ? `${w.m} m · ${tx('trình diễn', 'show')} ${pts(w.show)}` : tx('chưa thử', 'not tried');
      return `<div><span class="n">${cur ? '★' : ''}#${i + 1}</span><span class="t">${what} (${w.length} m)${w.chosen ? ' ✓' : ''}</span><span class="p">${st}</span></div>`;
    }).join('') : '';
    if ($('.ways').innerHTML !== wh) $('.ways').innerHTML = wh;
    const d = ses.ride, last = ses.last;
    const lh = d ? tx(`Đang lái: ${d.lands.length} cú nhảy, ${pts(d.game)} điểm`, `Riding: ${d.lands.length} jumps, ${pts(d.game)} points`)
      : last ? tx(`${END_WORDS[last.end][0]} sau ${last.m} m, ${pts(last.game)} điểm`, `${END_WORDS[last.end][1]} after ${last.m} m, ${pts(last.game)} points`) : tx('Chưa lái lượt nào.', 'No ride yet.');
    set('.last', lh);
    // the library
    const rows = lib.list().sort((a, b) => b.savedAt - a.savedAt);
    const bh = rows.map(o => `<div><span class="nm${m && m.id === o.id ? ' cur' : ''}" title="${esc(o.id)}">${esc(o.name)}</span><span>${pts(o.game)}</span><button data-do="ren" data-id="${esc(o.id)}" title="${tx('Đổi tên', 'Rename')}">✎</button><button data-do="del" data-id="${esc(o.id)}" title="${tx('Quên đường này', 'Forget this line')}">✕</button></div>`).join('')
      || `<div>${tx('Chưa có đường nào. Đưa xe tới đầu một đường rồi bấm Bắt đầu.', 'No lines yet. Take the bike to the start of a line and press Start.')}</div>`;
    if ($('.libl').innerHTML !== bh) $('.libl').innerHTML = bh;
  }
  const logRows = [];
  Object.assign(ui, {
    say(t) { if (panel) $('.say').textContent = t; },
    log(html) {
      const t = new Date().toTimeString().slice(0, 5);
      logRows.unshift(`<div><span style="color:#7c867a">${t}</span> ${html}</div>`);
      logRows.length = Math.min(logRows.length, 40);
      if (panel) $('.log').innerHTML = logRows.join('');
    },
    update,
  });
  setInterval(update, 2000);
