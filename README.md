# 📈 Fair Value | Kurumsal Temel Değerleme Terminali

Next.js 16, Google Gemini API (`@google/genai`), Supabase PostgreSQL ve Recharts ile geliştirilmiş; çok yıllık finansal faaliyet raporlarını (2022–2026) tarayan, dinamik büyüme/marj trendlerini görselleştiren, hisseleri liderlik puanına göre sıralayan ve kurumsal yatırım tezleri üreten temel değerleme terminali.

---

## ✨ Özellikler

* **Çok Yıllı Veri Ayıklama:** Birden fazla faaliyet raporu ve finansal tabloyu (PDF) yükleyerek 5+ yıllık zaman serisi (Hasılat, FAVÖK, Net Kâr, Nakit Akışları, Borçluluk, ROIC, WACC) çıkarma.
* **Kurumsal Finansal Tablolar:** Gelir Tablosu, Marjlar, Nakit Akışları, Borçluluk ve Sermaye Verimliliği bölümlerinde dönemsel artış/azalış (YoY) rozetleri (`▲ +%` / `▼ -%`).
* **Hisse Sıralama & Liderlik Paneli:**
  * **Öncelikli Sıralama:** Önce `AL` tavsiyeli hisseler, ardından `NÖTR` ve `ALMA`.
  * **Model Skoru:** Kendi içinde azalan (100 üzerinden) puan sıralaması.
  * Hızlı arama, filtreleme, KPI kartları ve madalyalı sıralama listesi.
* **Dinamik Grafik Terminali:** 
  * Hasılat & FAVÖK Trendi (Büyüme Dinamikleri)
  * Kârlılık Marjları Evrimi (Brüt, FAVÖK ve Net Marj)
  * Sermaye Verimliliği (ROIC vs. WACC - Ekonomik Değer Yaratımı)
  * Nakit Akış Kalitesi (İşletme Nakit Akışı vs. Net Kâr)
* **Yönetim Rehberlik Karnesi:** Şirketin geçmiş yıllarda verdiği hedefleri tutturup tutturamadığının başarı analizi.
* **Rapor Yönetimi & Silme:** İhtiyaç halinde tek tıkla rapor silme desteği (detay sayfası, liderlik tablosu ve sol arşiv menüsünden).
* **Supabase Bulut Senkronizasyonu:** Raporların tüm cihazlarınızdan (farklı bilgisayarlar, tablet ve telefonlar) ortak olarak erişilebilir olması.

---

## 🗄️ Supabase Bulut Veritabanı Kurulumu (3 Adımda)

Farklı bilgisayarlardan girdiğinizde analizlerinizi ortak bir havuzda görmek için ücretsiz bir **Supabase** veritabanı bağlayabilirsiniz:

1. [Supabase](https://supabase.com) üzerinde ücretsiz bir proje oluşturun.
2. Sol menüden **SQL Editor** bölümüne girip aşağıdaki SQL kodunu yapıştırın ve **Run** butonuna basın:
   ```sql
   create table if not exists valuation_reports (
     id text primary key,
     ticker text not null,
     price text,
     created_at text,
     period text,
     report text,
     decision text,
     score text,
     extracted_data jsonb,
     updated_at timestamp with time zone default timezone('utc'::text, now()) not null
   );

   alter table valuation_reports enable row level security;
   create policy "Allow all operations for anon" on valuation_reports for all using (true) with check (true);
   ```
3. Supabase **Project Settings -> API** sayfasından `Project URL` ve `anon / public key` bilgilerini alın.
   * Vercel panelinizde projenizin **Settings -> Environment Variables** kısmına veya yerel geliştirme için `.env.local` dosyasına ekleyin:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://projeniz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

---

## 🚀 Yerel Kurulum (Local Development)

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Ortam değişkenlerini tanımlayın:**
   `.env.local` dosyası oluşturun ve anahtarlarınızı ekleyin:
   ```env
   GEMINI_API_KEY=AIzaSy...
   NEXT_PUBLIC_SUPABASE_URL=https://...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

3. **Geliştirme sunucusunu başlatın:**
   ```bash
   npm run dev
   ```
   Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin.

---

## 🌐 Canlıya Alma (Vercel Deployment)

1. Bu projeyi GitHub hesabınıza pushlayın.
2. [Vercel](https://vercel.com) paneline gidin ve deponuzu seçin.
3. **Environment Variables** bölümüne:
   * `GEMINI_API_KEY`: Google Gemini API Anahtarınız
   * `NEXT_PUBLIC_SUPABASE_URL`: Supabase Proje URL'iniz (Opsiyonel / Bulut Senkronizasyonu için)
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Anahtarınız (Opsiyonel / Bulut Senkronizasyonu için)
4. **"Deploy"** butonuna basın.
