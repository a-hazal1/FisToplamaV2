# FisToplamaV2 – Python algoritmasının web entegrasyonu

Bu paket, masaüstünde çalışan Python/OpenCV akışını web tarafına taşır:

1. GrabCut ile foreground çıkarma
2. Morphological close/open
3. Merkeze yakın en büyük connected component
4. En büyük dış kontur
5. Convex hull
6. approxPolyDP ile 4 köşe
7. Gerekirse minAreaRect fallback
8. Perspective transform
9. Portrait rotation
10. CLAHE grayscale çıktı

## Dosyalar

- `web/receipt_scanner.js`
- `lib/services/scanner_service_web.dart`
- `lib/services/scanner_service.dart`
- `lib/services/scanner_types.dart`
- `scripts/fetch_opencv.py`

## Uygulama

1. Bu dosyaları aynı yollarla projeye kopyala.
2. Çalışan `scanner_service_mobile.dart` dosyana dokunma.
3. `web/index.html` için `web/INDEX_HTML_EKLE.txt` içindeki scriptleri ekle.
4. GitHub Actions'a `.github/workflows/WORKFLOW_EKLE.txt` içindeki OpenCV indirme adımını ekle.
5. `flutter clean`
6. `flutter pub get`
7. `python scripts/fetch_opencv.py`
8. `flutter run -d chrome`

## Neden Python dosyasını direkt çalıştırmıyoruz?

Flutter Web, Python runtime çalıştırmaz. Bu nedenle çalışan Python algoritmasının OpenCV fonksiyonları,
OpenCV.js karşılıklarıyla aynı sırada uygulanmıştır.

## Önemli

`cv.grabCut(..., GC_INIT_WITH_MASK)` OpenCV.js'te `null` Rect ile sorun çıkarabildiği için
boş `new cv.Rect()` kullanılmıştır.

Bu entegrasyonda eski Canny tabanlı web scanner kullanılmaz.
