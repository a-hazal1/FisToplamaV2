(function () {
  async function getCv(timeoutMs = 30000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      let cv = window.cv;

      if (cv) {
        if (typeof cv.then === 'function') {
          cv = await cv;
          window.cv = cv;
        }

        if (cv && typeof cv.Mat === 'function') {
          return cv;
        }
      }

      await new Promise(
        (resolve) => setTimeout(resolve, 150)
      );
    }

    throw new Error('OPENCV_LOAD_TIMEOUT');
  }
