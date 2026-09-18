(function () {
  "use strict";

  const GC_BGD = 0;
  const GC_FGD = 1;
  const GC_PR_BGD = 2;
  const GC_PR_FGD = 3;

  function deleteSafe(...mats) {
    for (const m of mats) {
      try {
        if (m && typeof m.delete === "function") m.delete();
      } catch (_) {}
    }
  }

  async function waitForOpenCv(timeoutMs = 30000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (window.cv) {
        try {
          if (typeof window.cv.Mat === "function") {
            return window.cv;
          }
        } catch (_) {}
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error("OpenCV.js 30 saniye içinde hazır olmadı.");
  }

  function base64ToBlob(base64, mime = "image/jpeg") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  async function blobToImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Görüntü açılamadı."));
        img.src = url;
      });
      return img;
    } finally {
      // URL, cv.imread tamamlanmadan kapatılmamalı.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function resizeForAnalysis(cv, src, maxSide = 700) {
    const maxDim = Math.max(src.cols, src.rows);
    const scale = Math.min(1.0, maxSide / maxDim);

    if (scale >= 1.0) {
      return { mat: src.clone(), scale: 1.0 };
    }

    const dst = new cv.Mat();
    const width = Math.max(1, Math.round(src.cols * scale));
    const height = Math.max(1, Math.round(src.rows * scale));

    cv.resize(
      src,
      dst,
      new cv.Size(width, height),
      0,
      0,
      cv.INTER_AREA
    );

    return { mat: dst, scale };
  }

  function setMaskRect(mask, x1, y1, x2, y2, value) {
    x1 = Math.max(0, Math.min(mask.cols, x1));
    y1 = Math.max(0, Math.min(mask.rows, y1));
    x2 = Math.max(0, Math.min(mask.cols, x2));
    y2 = Math.max(0, Math.min(mask.rows, y2));

    for (let y = y1; y < y2; y++) {
      const row = mask.ucharPtr(y);
      for (let x = x1; x < x2; x++) {
        row[x] = value;
      }
    }
  }

  function grabCutBinaryMask(cv, rgb) {
    const mask = new cv.Mat(
      rgb.rows,
      rgb.cols,
      cv.CV_8UC1,
      new cv.Scalar(GC_PR_BGD)
    );

    const border = Math.max(
      2,
      Math.round(Math.min(rgb.rows, rgb.cols) * 0.025)
    );

    setMaskRect(mask, 0, 0, rgb.cols, border, GC_BGD);
    setMaskRect(mask, 0, rgb.rows - border, rgb.cols, rgb.rows, GC_BGD);
    setMaskRect(mask, 0, 0, border, rgb.rows, GC_BGD);
    setMaskRect(mask, rgb.cols - border, 0, rgb.cols, rgb.rows, GC_BGD);

    const x1 = Math.round(rgb.cols * 0.18);
    const x2 = Math.round(rgb.cols * 0.82);
    const y1 = Math.round(rgb.rows * 0.12);
    const y2 = Math.round(rgb.rows * 0.88);

    setMaskRect(mask, x1, y1, x2, y2, GC_PR_FGD);

    const bgdModel = new cv.Mat();
    const fgdModel = new cv.Mat();

    try {
      // OpenCV.js GC_INIT_WITH_MASK için null yerine boş Rect gerekir.
      const dummyRect = new cv.Rect();
      cv.grabCut(
        rgb,
        mask,
        dummyRect,
        bgdModel,
        fgdModel,
        2,
        cv.GC_INIT_WITH_MASK
      );

      const binary = new cv.Mat.zeros(
        mask.rows,
        mask.cols,
        cv.CV_8UC1
      );

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
      deleteSafe(mask, bgdModel, fgdModel);
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
      deleteSafe(closed, opened, closeKernel, openKernel);
    }
  }

  function largestCentralComponent(cv, mask) {
    const labels = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();

    try {
      const count = cv.connectedComponentsWithStats(
        mask,
        labels,
        stats,
        centroids,
        8,
        cv.CV_32S
      );

      if (!count || count <= 1) {
        return mask.clone();
      }

      const centerX = mask.cols / 2;
      const centerY = mask.rows / 2;
      const maxDistance = Math.hypot(centerX, centerY);

      let bestIndex = -1;
      let bestScore = -1e9;

      for (let i = 1; i < count; i++) {
        const base = i * stats.cols;

        const x = stats.data32S[base + cv.CC_STAT_LEFT];
        const y = stats.data32S[base + cv.CC_STAT_TOP];
        const bw = stats.data32S[base + cv.CC_STAT_WIDTH];
        const bh = stats.data32S[base + cv.CC_STAT_HEIGHT];
        const area = stats.data32S[base + cv.CC_STAT_AREA];

        const areaRatio = area / (mask.cols * mask.rows);
        if (areaRatio < 0.03) continue;

        const cx = centroids.data64F[i * 2];
        const cy = centroids.data64F[i * 2 + 1];

        const distance = Math.hypot(cx - centerX, cy - centerY);
        const centerScore = 1.0 - Math.min(1.0, distance / maxDistance);

        let touches = 0;
        if (x <= 1) touches++;
        if (y <= 1) touches++;
        if (x + bw >= mask.cols - 1) touches++;
        if (y + bh >= mask.rows - 1) touches++;

        const score =
          areaRatio * 4.0 +
          centerScore * 1.25 -
          touches * 0.30;

        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) {
        let largestArea = -1;
        for (let i = 1; i < count; i++) {
          const area =
            stats.data32S[i * stats.cols + cv.CC_STAT_AREA];
          if (area > largestArea) {
            largestArea = area;
            bestIndex = i;
          }
        }
      }

      const out = new cv.Mat.zeros(
        mask.rows,
        mask.cols,
        cv.CV_8UC1
      );

      const labelData = labels.data32S;
      const outData = out.data;

      for (let i = 0; i < labelData.length; i++) {
        outData[i] = labelData[i] === bestIndex ? 255 : 0;
      }

      return out;
    } finally {
      deleteSafe(labels, stats, centroids);
    }
  }

  function fillLargestContour(cv, mask) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    try {
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      if (contours.size() === 0) {
        throw new Error("Fiş bölgesi bulunamadı.");
      }

      let largestIndex = 0;
      let largestArea = -1;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        try {
          const area = cv.contourArea(contour, false);
          if (area > largestArea) {
            largestArea = area;
            largestIndex = i;
          }
        } finally {
          contour.delete();
        }
      }

      const filled = new cv.Mat.zeros(
        mask.rows,
        mask.cols,
        cv.CV_8UC1
      );

      cv.drawContours(
        filled,
        contours,
        largestIndex,
        new cv.Scalar(255),
        -1
      );

      return filled;
    } finally {
      deleteSafe(contours, hierarchy);
    }
  }

  function matPointsToArray(mat) {
    const pts = [];
    const data = mat.data32S && mat.data32S.length
      ? mat.data32S
      : mat.data32F;

    for (let i = 0; i + 1 < data.length; i += 2) {
      pts.push({ x: Number(data[i]), y: Number(data[i + 1]) });
    }
    return pts;
  }

  function rotatedRectPoints(cv, rect) {
    if (cv.RotatedRect && typeof cv.RotatedRect.points === "function") {
      return cv.RotatedRect.points(rect).map((p) => ({
        x: Number(p.x),
        y: Number(p.y),
      }));
    }

    // Evrensel fallback: rotated rectangle köşelerini matematikle çıkar.
    const angle = rect.angle * Math.PI / 180.0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const hw = rect.size.width / 2.0;
    const hh = rect.size.height / 2.0;

    const local = [
      [-hw, -hh],
      [ hw, -hh],
      [ hw,  hh],
      [-hw,  hh],
    ];

    return local.map(([x, y]) => ({
      x: rect.center.x + x * cosA - y * sinA,
      y: rect.center.y + x * sinA + y * cosA,
    }));
  }

  function contourToQuad(cv, mask) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    try {
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      if (contours.size() === 0) {
        throw new Error("Fiş konturu bulunamadı.");
      }

      let largestIndex = 0;
      let largestArea = -1;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        try {
          const area = cv.contourArea(contour, false);
          if (area > largestArea) {
            largestArea = area;
            largestIndex = i;
          }
        } finally {
          contour.delete();
        }
      }

      const imageArea = mask.cols * mask.rows;
      if (largestArea / imageArea < 0.08) {
        throw new Error("Bulunan fiş alanı çok küçük.");
      }

      const contour = contours.get(largestIndex);
      const hull = new cv.Mat();

      try {
        cv.convexHull(contour, hull, false, true);

        const perimeter = cv.arcLength(hull, true);
        const epsilons = [
          0.010, 0.0125, 0.015, 0.0175,
          0.020, 0.025, 0.030, 0.040, 0.050
        ];

        for (const epsilon of epsilons) {
          const approx = new cv.Mat();
          try {
            cv.approxPolyDP(
              hull,
              approx,
              epsilon * perimeter,
              true
            );

            if (approx.rows === 4) {
              const candidateArea = Math.abs(
                cv.contourArea(approx, false)
              );

              if (candidateArea / imageArea >= 0.08) {
                return matPointsToArray(approx);
              }
            }
          } finally {
            approx.delete();
          }
        }

        const rect = cv.minAreaRect(hull);
        return rotatedRectPoints(cv, rect);
      } finally {
        deleteSafe(contour, hull);
      }
    } finally {
      deleteSafe(contours, hierarchy);
    }
  }

  function orderPoints(points) {
    if (!points || points.length !== 4) {
      throw new Error("Perspektif için 4 köşe gerekli.");
    }

    const sums = points.map((p) => p.x + p.y);
    const diffs = points.map((p) => p.x - p.y);

    const minIndex = (arr) =>
      arr.reduce((best, value, i) =>
        value < arr[best] ? i : best, 0);

    const maxIndex = (arr) =>
      arr.reduce((best, value, i) =>
        value > arr[best] ? i : best, 0);

    // sum: TL min, BR max
    // x-y: TR max, BL min
    return [
      points[minIndex(sums)],
      points[maxIndex(diffs)],
      points[maxIndex(sums)],
      points[minIndex(diffs)],
    ];
  }

  function fourPointTransform(cv, original, points, inverseScale) {
    const scaled = points.map((p) => ({
      x: Math.max(0, Math.min(original.cols - 1, p.x * inverseScale)),
      y: Math.max(0, Math.min(original.rows - 1, p.y * inverseScale)),
    }));

    const [tl, tr, br, bl] = orderPoints(scaled);

    const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
    const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const maxWidth = Math.max(2, Math.round(Math.max(widthBottom, widthTop)));

    const heightRight = Math.hypot(tr.x - br.x, tr.y - br.y);
    const heightLeft = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const maxHeight = Math.max(2, Math.round(Math.max(heightRight, heightLeft)));

    const srcPts = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y,
      ]
    );

    const dstPts = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      [
        0, 0,
        maxWidth - 1, 0,
        maxWidth - 1, maxHeight - 1,
        0, maxHeight - 1,
      ]
    );

    const matrix = cv.getPerspectiveTransform(srcPts, dstPts);
    const warped = new cv.Mat();

    try {
      cv.warpPerspective(
        original,
        warped,
        matrix,
        new cv.Size(maxWidth, maxHeight),
        cv.INTER_CUBIC,
        cv.BORDER_REPLICATE,
        new cv.Scalar()
      );

      return warped.clone();
    } finally {
      deleteSafe(srcPts, dstPts, matrix, warped);
    }
  }

  function autoRotatePortrait(cv, image) {
    if (image.cols <= image.rows * 1.25) {
      return image.clone();
    }

    const rotated = new cv.Mat();
    cv.rotate(image, rotated, cv.ROTATE_90_CLOCKWISE);
    return rotated;
  }

  function enhanceGray(cv, image) {
    const gray = new cv.Mat();

    if (image.channels() === 4) {
      cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);
    } else if (image.channels() === 3) {
      cv.cvtColor(image, gray, cv.COLOR_RGB2GRAY);
    } else {
      image.copyTo(gray);
    }

    if (typeof cv.createCLAHE === "function") {
      const out = new cv.Mat();
      const clahe = new cv.CLAHE(1.7, new cv.Size(8, 8));

      try {
        clahe.apply(gray, out);
        return out.clone();
      } finally {
        deleteSafe(gray, out, clahe);
      }
    }

    return gray;
  }

  function matToJpegBase64(cv, mat, quality = 0.92) {
    const canvas = document.createElement("canvas");
    cv.imshow(canvas, mat);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.substring(dataUrl.indexOf(",") + 1);
  }

  async function scanBase64(base64) {
    const cv = await waitForOpenCv();

    const blob = base64ToBlob(base64);
    const image = await blobToImage(blob);

    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = image.naturalWidth || image.width;
    inputCanvas.height = image.naturalHeight || image.height;

    const ctx = inputCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    let srcRgba = null;
    let srcRgb = null;
    let small = null;
    let smallRgb = null;
    let rawMask = null;
    let cleaned = null;
    let central = null;
    let filled = null;
    let warped = null;
    let portrait = null;
    let enhanced = null;

    try {
      srcRgba = cv.imread(inputCanvas);
      srcRgb = new cv.Mat();
      cv.cvtColor(srcRgba, srcRgb, cv.COLOR_RGBA2RGB);

      const resized = resizeForAnalysis(cv, srcRgb, 700);
      small = resized.mat;

      smallRgb = small.clone();

      rawMask = grabCutBinaryMask(cv, smallRgb);
      cleaned = morphClean(cv, rawMask);
      central = largestCentralComponent(cv, cleaned);
      filled = fillLargestContour(cv, central);

      const quad = contourToQuad(cv, filled);

      warped = fourPointTransform(
        cv,
        srcRgb,
        quad,
        1.0 / resized.scale
      );

      portrait = autoRotatePortrait(cv, warped);
      enhanced = enhanceGray(cv, portrait);

      const jpegBase64 = matToJpegBase64(cv, enhanced, 0.92);

      return {
        ok: true,
        detected: true,
        jpegBase64,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        detected: false,
        jpegBase64: null,
        error:
          error && error.message
            ? error.message
            : String(error),
      };
    } finally {
      deleteSafe(
        srcRgba,
        srcRgb,
        small,
        smallRgb,
        rawMask,
        cleaned,
        central,
        filled,
        warped,
        portrait,
        enhanced
      );
    }
  }

  window.receiptScanner = {
    scanBase64,
  };
})();
