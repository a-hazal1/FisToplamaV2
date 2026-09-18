import 'dart:async';
import 'dart:js' as js;
import 'dart:typed_data';

class ScanResultData {
  final Uint8List scannedBytes; final Uint8List originalBytes; final double confidence;
  const ScanResultData({required this.scannedBytes,required this.originalBytes,required this.confidence});
}
class ReceiptNotDetectedException implements Exception {
  final String message; const ReceiptNotDetectedException(this.message);
  @override String toString()=>message;
}
class ScannerService {
  Future<ScanResultData> process({required String path,required Uint8List originalBytes}) {
    final completer=Completer<ScanResultData>();
    try{
      final bridge=js.context['receiptScanner'];
      if(bridge==null) throw const ReceiptNotDetectedException('Web tarama bileşeni yüklenemedi. opencv_receipt.js build içine eklenmemiş.');
      final ok=js.allowInterop((dynamic raw,dynamic conf){
        if(completer.isCompleted)return;
        try{
          final len=(raw['length'] as num).toInt(); final values=<int>[];
          for(var i=0;i<len;i++){ values.add((raw[i] as num).toInt()); }
          completer.complete(ScanResultData(scannedBytes:Uint8List.fromList(values),originalBytes:originalBytes,confidence:conf is num?conf.toDouble():0));
        }catch(e){completer.completeError(ReceiptNotDetectedException('Web tarama çıktısı okunamadı: $e'));}
      });
      final err=js.allowInterop((dynamic e){
        if(completer.isCompleted)return; final m=e?.toString()??'Bilinmeyen hata';
        completer.completeError(ReceiptNotDetectedException(m.contains('NO_DOCUMENT')?'Fişin dört kenarı algılanamadı. Kontrastlı zeminde dört köşeyi görünür bırak.':'Web taraması başarısız: $m'));
      });
      bridge.callMethod('scan',[List<int>.from(originalBytes),ok,err]);
    }catch(e){ if(!completer.isCompleted) completer.completeError(e is ReceiptNotDetectedException?e:ReceiptNotDetectedException('Web taraması başlatılamadı: $e')); }
    return completer.future;
  }
}
