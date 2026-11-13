// Trails AI: a rider that teaches itself one line of trailsthegame.com at a time, to ride it to the end with as
// many points as the game gives. Runs inside the game page; tools/build.js joins src/*.js into dist/trails-ai.js.
//
// How it works (docs/design.md has the whole of it)
// - The player puts the bike at the start of a line and presses Start. The AI traces the line from the pieces the
//   game has loaded around the bike, cuts it into sections (one per jump, the rest every 40 m) and learns a plan
//   for it: per section the speed to carry, where to pull and pump, the angle to hold in the air and, off every
//   jump, a trick program (which tricks, how many times each, and when).
// - It learns by trial and error in Web Workers, each running the game's own physics (the same WebAssembly the game
//   runs), section by section from saved states of the physics, and keeps whatever the game would give the most
//   points for: first all the way to the end, then the game's own points.
// - Meanwhile it rides the player's bike in the real game with the best plan it has, over and over, and takes
//   what a real ride shows: where the game went otherwise than the simulation, it learns a plan with room to spare.
// - Every line it has learned is kept in this browser (its library). Taken somewhere else and stood still, the bike
//   is on another line: the AI saves the one it was on, loads the memory of the new one (or starts it fresh) and
//   learns on there.
// - A new best ride to the end without a fall, every 30 minutes at most, is shared as the game's replay (cut into a
//   video in the game's editor, for the game's Creator score, titled "come to join my ride") with an invite to
//   everyone in the chat; the AI's older videos are deleted (the newest 3 kept). Every 10 minutes it also presses one
//   of the chat's invites: to the line, or to watch it ride.
// - Nothing is sent to the game's server except what a player sends: the share, the chat invites, deleting a video.
(function TAI() {
  'use strict';
  // the browser extension runs the AI before the game starts (__taiDirect), so it needs no frame
  if (window.top === window && !window.__taiDirect) { boot(TAI); return; }
  if (window.TrailsAI) { window.TrailsAI.open(); return; }

  // From the bookmark, in the tab itself: quiet the game already open, then open it again in a frame with the AI
  // loaded first (the AI must be in place before the game builds its physics engine).
  function boot(fn) {
    const old = document.getElementById('tai-frame');
    if (old) { try { old.contentWindow.TrailsAI.open(); } catch { /* still loading */ } return; }
    // the game pauses its sound when the tab is hidden, stops when nothing draws, and stays offline without sockets
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } catch { /* keep going */ }
    window.requestAnimationFrame = () => 0;
    WebSocket.prototype.send = function () { try { this.close(); } catch { /* already closed */ } };
    window.WebSocket = function () { return { readyState: 3, send() {}, close() {}, addEventListener() {}, removeEventListener() {} }; };
    for (const el of [...document.body.children]) el.style.display = 'none';
    document.body.style.overflow = 'hidden';
    const f = document.createElement('iframe');
    f.id = 'tai-frame';
    f.src = location.origin + '/';
    f.allow = 'fullscreen; gamepad; autoplay; clipboard-write';
    f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#181a18';
    document.body.appendChild(f);
    const src = '(' + fn.toString() + ')()';
    const tick = () => {
      try {
        const w = f.contentWindow;
        if (w && w.location.href !== 'about:blank' && !w.__tai) { w.__tai = 1; w.eval(src); f.focus(); return; }
      } catch { /* frame between pages */ }
      setTimeout(tick, 0);
    };
    tick();
  }

  // ---------------------------------------------------------------- what the AI keeps in this browser
  // In IndexedDB (a line's memory is 100-400 kB, and localStorage holds 5 MB for the whole game page): read into
  // memory once at the start (keep.ready, before the panel opens), written through from then on, and passed to the
  // AI in other tabs (keep.listen). The language and the extension's copy of the AI stay in localStorage. Without
  // IndexedDB (blocked), localStorage.
  const keep = (() => {
    const LS = window.localStorage, DB = 'trailsai', OS = 'kv', LOCAL = new Set(['trailsai.code', 'trailsai.lang']);
    const mem = new Map(), listeners = [];
    let db = null;
    const ours = k => !!k && k.startsWith('trailsai.') && !LOCAL.has(k);
    const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('trailsai.keep') : null;
    if (chan) {
      chan.onmessage = e => {
        const { key, value } = e.data || {};
        if (!ours(key)) return;
        if (value === null) mem.delete(key); else mem.set(key, value);
        for (const f of listeners) { try { f(key, value); } catch (err) { console.error(err); } }
      };
    }
    const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
    const ready = (async () => {
      try {
        db = await new Promise((res, rej) => {
          const q = indexedDB.open(DB, 1);
          q.onupgradeneeded = () => q.result.createObjectStore(OS);
          q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
        });
        const t = db.transaction(OS, 'readonly');
        const ks = t.objectStore(OS).getAllKeys(), vs = t.objectStore(OS).getAll();
        await done(t);
        ks.result.forEach((k, i) => mem.set(k, vs.result[i]));
      } catch (err) {
        console.error('AI Trails: IndexedDB', err);
        db = null;
        try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (ours(k)) mem.set(k, LS.getItem(k)); } } catch { /* storage blocked */ }
      }
    })();
    const failed = err => { console.error('AI Trails: IndexedDB', err); if (api.onError) { try { api.onError(err); } catch { /* the panel is gone */ } } };
    const write = (k, v) => {
      if (db) {
        try {
          const t = db.transaction(OS, 'readwrite');
          if (v === null) t.objectStore(OS).delete(k); else t.objectStore(OS).put(v, k);
          t.onerror = t.onabort = () => failed(t.error);
          if (t.commit) t.commit();
        } catch (err) { failed(err); }
      } else if (v === null) LS.removeItem(k); else LS.setItem(k, v);
      if (chan) chan.postMessage({ key: k, value: v });
    };
    const api = {
      ready, onError: null,
      getItem: k => (LOCAL.has(k) ? LS.getItem(k) : mem.has(k) ? mem.get(k) : null),
      setItem(k, v) { v = String(v); if (LOCAL.has(k)) { LS.setItem(k, v); return; } write(k, v); mem.set(k, v); },
      removeItem(k) { if (LOCAL.has(k)) { LS.removeItem(k); return; } mem.delete(k); write(k, null); },
      keys: () => [...mem.keys()],
      listen: f => { listeners.push(f); },
    };
    return api;
  })();
  const readJSON = (k, d) => { try { const v = JSON.parse(keep.getItem(k) || 'null'); return v === null ? d : v; } catch { return d; } };
  const writeJSON = (k, v) => { try { keep.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  // ---------------------------------------------------------------- the language the AI speaks
  // Vietnamese, or English once the player presses EN on the panel (kept in this browser). tx(vi, en) is the one for now.
  const LANG = 'trailsai.lang';
  let lang = (() => { try { return keep.getItem(LANG) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } })();
  const tx = (vi, en) => (lang === 'en' ? en : vi);
  const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const kmh = v => (v * 3.6).toFixed(0);
