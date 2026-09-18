(function () {
  function opencvReady() {
    return window.cv && window.cv.Mat;
  }

  async function ensureOpenCv(timeoutMs = 25000) {
    if (opencvReady()) {
      return window.cv;
    }

    let script = document.querySelector(
      'script[data-fistoplama-opencv]'
    );

    if (!script) {
      script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.dataset.fistoplamaOpencv = '1';
      document.head.appendChild(script);
    }

    const started = Date.now();

    while (!opencvReady()) {
      if (Date.now() - started > timeoutMs) {
        throw new Error('OPENCV_LOAD_TIMEOUT');
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    return window.cv;
  }

  function distance(a, b) {
    return Math.hypot(
      a[0] - b[0],
      a[1] - b[1]
    );
  }

  function orderPoints(points) {
    const sums = points.map(
      (p) => p[0] + p[1]
    );

    const diffs = points.map(
      (p) => p[0] - p[1]
    );

    const tl = points[
      sums.indexOf(Math.min(...sums))
    ];

    const br = points[
      sums.indexOf(Math.max(...sums))
    ];

    const tr = points[
      diffs.indexOf(Math.max(...diffs))
    ];

    const bl = points[
      diffs.indexOf(Math.min(...diffs))
    ];

    return [tl, tr, br, bl];
  }

  async function canvasToBytes(canvas) {
    const blob = await new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) {
              resolve(b);
            } else {
              reject(
                new Error('OUTPUT_BLOB_FAILED')
              );
            }
          },
          'image/jpeg',
          0.94
        );
      }
    );

    const buffer = await blob.arrayBuffer();

    return Array.from(
      new Uint8Array(buffer)
    );
  }

  async function processReceipt(rawBytes) {
    const cv = await ensureOpenCv();

    const inputBytes =
      Uint8Array.from(rawBytes);

    const blob =
      new Blob([inputBytes]);

    const bitmap =
      await createImageBitmap(blob);

    const maxSide = 1800;

    const scale = Math.min(
      1,
      maxSide /
        Math.max(
          bitmap.width,
          bitmap.height
        )
    );

    const width = Math.max(
      1,
      Math.round(
        bitmap.width * scale
      )
    );

    const height = Math.max(
      1,
      Math.round(
        bitmap.height * scale
      )
    );

    const canvas =
      document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext(
      '2d',
      {
        willReadFrequently: true,
      }
    );

    ctx.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );

    bitmap.close();

    const src =
      cv.imread(canvas);

    const gray =
      new cv.Mat();

    const blur =
      new cv.Mat();

    const edges =
      new cv.Mat();

    const contours =
      new cv.MatVector();

    const hierarchy =
      new cv.Mat();

    let best = null;
    let bestArea = 0;

    try {
      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      );

      cv.GaussianBlur(
        gray,
        blur,
        new cv.Size(5, 5),
        0,
        0,
        cv.BORDER_DEFAULT
      );

      cv.Canny(
        blur,
        edges,
        40,
        140
      );

      const kernel =
        cv.Mat.ones(
          3,
          3,
          cv.CV_8U
        );

      cv.dilate(
        edges,
        edges,
        kernel,
        new cv.Point(-1, -1),
        1
      );

      kernel.delete();

      cv.findContours(
        edges,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE
      );

      const imageArea =
        width * height;

      // Fiş küçük görünse bile algılasın
      const minArea =
        imageArea * 0.02;

      for (
        let i = 0;
        i < contours.size();
        i++
      ) {
        const cnt =
          contours.get(i);

        const area =
          Math.abs(
            cv.contourArea(cnt)
          );

        if (
          area >= minArea &&
          area > bestArea
        ) {
          const perimeter =
            cv.arcLength(
              cnt,
              true
            );

          const tolerances = [
            0.01,
            0.015,
            0.02,
            0.025,
            0.03,
            0.04
          ];

          for (
            const tolerance
            of tolerances
          ) {
            const approx =
              new cv.Mat();

            cv.approxPolyDP(
              cnt,
              approx,
              tolerance *
                perimeter,
              true
            );

            if (
              approx.rows === 4 &&
              cv.isContourConvex(
                approx
              )
            ) {
              const points = [];

              for (
                let r = 0;
                r < 4;
                r++
              ) {
                const ptr =
                  approx.intPtr(
                    r,
                    0
                  );

                points.push([
                  ptr[0],
                  ptr[1]
                ]);
              }

              best = points;
              bestArea = area;

              approx.delete();
              break;
            }

            approx.delete();
          }
        }

        cnt.delete();
      }

      if (!best) {
        throw new Error(
          'NO_DOCUMENT'
        );
      }

      const ordered =
        orderPoints(best);

      const tl = ordered[0];
      const tr = ordered[1];
      const br = ordered[2];
      const bl = ordered[3];

      const outWidth =
        Math.max(
          220,
          Math.round(
            Math.max(
              distance(
                br,
                bl
              ),
              distance(
                tr,
                tl
              )
            )
          )
        );

      const outHeight =
        Math.max(
          320,
          Math.round(
            Math.max(
              distance(
                tr,
                br
              ),
              distance(
                tl,
                bl
              )
            )
          )
        );

      const srcPoints =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          [
            tl[0],
            tl[1],

            tr[0],
            tr[1],

            br[0],
            br[1],

            bl[0],
            bl[1]
          ]
        );

      const dstPoints =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          [
            0,
            0,

            outWidth - 1,
            0,

            outWidth - 1,
            outHeight - 1,

            0,
            outHeight - 1
          ]
        );

      const transform =
        cv.getPerspectiveTransform(
          srcPoints,
          dstPoints
        );

      const warped =
        new cv.Mat();

      cv.warpPerspective(
        src,
        warped,
        transform,
        new cv.Size(
          outWidth,
          outHeight
        ),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE,
        new cv.Scalar()
      );

      // Hafif taranmış belge görünümü
      const grayScan =
        new cv.Mat();

      cv.cvtColor(
        warped,
        grayScan,
        cv.COLOR_RGBA2GRAY
      );

      cv.equalizeHist(
        grayScan,
        grayScan
      );

      const finalImage =
        new cv.Mat();

      cv.cvtColor(
        grayScan,
        finalImage,
        cv.COLOR_GRAY2RGBA
      );

      const outputCanvas =
        document.createElement(
          'canvas'
        );

      outputCanvas.width =
        outWidth;

      outputCanvas.height =
        outHeight;

      cv.imshow(
        outputCanvas,
        finalImage
      );

      const outputBytes =
        await canvasToBytes(
          outputCanvas
        );

      const confidence =
        Math.min(
          1,
          Math.max(
            0,
            bestArea /
              imageArea
          )
        );

      srcPoints.delete();
      dstPoints.delete();
      transform.delete();
      warped.delete();
      grayScan.delete();
      finalImage.delete();

      return {
        bytes: outputBytes,
        confidence: confidence,
      };
    } finally {
      src.delete();
      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  function processReceiptWithCallbacks(
    rawBytes,
    onSuccess,
    onError
  ) {
    processReceipt(
      rawBytes
    )
      .then(
        (result) => {
          onSuccess(
            result.bytes,
            result.confidence
          );
        }
      )
      .catch(
        (error) => {
          onError(
            error &&
            error.message
              ? error.message
              : String(error)
          );
        }
      );
  }

  window.receiptScanner = {
    processReceiptWithCallbacks:
      processReceiptWithCallbacks,
  };
})();
