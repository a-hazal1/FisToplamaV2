let cvReadyPromise = null;


/* =========================================================
   OPENCV BAŞLATMA
   ========================================================= */

function getCv() {
  if (cvReadyPromise) {
    return cvReadyPromise;
  }

  cvReadyPromise = new Promise((resolve, reject) => {
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;

      finished = true;

      reject(
        new Error(
          'OPENCV_INIT_TIMEOUT'
        )
      );
    }, 30000);


    function success(candidate) {
      if (finished) return;

      if (
        candidate &&
        typeof candidate.Mat === 'function'
      ) {
        finished = true;

        clearTimeout(timeout);

        self.cv = candidate;

        resolve(candidate);
      }
    }


    function fail(error) {
      if (finished) return;

      finished = true;

      clearTimeout(timeout);

      reject(error);
    }


    /*
     * OpenCV'nin klasik Emscripten
     * runtime callback mekanizması.
     */
    self.Module = {
      onRuntimeInitialized: function () {
        try {
          success(self.cv);
        } catch (error) {
          fail(error);
        }
      }
    };


    try {
      /*
       * web/opencv_worker.js ile
       * web/opencv.js aynı klasörde.
       */
      importScripts(
        'opencv.js'
      );
    } catch (error) {
      fail(
        new Error(
          'OPENCV_IMPORT_FAILED: ' +
          (
            error &&
            error.message
              ? error.message
              : String(error)
          )
        )
      );

      return;
    }


    try {
      const candidate =
        self.cv;

      /*
       * OpenCV'nin yeni sürümlerinde cv
       * Promise olabilir.
       */
      if (
        candidate &&
        typeof candidate.then ===
          'function'
      ) {
        candidate
          .then((readyCv) => {
            success(readyCv);
          })
          .catch((error) => {
            fail(
              new Error(
                'OPENCV_PROMISE_FAILED: ' +
                (
                  error &&
                  error.message
                    ? error.message
                    : String(error)
                )
              )
            );
          });

        return;
      }


      /*
       * Bazı buildlerde importScripts
       * döndüğü anda zaten hazırdır.
       */
      success(candidate);

    } catch (error) {
      fail(error);
    }
  });


  return cvReadyPromise.catch(
    (error) => {
      cvReadyPromise = null;
      throw error;
    }
  );
}


/* =========================================================
   YARDIMCI FONKSİYONLAR
   ========================================================= */

function distance(a, b) {
  return Math.hypot(
    a[0] - b[0],
    a[1] - b[1]
  );
}


function orderPoints(points) {
  const sums =
    points.map(
      (p) =>
        p[0] + p[1]
    );

  const diffs =
    points.map(
      (p) =>
        p[0] - p[1]
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


/* =========================================================
   FİŞ KENARLARINI BUL
   ========================================================= */

function detectReceipt(
  cv,
  src
) {
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


  let bestPoints = null;
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
      src.cols *
      src.rows;


    const minimumArea =
      imageArea *
      0.02;


    const tolerances = [
      0.01,
      0.015,
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
            minimumArea ||
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
    blur.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}


/* =========================================================
   FOTOĞRAFI İŞLE
   ========================================================= */

async function processReceipt(
  inputBuffer
) {
  const cv =
    await getCv();


  const blob =
    new Blob(
      [inputBuffer]
    );


  const bitmap =
    await createImageBitmap(
      blob
    );


  /*
   * Kenar bulma için 800-900 px
   * yeterli.
   */
  const maxSide = 900;


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


  const canvas =
    new OffscreenCanvas(
      width,
      height
    );


  const context =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  if (!context) {
    bitmap.close();

    throw new Error(
      'CANVAS_CONTEXT_FAILED'
    );
  }


  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );


  bitmap.close();


  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height
    );


  /*
   * OpenCV'nin resmi JS API'sinde
   * ImageData -> Mat dönüşümü.
   */
  const src =
    cv.matFromImageData(
      imageData
    );


  try {
    const detection =
      detectReceipt(
        cv,
        src
      );


    if (!detection.points) {
      throw new Error(
        'NO_DOCUMENT'
      );
    }


    const [
      tl,
      tr,
      br,
      bl
    ] =
      orderPoints(
        detection.points
      );


    const outputWidth =
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


    const outputHeight =
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


    const targetPoints =
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [
          0,
          0,

          outputWidth - 1,
          0,

          outputWidth - 1,
          outputHeight - 1,

          0,
          outputHeight - 1
        ]
      );


    const matrix =
      cv.getPerspectiveTransform(
        sourcePoints,
        targetPoints
      );


    const warped =
      new cv.Mat();


    try {
      /*
       * Perspektif düzeltme.
       */
      cv.warpPerspective(
        src,
        warped,
        matrix,
        new cv.Size(
          outputWidth,
          outputHeight
        ),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE,
        new cv.Scalar()
      );


      const gray =
        new cv.Mat();

      const resultMat =
        new cv.Mat();


      try {
        /*
         * Scanner görünümü.
         */
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
          resultMat,
          cv.COLOR_GRAY2RGBA
        );


        const outputCanvas =
          new OffscreenCanvas(
            outputWidth,
            outputHeight
          );


        const outputContext =
          outputCanvas.getContext(
            '2d'
          );


        if (!outputContext) {
          throw new Error(
            'OUTPUT_CONTEXT_FAILED'
          );
        }


        const pixelCopy =
          new Uint8ClampedArray(
            resultMat.data
          );


        const resultImage =
          new ImageData(
            pixelCopy,
            outputWidth,
            outputHeight
          );


        outputContext.putImageData(
          resultImage,
          0,
          0
        );


        const resultBlob =
          await outputCanvas
            .convertToBlob({
              type:
                'image/jpeg',

              quality:
                0.92
            });


        const resultBuffer =
          await resultBlob
            .arrayBuffer();


        return {
          buffer:
            resultBuffer,

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
        resultMat.delete();
      }

    } finally {
      sourcePoints.delete();
      targetPoints.delete();
      matrix.delete();
      warped.delete();
    }

  } finally {
    src.delete();
  }
}


/* =========================================================
   WORKER MESAJLARI
   ========================================================= */

self.onmessage =
  async function(event) {

    const message =
      event.data;


    if (
      !message ||
      !message.id ||
      !message.buffer
    ) {
      return;
    }


    const id =
      message.id;


    try {
      /*
       * İlk OpenCV initialization dahil
       * maksimum 40 saniye.
       *
       * Sonraki fişler çok daha hızlı olur.
       */
      const result =
        await Promise.race([
          processReceipt(
            message.buffer
          ),

          new Promise(
            (_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      'SCAN_TIMEOUT'
                    )
                  ),
                40000
              )
          )
        ]);


      self.postMessage(
        {
          id:
            id,

          ok:
            true,

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
        id:
          id,

        ok:
          false,

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      });

    }
  };


/*
 * Worker oluşturulduğu anda OpenCV'yi
 * arka planda hazırlamaya başla.
 */
getCv()
  .then(() => {
    self.postMessage({
      type: 'opencv-ready'
    });
  })
  .catch((error) => {
    self.postMessage({
      type: 'opencv-error',

      error:
        error &&
        error.message
          ? error.message
          : String(error)
    });
  });
