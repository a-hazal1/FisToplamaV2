from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "web" / "opencv.js"

URLS = [
    "https://docs.opencv.org/4.x/opencv.js",
]

if TARGET.exists() and TARGET.stat().st_size > 1_000_000:
    print(f"opencv.js zaten var: {TARGET}")
    raise SystemExit(0)

last_error = None

for url in URLS:
    try:
        print(f"OpenCV.js indiriliyor: {url}")
        req = Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urlopen(req, timeout=120) as response:
            data = response.read()

        if len(data) < 1_000_000:
            raise RuntimeError(
                f"İndirilen opencv.js beklenenden küçük: {len(data)} byte"
            )

        TARGET.write_bytes(data)
        print(f"Tamam: {TARGET} ({len(data)} byte)")
        break

    except Exception as exc:
        last_error = exc
else:
    raise RuntimeError(
        f"opencv.js indirilemedi: {last_error}"
    )
