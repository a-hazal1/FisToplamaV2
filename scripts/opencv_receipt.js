(function () {
  'use strict';

  let cvPromise = null;

  function loadCv() {
    if (cvPromise) return cvPromise;

    cvPromise = new Promise((resolve, reject) => {
      const started = Date.now();

      const poll = async () => {
        try {
          while (Date.now() - started < 30000) {
            let c = window.cv;

            // Bazı OpenCV.js sürümleri thenable döndürür.
            if (c && typeof c.then === 'function') {
              try {
                c = await c;
                window.cv = c;
              } catch (_) {}
            }

            if (c && typeof c.Mat === 'function') {
              resolve(c);
              return;
            }

            await new Promise(r => setTimeout(r, 100));
          }

          reject(new Error('OPENCV_RUNTIME_TIMEOUT'));
        } catch (e) {
          reject(e);
        }
      };

      if (window.cv) {
        poll();
        return;
      }

      let script = document.querySelector('script[data-fistoplama-opencv]');

      if (!script) {
        script = document.createElement('script');
        script.src = 'opencv.js';
        script.async = true;
        script.dataset.fistoplamaOpencv = '1';
        document.head.appendChild(script);
      }

      script.addEventListener('load', poll, { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error('OPENCV_SCRIPT_LOAD_FAILED')),
        { once: true }
      );
    });

    return cvPromise.catch(e => {
      cvPromise = null;
      throw e;
    });
  }

  function safeDelete(...items) {
    for (const item of items) {
      try {
        if (item && typeof item.delete === 'function') item.delete();
      } catch (_) {}
    }
  }

  function canvasToJpegBytes(canvas, quality = 0.94) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async blob => {
        if (!blob) {
          reject(new Error('OUTPUT_BLOB_FAILED'));
          return;
        }

        try {
          const buffer = await blob.arrayBuffer();
          resolve(Array.from(new Uint8Array(buffer)));
        } catch (e) {
          reject(e);
        }
      }, 'image/jpeg', quality);
    });
  }

  function orderPoints(points) {
    const sums = points.map(p => p[0] + p[1]);
    const diffs = points.map(p => p[0] - p[1]);

    return [
      points[sums.indexOf(Math.min(...sums))], // TL
      points[diffs.indexOf(Math.max(...diffs))], // TR
      points[sums.indexOf(Math.max(...sums))], // BR
      points[diffs.indexOf(Math.min(...diffs))], // BL
    ];
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function contourPoints(mat) {
    const out = [];

    for (let i = 0; i < mat.rows; i++) {
      const p = mat.intPtr(i, 0);
      out.push([p[0], p[1]]);
    }

    return out;
  }

  function boxPointsFromRotatedRect(rect) {
    const angle = rect.angle * Math.PI / 180.0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = rect.size.width / 2.0;
    const hh = rect.size.height / 2.0;

    const local = [
      [-hw, -hh],
      [ hw, -hh],
      [ hw,  hh],
      [-hw,  hh],
    ];

    return local.map(([x, y]) => [
      rect.center.x + x * cos - y * sin,
      rect.center.y + x * sin + y * cos,
    ]);
  }

  function setMaskRect(mask, x1, y1, x2, y2, value) {
    const sx = Math.max(0, Math.min(mask.cols, Math.floor(x1)));
    const sy = Math.max(0, Math.min(mask.rows, Math.floor(y1)));
    const ex = Math.max(0, Math.min(mask.cols, Math.ceil(x2)));
    const ey = Math.max(0, Math.min(mask.rows, Math.ceil(y2)));

    for (let y = sy; y < ey; y++) {
      const row = mask.ucharPtr(y);
      for (let x = sx; x < ex; x++) row[x] = value;
    }
  }

  function createGrabCutMask(cv, image) {
    const GC_BGD = 0;
    const GC_FGD = 1;
    const GC_PR_BGD = 2;
    const GC_PR_FGD = 3;

    const mask = new cv.Mat(
      image.rows,
      image.cols,
      cv.CV_8UC1,
      new cv.Scalar(GC_PR_BGD)
    );

    const border = Math.max(
      2,
      Math.round(Math.min(image.rows, image.cols) * 0.025)
    );

    setMaskRect(mask, 0, 0, image.cols, border, GC_BGD);
    setMaskRect(mask, 0, image.rows - border, image.cols, image.rows, GC_BGD);
    setMaskRect(mask, 0, 0, border, image.rows, GC_BGD);
    setMaskRect(mask, image.cols - border, 0, image.cols, image.rows, GC_BGD);

    // Python sürümündeki probable foreground merkezi.
    setMaskRect(
      mask,
      image.cols * 0.18,
      image.rows * 0.12,
      image.cols * 0.82,
      image.rows * 0.88,
      GC_PR_FGD
    );

    const bgModel = new cv.Mat();
    const fgModel = new cv.Mat();

    try {
      cv.grabCut(
        image,
        mask,
        new cv.Rect(0, 0, 1, 1),
        bgModel,
        fgModel,
        1,
        cv.GC_INIT_WITH_MASK
      );

      const binary = new cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);

      for (let y = 0; y < mask.rows; y++) {
        const srcRow = mask.ucharPtr(y);
        const dstRow = binary.ucharPtr(y);

        for (let x = 0; x < mask.cols; x++) {
          const v = srcRow[x];
          dstRow[x] = (v === GC_FGD || v === GC_PR_FGD) ? 255 : 0;
        }
      }

      return binary;
    } finally {
      safeDelete(mask, bgModel, fgModel);
    }
  }

  function morphClean(cv, mask) {
    const closed = new cv.Mat();
    const opened = new cv.Mat();
    const closeKernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(11, 11)
    );
    const openKernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(5, 5)
    );

    try {
      cv.morphologyEx(
        mask,
        closed,
        cv.MORPH_CLOSE,
        closeKernel,
        new cv.Point(-1, -1),
        2
      );

      cv.morphologyEx(
        closed,
        opened,
        cv.MORPH_OPEN,
        openKernel,
        new cv.Point(-1, -1),
        1
      );

      return opened.clone();
    } finally {
      safeDelete(closed, opened, closeKernel, openKernel);
    }
  }

  // Python'daki largest_central_component mantığının OpenCV.js'te
  // daha uyumlu contour tabanlı karşılığı.
  function selectLargestCentralContour(cv, mask) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const imageArea = mask.cols * mask.rows;
    const centerX = mask.cols / 2;
    const centerY = mask.rows / 2;
    const maxDistance = Math.hypot(centerX, centerY);

    try {
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      if (contours.size() === 0) {
        throw new Error('NO_DOCUMENT');
      }

      let bestIndex = -1;
      let bestScore = -1e9;
      let largestFallback = -1;
      let largestArea = -1;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);

        try {
          const area = Math.abs(cv.contourArea(cnt));
          if (area > largestArea) {
            largestArea = area;
            largestFallback = i;
          }

          const areaRatio = area / imageArea;
          if (areaRatio < 0.03) continue;

          const rect = cv.boundingRect(cnt);
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const centerDistance = Math.hypot(cx - centerX, cy - centerY) / maxDistance;
          const centerScore = 1.0 - Math.min(1.0, centerDistance);

          let touches = 0;
          if (rect.x <= 1) touches++;
          if (rect.y <= 1) touches++;
          if (rect.x + rect.width >= mask.cols - 1) touches++;
          if (rect.y + rect.height >= mask.rows - 1) touches++;

          const score = areaRatio * 4.0 + centerScore * 1.25 - touches * 0.30;

          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        } finally {
          cnt.delete();
        }
      }

      if (bestIndex < 0) bestIndex = largestFallback;
      if (bestIndex < 0) throw new Error('NO_DOCUMENT');

      const filled = new cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
      cv.drawContours(
        filled,
        contours,
        bestIndex,
        new cv.Scalar(255),
        -1
      );

      return filled;
    } finally {
      safeDelete(contours, hierarchy);
    }
  }

  function contourToQuad(cv, mask) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const imageArea = mask.cols * mask.rows;

    try {
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      if (contours.size() === 0) throw new Error('NO_DOCUMENT');

      let bestIndex = -1;
      let bestArea = -1;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        try {
          const area = Math.abs(cv.contourArea(cnt));
          if (area > bestArea) {
            bestArea = area;
            bestIndex = i;
          }
        } finally {
          cnt.delete();
        }
      }

      if (bestIndex < 0 || bestArea / imageArea < 0.08) {
        throw new Error('NO_DOCUMENT');
      }

      const contour = contours.get(bestIndex);
      const hull = new cv.Mat();

      try {
        cv.convexHull(contour, hull, false, true);
        const perimeter = cv.arcLength(hull, true);
        const eps = [0.010, 0.0125, 0.015, 0.0175, 0.020, 0.025, 0.030, 0.040, 0.050];

        for (const e of eps) {
          const approx = new cv.Mat();

          try {
            cv.approxPolyDP(hull, approx, e * perimeter, true);

            if (approx.rows === 4 && cv.isContourConvex(approx)) {
              const candidateArea = Math.abs(cv.contourArea(approx));
              if (candidateArea / imageArea >= 0.08) {
                return contourPoints(approx);
              }
            }
          } finally {
            approx.delete();
          }
        }

        // Python sürümündeki fallback.
        const rect = cv.minAreaRect(hull);
        return boxPointsFromRotatedRect(rect);
      } finally {
        safeDelete(contour, hull);
      }
    } finally {
      safeDelete(contours, hierarchy);
    }
  }

  function perspectiveWarp(cv, original, smallQuad, scale) {
    const inv = 1.0 / scale;
    const originalPoints = smallQuad.map(p => [
      Math.max(0, Math.min(original.cols - 1, p[0] * inv)),
      Math.max(0, Math.min(original.rows - 1, p[1] * inv)),
    ]);

    const [tl, tr, br, bl] = orderPoints(originalPoints);

    const outW = Math.max(
      2,
      Math.round(Math.max(distance(br, bl), distance(tr, tl)))
    );

    const outH = Math.max(
      2,
      Math.round(Math.max(distance(tr, br), distance(tl, bl)))
    );

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl[0], tl[1],
      tr[0], tr[1],
      br[0], br[1],
      bl[0], bl[1],
    ]);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outW - 1, 0,
      outW - 1, outH - 1,
      0, outH - 1,
    ]);

    const matrix = cv.getPerspectiveTransform(srcPts, dstPts);
    const warped = new cv.Mat();

    try {
      cv.warpPerspective(
        original,
        warped,
        matrix,
        new cv.Size(outW, outH),
        cv.INTER_CUBIC,
        cv.BORDER_REPLICATE,
        new cv.Scalar()
      );

      return warped.clone();
    } finally {
      safeDelete(srcPts, dstPts, matrix, warped);
    }
  }

  function autoRotatePortrait(cv, image) {
    if (image.cols <= image.rows * 1.25) return image.clone();

    const rotated = new cv.Mat();
    cv.rotate(image, rotated, cv.ROTATE_90_CLOCKWISE);
    return rotated;
  }

  function enhanceDocument(cv, image) {
    const gray = new cv.Mat();
    const result = new cv.Mat();

    try {
      if (image.channels() === 4) {
        cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);
      } else if (image.channels() === 3) {
        cv.cvtColor(image, gray, cv.COLOR_RGB2GRAY);
      } else {
        image.copyTo(gray);
      }

      // CLAHE OpenCV.js buildlerinde her zaman expose edilmediği için
      // güvenli fallback olarak histogram equalization kullanıyoruz.
      cv.equalizeHist(gray, gray);
      cv.cvtColor(gray, result, cv.COLOR_GRAY2RGBA);
      return result.clone();
    } finally {
      safeDelete(gray, result);
    }
  }

  async function process(raw) {
    const cv = await loadCv();
    const inputBytes = Uint8Array.from(raw);
    const blob = new Blob([inputBytes]);
    const bitmap = await createImageBitmap(blob);

    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = bitmap.width;
    originalCanvas.height = bitmap.height;
    originalCanvas
      .getContext('2d', { willReadFrequently: true })
      .drawImage(bitmap, 0, 0);
    bitmap.close();

    const originalRgba = cv.imread(originalCanvas);
    const originalRgb = new cv.Mat();
    const small = new cv.Mat();

    let grabMask = null;
    let cleanMask = null;
    let centralMask = null;
    let warped = null;
    let portrait = null;
    let enhanced = null;

    try {
      cv.cvtColor(originalRgba, originalRgb, cv.COLOR_RGBA2RGB);

      const scale = Math.min(
        1.0,
        450 / Math.max(originalRgb.cols, originalRgb.rows)
      );

      if (scale < 1.0) {
        cv.resize(
          originalRgb,
          small,
          new cv.Size(
            Math.max(1, Math.round(originalRgb.cols * scale)),
            Math.max(1, Math.round(originalRgb.rows * scale))
          ),
          0,
          0,
          cv.INTER_AREA
        );
      } else {
        originalRgb.copyTo(small);
      }

      grabMask = createGrabCutMask(cv, small);
      cleanMask = morphClean(cv, grabMask);
      centralMask = selectLargestCentralContour(cv, cleanMask);

      const quad = contourToQuad(cv, centralMask);
      warped = perspectiveWarp(cv, originalRgb, quad, scale);
      portrait = autoRotatePortrait(cv, warped);
      enhanced = enhanceDocument(cv, portrait);

      const out = document.createElement('canvas');
      out.width = enhanced.cols;
      out.height = enhanced.rows;
      cv.imshow(out, enhanced);

      const outBytes = await canvasToJpegBytes(out, 0.94);

      const contourAreaApprox = Math.abs(
        (quad[0][0] * quad[1][1] - quad[1][0] * quad[0][1]) +
        (quad[1][0] * quad[2][1] - quad[2][0] * quad[1][1]) +
        (quad[2][0] * quad[3][1] - quad[3][0] * quad[2][1]) +
        (quad[3][0] * quad[0][1] - quad[0][0] * quad[3][1])
      ) / 2.0;

      const confidence = Math.max(
        0,
        Math.min(1, contourAreaApprox / (small.cols * small.rows))
      );

      return {
        bytes: outBytes,
        confidence,
      };
    } finally {
      safeDelete(
        originalRgba,
        originalRgb,
        small,
        grabMask,
        cleanMask,
        centralMask,
        warped,
        portrait,
        enhanced
      );
    }
  }

  // Mevcut Flutter scanner_service_web.dart API'sini AYNEN koruyoruz.
  window.receiptScanner = {
    scan(raw, ok, err) {
      process(raw)
        .then(result => ok(result.bytes, result.confidence))
        .catch(error => {
          console.error('[FişToplama scanner]', error);
          const message = error && error.message ? error.message : String(error);
          err(message);
        });
    },
  };
})();
