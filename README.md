# FişToplama Pro v2

Bu sürümde OCR yok. Mobilde fişin dört kenarı otomatik bulunur, perspektif düzeltilir ve enhance filtresiyle taranmış belge görünümüne çevrilir. Ham fotoğraf da ayrıca saklanır.

## Özellikler
- Supabase e-posta/şifre giriş
- Admin / Yönetici / Personel rolleri
- Şube ataması
- Admin kullanıcı yönetimi
- Android + iOS otomatik kenar algılama ve perspektif düzeltme
- Merkezi private Storage arşivi
- RLS yetkilendirmesi
- 1 A4'e 6 fiş (2x3)
- Responsive web yönetim paneli

## Kurulum
1. Supabase'de yeni proje oluştur.
2. `supabase/migrations/001_initial.sql` dosyasını SQL Editor'de çalıştır.
3. Authentication > Users > Add user ile ilk kullanıcıyı oluştur.
4. SQL Editor'de bu kullanıcıyı admin yap:
```sql
update public.profiles set full_name='Admin', role='admin', active=true where email='SENIN_MAILIN';
```
5. Admin ekranından kullanıcı eklemek için Edge Function deploy et:
```bash
supabase login
supabase link --project-ref PROJE_REF
supabase functions deploy create-user
```
6. GitHub > Settings > Secrets and variables > Actions içine:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   ekle.
7. Dosyaları repo köküne yükle. Actions Android APK + Web + iOS unsigned build üretir.

## Tarama
- Android: OpenCV tabanlı köşe algılama.
- iOS: Apple Vision tabanlı köşe algılama.
- Web: dosya yükleme var; native otomatik kırpma bu sürümde mobilde çalışır.
- OCR kullanılmaz.

## Güvenlik
Service Role Key istemciye veya GitHub `SUPABASE_ANON_KEY` yerine kesinlikle konmaz. `create-user` fonksiyonunda sunucu tarafında kullanılır.
