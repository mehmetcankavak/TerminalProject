# Product Specification — CryptoTerminal

## Proje Özeti

CryptoTerminal, haber akışı ve canlı piyasa verisini tek bir terminal arayüzünde birleştiren, komut tabanlı kripto işlem terminalidir.

Temel vaadi: **Haber düştüğünde saniyeler içinde durumu değerlendir, karar ver, emri gir — hepsi klavyeden ayrılmadan.**

Bu bir algotrading botu değil. Otomatik trade açmaz.
Kullanıcıya bilgiyi hızlı getirir, karar verme süresini kısaltır, emri güvenli şekilde iletir.

---

## Problem Tanımı

Kripto piyasasında haber bazlı fiyat hareketleri saniyeler içinde gerçekleşir. Tipik bir trader şu adımları izler:

1. Haberi Twitter/Telegram/haber sitesinden görür
2. Tarayıcıda borsayı açar
3. Doğru pariteti bulur
4. Fiyata, spread'e, volume'a bakar
5. Emri girer
6. Stop-loss / take-profit ayarlar

Bu süreç ortalama 30-120 saniye sürer. Fırsat çoktan geçmiş olur.

CryptoTerminal bu akışı tek ekrana sıkıştırır:
- Haber zaten ekranda
- Fiyat zaten ekranda
- Emir tek komutla girer
- Risk otomatik kontrol edilir

---

## Hedef Kullanıcı

- Tek kişi (sen)
- Aktif kripto trader
- Haber bazlı kısa vadeli işlem yapan
- Terminal/CLI kullanmaya istekli
- Teknik bilgisi olan (geliştirici)

---

## MVP Kapsamı (v0.1)

### Yapılacaklar

| Özellik | Açıklama |
|---------|----------|
| Canlı market data | WebSocket ile ticker, orderbook derinliği, volume |
| Canlı haber akışı | REST polling + WebSocket (kaynak bağlı) ile haber başlıkları |
| Terminal UI | 4 panelli terminal ekranı (Textual) |
| Komut sistemi | CLI parser ile emir, izleme, bilgi komutları |
| Paper trading | Simüle emir, sahte fill, PnL hesaplama |
| Risk engine | Temel limitler — günlük zarar, işlem başı risk, cooldown |
| Logging | Tüm haber, sinyal, emir, hata logları |
| Tek borsa | Binance veya Bybit (futures dahil) |
| Local çalışma | Kendi makinende, cloud yok |

### MVP Dışı (Later)

| Özellik | Neden şimdi değil |
|---------|-------------------|
| Multi-exchange | Tek borsa adapter'ı bile yeterince karmaşık |
| Otomatik trade | Önce manuel karar verme döngüsü olgunlaşmalı |
| Signal engine / scoring | Haber değerlendirme subjektif, önce veriyi gör |
| Confidence score | ML/NLP gerektiriyor, MVP'yi bloklar |
| Web UI / mobil | Terminal-first, UI lüks |
| Multi-user | Sadece sen kullanacaksın |
| Cloud deployment | Local yeterli |
| Telegram/Discord bot | Ayrı proje |
| Backtesting | Önce forward test (paper) |
| Portfolio rebalancing | Kapsam dışı |

---

## Temel Kullanım Senaryoları

### Senaryo 1 — Haber Bazlı Hızlı İşlem

```
1. Terminal açık, watchlist'te BTC ETH SOL izleniyor
2. Haber panelinde düşer: "SEC approves Solana ETF application"
3. SOL fiyatı hareket etmeye başlar, volume spike görünür
4. Kullanıcı yazar: buy SOLUSDT 50 market
5. Risk engine kontrol eder: günlük limit OK, pozisyon limiti OK
6. Emir borsaya gider
7. Fill gelir, pozisyon panelinde görünür
8. Kullanıcı yazar: sl SOLUSDT 3%
9. Stop-loss set edilir
10. PnL canlı güncellenir
```

### Senaryo 2 — Orderbook İnceleme + Limit Emir

```
1. Kullanıcı yazar: book BTCUSDT
2. Orderbook derinliği gösterilir (bid/ask ilk 10 seviye)
3. Kullanıcı spread'i ve duvarları görür
4. Yazar: buy BTCUSDT 100 limit 67250
5. Emir girer, orders panelinde "OPEN" olarak görünür
6. Fill gelince pozisyona eklenir
```

### Senaryo 3 — Risk Limiti Tetiklenmesi

```
1. Kullanıcı yazar: buy ETHUSDT 500 market
2. Risk engine: "REJECTED — max trade size exceeded (limit: $200)"
3. Emir borsaya gönderilmez
4. Log'a yazılır
```

### Senaryo 4 — Panik Çıkış

```
1. Piyasa sert düşüyor
2. Kullanıcı yazar: panic
3. Tüm açık pozisyonlar market ile kapatılır
4. Tüm açık emirler iptal edilir
5. Sistem 5 dakika cooldown'a girer
```

---

## Başarı Kriterleri

| Metrik | Hedef |
|--------|-------|
| Haber → terminale ulaşma süresi | < 5 saniye (kaynak latency hariç) |
| Komut → emir gönderme süresi | < 500ms |
| WebSocket reconnect süresi | < 3 saniye |
| Uptime (local session) | Saatlerce crash'siz çalışma |
| Paper trade accuracy | Gerçek fill'lere yakın simülasyon |
| Risk engine bypass | Sıfır — her emir risk'ten geçmeli |

---

## Kısıtlamalar ve Kabul Edilen Trade-off'lar

1. **Haber latency kontrol edilemez** — Kaynak API'den geç gelen haberi hızlandıramazsın. Ama haberin sana ulaştığı an ile emri girdiğin an arasındaki süreyi minimize edebilirsin. Asıl hedef bu.

2. **Haber güvenilirliği** — Sahte veya yanıltıcı haber filtrelenmeyecek. Bu kullanıcının sorumluluğu. Sistem sadece veriyi getirir.

3. **Single point of failure** — Local çalıştığı için makine kapanırsa sistem durur. Açık pozisyonlar borsada kalır. Bu riski bilerek kabul ediyoruz; borsada her zaman stop-loss olmalı.

4. **Tek borsa limiti** — Arbitraj veya cross-exchange strateji yapılamaz. MVP için kabul edilebilir.

5. **Terminal UI limitleri** — Grafik, mum chart, teknik analiz göstergesi yok. Bunlar ayrı tool'larla (TradingView vb.) takip edilir. Terminal sadece execution ve bilgi akışı içindir.
