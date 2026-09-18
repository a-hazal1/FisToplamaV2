import 'dart:async';
import 'dart:js' as js;
import 'dart:typed_data';

class ScanResultData {
  final Uint8List scannedBytes;
  final Uint8List originalBytes;
  final double confidence;

  const ScanResultData({
    required this.scannedBytes,
    required this.originalBytes,
    required this.confidence,
  });
}

class ReceiptNotDetectedException implements Exception {
  final String message;

  const ReceiptNotDetectedException(this.message);

  @override
  String toString() => message;
}

class ScannerService {
  Future<ScanResultData> process({
    required String path,
    required Uint8List originalBytes,
  }) {
    final completer = Completer<ScanResultData>();

    try {
      final scanner = js.context['receiptScanner'];

      if (scanner == null) {
        throw const ReceiptNotDetectedException(
          'Web tarama motoru yüklenemedi. Sayfayı yenileyip tekrar dene.',
        );
      }

      final onSuccess = js.allowInterop(
        (dynamic rawBytes, dynamic rawConfidence) {
          if (completer.isCompleted) return;

          try {
            final bytes = Uint8List.fromList(
              List<int>.from(rawBytes),
            );

            final confidence = rawConfidence is num
                ? rawConfidence.toDouble()
                : 0.0;

            completer.complete(
              ScanResultData(
                scannedBytes: bytes,
                originalBytes: originalBytes,
                confidence: confidence,
              ),
            );
          } catch (e) {
            completer.completeError(
              ReceiptNotDetectedException(
                'Web tarama çıktısı okunamadı: $e',
              ),
            );
          }
        },
      );

      final onError = js.allowInterop((dynamic rawError) {
        if (completer.isCompleted) return;

        final text = rawError?.toString() ?? 'Bilinmeyen hata';

        if (text.contains('NO_DOCUMENT')) {
          completer.completeError(
            const ReceiptNotDetectedException(
              'Fişin dört kenarı algılanamadı. '
              'Fişi kontrastlı bir zemine koyup dört köşesi görünür olacak şekilde tekrar dene.',
            ),
          );
          return;
        }

        if (text.contains('OPENCV_LOAD')) {
          completer.completeError(
            const ReceiptNotDetectedException(
              'OpenCV web tarama motoru yüklenemedi. '
              'Sayfayı yenileyip tekrar dene.',
            ),
          );
          return;
        }

        completer.completeError(
          ReceiptNotDetectedException(
            'Web fiş taraması başarısız: $text',
          ),
        );
      });

      scanner.callMethod(
        'processReceiptWithCallbacks',
        [
          List<int>.from(originalBytes),
          onSuccess,
          onError,
        ],
      );
    } catch (e) {
      if (!completer.isCompleted) {
        completer.completeError(
          e is ReceiptNotDetectedException
              ? e
              : ReceiptNotDetectedException(
                  'Web fiş taraması başlatılamadı: $e',
                ),
        );
      }
    }

    return completer.future;
  }
}
