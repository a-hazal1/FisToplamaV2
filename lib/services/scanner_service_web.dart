import 'dart:js' as js;
import 'dart:js_util' as js_util;
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
  }) async {
    try {
      final scanner = js.context['receiptScanner'];

      if (scanner == null) {
        throw const ReceiptNotDetectedException(
          'Web tarama motoru yüklenemedi. Sayfayı yenileyip tekrar dene.',
        );
      }

      final promise = scanner.callMethod(
        'processReceipt',
        [List<int>.from(originalBytes)],
      );

      final dynamic result =
          await js_util.promiseToFuture<dynamic>(promise);

      final dynamic rawBytes =
          js_util.getProperty(result, 'bytes');

      final dynamic rawConfidence =
          js_util.getProperty(result, 'confidence');

      final bytes = Uint8List.fromList(
        List<int>.from(rawBytes as List),
      );

      return ScanResultData(
        scannedBytes: bytes,
        originalBytes: originalBytes,
        confidence: (rawConfidence as num?)?.toDouble() ?? 0.0,
      );
    } catch (e) {
      if (e is ReceiptNotDetectedException) rethrow;

      final text = e.toString();

      if (text.contains('NO_DOCUMENT')) {
        throw const ReceiptNotDetectedException(
          'Fişin dört kenarı web üzerinde algılanamadı. Fişi kontrastlı bir zeminde, dört köşesi görünür olacak şekilde tekrar seç.',
        );
      }

      if (text.contains('OPENCV_LOAD')) {
        throw const ReceiptNotDetectedException(
          'OpenCV web tarama motoru yüklenemedi. İnternet bağlantısını kontrol edip sayfayı yenile.',
        );
      }

      throw ReceiptNotDetectedException(
        'Web fiş taraması başarısız: $text',
      );
    }
  }
}
