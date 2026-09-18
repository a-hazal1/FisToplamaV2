from pathlib import Path
import shutil


# ============================================================
# WEB
# ============================================================

web_dir = Path("web")
web_index = web_dir / "index.html"

source_worker = Path(
    "scripts/opencv_worker.js"
)

target_worker = (
    web_dir /
    "opencv_worker.js"
)


if (
    web_dir.exists()
    and source_worker.exists()
):
    shutil.copy2(
        source_worker,
        target_worker,
    )


if web_index.exists():

    html = web_index.read_text(
        encoding="utf-8"
    )

    start_marker = (
        "<!-- FISTOPLAMA_SCANNER_START -->"
    )

    end_marker = (
        "<!-- FISTOPLAMA_SCANNER_END -->"
    )


    if (
        start_marker in html
        and end_marker in html
    ):
        before =
            html.split(
                start_marker
            )[0]

        after =
            html.split(
                end_marker
            )[1]

        html =
            before + after


    scanner_bridge = r"""
<!-- FISTOPLAMA_SCANNER_START -->

<script>
(function () {

  let worker = null;
  let counter = 1;

  const pending =
    new Map();


  function getWorker() {

    if (worker) {
      return worker;
    }


    worker =
      new Worker(
        'opencv_worker.js'
      );


    worker.onmessage =
      function(event) {

        const message =
          event.data;


        if (
          !message ||
          !message.id
        ) {
          return;
        }


        const request =
          pending.get(
            message.id
          );


        if (!request) {
          return;
        }


        pending.delete(
          message.id
        );


        if (
          message.ok
        ) {

          const bytes =
            Array.from(
              new Uint8Array(
                message.buffer
              )
            );


          request.onSuccess(
            bytes,
            message.confidence || 0
          );

        } else {

          request.onError(
            message.error ||
            'SCAN_FAILED'
          );

        }
      };


    worker.onerror =
      function(event) {

        const error =
          event &&
          event.message
            ? event.message
            : 'WORKER_ERROR';


        pending.forEach(
          function(request) {
            request.onError(
              error
            );
          }
        );


        pending.clear();


        try {
          worker.terminate();
        } catch (_) {
        }


        worker = null;
      };


    return worker;
  }


  function scan(
    rawBytes,
    onSuccess,
    onError
  ) {

    try {

      const activeWorker =
        getWorker();


      const bytes =
        Uint8Array.from(
          rawBytes
        );


      const id =
        'receipt_' +
        Date.now() +
        '_' +
        counter++;


      const timeout =
        setTimeout(
          function() {

            const request =
              pending.get(
                id
              );


            if (!request) {
              return;
            }


            pending.delete(
              id
            );


            request.onError(
              'SCAN_TIMEOUT'
            );

          },
          25000
        );


      pending.set(
        id,
        {
          onSuccess:
            function(
              resultBytes,
              confidence
            ) {

              clearTimeout(
                timeout
              );


              onSuccess(
                resultBytes,
                confidence
              );
            },

          onError:
            function(error) {

              clearTimeout(
                timeout
              );


              onError(
                error
              );
            }
        }
      );


      const buffer =
        bytes.buffer;


      activeWorker.postMessage(
        {
          id:
            id,

          buffer:
            buffer
        },
        [
          buffer
        ]
      );


    } catch (error) {

      onError(
        error &&
        error.message
          ? error.message
          : String(error)
      );

    }
  }


  window.receiptScanner = {
    scan: scan
  };


  console.log(
    'FişToplama scanner bridge hazır.'
  );

})();
</script>

<!-- FISTOPLAMA_SCANNER_END -->
"""


    html = html.replace(
        "</body>",
        scanner_bridge
        + "\n</body>",
    )


    web_index.write_text(
        html,
        encoding="utf-8",
    )


# ============================================================
# ANDROID
# ============================================================

manifest = Path(
    "android/app/src/main/AndroidManifest.xml"
)

if manifest.exists():

    text = manifest.read_text(
            encoding="utf-8"
        )


    permissions = [
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.CAMERA" />',
        '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    ]


    additions = ""


    for permission in permissions:

        if permission not in text:

            additions += (
                "\n    "
                + permission
            )


    if additions:

        manifest_end = text.find(
                ">"
            )


        if manifest_end != -1:

            text = (
                text[
                    :manifest_end + 1
                ]
                + additions
                + text[
                    manifest_end + 1:
                ]
            )


    manifest.write_text(
        text,
        encoding="utf-8",
    )


# ============================================================
# IOS
# ============================================================

plist = Path(
    "ios/Runner/Info.plist"
)

if plist.exists():

    text = plist.read_text(
            encoding="utf-8"
        )


    additions = """
    <key>NSCameraUsageDescription</key>
    <string>Fiş fotoğrafı çekmek için kamera erişimi gerekir.</string>

    <key>NSPhotoLibraryUsageDescription</key>
    <string>Galeriden fiş seçmek için fotoğraf erişimi gerekir.</string>
"""


    if (
        "NSCameraUsageDescription"
        not in text
    ):

        text = text.replace(
                "</dict>",
                additions
                + "\n</dict>",
            )


    plist.write_text(
        text,
        encoding="utf-8",
    )


# ============================================================
# KONTROL
# ============================================================

print(
    "Platform patch tamamlandı."
)


if web_dir.exists():

    print(
        "opencv.js:",
        (
            web_dir /
            "opencv.js"
        ).exists(),
    )


    print(
        "opencv_worker.js:",
        target_worker.exists(),
    )


    if web_index.exists():

        final_html = web_index.read_text(
                encoding="utf-8"
            )


        print(
            "receiptScanner bridge:",
            "window.receiptScanner"
            in final_html,
        )
