# 📋 KAPSAMLI MOBİL APP DENETİM RAPORU
**Senior Developer + Trader Bakışıyla — En İnce Detay**
**Tarih:** 2026-05-17
**Kapsam:** `/Users/mehmetcan/Desktop/terminal` — Backend (Python) + Web (React) + Mobile (Capacitor/iOS)

> **NOT:** Mobile app, web app'in Capacitor wrapper'ıdır. `mobile/capacitor.config.ts` web build'ini iOS bundle'ına kopyalar. Dolayısıyla aşağıdaki backend + frontend bulgularının tamamı mobile için de geçerlidir. Sadece mobile'a özgü ek bulgular son bölümde listelenmiştir.

---

## ÖZET

Uygulama bir "crypto terminal" olarak yarı-yarı çalışıyor, "stocks terminal" olarak ise neredeyse bir maket. Kripto fiyat akışı ve haber pipeline'ı sağlam; stocks, smart money, push notifications ve cüzdan entegrasyonu kritik eksiklere sahip. `web-dist` git state'i kırık — deploy ve mobile build patlatabilir.

---

## 1. 🪙 KRİPTO VERİ DOĞRULUĞU — ✅ ÇALIŞIYOR (eksikler var)





**Veri kaynağı:** Binance (`ccxt.pro` WebSocket) + Hyperliquid (native WS)
- `src/cryptoterminal/market/adapter.py:52-254` → Binance gerçek zamanlı `watch_ticker` / `watch_order_book`
- `src/cryptoterminal/market/hl_adapter.py:29-236` → Hyperliquid `trades` + `l2Book` stream
- Reconnect var, exponential backoff (1-30s), disconnect event yayını yapıyor.
- Stale veri koruması: `risk_stale_data_max_age_seconds = 3s`

### 🔴 Sorunlar
- **Sahte spread:** Binance futures ticker'ı bid/ask vermiyor; kod son fiyatın etrafına yapay spread koyuyor (`adapter.py:118-121`). Hyperliquid'de daha kötü — sabit %0.01 (`hl_adapter.py:100-102`). İlliquid coinlerde risk hesabı yanlış.
- **Hyperliquid volume = 0.0 hardcoded** (`hl_adapter.py:103`).
- **Sembol precision** exchange'den çekilmiyor; 6 ondalık sabit yuvarlama (`adapter.py:247`). SHIB gibi coinlerde emir reddedilir.

### ✅ Yapılacaklar
- [ ] Binance `exchangeInfo` endpoint'inden lot/tick size çek ve cache'le.
- [ ] Hyperliquid `/info` endpointinden `dayNtlVlm` çekip volume doldur.
- [ ] Gerçek bid/ask için Binance `bookTicker` stream'ine subscribe ol.

---

## 2. 📈 STOCKS KISMI — ❌ NEREDEYSE TAMAMEN MOCK

**En kritik bulgu.**

- `src/cryptoterminal/web/server.py:3199-3273`
- Kaynak: **Yahoo Finance + TradingView scanner scrape** (REST, gerçek zamanlı değil)
- **44 sembol hardcoded whitelist** (AAPL, TSLA, NVDA, COIN, MSTR, SPY...). Yeni sembol = sessiz hata.
- **Sadece fundamentals** (marketCap, P/B, 52-week H/L). Canlı fiyat YOK, websocket YOK, candle YOK.
- FMP API key ayarlarda tanımlı (`config/settings.py:126`) ama hiç kullanılmıyor.
- Yahoo'ya cache yok → rate-limit yiyecek.

### Verdict
Bu app şu an "stocks terminal" değil, kripto terminalin yanına süs olarak konmuş bir stocks sekmesi. Yayında stocks tabı kapatılmalı veya düzgün entegre edilmeli.

### ✅ Çözüm Önerileri (öncelik sırası)
- [ ] **Polygon.io** ($29/ay) → WS ile real-time US stocks
- [ ] **Finnhub** (free tier ile bile delay 1s) → en hızlı ucuz çözüm
- [ ] **Alpaca Market Data** → broker entegrasyonuyla beraber
- [ ] **TradingView Charting Library** lisansı → profesyonel grafikler

---

## 3. 👛 CÜZDAN BAĞLAMA — ⚠️ EKSİK TASARIM

- **WalletConnect YOK, MetaMask YOK, Web3 kütüphanesi YOK.**
- Hyperliquid için EVM private key string olarak settings'e giriliyor (`hl_adapter.py:33-62`). DB'de düz metin → **ciddi güvenlik açığı.**
- Binance/Bybit için CCXT API key/secret.
- "Cüzdan bağla" akışı on-demand fetch — pozisyonlar real-time sync olmuyor (`portfolio/manager.py:190-220`).
- Kripto ödeme cüzdan adresleri settings'de hardcoded (`config/settings.py:96-100`).

### ✅ Doğru Tasarım
- [ ] **WalletConnect v2 SDK** ekle (mobil için `@walletconnect/modal`)
- [ ] Hyperliquid için WalletConnect → message signing → API agent wallet akışı (HL native destekliyor)
- [ ] Private key **asla** DB'de düz metin olmamalı → OS keychain (`@capacitor-community/keychain`) veya AES-encrypted
- [ ] Portfolio sayfası açıldığında değil, arkada her 5sn poll + her trade event'inde force-refresh

---

## 4. 📰 TERMİNAL HABERLERİ — ✅ İYİ TASARLANMIŞ AMA DELİKLER VAR

**Mimari iyi:** Her kaynak ayrı async loop'ta, paralel.

| Kaynak | Aralık | Durum |
|---|---|---|
| Exchange Listings | 5s | ✅ |
| Binance Announcements | **10s** (önceden 5s, 429 yedik) | ⚠️ Hedef "<5s" ama 10s'ye düştü |
| **CryptoPanic** | — | ❌ **DEVRE DIŞI** — v2 API kırıldı (`news/service.py:268-270`) |
| RSS | 10s | ✅ (config gerekli) |
| Twitter/Nitter | 15s | ⚠️ Nitter stabil değil |
| Twitter v2 Filtered Stream | real-time WS | ✅ (bearer token ücretli) |
| **Telegram Sniper** | ~1s | ✅ **EN HIZLISI** — `t.me/s/{channel}` polling + MTProto fallback |

### 🔴 Eksikler
- Reuters/AP/Bloomberg yok → tradfi haberlerini kaçırıyor.
- CryptoPanic ölü → repair veya kaldır.
- Twitter çoğu kullanıcıda kapalı (bearer yok).

### ✅ Hızlı Haber İçin Önerilen Kaynaklar
- [ ] **Tree of Alpha** (`feeds.treeofalpha.com`) → kripto trader altın standardı, 100ms-1s, ücretsiz JSON
- [ ] **Phoenix News** (`phoenixnews.io`) → MEXC/Binance listing'leri <500ms
- [ ] **Blogtrottr / RSS-Bridge** → SEC EDGAR, ETF filings
- [ ] **Whale Alert webhook** ($49/ay) → Telegram'a bağımlı kalma
- [ ] **DefiLlama webhook** → protokol exploit'leri
- [ ] **The Block / CoinDesk JSON feed** → editoryal haberler

---

## 5. 💼 PORTFOLIO ENTEGRASYONU — ⚠️ ŞEFFAF DEĞİL

- `portfolio/manager.py:21-346`
- Default mod: PAPER (`paper_starting_balance=10000`)
- Real exchange pozisyonları tek yönlü okunuyor, portfolio'ya geri yazılmıyor
- Real funding fee gerçek pozisyonlara uygulanmıyor (`manager.py:189-214`)
- Trade history **200'le sınırlı** (`manager.py:244-245`) — eski trade'ler düşüyor

### ✅ Düzeltme
- [ ] "Live" mode için her 10s exchange'den `fetch_positions` + `fetch_balance` → DB snapshot
- [ ] Trade history sınırını kaldır, ayrı `trades_history` tablosuna sınırsız yaz
- [ ] UI'da net göster: "Bu pozisyon: Paper" vs "Bu pozisyon: Binance Live"

---

## 6. 🔔 PRICE ALERTS & PUSH BİLDİRİMLERİ — 🔴 KIRIK

**Telegram + Email çalışıyor, ama mobil PUSH gerçekte tetiklenmiyor.**

- Alert evaluation: 5sn polling (`web/server.py:1176`) — OK
- WS broadcast: ✅
- Email: ✅ (`notifications/email_sender.py`)
- Telegram: ✅ (`notifications/telegram_bot.py`)
- **Push (APNs/FCM):**
  - `@capacitor/push-notifications@8.0.3` kurulu (`mobile/package.json`)
  - `capacitor.config.ts:45-47` konfigüre
  - Web app kodunda `PushNotifications.requestPermissions()` veya `.register()` **çağrısı YOK**
  - Cihaz device token'ı backend'e hiç gitmiyor → backend `_send_push_to_user` çağırsa bile sessiz fail

### ✅ Düzeltme (1-2 saatlik iş)
```ts
// web app initialize'da:
await PushNotifications.requestPermissions();
await PushNotifications.register();
PushNotifications.addListener('registration', token => {
  api.post('/api/user/device-token', { token: token.value, platform: 'ios' });
});
```
- [ ] Frontend permission + register akışı
- [ ] Backend `user_device_tokens` tablosu
- [ ] APNs HTTP/2 + FCM HTTP v1 sender service
- [ ] Alert tetiklendiğinde tüm kanallara fan-out

---

## 7. 🐋 SMART MONEY / BALİNA TAKİBİ — ❌ KABUKTAN İBARET

**Bu özellik UI'da var ama backend'de neredeyse hiçbir şey yapmıyor.**

- `web/server.py:4265-4360`
- Kullanıcı cüzdan adresi + label + budget + ratio kaydedebiliyor → sadece DB'ye yazılıyor
- **On-chain monitoring YOK** (Arkham, Nansen, Etherscan webhook YOK)
- Hyperliquid leaderboard çekiliyor (5 dk cache) — agregat istatistik, anlık trade değil
- "Balina işleme girer girmez bildirim" → şu an mümkün değil
- Auto-copy trade UI'da var ama trade detection olmadan tetiklenemez

### ✅ Doğru Çözüm (zorluk sırası)
- [ ] **Hyperliquid `userFills` WS endpoint** (her takip edilen adres için) — gecikme <200ms, **1 günde yapılır**
- [ ] **Alchemy / QuickNode webhooks** ($49-99/ay) → EVM adres aktivitesi push event
- [ ] **Hypersync / Ghost / Goldsky** indexer → 10x daha hızlı
- [ ] **Arkham API** (waitlist) → etiketli adres + tag
- [ ] **Helius webhook** → Solana için en hızlı

**MVP:** Sadece Hyperliquid `userFills` ekle — bir günde gerçek balina takibi çalışır.

---

## 8. 💸 BIG TRANSFERS — ❌ HİÇ YOK

- Kodda "big_transfer", "whale_alert", "large_transfer" implementasyonu sıfır
- Sadece Telegram'da `@whale_alert` kanalı dinleniyor → 3. parti dedikodu

### ✅ Düzeltme
- [ ] **Whale Alert API** ($49/ay) → webhook ile direkt push
- [ ] **Alchemy** `alchemy_minedTransactions` subscription + threshold filtresi (ücretsiz alternatif)
- [ ] **Glassnode** veya **CryptoQuant API** → CEX inflow/outflow (en actionable sinyal)

---

## 9. 💥 LIQUIDATIONS STREAM — ⚠️ KARMA

`web/server.py:1992-2071` ve 270-440.

- ✅ **Coinglass API** (30s cache) — agregat, gerçek
- ✅ **Binance** `allForceOrdersStream` WS — gerçek anlık
- ✅ **OKX** `liquidation-orders` WS — gerçek, ama **sadece 15 sembol hardcoded** (`server.py:2045`)
- ✅ **Bybit** `allLiquidation.{symbol}` WS — gerçek, $10 min filter
- ❌ **Hyperliquid: GERÇEK DEĞİL** — public liq stream yok, OI delta × mark price ile sentetik tahmin (`server.py:397-440`)

### ✅ Düzeltme
- [ ] HL sentetik veriyi UI'da "Estimated" etiketle, dürüst ol
- [ ] OKX'in 15-sembol listesini **top 50 by 24h volume**'a dinamik çevir
- [ ] Opsiyonel: **Hyblock Capital** veya **Velo Data** ile premium veri

---

## 10. 💰 FUNDING RATES — ⚠️ SADECE BINANCE

- `web/server.py:1074-1107`
- Sadece Binance, 8 saatte bir REST poll
- Bybit, OKX, Hyperliquid funding hiç çekilmiyor
- Sadece paper portfolio'ya uygulanıyor

### ✅ Düzeltme
- [ ] 4 borsadan paralel funding çek → arbitraj fırsatları
- [ ] **Coinglass funding aggregator** tek API call ile tüm borsalar
- [ ] UI'da "Funding spread" tablosu (BTC: Binance +0.01%, HL -0.005%)

---

## 11. 📊 VOLUME MONITOR — ⚠️ ZAYIF ALGORİTMA

- `market/service.py:197-218`
- Son 10 değerin ortalamasına göre 2x üstüyse spike
- Binance ticker 24h rolling volume → intraday spike'ları kaçırır

### ✅ Düzeltme
- [ ] 1m candle volume kullan (`klines` WS): `volume[-1] > median(volume[-20:]) * 3`
- [ ] Z-score: `(current - mean) / stddev > 2.5`
- [ ] "Relative volume" göster (günün şu saatine ait normal hacme oran)

---

## 12. ⚙️ SETTINGS — EKSİKLER

- **Kullanılmayan key'ler:** `cryptopanic_api_key`, `fmp_api_key`, `twitter_bearer_token`, `bybit_api_key/secret` — implementasyon tamamla veya UI'dan kaldır
- **CORS hâlâ dev:** `localhost:5173, localhost:3000` (`settings.py:129`) → prod'da hatalı
- **Admin email default boş** → admin paneli sahipsiz
- **Proxy ayarları yok** (Telegram için hardcoded localhost)
- **Push provider key'leri yok** (FCM service account, APNs key)

---

## 13. 🚨 KRİTİK BUILD/DEPLOY SORUNU

`git status`: **297 adet `web-dist/assets/*.js` DELETED**. Filesystemde yeni dosyalar var, git'te eskiler silinmiş, yenisi commit edilmemiş.

**Bu state ile deploy edersen veya mobile build alırsan uygulama açılmaz** (asset chunk'ları 404).

### ✅ Düzeltme (HEMEN)
```bash
echo "web-dist/" >> .gitignore
git rm -r --cached web-dist/
git add .gitignore
# CI/CD pipeline'da deploy öncesi "npm run build"
```
- [ ] `web-dist/` gitignore'a ekle
- [ ] Tracked dosyaları cache'ten kaldır
- [ ] CI pipeline'a build adımı

---

## 14. 📱 MOBİLE'A ÖZGÜ EK BULGULAR

1. **Push notification kırık** — `@capacitor/push-notifications` kurulu ama `requestPermissions()` / `register()` çağrısı yok. APNs token backend'e hiç gitmiyor. Fiyat alarmları telefona düşmüyor.

2. **`web-dist` git sorunu mobile'ı daha çok vurur** — `mobile/package.json`'daki `_copy-assets` script'i web-dist'i iOS bundle'ına kopyalıyor. Bozuk state = **iOS app beyaz ekran**.

3. **Cüzdan akışı mobile için kritik** — WalletConnect olmadan kullanıcı private key yazamaz. **iOS Keychain** kullanmalı (`@capacitor-community/keychain`).

4. **Native özellikler kullanılmıyor:**
   - [ ] Haptic feedback (alert geldiğinde titreşim)
   - [ ] Background fetch (uygulama kapalıyken haber çekme)
   - [ ] Live Activities (iOS 16+ — kilit ekranında canlı fiyat)
   - [ ] Widget extension (ana ekranda BTC fiyatı)
   - [ ] Face ID / Touch ID (private key erişimi için)

---

## 🎯 ÖNCELİK SIRASI — YOL HARİTASI

### 🔴 ŞU HAFTA (ürün kırık)
- [ ] 1. `web-dist` git sorununu çöz (yoksa deploy patlar)
- [ ] 2. Push notification flow'u bağla (1-2 saat, kritik UX)
- [ ] 3. Stocks tab'ını gizle veya gerçek provider entegre et (Polygon/Finnhub)
- [ ] 4. Private key güvenliği — Hyperliquid key'i en azından şifrele

### 🟡 BU AY (rekabet için)
- [ ] 5. Hyperliquid `userFills` WS ile smart money tracking gerçek yap
- [ ] 6. Tree of Alpha + Whale Alert entegrasyonu (haber/transfer hızı)
- [ ] 7. Coinglass funding aggregator (4 borsa tek tabloda)
- [ ] 8. CryptoPanic v2 fix veya kaldır

### 🟢 ÖNÜMÜZDEKİ ÇEYREK (profesyonelleşme)
- [ ] 9. WalletConnect v2 ile cüzdan akışı
- [ ] 10. Polygon.io ile gerçek stocks terminali
- [ ] 11. Real-time portfolio sync (live mode)
- [ ] 12. Volume monitor algoritmasını z-score + relative volume'a çevir
- [ ] 13. iOS Live Activities + Widget

---

## 📊 DURUM TABLOSU

| Modül | Durum | Risk |
|---|---|---|
| Crypto fiyat | ✅ Çalışıyor | Düşük (sahte spread düzelt) |
| Stocks | ❌ Mock | **Kritik** — yayında utandırır |
| Cüzdan | ⚠️ Yarı | **Yüksek** (private key plaintext) |
| Haberler | ✅ İyi | Orta (Twitter+CryptoPanic boşluk) |
| Portfolio | ⚠️ Paper-ağırlıklı | Orta |
| Alerts | ⚠️ Push kırık | **Yüksek** (mobil ana özellik) |
| Smart Money | ❌ Kabuk | **Yüksek** (reklamlanan özellik çalışmıyor) |
| Big Transfers | ❌ Yok | Orta |
| Liquidations | ⚠️ HL sentetik | Düşük (etiketle çöz) |
| Funding | ⚠️ Sadece Binance | Düşük |
| Volume | ⚠️ Zayıf algo | Düşük |
| Settings | ⚠️ Ölü keyler | Düşük |
| Build/Deploy | 🔴 Kırık git state | **Kritik** |
| Mobile Native | ❌ Kullanılmıyor | Orta |

---

**Dürüst değerlendirme:** Şu an "MVP+" seviyesinde bir kripto terminal. Gerçek trader'ları çekmek için en az 1, 2, 5, 6, 7 ve 11 numaralı maddeleri kapatılmalı. Yapı sağlam, mimari mantıklı — eksik olan **veri kaynaklarına yatırım ve UX bütünlüğü.**
