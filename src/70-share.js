  // ---------------------------------------------------------------- sharing a good ride
  // Every ride the AI takes to the end without a fall is shared for everyone, and everyone invited to come and ride it,
  // at most once every 5 minutes (when it was last done is kept, so a reload does not share again sooner). The AI does
  // it as a player does: the game's "Share your last run" (L) opens the run in the replay; there it is cut into a video
  // in the game's editor (Edit, Auto edit, camera cuts, made into a video: the game's Creator score counts each), given
  // a title, kept "On your profile" and made into a link; the replay is closed (P). Then it invites everyone in the
  // game's chat to the start of the line, the link in the message, as the game's own chat invite sends it.
  const SHARE = 'trailsai.share', SHARE_AT = 'trailsai.share.at', SHARE_EVERY = 5 * 60e3, SHARE_CUTS = 6;
  const share = { on: (() => { try { return keep.getItem(SHARE) !== '0'; } catch { return true; } })(), busy: false };
  const shareAt = () => +(keep.getItem(SHARE_AT) || 0) || 0;
  const shareDue = () => share.on && !share.busy && Date.now() - shareAt() >= SHARE_EVERY;
  function setShare(on) { share.on = on; try { keep.setItem(SHARE, on ? '1' : '0'); } catch { /* storage blocked */ } }
  // (the AI's own key presses are not trusted, so the player's-key watch does not take them for the player's)
  const key = (code, k, shiftKey) => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: k, code, shiftKey: !!shiftKey, bubbles: true })); };
  const until = async (f, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) { const v = f(); if (v) return v; } return null; };
  const sharePanel = () => { const c = [...document.querySelectorAll('.rp-caps')].find(e => e.textContent === 'Share this run'); return c && c.parentElement; };
  const replayBtn = (sel, text) => [...document.querySelectorAll(sel + ' button')].find(b => b.textContent.trim() === text);
  const segs = () => document.querySelectorAll('.rp-shots-track .rp-seg').length;
  const pickOpt = (group, text) => {
    const g = [...document.querySelectorAll('.rp-group')].find(e => { const n = e.querySelector('.rp-group-name'); return n && n.textContent.startsWith(group); });
    const b = g && [...g.querySelectorAll('.rp-opt')].find(e => e.textContent.trim() === text && !e.disabled);
    if (b && !b.classList.contains('on')) b.click();
  };
  // The edit made into a video by the editor's "Video": the game counts it once the video is made, so it is not saved
  // (no file comes down). 720p at 30 a second, the quickest the game makes.
  async function filmRun() {
    const video = replayBtn('.rp-tools', 'Video');
    if (!video) return false;
    video.click();
    if (!(await until(() => replayBtn('.rp-panel', 'Make video'), 3000))) return false;
    pickOpt('Size', '720p');
    pickOpt('Frames a second', '30');
    await sleep(400);
    const make = replayBtn('.rp-panel', 'Make video');
    if (!make) return false;
    make.click();
    const end = await until(() => replayBtn('.rp-making', 'Back to the edit') || replayBtn('.rp-making', 'Back'), 5 * 60e3);
    if (!end) { const c = replayBtn('.rp-making', 'Cancel'); if (c) c.click(); await sleep(1000); return false; }
    const made = end.textContent.trim() === 'Back to the edit';
    if (made) end.click();
    return made;
  }
  // The run cut in the editor: its "Edit", then "Auto edit", then cuts spread evenly over the video (the editor's keys:
  // Shift + ← → a second back or on, K "Cut here"), then made into a video. The share panel is opened again from the
  // editor's "Share". Back: {cuts made, filmed}.
  async function editRun() {
    const edit = await until(() => replayBtn('.rp-actions', 'Edit'), 4000);
    if (!edit) return { cuts: 0, film: false };
    edit.click();
    const auto = await until(() => replayBtn('.rp-tools', 'Auto edit'), 3000);
    if (!auto) return { cuts: 0, film: false };
    auto.click();
    await sleep(300);
    const tm = [...document.querySelectorAll('.rp-time')].map(e => e.textContent.match(/of\s+(\d+):(\d+)/)).find(Boolean);
    const secs = tm ? +tm[1] * 60 + +tm[2] : 0, step = Math.floor(secs / SHARE_CUTS);
    if (step >= 1) {
      for (let i = 0; i < secs + 2; i++) key('ArrowLeft', 'ArrowLeft', true);
      for (let i = 1; i < SHARE_CUTS && segs() - 1 < SHARE_CUTS; i++) {
        for (let j = 0; j < step; j++) key('ArrowRight', 'ArrowRight', true);
        key('KeyK', 'k');
        await sleep(150);
      }
    }
    const cuts = Math.max(0, segs() - 1);
    let film = false;
    try { film = await filmRun(); } catch (err) { console.error(err); }
    const sh = await until(() => replayBtn('.rp-tools', 'Share'), 3000);
    if (sh) sh.click();
    return { cuts, film };
  }
  // the run just ridden, cut into a video and made into a link: {link, cuts, film} back, or an error
  async function shareRun(title) {
    try {
      key('KeyL', 'l');
      if (!(await until(sharePanel, 8000))) throw new Error(tx('game không mở bảng chia sẻ (cần đang ở trong game và có mạng)', 'the game did not open its share panel (it needs to be riding, online)'));
      let ed = { cuts: 0, film: false };
      try { ed = await editRun(); } catch (err) { console.error(err); }
      if (!(await until(sharePanel, 4000))) throw new Error(tx('game không mở lại bảng chia sẻ sau khi cắt video', 'the game did not open its share panel again after the edit'));
      const field = sharePanel().querySelector('input.rp-field');
      if (field) { field.value = title; field.dispatchEvent(new Event('input', { bubbles: true })); }
      const sw = sharePanel().querySelector('.rp-switch');
      if (sw && !sw.classList.contains('on')) sw.click();
      if (!sharePanel().querySelector('.rp-url')) {
        const make = await until(() => [...sharePanel().querySelectorAll('button')].find(b => b.textContent === 'Make the link'), 3000);
        if (!make) throw new Error(tx('không thấy nút “Make the link”', 'no “Make the link” button'));
        make.click();
      }
      const got = await until(() => { const p = sharePanel(); return p && (p.querySelector('.rp-url') || p.querySelector('.rp-error')); }, 180e3);
      if (!got) throw new Error(tx('3 phút chưa có link', 'no link after 3 minutes'));
      if (got.classList.contains('rp-error')) throw new Error(got.textContent);
      return { link: 'https://' + got.textContent.trim(), ...ed };
    } finally {
      // (closing the panel closes the replay too; P, the game's Replay key, toggles it, so only when it stays open)
      const p = sharePanel(), x = p && p.querySelector('.rp-panel-close'), shut = () => !document.body.classList.contains('replaying');
      if (x) x.click();
      if (!(await until(shut, 1500))) { key('KeyP', 'p'); await until(shut, 3000); }
    }
  }
  // A ride to the end of line (start st) without a fall, m metres, pts points: shared, and everyone invited. say(html)
  // tells the panel how it went.
  async function shareGood(st, m, pts, say) {
    share.busy = true;
    try { keep.setItem(SHARE_AT, String(Date.now())); } catch { /* storage blocked */ }
    try {
      const { link, cuts, film } = await shareRun(`AI Trails · ${m} m · ${pts} pts`.slice(0, 60));
      const ws = cap.ws;
      let invited = false;
      if (ws && ws.readyState === 1 && st && num(st.x) && num(st.z)) {
        // (the game's chat takes 200 characters at most)
        ws.send(JSON.stringify({ t: 'chat', text: `My AI just rode this line to the end, no falls, ${pts} pts. Watch: ${link} · come ride it!`.slice(0, 200), invite: { x: st.x, z: st.z, heading: st.heading || 0 } }));
        invited = true;
      }
      say(tx(`<b>Đã chia sẻ lượt chạy</b> (${m} m, ${pts} điểm): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>.${cuts ? ` Video cắt ${cuts} lần camera.` : ''}${film ? ' Đã làm thành video 720p.' : ''}${invited ? ' Đã mời mọi người trong chat.' : ' Chưa gửi được lời mời (game chưa kết nối máy chủ).'}`,
        `<b>Shared the ride</b> (${m} m, ${pts} points): <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>.${cuts ? ` ${cuts} camera cuts.` : ''}${film ? ' Made into a 720p video.' : ''}${invited ? ' Invited everyone in chat.' : ' Could not invite in chat (not connected).'}`));
    } catch (err) {
      say(tx(`<b>Chưa chia sẻ được:</b> ${esc(err && err.message || err)}. Thử lại ở lượt đẹp sau 5 phút nữa.`, `<b>Could not share:</b> ${esc(err && err.message || err)}. Trying again on a good ride in 5 minutes.`));
    } finally { share.busy = false; }
  }
