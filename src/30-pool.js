  // ---------------------------------------------------------------- the learning workers
  // WORKER_SRC: sim/rider.js and sim/worker.js, put here as text by tools/build.js
  const WORKER_SRC = /*@WORKER_SRC@*/'';
  // which simulation scored a stored ride: one scored by other code is not trusted (it is ridden again)
  const SIM_ID = (() => { let h = 2166136261; for (let i = 0; i < WORKER_SRC.length; i++) h = Math.imul(h ^ WORKER_SRC.charCodeAt(i), 16777619) >>> 0; return h.toString(36); })();
  // The game's physics and terrain files, as the game loaded them (the browser has them cached)
  async function gameFiles() {
    const a = assets();
    if (!a.wasm || a.land.some(u => !u)) throw new Error(tx('Không thấy file vật lý của game. Hãy tải lại trang game.', "The game's physics files were not found. Reload the game's page."));
    const wasm = await (await fetch(a.wasm)).arrayBuffer();
    const land = await Promise.all(a.land.map(u => fetch(u).then(r => r.arrayBuffer())));
    return { wasm, land };
  }
  // Workers each with the game's physics on one line. Every call is a message with an id; the answer has the same id.
  // A worker that dies, or a pool closed, fails the calls still waiting instead of leaving them hanging.
  class Pool {
    constructor(n, make) {
      const url = make ? null : URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      this.ws = Array.from({ length: n }, () => (make ? make() : new Worker(url)));
      this.seq = 0; this.waiting = new Map(); this.closed = false;
      this.ws.forEach(w => w.addEventListener('error', e => { if (e.preventDefault) e.preventDefault(); this.failAll(new Error('worker: ' + (e.message || 'error'))); }));
    }
    failAll(err) { for (const [, rej] of this.waiting) rej(err); this.waiting.clear(); }
    call(w, msg, transfer) {
      if (this.closed) return Promise.reject(new Error('pool closed'));
      return new Promise((resolve, reject) => {
        const id = ++this.seq;
        const h = e => {
          if (e.data.id !== id) return;
          w.removeEventListener('message', h);
          this.waiting.delete(id);
          if (e.data.type === 'error') reject(new Error(e.data.error)); else resolve(e.data);
        };
        this.waiting.set(id, err => { w.removeEventListener('message', h); reject(err); });
        w.addEventListener('message', h);
        w.postMessage({ ...msg, id }, transfer || []);
      });
    }
    // every worker gets the line (files: the game's, see gameFiles)
    async init(route, setup, files) {
      const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'init', wasm: files.wasm.slice(0), land: files.land.map(b => b.slice(0)), route, setup })));
      return r[0];
    }
    // Finds the pages of memory a ride changes in every worker, gives every worker all of them, and checks that a
    // saved state put back rides on exactly as before, in the same worker and in another one. Gives back whether saved
    // states can be used (the search needs them).
    async calib(plans) {
      const r = await Promise.all(this.ws.map(w => this.call(w, { type: 'calib', plans })));
      const all = new Set();
      for (const x of r) for (const p of x.list) all.add(p);
      const list = [...all];
      const q = await Promise.all(this.ws.map(w => this.call(w, { type: 'pages', list, plans })));
      const same = r.every(x => x.hash === r[0].hash && x.size === r[0].size);
      let cross = true;
      if (same && this.ws.length > 1) {
        const a = await this.call(this.ws[0], { type: 'snapat', P: plans[0] });
        if (a.node) {
          const f = a.full, b = (await this.call(this.ws[this.ws.length - 1], { type: 'snaptest', node: a.node, P: plans[0] })).r;
          cross = b.prog === f.prog && b.ticks === f.ticks && b.game === f.game && b.end === f.end;
        }
      }
      return (this.snapOk = same && cross && q.every(x => x.test && x.test.ok));
    }
    roll(wi, msg) { return this.call(this.ws[wi], { type: 'roll', ...msg }).then(r => r.out); }
    take(wi, keys) { return this.call(this.ws[wi], { type: 'take', keys }).then(r => r.nodes); }
    clearKids() { return Promise.all(this.ws.map(w => this.call(w, { type: 'clear' }))); }
    // whole rides from the start, spread over the workers (jit: every one ridden so, see makeRider)
    async evalAll(plans, jit) {
      const n = this.ws.length, parts = Array.from({ length: n }, () => []);
      plans.forEach((p, i) => parts[i % n].push(i));
      const res = new Array(plans.length);
      await Promise.all(parts.map(async (ix, wi) => {
        if (!ix.length) return;
        const r = await this.call(this.ws[wi], { type: 'eval', plans: ix.map(i => plans[i]), jit });
        r.out.forEach((o, k) => { res[ix[k]] = o; });
      }));
      return res;
    }
    trace(plan) { return this.call(this.ws[0], { type: 'trace', plan }); }
    close() { this.closed = true; this.ws.forEach(w => w.terminate()); this.failAll(new Error('pool closed')); }
  }
