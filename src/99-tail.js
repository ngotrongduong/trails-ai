  // ---------------------------------------------------------------- open
  // The panel opens once the browser's memory is read and the page is there; the old memories join the library then.
  async function open() {
    await keep.ready;
    if (!document.body) await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true }));
    buildPanel();
    const n = migrateOld();
    if (n) ui.log(tx(`Đã chuyển ${n} đường đã học từ bản AI cũ vào thư viện.`, `Moved ${n} lines learned by the old AI into the library.`));
    ui.say(tx('Đưa xe tới đầu đường muốn học rồi bấm ▶ Bắt đầu.', 'Take the bike to the start of the line to learn and press ▶ Start.'));
    keep.onError = () => ui.log(tx('<b>Không ghi được vào bộ nhớ trình duyệt.</b>', '<b>Could not write to the browser storage.</b>'));
    if (window.__taiNewer) { ses.update = true; update(); }
    resume();
  }
  window.TrailsAI = { open: buildPanel, newer() { ses.update = true; update(); }, ses, lib };
  open();
})();
