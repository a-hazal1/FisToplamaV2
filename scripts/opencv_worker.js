let cvReadyPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCv() {
  if (cvReadyPromise) {
    return cvReadyPromise;
  }

  cvReadyPromise = (async () => {
    try {
      if (!self.cv) {
        importScripts('opencv.js');
      }

      const startedAt = Date.now();
      const timeoutMs = 15000;

      while (Date.now() - startedAt < timeoutMs) {
        let candidate = self.cv;

        if (candidate) {
          if (typeof candidate.then === 'function') {
            try {
              candidate = await Promise.race([
                candidate,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(
                      new Error('OPENCV_PROMISE_TIMEOUT')
                    ),
                    10000
                  )
                ),
              ]);

              self.cv = candidate;
            } catch (e) {
              throw new Error(
                'OPENCV_INIT_FAILED: ' +
                (e?.message ?? e)
              );
            }
          }

          if (
            candidate &&
            typeof candidate.Mat === 'function'
          ) {
            return candidate;
          }
        }

        await sleep(100);
      }

      throw new Error('OPENCV_RUNTIME_TIMEOUT');
    } catch (error) {
      cvReadyPromise = null;
      throw error;
    }
  })();

  return cvReadyPromise;
}
function distance(a, b) {
  return Math.hypot(
    a[0] - b[0],
    a[1] - b[1]
  );
}

function orderPoints(points) {
  const sums =
    points.map(
      (p) => p[0] + p[1]
    );

  const diffs =
    points.map(
      (p) => p[0] - p[1]
    );

  const tl =
    points[
      sums.indexOf(
        Math.min(...sums)
      )
    ];

  const br =
    points[
      sums.indexOf(
        Math.max(...sums)
      )
    ];

  const tr =
    points[
      diffs.indexOf(
        Math.max(...diffs)
      )
    ];

  const bl =
    points[
      diffs.indexOf(
        Math.min(...diffs)
      )
    ];

  return [
    tl,
    tr,
    br,
    bl
  ];
}

function findReceipt(
  cv,
  src
) {
  const gray =
    new cv.Mat();

  const blurred =
    new cv.Mat();

  const edges =
    new cv.Mat();

  const contours =
    new cv.MatVector();

  const hierarchy =
    new cv.Mat();

  let bestPoints = null;
  let bestArea = 0;

  try {
    /*
     * Gri tonlama
     */
    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    );

    /*
     * Gürültüyü azalt
     */
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0,
      0,
      cv.BORDER_DEFAULT
    );

    /*
     * Kenarlar
     */
    cv.Canny(
      blurred,
      edges,
      35,
      135
    );

    /*
     * Fiş kenarındaki küçük
     * kopuklukları birleştir.
     */
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
      2
    );

    kernel.delete();

    /*
     * Konturlar
     */
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const imageArea =
      src.cols *
      src.rows;

    /*
     * Fiş fotoğraf içerisinde
     * küçük olsa bile dene.
     */
    const minArea =
      imageArea *
      0.015;

    const tolerances = [
      0.008,
      0.01,
      0.012,
      0.015,
      0.018,
      0.02,
      0.025,
      0.03,
      0.04,
      0.05
    ];

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour =
        contours.get(i);

      try {
        const area =
          Math.abs(
            cv.contourArea(
              contour
            )
          );

        if (
          area <
            minArea ||
          area <=
            bestArea
        ) {
          continue;
        }

        const perimeter =
          cv.arcLength(
            contour,
            true
          );

        for (
          const tolerance
          of tolerances
        ) {
          const approx =
            new cv.Mat();

          try {
            cv.approxPolyDP(
              contour,
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

              /*
               * approx:
               * [x1,y1,x2,y2...]
               */
              for (
                let p = 0;
                p < 4;
                p++
              ) {
                points.push([
                  approx.data32S[
                    p * 2
                  ],
                  approx.data32S[
                    p * 2 + 1
                  ]
                ]);
              }

              bestPoints =
                points;

              bestArea =
                area;

              break;
            }
          } finally {
            approx.delete();
          }
        }
      } finally {
        contour.delete();
      }
    }

    return {
      points:
        bestPoints,

      area:
        bestArea,

      imageArea:
        imageArea
    };
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

async function processReceipt(
  inputBuffer
) {
  const cv =
    await getCv();

  /*
   * Fotoğrafı Worker içinde aç.
   */
  const blob =
    new Blob(
      [inputBuffer]
    );

  const bitmap =
    await createImageBitmap(
      blob
    );

  /*
   * Kenar tespiti için 1200px yeterli.
   * Telefon fotoğrafının 4000px olması
   * gereksiz CPU/RAM harcatıyordu.
   */
  const maxSide =900;

  const scale =
    Math.min(
      1,
      maxSide /
        Math.max(
          bitmap.width,
          bitmap.height
        )
    );

  const width =
    Math.max(
      1,
      Math.round(
        bitmap.width *
          scale
      )
    );

  const height =
    Math.max(
      1,
      Math.round(
        bitmap.height *
          scale
      )
    );

  /*
   * Worker'da HTML Canvas yerine
   * OffscreenCanvas kullanıyoruz.
   */
  const canvas =
    new OffscreenCanvas(
      width,
      height
    );

  const ctx =
    canvas.getContext(
      '2d',
      {
        willReadFrequently: true
      }
    );

  if (!ctx) {
    bitmap.close();

    throw new Error(
      'CANVAS_CONTEXT_FAILED'
    );
  }

  ctx.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );

  bitmap.close();

  const imageData =
    ctx.getImageData(
      0,
      0,
      width,
      height
    );

  /*
   * cv.imread(OffscreenCanvas)
   * yerine doğrudan ImageData
   * kullanıyoruz.
   */
  const src =
    cv.matFromImageData(
      imageData
    );

  try {
    const detection =
      findReceipt(
        cv,
        src
      );

    if (!detection.points) {
      throw new Error(
        'NO_DOCUMENT'
      );
    }

    const ordered =
      orderPoints(
        detection.points
      );

    const tl =
      ordered[0];

    const tr =
      ordered[1];

    const br =
      ordered[2];

    const bl =
      ordered[3];

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

    const sourcePoints =
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

    const destinationPoints =
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
        sourcePoints,
        destinationPoints
      );

    const warped =
      new cv.Mat();

    try {
      /*
       * Perspektif düzeltme
       */
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

      /*
       * Tarayıcı görünümü.
       */
      const gray =
        new cv.Mat();

      const finalImage =
        new cv.Mat();

      try {
        cv.cvtColor(
          warped,
          gray,
          cv.COLOR_RGBA2GRAY
        );

        cv.equalizeHist(
          gray,
          gray
        );

        cv.cvtColor(
          gray,
          finalImage,
          cv.COLOR_GRAY2RGBA
        );

        /*
         * OpenCV Mat -> ImageData
         */
        const resultPixels =
          new Uint8ClampedArray(
            finalImage.data
          );

        const resultImageData =
          new ImageData(
            resultPixels,
            outWidth,
            outHeight
          );

        const outputCanvas =
          new OffscreenCanvas(
            outWidth,
            outHeight
          );

        const outputContext =
          outputCanvas.getContext(
            '2d'
          );

        outputContext.putImageData(
          resultImageData,
          0,
          0
        );

        /*
         * JPEG'e çevir.
         */
        const outputBlob =
          await outputCanvas
            .convertToBlob({
              type:
                'image/jpeg',

              quality:
                0.94
            });

        const outputBuffer =
          await outputBlob
            .arrayBuffer();

        return {
          buffer:
            outputBuffer,

          confidence:
            Math.min(
              1,
              Math.max(
                0,
                detection.area /
                  detection.imageArea
              )
            )
        };
      } finally {
        gray.delete();
        finalImage.delete();
      }
    } finally {
      sourcePoints.delete();
      destinationPoints.delete();
      transform.delete();
      warped.delete();
    }
  } finally {
    src.delete();
  }
}

self.onmessage = async function (event) {
    const message = event.data;
  
    if (
      !message ||
      !message.id ||
      !message.buffer
    ) {
      return;
    }
  
    const id = message.id;
  
    try {
      const result = await Promise.race([
        processReceipt(message.buffer),
  
        new Promise((_, reject) =>
          setTimeout(
            () => reject(
              new Error('SCAN_TIMEOUT')
            ),
            20000
          )
        ),
      ]);
  
      self.postMessage(
        {
          id: id,
          ok: true,
          buffer: result.buffer,
          confidence: result.confidence,
        },
        [result.buffer]
      );
    } catch (error) {
      self.postMessage({
        id: id,
        ok: false,
        error:
          error && error.message
            ? error.message
            : String(error),
      });
    }
  };
      /*
       * ArrayBuffer'ı kopyalamadan
       * ana thread'e transfer ediyoruz.
       */
      self.postMessage(
        {
          id: id,
          ok: true,
          buffer:
            result.buffer,
          confidence:
            result.confidence
        },
        [
          result.buffer
        ]
      );
    } catch (error) {
      self.postMessage({
        id: id,
        ok: false,
        error:
          error &&
          error.message
            ? error.message
            : String(error)
      });
    }
  };
