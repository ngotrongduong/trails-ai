// Runs in the game page before any of the game's own scripts, so the AI is in place when the game builds its
// physics engine (no reloading the game in a frame, as the bookmark has to). The AI's code comes from GitHub:
// the copy kept from last time runs at once, and a newer one, if any, is kept for the next page load.
(() => {
  'use strict';
  const KEY = 'trailsai.code';
  const RAW = 'https://raw.githubusercontent.com/ngotrongduong/trails-ai/main/dist/trails-ai.js';
  window.__taiDirect = true;
  let kept = null;
  try { kept = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (kept) { try { (0, eval)(kept); } catch (err) { console.error('AI Trails', err); } }
  fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => (r.ok ? r.text() : null))
    .then(code => {
      if (!code || code === kept) return;
      try { localStorage.setItem(KEY, code); } catch { return; }
      // the very first time there was nothing to run yet: load the page again with the AI in place
      if (!kept) { location.reload(); return; }
      window.__taiNewer = true;
      if (window.TrailsAI && window.TrailsAI.newer) window.TrailsAI.newer();
    })
    .catch(() => { /* offline: keep the copy we have */ });
})();
