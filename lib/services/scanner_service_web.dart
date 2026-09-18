import 'dart:async';
import 'dart:html' as html;
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
  static Future<void>? _bridgeLoading;

  Future<void> _ensureBridgeLoaded() async {
    if (js.context['receiptScanner'] != null) {
      return;
    }

    if (_bridgeLoading != null) {
      await _bridgeLoading;
      return;
    }

    final completer = Completer<void>();
    _bridgeLoading = completer.future;

    try {
      final existing = html.document.querySelector(
        'script[data-fistoplama-scanner]',
      );

      if (existing != null) {
        final started = DateTime.now();

        while (js.context['receiptScanner'] == null) {
          if (DateTime.now()
                  .difference(started)
                  .inSeconds >
              15) {
            throw const ReceiptNotDetectedException(
              'opencv_receipt.js yüklendi ancak scanner başlatılamadı.',
            );
          }

          await Future.delayed(
            const Duration(milliseconds: 100),
          );
        }

        completer.complete();
        return;
      }

      final script = html.ScriptElement()
        ..src = 'opencv_receipt.js'
        ..type = 'text/javascript'
        ..setAttribute(
          'data-fistoplama-scanner',
          '1',
        );

      late StreamSubscription loadSubscription;
      late StreamSubscription errorSubscription;

      loadSubscription = script.onLoad.listen((_) async {
        try {
          final started = DateTime.now();

          while (js.context['receiptScanner'] == null) {
            if (DateTime.now()
                    .difference(started)
                    .inSeconds >
                10) {
              throw const ReceiptNotDetectedException(
                'opencv_receipt.js açıldı ancak receiptScanner oluşturulamadı.',
              );
            }

            await Future.delayed(
              const Duration(milliseconds: 100),
            );
          }

          await loadSubscription.cancel();
          await errorSubscription.cancel();

          if (!completer.isCompleted) {
            completer.complete();
          }
        } catch (e) {
          if (!completer.isCompleted) {
            completer.completeError(e);
          }
        }
      });

      errorSubscription = script.onError.listen((_) async {
        await loadSubscription.cancel();
        await errorSubscription.cancel();

        if (!completer.isCompleted) {
          completer.completeError(
            const ReceiptNotDetectedException(
              'opencv_receipt.js dosyası web sunucusundan yüklenemedi.',
            ),
          );
        }
      });

      html.document.head?.append(script);

      await completer.future;
    } catch (e) {
      _bridgeLoading = null;
      rethrow;
    }
  }

  Future<ScanResultData> process({
    required String path,
    required Uint8List originalBytes,
  }) async {
    await _ensureBridgeLoaded();

    final bridge = js.context['receiptScanner'];

    if (bridge == null) {
      throw const ReceiptNotDetectedException(
        'Web scanner başlatılamadı.',
      );
    }

    final completer = Completer<ScanResultData>();

    final onSuccess = js.allowInterop(
      (
        dynamic rawBytes,
        dynamic rawConfidence,
      ) {
        if (completer.isCompleted) return;

        try {
          final length =
              rawBytes['length'] as int;

          final output = <int>[];

          for (var i = 0; i < length; i++) {
            output.add(
              (rawBytes[i] as num).toInt(),
            );
          }

          final confidence =
              rawConfidence is num
                  ? rawConfidence.toDouble()
                  : 0.0;

          completer.complete(
            ScanResultData(
              scannedBytes:
                  Uint8List.fromList(output),
              originalBytes: originalBytes,
              confidence: confidence,
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
            rawError?.toString() ??
                'Bilinmeyen hata';

        if (text.contains('NO_DOCUMENT')) {
          completer.completeError(
            const ReceiptNotDetectedException(
              'Fişin dört kenarı algılanamadı. '
              'Fişi kontrastlı bir zeminde, '
              'dört köşesi görünür olacak şekilde tekrar dene.',
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

    try {
      bridge.callMethod(
        'scan',
        [
          List<int>.from(originalBytes),
          onSuccess,
          onError,
        ],
      );
    } catch (e) {
      throw ReceiptNotDetectedException(
        'Scanner çalıştırılamadı: $e',
      );
    }

    return completer.future;
  }
}
