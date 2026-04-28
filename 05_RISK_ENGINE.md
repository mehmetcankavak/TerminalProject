# Risk Engine — CryptoTerminal

## Felsefe

Risk engine bu sistemin en önemli parçası. Emir gönderen engine'den bile önemli.

Temel kural: **Her emir, borsaya gitmeden ÖNCE risk engine'den geçer. İstisna yok.**

Tek istisna: `panic` komutu. O da risk engine'in kendisi tarafından çalıştırılır.

---

## Risk Kontrol Katmanları

### Katman 1: Pre-Trade Kontroller (Emir gönderilmeden önce)

Her yeni emir şu kontrollerden sırayla geçer. Herhangi biri fail ederse emir gönderilmez.

#### 1.1 — Max Trade Size

```
Kural: Tek emirde max X USD
Varsayılan: 200 USD
Config: RISK_MAX_TRADE_USD=200

Örnek:
  buy BTCUSDT 500 market
  → REJECTED: Trade size $500 exceeds limit ($200)
```

#### 1.2 — Max Daily Loss

```
Kural: Günlük toplam realized + unrealized zarar Y% geçerse yeni emir engelle
Varsayılan: %3 (başlangıç bakiyesinin)
Config: RISK_MAX_DAILY_LOSS_PCT=3.0

Hesaplama:
  daily_loss = (realized_pnl_today + unrealized_pnl_now)
  daily_loss_pct = daily_loss / starting_balance_today × 100

  Eğer daily_loss_pct < -3.0:
    → REJECTED: Daily loss limit reached (-3.2%). No new orders until reset.

Reset: Her gün 00:00 UTC'de sıfırlanır.
```

#### 1.3 — Max Open Positions

```
Kural: Aynı anda en fazla N açık pozisyon
Varsayılan: 3
Config: RISK_MAX_OPEN_POSITIONS=3

Örnek:
  Zaten 3 pozisyon açık → yeni buy/long/short emri
  → REJECTED: Max open positions reached (3/3)

Not: Mevcut pozisyona ekleme (aynı symbol) ayrı pozisyon sayılmaz.
```

#### 1.4 — Max Leverage

```
Kural: Max kaldıraç oranı
Varsayılan: 5x
Config: RISK_MAX_LEVERAGE=5

Örnek:
  long BTCUSDT 100 10x
  → REJECTED: Leverage 10x exceeds limit (5x)
```

#### 1.5 — Duplicate Order Blocker

```
Kural: Aynı symbol + aynı yön + son N saniye içinde zaten emir gönderilmişse engelle
Varsayılan: 5 saniye
Config: RISK_DUPLICATE_WINDOW_SECONDS=5

Amaç: Yanlışlıkla aynı emri iki kez göndermeyi önle.

Örnek:
  14:22:35 → buy SOLUSDT 50 market → OK
  14:22:37 → buy SOLUSDT 50 market
  → REJECTED: Duplicate order detected (SOLUSDT BUY within 5s). Wait or use 'force' flag.
```

#### 1.6 — Stale Data Kontrolü

```
Kural: Market data 10 saniyeden eski ise market emir engelle
Config: RISK_STALE_DATA_MAX_AGE_SECONDS=10

Örnek:
  WS kopmuş, son fiyat 45 saniye önce gelmiş
  buy BTCUSDT 100 market
  → REJECTED: Market data stale (45s old). Cannot send market order.

Not: Limit emir gönderilebilir (kullanıcı fiyatı kendisi belirlediği için).
```

#### 1.7 — Spread Kontrolü

```
Kural: Bid-ask spread normalden çok açıksa uyarı ver
Varsayılan eşik: spread > %0.5
Config: RISK_MAX_SPREAD_PCT=0.5

Davranış:
  - spread > eşik → WARNING: High spread on BTCUSDT (0.8%). Confirm? (y/n)
  - Kullanıcı 'y' yazarsa emir gider
  - Kullanıcı 'n' veya 5 saniye cevap vermezse iptal
```

#### 1.8 — Stop-Loss Zorunluluğu (Opsiyonel)

```
Kural: Pozisyon açılınca X saniye içinde stop-loss girilmezse uyarı
Varsayılan: 60 saniye
Config: RISK_SL_REMINDER_SECONDS=60
Config: RISK_SL_REQUIRED=false  (true yapılırsa SL olmadan emir kabul etmez)

Davranış (RISK_SL_REQUIRED=false):
  Pozisyon açıldıktan 60 saniye sonra SL yoksa:
  → WARNING: No stop-loss set for SOLUSDT. Set with: sl SOLUSDT <pct>

Davranış (RISK_SL_REQUIRED=true):
  buy BTCUSDT 100 market
  → REJECTED: Stop-loss required. Use: buy BTCUSDT 100 market sl=2.5%
```

---

### Katman 2: Post-Trade Monitoring (Emir sonrası sürekli kontrol)

#### 2.1 — Daily Loss Auto-Lock

```
Günlük zarar limiti aşılırsa:
  1. Yeni emir girişi engellenir
  2. Mevcut pozisyonlar KAPANMAZ (ani piyasa hareketinde daha fazla zarar yaratabilir)
  3. Terminalde kırmızı uyarı: "DAILY LOSS LIMIT HIT. Trading locked until 00:00 UTC."
  4. Sadece close, cancel, panic komutları çalışır
  5. Manuel unlock: unlock komutu ile (onay ister, riski bilerek kabul)
```

#### 2.2 — Cooldown

```
Kural: Emir sonrası N saniye yeni emir engelle
Varsayılan: 5 saniye (normal), 300 saniye (panic sonrası)
Config: RISK_COOLDOWN_SECONDS=5
Config: RISK_PANIC_COOLDOWN_SECONDS=300

Amaç: Tilt durumunda (üst üste zarar sonrası panik emir) frenleme.
```

#### 2.3 — Haber Sonrası Filtre

```
Kural: HIGH priority haber geldikten sonra ilk N saniyede market emir engelle
Varsayılan: 3 saniye
Config: RISK_NEWS_DELAY_SECONDS=3

Amaç: Haber düşer düşmez refleksle emir girmeyi engelle.
İlk birkaç saniyede spread açılır, slippage yüksek olur.

Davranış:
  [14:22:28] HIGH priority haber geldi
  [14:22:29] buy SOLUSDT 50 market
  → REJECTED: News cooldown active (2s remaining). Wait for spread to stabilize.

  [14:22:32] buy SOLUSDT 50 market
  → Risk check: spread OK, stale data yok → APPROVED
```

---

### Katman 3: Pozisyon Seviyesi Kontroller

#### 3.1 — Max Position Size

```
Kural: Tek pozisyonda max X USD notional
Varsayılan: 500 USD
Config: RISK_MAX_POSITION_USD=500

Mevcut pozisyona ekleme yapılırken de kontrol edilir.
Mevcut: 300 USD, yeni ekleme: 250 USD, toplam: 550 USD
→ REJECTED: Position would exceed max size ($550 > $500)
```

#### 3.2 — Portfolio Exposure

```
Kural: Tüm açık pozisyonların toplamı bakiyenin X%'ini geçemez
Varsayılan: %50
Config: RISK_MAX_PORTFOLIO_EXPOSURE_PCT=50

Amaç: Tüm sermayenin risk altına girmesini engelle.
```

---

## Panic Komutu

En yüksek öncelikli komut.

```
> panic
  ⚠️ PANIC CLOSE
  Open positions: 2
  Open orders: 3
  Type YES to confirm:
> YES
  [14:30:01] Cancelling 3 open orders...
  [14:30:01] ✓ 3 orders cancelled
  [14:30:01] Closing SOLUSDT LONG 2.5 @ market...
  [14:30:02] ✓ SOLUSDT closed @ 186.20
  [14:30:02] Closing ETHUSDT SHORT 0.15 @ market...
  [14:30:02] ✓ ETHUSDT closed @ 3,425.00
  [14:30:02] All positions closed. Cooldown: 300s.
  [14:30:02] 🔒 Trading locked for 5 minutes.
```

Panic sırası:
1. Tüm açık emirleri iptal et (cancel all)
2. Tüm açık pozisyonları market ile kapat
3. Cooldown başlat
4. Tüm event'leri logla

---

## Risk State

Risk engine kendi iç state'ini tutar:

```python
class RiskState(BaseModel):
    starting_balance_today: float     # günün başındaki bakiye
    current_balance: float
    realized_pnl_today: float
    unrealized_pnl_today: float
    daily_loss_pct: float
    open_position_count: int
    total_exposure_usd: float
    last_order_time: datetime | None
    cooldown_until: datetime | None
    news_cooldown_until: datetime | None
    is_locked: bool                   # daily loss lock
    recent_orders: list[RecentOrder]  # duplicate detection için
```

Bu state her event'te güncellenir:
- `order.filled` → realized PnL, position count güncelle
- `market.ticker_update` → unrealized PnL güncelle
- `news.received` (HIGH) → news cooldown set
- `panic` → lock + cooldown

---

## Risk Komutları

```
> risk
  ┌──────────────────────────────────┐
  │ Risk Summary                     │
  │ Daily PnL:    -$45.20 (-1.5%)   │
  │ Daily Limit:  -$90.00 (-3.0%)   │
  │ Remaining:    $44.80             │
  │ Open Pos:     2/3               │
  │ Exposure:     $380 / $1,500     │
  │ Max Trade:    $200              │
  │ Max Leverage: 5x                │
  │ Cooldown:     none              │
  │ Status:       ACTIVE ✓          │
  └──────────────────────────────────┘

> limits
  ┌──────────────────────────────────┐
  │ Active Risk Limits               │
  │ Max trade:       $200           │
  │ Max daily loss:  3.0%           │
  │ Max leverage:    5x             │
  │ Max positions:   3              │
  │ Max pos size:    $500           │
  │ Max exposure:    50%            │
  │ Cooldown:        5s             │
  │ Duplicate window: 5s           │
  │ News delay:      3s             │
  │ SL required:     no            │
  │ SL reminder:     60s           │
  └──────────────────────────────────┘
```

---

## Konfigürasyon Özeti

```bash
# .env — Risk parametreleri
RISK_MAX_TRADE_USD=200
RISK_MAX_DAILY_LOSS_PCT=3.0
RISK_MAX_OPEN_POSITIONS=3
RISK_MAX_LEVERAGE=5
RISK_MAX_POSITION_USD=500
RISK_MAX_PORTFOLIO_EXPOSURE_PCT=50
RISK_COOLDOWN_SECONDS=5
RISK_PANIC_COOLDOWN_SECONDS=300
RISK_DUPLICATE_WINDOW_SECONDS=5
RISK_STALE_DATA_MAX_AGE_SECONDS=10
RISK_MAX_SPREAD_PCT=0.5
RISK_NEWS_DELAY_SECONDS=3
RISK_SL_REQUIRED=false
RISK_SL_REMINDER_SECONDS=60
```

Tüm değerler config'den okunur, runtime'da `limits` komutuyla görüntülenir.

---

## Risk Engine Bypass Politikası

**Bypass yok.**

- Risk engine atlanamaz
- "Force" flag'i sadece duplicate blocker için var (aynı emri bilinçli tekrar göndermek)
- Diğer tüm kontroller her zaman aktif
- Limitleri değiştirmek istiyorsan `.env`'yi düzenle ve terminal'i yeniden başlat
- Runtime'da limit değişikliği yok (kasıtlı tasarım kararı — tilt durumunda limitleri gevşetmeyi engeller)

---

## Logging

Her risk kararı loglanır:

```json
{
    "timestamp": "2025-03-08T14:22:35.100Z",
    "event": "risk_check",
    "order_id": "ord_001",
    "symbol": "SOLUSDT",
    "side": "buy",
    "amount_usd": 50.0,
    "checks": {
        "max_trade_size": "PASS",
        "daily_loss": "PASS",
        "open_positions": "PASS",
        "leverage": "PASS",
        "duplicate": "PASS",
        "stale_data": "PASS",
        "spread": "PASS"
    },
    "result": "APPROVED"
}
```

Rejected örneği:

```json
{
    "timestamp": "2025-03-08T14:22:35.100Z",
    "event": "risk_check",
    "order_id": "ord_002",
    "symbol": "BTCUSDT",
    "side": "buy",
    "amount_usd": 500.0,
    "checks": {
        "max_trade_size": "FAIL — $500 > $200 limit"
    },
    "result": "REJECTED",
    "reason": "max_trade_size"
}
```

Not: Fail olan ilk check'te dur, gerisi kontrol edilmez (early return). Ama tüm check sonuçları loglanır.
