# 📈 Kurumsal Temel Değerleme Terminali (Fintables Görünümü)

Next.js 16, Google Gemini API (`@google/genai`) ve Recharts ile geliştirilmiş; çok yıllık finansal faaliyet raporlarını (2022–2026) tarayan, dinamik büyüme/marj trendlerini görselleştiren ve fon yöneticisi standartlarında yatırım tezleri üreten kurumsal değerleme terminali.

---

## ✨ Özellikler

* **Çok Yıllı Veri Ayıklama:** Birden fazla faaliyet raporu ve finansal tabloyu (PDF) yükleyerek 5+ yıllık zaman serisi (Hasılat, FAVÖK, Net Kâr, Nakit Akışları, Borçluluk, ROIC, WACC) çıkarma.
* **Fintables Finansal Tabloları:** Gelir Tablosu, Marjlar, Nakit Akışları, Borçluluk ve Sermaye Verimliliği bölümlerinde dönemsel artış/azalış (YoY) rozetleri (`▲ +%` / `▼ -%`).
* **Dinamik Grafik Terminali:** 
  * Hasılat & FAVÖK Trendi (Büyüme Dinamikleri)
  * Kârlılık Marjları Evrimi (Brüt, FAVÖK ve Net Marj)
  * Sermaye Verimliliği (ROIC vs. WACC - Ekonomik Değer Yaratımı)
  * Nakit Akış Kalitesi (İşletme Nakit Akışı vs. Net Kâr)
* **Yönetim Rehberlik Karnesi:** Şirketin geçmiş yıllarda verdiği hedefleri tutturup tutturamadığının başarı analizi.
* **Çeyreklik Skor & Karar Evrimi:** Her yeni çeyrek bilançosunda kalite skoru değişiminin ve yatırım kararının (`AL` / `ALMA` / `NÖTR`) takibi.
* **Hedge Fund Değerleme Raporu:** DuPont analizi, ROIC vs WACC makası ve serbest nakit akışı odaklı detaylı kurumsal analiz.

---

## 🚀 Yerel Kurulum (Local Development)

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Ortam değişkenlerini tanımlayın:**
   `.env.local` dosyası oluşturun ve Gemini API anahtarınızı ekleyin:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```

3. **Geliştirme sunucusunu başlatın:**
   ```bash
   npm run dev
   ```
   Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin.

---

## 🌐 Canlıya Alma (Vercel Deployment)

En hızlı ve sorunsuz canlıya alma yöntemi **Vercel**'dir:

1. Bu projeyi GitHub hesabınıza pushlayın.
2. [Vercel](https://vercel.com) paneline gidin ve **"Add New Project"** seçeneğine tıklayın.
3. GitHub deponuzu seçin ve içe aktarın.
4. **Environment Variables** bölümüne:
   * Key: `GEMINI_API_KEY`
   * Value: `Google Gemini API Anahtarınız`
5. **"Deploy"** butonuna basın. Projeniz 1-2 dakika içinde canlıya alınacaktır.
