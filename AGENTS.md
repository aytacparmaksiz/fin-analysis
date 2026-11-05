<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MANDATORY INSTITUTIONAL FORENSIC AUDIT & VALUATION PROTOCOL (OTOMATİK ADLİ DENETİM STANDARDI)

Tüm hisse senedi analizlerinde, sektör stres testlerinde ve değerleme çalışmalarında bu protokol KULLANICI HATIRLATMASI OLMADAN OTOMATİK OLARAK DEVREDEDİR. İstisnası yoktur.

## 1. DÖRT BOYUTLU ADLİ STRES MATRİSİ ZORUNLULUĞU (4-PILLAR FORENSIC MATRIX)
Herhangi bir hisse senedi hakkında karar (AL / NÖTR / ALMA) veya hedef fiyat telaffuz edilmeden önce şu 4 boyutlu veri matrisi eksiksiz incelenmeli ve rapora dökülmelidir:
1. **Gelir Tablosu ve Kârlılık Trendi:** Son 4-5 çeyreğin net kâr/zarar serisi, brüt kâr marjı, FAVÖK marjı ve net marj trendi.
2. **Sermaye Verimliliği ve Değer Yaratımı:** Reel ROIC vs. WACC karşılaştırması ve EVA Makası (Economic Value Added Spread). Negatif ROIC ve sermaye maliyetinin altındaki şirketler sermaye erozyonu olarak işaretlenmelidir.
3. **Nakit Akışı Kaynak Ayrıştırması:** Faaliyet nakit akışının kaynağı adli olarak ayrıştırılmalıdır: Nakit operasyonel kârdan mı geliyor, yoksa tedarikçi vadelerinin açılmasından / işletme sermayesi borçlanmasından (`working_capital_change`) mı? Nakit akışının >= %70'i işletme sermayesinden gelen ve net zarardaki şirketler "Nakit İneği" DEĞİL, "Tedarikçi Borcuyla Yaşayan Değer Tuzağı" sayılır.
4. **Bilanço Sağlığı ve Likidite:** Net Borç / Nakit pozisyonu, LTV, Finansal Yatırımlar, kısa vadeli borç baskısı.

## 2. KESİN YASAKLAR & ACELECİ GENELLEME ENGELİ
- **Tek Rasyoya Dayalı Karar Yasağı:** Tek bir rasyo (örneğin sadece nakit akışı veya sadece düşük PD/DD) yüksek diye bir hisseye doğrudan "AL" denemez, değer tuzağı tırpanı kaldırılamaz.
- **Doğrulanmamış Karar Önerisi Yasağı:** Ham hesaplama adli süzgeçten geçirilmeden sohbet ortamında alelacele "GÜÇLÜ AL" veya karar değişikliği önerilemez.
- **Sıfır Sugarcoating (Göz Boyama Yasağı):** "Haklısınız, harika tespit" gibi laf kalabalıkları kesinlikle yasaktır; doğrudan soğuk finansal rakamlar, kanıtlar ve çelişkiler sunulur.

## 3. ZORUNLU KIRMIZI TAKIM & ANALİST RAPORU YATIRIM TEZİ ENTEGRASYONU
- Bir hisse ne kadar iskontolu görünürse görünsün, analist raporu ve sunum içerisinde **"Ayı Senaryosu & Değer Tuzağı Riskleri"** en az 3 somut, sayısal gerekçeyle (daralan marjlar, negatif EVA, tedarikçi borçlanması vb.) açıkça yatırım tezine işlenmelidir.
- Bu somut gerekçeler Analist Raporu metin senkronizasyonuna (`syncReportTextWithValuation` ve `extracted_data.drivers / value_trap_reasons`) kalıcı tez olarak kaydedilmelidir.

