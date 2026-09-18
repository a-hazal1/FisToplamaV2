let cvInstance = null;
let cvLoadingPromise = null;

async function getReadyCv(timeoutMs = 30000) {
  if (
    cvInstance &&
    typeof cvInstance.Mat === 'function'
  ) {
    return cvInstance;
  }

  if (cvLoadingPromise) {
    return cvLoadingPromise;
  }

  cvLoadingPromise = new Promise(
    async (resolve, reject) => {
      try {
        let script = document.querySelector(
          'script[data-fistoplama-opencv]'
        );

        if (!script) {
          script =
            document.createElement('script');

          // ARTIK CDN DEĞİL.
          // GitHub Pages'teki kendi opencv.js dosyamız.
          script.src = 'opencv.js';

          script.async = true;

          script.setAttribute(
            'data-fistoplama-opencv',
            '1'
          );

          document.head.appendChild(
            script
          );
        }

        const startedAt =
          Date.now();

        while (
          Date.now() - startedAt <
          timeoutMs
        ) {
          if (window.cv) {
            let candidate =
              window.cv;

            if (
              candidate &&
              typeof candidate.then ===
                'function'
            ) {
              candidate =
                await candidate;

              window.cv =
                candidate;
            }

            if (
              candidate &&
              typeof candidate.Mat ===
                'function'
            ) {
              cvInstance =
                candidate;

              resolve(candidate);
              return;
            }
          }

          await new Promise(
            (r) =>
              setTimeout(
                r,
                150
              )
          );
        }

        reject(
          new Error(
            'OPENCV_LOAD_TIMEOUT'
          )
        );
      } catch (e) {
        reject(e);
      }
    }
  );

  try {
    return await cvLoadingPromise;
  } catch (e) {
    cvLoadingPromise = null;
    throw e;
  }
}
