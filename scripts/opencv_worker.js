let cvReadyPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCv() {
  if (cvReadyPromise) return cvReadyPromise;

  cvReadyPromise = (async () => {
    if (!self.cv) {
      importScripts('opencv.js');
    }

    let candidate = self.cv;

    if (candidate && typeof candidate.then === 'function') {
      candidate = await candidate;
      self.cv = candidate;
    }

    const startedAt = Date.now();

    while (
      (!candidate || typeof candidate.Mat !== 'function') &&
      Date.now() - startedAt < 15000
    ) {
      await sleep(100);
      candidate = self.cv;

      if (candidate && typeof candidate.then === 'function') {
        candidate = await candidate;
        self.cv = candidate;
      }
    }

    if (!candidate || typeof candidate.Mat !== 'function') {
      throw new Error('OPENCV_RUNTIME_TIMEOUT');
    }

    return candidate;
  })();

  try {
    return await cvReadyPromise;
  } catch (error) {
    cvReadyPromise = null;
    throw error;
  }
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function orderPoints(points) {
  const sums = points.map((p) => p[0] + p[1]);
  const diffs = points.map((p) => p[0] - p[1]);

  const tl = points[sums.indexOf(Math.min(...sums))];
  const br = points[sums.indexOf(Math.max(...sums))];
  const tr = points[diffs.indexOf(Math.max(...diffs))];
  const bl = points[diffs.indexOf(Math.min(...diffs))];

  return [tl, tr, br, bl];
}

function findBestQuad(cv, src) {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let bestPoints = null;
  let bestArea = 0;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0,
      0,
      cv.BORDER_DEFAULT
    );

    cv.Canny(
      blurred,
      edges,
      40,
      140
    );

    const kernel = cv.Mat.ones(
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
      src.cols * src.rows;

    const minArea =
      imageArea * 0.02;

    const tolerances = [
      0.01,
      0.015,
      0.02,
      0.025,
      0.03,
      0.04
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
          area < minArea ||
          area <= bestArea
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
                  ],
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
      points: bestPoints,
      area: bestArea,
      imageArea: imageArea,
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

  const blob =
    new Blob(
      [inputBuffer]
    );

  const bitmap =
    await createImageBitmap(
      blob
    );

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

  const src =
    cv.matFromImageData(
      imageData
    );

  try {
    const detection =
      findBestQuad(
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
          bl[1],
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
          outHeight - 1,
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

        const outputCanvas =
          new OffscreenCanvas(
            outWidth,
            outHeight
          );

        const outputContext =
          outputCanvas.getContext(
            '2d'
          );

        if (!outputContext) {
          throw new Error(
            'OUTPUT_CANVAS_CONTEXT_FAILED'
          );
        }

        const pixels =
          new Uint8ClampedArray(
            finalImage.data
          );

        const outputImageData =
          new ImageData(
            pixels,
            outWidth,
            outHeight
          );

        outputContext.putImageData(
          outputImageData,
          0,
          0
        );

        const outputBlob =
          await outputCanvas
            .convertToBlob({
              type:
                'image/jpeg',

              quality:
                0.92
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
            ),
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

self.onmessage =
  async function (event) {

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
                20000
              )
          ),
        ]);

      self.postMessage(
        {
          id: id,
          ok: true,
          buffer:
            result.buffer,
          confidence:
            result.confidence,
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
            : String(error),
      });
    }
  };
