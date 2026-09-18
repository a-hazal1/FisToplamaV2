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
      final bridge = js.context['receiptScanner'];

      if (bridge == null) {
        throw const ReceiptNotDetectedException(
          'Web tarama sistemi başlatılamadı.',
        );
      }

      final onSuccess = js.allowInterop(
        (
          dynamic rawBytes,
          dynamic rawConfidence,
        ) {
          if (completer.isCompleted) return;

          try {
            final length = rawBytes['length'] as int;

            final output = <int>[];

            for (var i = 0; i < length; i++) {
              output.add(
                (rawBytes[i] as num).toInt(),
              );
            }

            completer.complete(
              ScanResultData(
                scannedBytes: Uint8List.fromList(output),
                originalBytes: originalBytes,
                confidence: rawConfidence is num
                    ? rawConfidence.toDouble()
                    : 0.0,
              ),
            );
          } catch (e) {
            completer.completeError(
              ReceiptNotDetectedException(
                'Tarama sonucu okunamadı: $e',
              ),
            );
          }
        },
      );

      final onError = js.allowInterop(
        (dynamic rawError) {
          if (completer.isCompleted) return;

          final text =
              rawError?.toString() ?? 'Bilinmeyen hata';

          if (text.contains('NO_DOCUMENT')) {
            completer.completeError(
              const ReceiptNotDetectedException(
                'Fişin dört kenarı algılanamadı. '
                'Fişin tamamını kadraja alıp tekrar dene.',
              ),
            );
            return;
          }

          if (text.contains('OPENCV')) {
            completer.completeError(
              ReceiptNotDetectedException(
                'OpenCV başlatılamadı: $text',
              ),
            );
            return;
          }

          completer.completeError(
            ReceiptNotDetectedException(
              'Web tarama hatası: $text',
            ),
          );
        },
      );

      bridge.callMethod(
        'scan',
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
                  'Tarama başlatılamadı: $e',
                ),
        );
      }
    }

    return completer.future;
  }
}
