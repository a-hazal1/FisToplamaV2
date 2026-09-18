(function () {
  let cvPromise = null;

  function waitForCv(timeoutMs = 20000) {
    if (window.cv && window.cv.Mat) return Promise.resolve(window.cv);
    if (cvPromise) return cvPromise;

    cvPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(timer);
            resolve(window.cv);
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            reject(new Error('OPENCV_LOAD_TIMEOUT'));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('OPENCV_LOAD_FAILED'));
      document.head.appendChild(script);
    });

    return cvPromise;
  }

  function orderPoints(points) {
    const sums = points.map(p => p[0] + p[1]);
    const diffs = points.map(p => p[0] - p[1]);
    const tl = points[sums.indexOf(Math.min(...sums))];
    const br = points[sums.indexOf(Math.max(...sums))];
    const tr = points[diffs.indexOf(Math.max(...diffs))];
    const bl = points[diffs.indexOf(Math.min(...diffs))];
    return [tl, tr, br, bl];
  }

  function dist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function canvasToBytes(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('OUTPUT_BLOB_FAILED'));
        const buffer = await blob.arrayBuffer();
        resolve(Array.from(new Uint8Array(buffer)));
      }, 'image/jpeg', 0.94);
    });
  }

  async function processReceipt(bytes) {
    const cv = await waitForCv();

    const blob = new Blob([new Uint8Array(bytes)]);
    const bitmap = await createImageBitmap(blob);

    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const blur = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    let best = null;
    let bestArea = 0;

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.Canny(blur, edges, 50, 150);

      cv.findContours(
        edges,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE
      );

      const imageArea = width * height;
      const minArea = imageArea * 0.08;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = Math.abs(cv.contourArea(cnt));

        if (area >= minArea && area > bestArea) {
          const peri = cv.arcLength(cnt, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const pts = [];
            for (let r = 0; r < 4; r++) {
              pts.push([
                approx.intPtr(r, 0)[0],
                approx.intPtr(r, 0)[1]
              ]);
            }
            best = pts;
            bestArea = area;
          }
          approx.delete();
        }

        cnt.delete();
      }

      if (!best) throw new Error('NO_DOCUMENT');

      const [tl, tr, br, bl] = orderPoints(best);
      const outWidth = Math.max(200, Math.round(Math.max(dist(br, bl), dist(tr, tl))));
      const outHeight = Math.max(300, Math.round(Math.max(dist(tr, br), dist(tl, bl))));

      const srcTri = cv.matFromArray(
        4, 1, cv.CV_32FC2,
        [tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]]
      );

      const dstTri = cv.matFromArray(
        4, 1, cv.CV_32FC2,
        [0, 0, outWidth - 1, 0, outWidth - 1, outHeight - 1, 0, outHeight - 1]
      );

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const warped = new cv.Mat();

      cv.warpPerspective(
        src,
        warped,
        M,
        new cv.Size(outWidth, outHeight),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE
      );

      const scanGray = new cv.Mat();
      const scanRgba = new cv.Mat();

      cv.cvtColor(warped, scanGray, cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(scanGray, scanGray);
      cv.cvtColor(scanGray, scanRgba, cv.COLOR_GRAY2RGBA);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outWidth;
      outCanvas.height = outHeight;
      cv.imshow(outCanvas, scanRgba);

      const outputBytes = await canvasToBytes(outCanvas);
      const confidence = Math.min(1, Math.max(0, bestArea / imageArea));

      srcTri.delete();
      dstTri.delete();
      M.delete();
      warped.delete();
      scanGray.delete();
      scanRgba.delete();

      return { bytes: outputBytes, confidence };
    } finally {
      src.delete();
      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  window.receiptScanner = { processReceipt };
})();
