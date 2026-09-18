(function () {
  let cvInstance = null;
  let cvLoadingPromise = null;

  async function getReadyCv(timeoutMs = 30000) {
    if (cvInstance && cvInstance.Mat) {
      return cvInstance;
    }

    if (cvLoadingPromise) {
      return cvLoadingPromise;
    }

    cvLoadingPromise = new Promise(async (resolve, reject) => {
      const startedAt = Date.now();

      try {
        // OpenCV scripti index.html tarafından henüz eklenmemişse
        // burada fallback olarak yükle.
        let script = document.querySelector(
          'script[src*="opencv.js"]'
        );

        if (!script) {
          script = document.createElement('script');

          script.src =
            'https://docs.opencv.org/4.10.0/opencv.js';

          script.async = true;

          script.setAttribute(
            'data-fistoplama-opencv',
            '1'
          );

          document.head.appendChild(script);
        }

        while (Date.now() - startedAt < timeoutMs) {
          if (window.cv) {
            let candidate = window.cv;

            /*
             * Bazı OpenCV.js sürümlerinde cv doğrudan object,
             * bazı sürümlerde Promise/thenable olarak geliyor.
             */
            if (
              candidate &&
              typeof candidate.then === 'function'
            ) {
              try {
                candidate = await candidate;

                if (candidate) {
                  window.cv = candidate;
                }
              } catch (e) {
                // Henüz runtime hazır olmayabilir.
              }
            }

            if (
              candidate &&
              typeof candidate.Mat === 'function'
            ) {
              cvInstance = candidate;

              resolve(candidate);
              return;
            }

            /*
             * cv object oluşmuş ama runtime henüz tamamlanmamışsa
             * biraz daha bekle.
             */
            if (
              candidate &&
              candidate.calledRun === true &&
              typeof candidate.Mat === 'function'
            ) {
              cvInstance = candidate;

              resolve(candidate);
              return;
            }
          }

          await new Promise((r) => {
            setTimeout(r, 150);
          });
        }

        reject(
          new Error(
            'OPENCV_LOAD_TIMEOUT'
          )
        );
      } catch (e) {
        reject(
          new Error(
            'OPENCV_LOAD_FAILED: ' +
              (e?.message ?? e)
          )
        );
      }
    });

    try {
      return await cvLoadingPromise;
    } catch (e) {
      cvLoadingPromise = null;
      throw e;
    }
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
      sums.indexOf(
        Math.min(...sums)
      )
    ];

    const br = points[
      sums.indexOf(
        Math.max(...sums)
      )
    ];

    const tr = points[
      diffs.indexOf(
        Math.max(...diffs)
      )
    ];

    const bl = points[
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

  async function canvasToBytes(
    canvas
  ) {
    const blob =
      await new Promise(
        (resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(
                  new Error(
                    'OUTPUT_BLOB_FAILED'
                  )
                );
              }
            },
            'image/jpeg',
            0.94
          );
        }
      );

    const buffer =
      await blob.arrayBuffer();

    return Array.from(
      new Uint8Array(buffer)
    );
  }

  async function processReceipt(
    rawBytes
  ) {
    const cv =
      await getReadyCv();

    if (
      !cv ||
      typeof cv.Mat !== 'function'
    ) {
      throw new Error(
        'OPENCV_LOAD'
      );
    }

    const inputBytes =
      Uint8Array.from(
        rawBytes
      );

    const blob =
      new Blob(
        [inputBytes]
      );

    let bitmap;

    try {
      bitmap =
        await createImageBitmap(
          blob
        );
    } catch (e) {
      throw new Error(
        'IMAGE_DECODE_FAILED'
      );
    }

    /*
     * Çok büyük fotoğrafları küçült.
     * Hem tarayıcıyı rahatlatır hem OpenCV işlemini hızlandırır.
     */
    const maxSide = 1800;

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
      document.createElement(
        'canvas'
      );

    canvas.width =
      width;

    canvas.height =
      height;

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

    let bestPoints = null;
    let bestArea = 0;

    try {
      /*
       * 1. Gri tonlama
       */
      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      );

      /*
       * 2. Gürültüyü azalt
       */
      cv.GaussianBlur(
        gray,
        blur,
        new cv.Size(
          5,
          5
        ),
        0,
        0,
        cv.BORDER_DEFAULT
      );

      /*
       * 3. Kenar tespiti
       */
      cv.Canny(
        blur,
        edges,
        35,
        135
      );

      /*
       * 4. Kopuk kenarları
       * biraz birleştir.
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
        new cv.Point(
          -1,
          -1
        ),
        2
      );

      kernel.delete();

      /*
       * 5. Konturları bul
       */
      cv.findContours(
        edges,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE
      );

      const imageArea =
        width *
        height;

      /*
       * Fiş fotoğrafın sadece
       * %1.5'ini kaplasa bile
       * değerlendirmeye al.
       */
      const minArea =
        imageArea *
        0.015;

      for (
        let i = 0;
        i <
        contours.size();
        i++
      ) {
        const cnt =
          contours.get(i);

        try {
          const area =
            Math.abs(
              cv.contourArea(
                cnt
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
              cnt,
              true
            );

          /*
           * Tek toleransa güvenmiyoruz.
           * Fiş kıvrılmış / gölgeli olabilir.
           */
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
            const tolerance
            of tolerances
          ) {
            const approx =
              new cv.Mat();

            try {
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
                const points =
                  [];

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
          cnt.delete();
        }
      }

      /*
       * Tam dörtgen bulunamadıysa
       * ikinci yöntem:
       * en büyük konturun bounding box'ını dene.
       *
       * Bu sayede fişin bir kenarı çok silikse
       * tamamen başarısız olmak yerine
       * yine kırpma şansı verir.
       */
      if (!bestPoints) {
        let largestRect = null;
        let largestRectArea = 0;

        /*
         * Konturlar yukarıda delete edildiği için
         * ikinci kez contour çıkarıyoruz.
         */
        const contours2 =
          new cv.MatVector();

        const hierarchy2 =
          new cv.Mat();

        try {
          cv.findContours(
            edges,
            contours2,
            hierarchy2,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
          );

          for (
            let i = 0;
            i <
            contours2.size();
            i++
          ) {
            const cnt =
              contours2.get(i);

            try {
              const area =
                Math.abs(
                  cv.contourArea(
                    cnt
                  )
                );

              if (
                area >
                  largestRectArea &&
                area >=
                  minArea
              ) {
                const rect =
                  cv.boundingRect(
                    cnt
                  );

                largestRect =
                  rect;

                largestRectArea =
                  area;
              }
            } finally {
              cnt.delete();
            }
          }
        } finally {
          contours2.delete();
          hierarchy2.delete();
        }

        if (
          largestRect &&
          largestRect.width >
            40 &&
          largestRect.height >
            80
        ) {
          const x =
            largestRect.x;

          const y =
            largestRect.y;

          const w =
            largestRect.width;

          const h =
            largestRect.height;

          bestPoints = [
            [
              x,
              y
            ],
            [
              x + w,
              y
            ],
            [
              x + w,
              y + h
            ],
            [
              x,
              y + h
            ]
          ];

          bestArea =
            largestRectArea;
        }
      }

      if (!bestPoints) {
        throw new Error(
          'NO_DOCUMENT'
        );
      }

      const ordered =
        orderPoints(
          bestPoints
        );

      const tl =
        ordered[0];

      const tr =
        ordered[1];

      const br =
        ordered[2];

      const bl =
        ordered[3];

      /*
       * Çıktı genişliği/yüksekliği
       * dört kenardan hesaplanıyor.
       */
      const widthBottom =
        distance(
          br,
          bl
        );

      const widthTop =
        distance(
          tr,
          tl
        );

      const heightRight =
        distance(
          tr,
          br
        );

      const heightLeft =
        distance(
          tl,
          bl
        );

      const outWidth =
        Math.max(
          220,
          Math.round(
            Math.max(
              widthBottom,
              widthTop
            )
          )
        );

      const outHeight =
        Math.max(
          320,
          Math.round(
            Math.max(
              heightRight,
              heightLeft
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
         * Önce grayscale.
         */
        const scannedGray =
          new cv.Mat();

        const finalImage =
          new cv.Mat();

        try {
          cv.cvtColor(
            warped,
            scannedGray,
            cv.COLOR_RGBA2GRAY
          );

          /*
           * Kontrast iyileştirme.
           */
          cv.equalizeHist(
            scannedGray,
            scannedGray
          );

          /*
           * Görüntüyü tekrar
           * canvas için RGBA yap.
           */
          cv.cvtColor(
            scannedGray,
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

          return {
            bytes:
              outputBytes,

            confidence:
              confidence
          };
        } finally {
          scannedGray.delete();
          finalImage.delete();
        }
      } finally {
        srcPoints.delete();
        dstPoints.delete();
        transform.delete();
        warped.delete();
      }
    } finally {
      src.delete();
      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  /*
   * Flutter tarafına Promise göndermiyoruz.
   * Callback ile iletiyoruz.
   *
   * Böylece daha önce aldığın:
   *
   * a.then is not a function
   *
   * hatası oluşmaz.
   */
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
          console.error(
            'Receipt scanner error:',
            error
          );

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
      processReceiptWithCallbacks
  };

  /*
   * Sayfa açılır açılmaz
   * OpenCV'yi hazırlamaya başla.
   * Kullanıcı görsel seçene kadar
   * çoğunlukla yüklenmiş olur.
   */
  getReadyCv()
    .then(() => {
      console.log(
        'FişToplama OpenCV hazır.'
      );
    })
    .catch((error) => {
      console.error(
        'OpenCV başlangıç yükleme hatası:',
        error
      );
    });
})();
