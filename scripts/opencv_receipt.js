(function () {
  'use strict';

  let worker = null;
  let seq = 0;
  const pending = new Map();

  function newWorker() {
    if (worker) {
      try { worker.terminate(); } catch (_) {}
    }

    worker = new Worker(new URL('opencv_worker.js', document.baseURI));
    console.info('[SCAN] worker created', worker);
    worker.onmessageerror = function (event) { console.error('[SCAN] worker message error', event); };

    worker.onmessage = function (event) {
      const msg = event.data || {};
      const job = pending.get(msg.id);
      if (!job) return;

      if (msg.type === 'stage') {
        job.lastStage = msg.stage || 'unknown';
        console.info('[SCAN #' + msg.id + '] ' + job.lastStage + ' +' + msg.elapsedMs + 'ms');
        return;
      }

      clearTimeout(job.timer);
      pending.delete(msg.id);

      if (msg.ok) {
        const bytes = new Uint8Array(msg.buffer);
        job.ok(bytes, Number(msg.confidence || 0));
      } else {
        job.err(msg.error || 'WEB_SCAN_FAILED');
      }
    };

    worker.onerror = function (event) {
      const message = event && event.message ? event.message : 'WEB_WORKER_ERROR';

      for (const [, job] of pending) {
        clearTimeout(job.timer);
        try { job.err(message); } catch (_) {}
      }
      pending.clear();

      try { worker.terminate(); } catch (_) {}
      worker = null;
    };

    return worker;
  }

  function getWorker() {
    return worker || newWorker();
  }

  window.receiptScanner = {
    scan: function (raw, ok, err) {
      try {
        const id = ++seq;
        let input;
        if (raw instanceof Uint8Array) {
          input = raw;
        } else if (raw instanceof ArrayBuffer) {
          input = new Uint8Array(raw);
        } else if (raw && typeof raw.length === 'number') {
          input = Uint8Array.from(raw);
        } else {
          throw new Error('INVALID_SCAN_INPUT');
        }
        if (!input.byteLength) throw new Error('EMPTY_SCAN_INPUT');
        // Worker'a transferable olarak verirken Flutter tarafındaki nesnenin
        // detached olmasını önlemek için tek kontrollü kopya oluştur.
        const transferable = input.slice();
        const buffer = transferable.buffer;

        const timer = setTimeout(function () {
          const job = pending.get(id);
          if (!job) return;

          pending.delete(id);
          console.error('[SCAN #' + id + '] TIMEOUT; last stage:', job.lastStage);
          try { job.err('SCAN_TIMEOUT @ ' + job.lastStage); } catch (_) {}

          // Takılmış WASM/worker'ı öldür; sonraki taramada temiz worker açılır.
          try { if (worker) worker.terminate(); } catch (_) {}
          worker = null;
        }, 25000);

        pending.set(id, { ok: ok, err: err, timer: timer, lastStage: 'posted-to-worker' });
        console.info('[SCAN #' + id + '] start; input=' + input.byteLength + ' bytes');

        getWorker().postMessage(
          { id: id, buffer: buffer },
          [buffer]
        );
      } catch (e) {
        try { err(e && e.message ? e.message : String(e)); } catch (_) {}
      }
    }
  };
})();
