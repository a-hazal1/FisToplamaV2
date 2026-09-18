(function () {
  let worker = null;
  let nextId = 1;

  const pending = new Map();

  function createWorker() {
    if (worker) {
      return worker;
    }

    worker = new Worker('opencv_worker.js');

    worker.onmessage = function (event) {
      const message = event.data;

      if (!message || !message.id) {
        return;
      }

      const request = pending.get(message.id);

      if (!request) {
        return;
      }

      pending.delete(message.id);

      if (message.ok) {
        const bytes = Array.from(
          new Uint8Array(message.buffer)
        );

        request.onSuccess(
          bytes,
          message.confidence || 0
        );
      } else {
        request.onError(
          message.error || 'SCAN_FAILED'
        );
      }
    };

    worker.onerror = function (event) {
      const errorMessage =
        event && event.message
          ? event.message
          : 'WORKER_ERROR';

      for (const request of pending.values()) {
        request.onError(errorMessage);
      }

      pending.clear();

      if (worker) {
        worker.terminate();
      }

      worker = null;
    };

    return worker;
  }

  function scan(
    rawBytes,
    onSuccess,
    onError
  ) {
    try {
      const activeWorker =
        createWorker();

      const bytes =
        Uint8Array.from(rawBytes);

      const id =
        'scan_' +
        Date.now() +
        '_' +
        nextId++;

      pending.set(
        id,
        {
          onSuccess,
          onError
        }
      );

      const buffer =
        bytes.buffer;

      activeWorker.postMessage(
        {
          id: id,
          buffer: buffer
        },
        [buffer]
      );
    } catch (error) {
      onError(
        error &&
        error.message
          ? error.message
          : String(error)
      );
    }
  }

  window.receiptScanner = {
    scan: scan
  // Sayfa açılır açılmaz Worker'ı arka planda hazırla.
  // OpenCV ana thread'i kilitlemez.
  try {
    createWorker();
  } catch (e) {
    console.error('Scanner worker ön yükleme hatası:', e);
  }
  };
})();
