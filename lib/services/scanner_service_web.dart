import 'dart:async';
import 'dart:convert';
import 'dart:js' as js;
import 'dart:js_util' as js_util;
import 'dart:typed_data';

export 'scanner_types.dart';
import 'scanner_types.dart';

class ReceiptScannerService {
  const ReceiptScannerService();

  Future<ScanResult> process({
    String? path,
    required Uint8List originalBytes,
  }) async {
    try {
      final scanner = js.context['receiptScanner'];
      if (scanner == null) {
        throw StateError(
          'receiptScanner bulunamadı. web/receipt_scanner.js yüklenmemiş.',
        );
      }

      final inputBase64 = base64Encode(originalBytes);

      final promise = js_util.callMethod<Object?>(
        scanner,
        'scanBase64',
        <Object?>[inputBase64],
      );

      final result = await js_util.promiseToFuture<Object?>(promise);

      if (result == null) {
        throw StateError('Web tarama sonucu boş döndü.');
      }

      final resultMap = js_util.dartify(result);

      if (resultMap is! Map) {
        throw StateError('Web tarama sonucu geçersiz.');
      }

      final ok = resultMap['ok'] == true;
      final detected = resultMap['detected'] == true;
      final outputBase64 = resultMap['jpegBase64']?.toString();
      final error = resultMap['error']?.toString();

      if (!ok || outputBase64 == null || outputBase64.isEmpty) {
        return ScanResult(
          originalBytes: originalBytes,
          scannedBytes: originalBytes,
          detected: false,
          error: error ?? 'Fiş taranamadı.',
        );
      }

      return ScanResult(
        originalBytes: originalBytes,
        scannedBytes: base64Decode(outputBase64),
        detected: detected,
        error: error,
      );
    } catch (e) {
      return ScanResult(
        originalBytes: originalBytes,
        scannedBytes: originalBytes,
        detected: false,
        error: e.toString(),
      );
    }
  }
}
