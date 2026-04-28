# System Design — CryptoTerminal

## Tech Stack

### Dil: Python 3.12+

**Neden Python:**
- `Textual` / `Rich` ile terminal UI ekosistemi çok güçlü
- `ccxt` kütüphanesi 100+ borsayı tek arayüzle soyutluyor
- `asyncio` + `websockets` olgun ve stabil
- Kripto trading bot ekosistemi Python'da en zengin
- Hızlı prototipleme, hızlı iterasyon
- Veri işleme (pandas, vb.) ileride kolayca eklenir

**Neden TypeScript değil:**
- Terminal UI kütüphaneleri (`blessed`, `neo-blessed`) bakımsız
- Aynı sonuç için daha fazla boilerplate
- Kripto bot ekosistemi daha sığ

### Kütüphane Seçimleri

| Katman | Kütüphane | Neden |
|--------|-----------|-------|
| Terminal UI | `textual` | Modern, async-native, zengin widget seti |
| Zengin çıktı | `rich` | Tablolar, renkli log, progress bar |
| HTTP client | `httpx` | async destekli, modern, `requests` alternatifi |
| WebSocket | `websockets` | Hafif, async-native |
| Exchange API | `ccxt.pro` | Unified async exchange interface, WS destekli |
| Veri validasyon | `pydantic` | Type-safe config, event modelleri |
| Veritabanı | `sqlite3` (stdlib) → `aiosqlite` | Sıfır kurulum, MVP için yeterli |
| Config | `pydantic-settings` + `.env` | Env-based config, type-safe |
| Secrets | `.env` + `python-dotenv` | API key'ler için basit ve yeterli |
| Logging | `structlog` | Structured JSON logging |
| Task scheduling | `asyncio` (native) | Ek kütüphane gereksiz |
| Testing | `pytest` + `pytest-asyncio` | Async test desteği |

### Bilinçli Olarak Kullanılmayan Şeyler

| Teknoloji | Neden kullanılmıyor |
|-----------|---------------------|
| Redis | MVP'de gereksiz karmaşıklık, in-memory queue yeterli |
| PostgreSQL | SQLite MVP için yeterli, migration sonra yapılır |
| Kafka / RabbitMQ | asyncio.Queue yeterli, overengineering olur |
| Docker | Local geliştirme, native çalıştırma yeterli |
| FastAPI / Flask | Web sunucu yok, terminal uygulaması |
| Celery | asyncio task'ları yeterli |

---

## Mimari Yaklaşım

### Monolith + Modüler İç Yapı

Mikroservis değil. Tek process, tek entry point.
Ama iç yapı net modüllere ayrılmış: her modülün kendi sorumluluğu, kendi interface'i var.

Modüller arası iletişim: **async event bus** (in-memory `asyncio.Queue` tabanlı).

```
┌─────────────────────────────────────────────────────┐
│                    TERMINAL UI                       │
│            (Textual App — Ana Process)               │
├──────────┬──────────┬──────────┬────────────────────┤
│  News    │  Market  │ Position │  Command           │
│  Panel   │  Panel   │  Panel   │  Input             │
├──────────┴──────────┴──────────┴────────────────────┤
│                   EVENT BUS                          │
│            (asyncio.Queue based)                     │
├──────────┬──────────┬──────────┬────────────────────┤
│  News    │  Market  │ Execution│  Risk              │
│  Ingestion│  Data   │  Engine  │  Engine            │
│  Service │  Service │          │                    │
├──────────┴──────────┴──────────┴────────────────────┤
│               PERSISTENCE LAYER                      │
│          (SQLite + structlog files)                  │
└─────────────────────────────────────────────────────┘
```

### Neden Bu Yapı

1. **Tek process** — debug kolay, deploy kolay, state paylaşımı basit
2. **Event bus** — modüller birbirini doğrudan çağırmıyor, loose coupling
3. **Async everything** — WebSocket, HTTP, UI hepsi non-blocking
4. **Modüler** — bir modülü değiştirmek diğerlerini etkilemiyor

---

## Core Modüller

### 1. `event_bus` — Merkezi Olay Yöneticisi

Tüm modüller arası iletişimi sağlar.

```python
# Basitleştirilmiş interface
class EventBus:
    async def publish(self, event_type: str, payload: dict) -> None
    async def subscribe(self, event_type: str, handler: Callable) -> None
    async def start(self) -> None  # consumer loop
```

Event tipleri:
- `news.received` — yeni haber geldi
- `market.ticker_update` — fiyat güncellendi
- `market.volume_spike` — volume anormal arttı
- `market.orderbook_update` — orderbook güncellendi
- `order.submitted` — emir borsaya gönderildi
- `order.filled` — emir doldu
- `order.rejected` — emir reddedildi
- `order.cancelled` — emir iptal edildi
- `position.updated` — pozisyon değişti
- `risk.alert` — risk limiti yaklaştı
- `risk.blocked` — risk limiti aşıldı, emir engellendi
- `system.ws_disconnected` — WebSocket koptu
- `system.ws_reconnected` — WebSocket tekrar bağlandı
- `system.error` — sistem hatası

### 2. `market_data` — Piyasa Verisi Servisi

Borsadan canlı veri alır, normalize eder, event bus'a yayınlar.

Sorumlulukları:
- WebSocket bağlantısı yönetimi (connect, reconnect, heartbeat)
- Ticker stream (son fiyat, 24h değişim, volume)
- Orderbook stream (configurable derinlik, varsayılan top 10)
- Trade stream (son işlemler)
- Funding rate (futures için)
- Rate limit yönetimi
- Stale data tespiti (belirli süre veri gelmezse uyarı)

```python
# Örnek ticker event payload
{
    "type": "market.ticker_update",
    "timestamp": "2025-03-08T14:22:31.442Z",
    "source": "binance",
    "symbol": "BTCUSDT",
    "data": {
        "last_price": 67842.50,
        "bid": 67841.20,
        "ask": 67843.80,
        "spread": 2.60,
        "volume_24h": 28451.23,
        "change_24h_pct": 2.34,
        "high_24h": 68100.00,
        "low_24h": 66200.00,
        "funding_rate": 0.0001
    }
}
```

### 3. `news_ingestion` — Haber Servisi

Çoklu kaynaktan haber çeker, normalize eder, event bus'a yayınlar.

Sorumlulukları:
- Kaynak adapter'ları (REST polling ve/veya WebSocket)
- Haber normalizasyonu (ortak format)
- Duplicate detection (aynı haberi iki kez gösterme)
- Coin/ticker eşleştirme (haberden ilgili coin'i çıkar)
- Kaynak güvenilirlik seviyesi

```python
# Örnek haber event payload
{
    "type": "news.received",
    "timestamp": "2025-03-08T14:22:28.000Z",
    "data": {
        "id": "news_abc123",
        "headline": "SEC Approves Solana ETF Application from BlackRock",
        "source": "cryptonews_api",
        "source_published_at": "2025-03-08T14:22:15.000Z",
        "received_at": "2025-03-08T14:22:28.000Z",
        "latency_ms": 13000,
        "related_symbols": ["SOLUSDT", "SOLUSD"],
        "tags": ["SEC", "ETF", "regulation", "solana"],
        "url": "https://...",
        "priority": "high"
    }
}
```

**Kritik nokta — Haber zamanlaması:**
- `source_published_at`: Haberin kaynakta yayınlandığı an
- `received_at`: Haberin bize ulaştığı an
- `latency_ms`: Aradaki fark
- Bu fark önemli. 30 saniyelik bir haber "eski haber"dir. Terminalde bu latency gösterilmeli.

### 4. `execution_engine` — Emir Motoru

Kullanıcının komutunu alır, risk engine'den onay alır, borsaya gönderir, sonucu takip eder.

Sorumlulukları:
- Komut → order objesi dönüşümü
- Risk engine'e pre-trade kontrol gönderme
- Borsaya emir iletme (REST veya WS)
- Order acknowledgement alma
- Private order stream'den gerçek durumu takip etme
- Fill, partial fill, reject, cancel event'lerini yayınlama
- Retry mantığı (network hatası durumunda)
- Idempotency (aynı emri iki kez göndermeme)

**Kritik ayrım:**
```
Emir gönder → ACK geldi (borsa aldı) ≠ Emir doldu (fill)

ACK = borsa emri kabul etti, işleme aldı
FILL = emir gerçekten gerçekleşti

Bu ikisi arasında saniyeler hatta dakikalar olabilir (limit emirlerde).
Private order stream bu durumu takip eder.
```

Order lifecycle:
```
CREATED → SUBMITTED → ACKNOWLEDGED → PARTIALLY_FILLED → FILLED
                   → REJECTED
                   → CANCELLED
```

```python
# Örnek order event payload
{
    "type": "order.submitted",
    "timestamp": "2025-03-08T14:22:35.100Z",
    "data": {
        "internal_id": "ord_001",
        "exchange_id": null,
        "symbol": "SOLUSDT",
        "side": "buy",
        "type": "market",
        "quantity": 2.5,
        "notional_usd": 50.00,
        "leverage": 1,
        "status": "SUBMITTED",
        "risk_check_passed": true,
        "submitted_at": "2025-03-08T14:22:35.100Z"
    }
}
```

### 5. `risk_engine` — Risk Motoru

Her emri borsaya göndermeden ÖNCE kontrol eder. Ayrıntılar `RISK_ENGINE.md`'de.

Interface:
```python
class RiskEngine:
    async def check_order(self, order: Order) -> RiskResult:
        """
        Returns:
          RiskResult(approved=True) veya
          RiskResult(approved=False, reason="daily loss limit exceeded")
        """

    async def update_state(self, event: Event) -> None:
        """Fill, cancel vb. event'lerde iç state'i günceller"""

    async def get_risk_summary(self) -> RiskSummary:
        """Anlık risk durumu — pozisyon sayısı, günlük PnL, vb."""
```

### 6. `portfolio_state` — Portföy Durumu

Açık pozisyonlar, bakiye, PnL hesaplamaları.

Sorumlulukları:
- Açık pozisyon listesi
- Her pozisyon için: giriş fiyatı, miktar, unrealized PnL, realized PnL
- Toplam portföy değeri
- Bakiye takibi
- Pozisyon geçmişi

PnL hesaplama:
```
Unrealized PnL = (current_price - entry_price) × quantity × direction
  direction: long = +1, short = -1

Realized PnL = (exit_price - entry_price) × quantity × direction - fees
```

### 7. `terminal_ui` — Terminal Arayüzü

Textual tabanlı 4 panelli ekran. Ayrıntılar `CLI_AND_TERMINAL.md`'de.

### 8. `persistence` — Veri Katmanı

SQLite ile basit ama yeterli veri saklama.

Tablolar:
- `news_events` — gelen tüm haberler
- `orders` — gönderilen tüm emirler ve durumları
- `fills` — gerçekleşen işlemler
- `positions` — pozisyon snapshot'ları
- `risk_events` — risk engine kararları (onay/red)
- `system_logs` — hata, reconnect, vb.

```sql
-- Örnek orders tablosu
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    exchange_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,        -- buy/sell
    order_type TEXT NOT NULL,  -- market/limit
    quantity REAL NOT NULL,
    price REAL,
    leverage INTEGER DEFAULT 1,
    status TEXT NOT NULL,
    risk_approved BOOLEAN,
    risk_reject_reason TEXT,
    created_at TEXT NOT NULL,
    submitted_at TEXT,
    filled_at TEXT,
    fill_price REAL,
    fees REAL,
    error TEXT
);
```

### 9. `config` — Konfigürasyon

Pydantic-settings ile type-safe config.

```python
# .env dosyası
EXCHANGE=binance
EXCHANGE_API_KEY=xxx
EXCHANGE_API_SECRET=xxx
EXCHANGE_TESTNET=true

WATCHLIST=BTCUSDT,ETHUSDT,SOLUSDT

NEWS_SOURCES=cryptopanic,finnhub
NEWS_POLL_INTERVAL_SECONDS=10

RISK_MAX_TRADE_USD=200
RISK_MAX_DAILY_LOSS_PCT=3.0
RISK_MAX_LEVERAGE=5
RISK_MAX_OPEN_POSITIONS=3
RISK_COOLDOWN_SECONDS=30

LOG_LEVEL=INFO
LOG_FILE=logs/terminal.log
DB_PATH=data/terminal.db
```

---

## Domain Model

### Core Entities

```
Symbol          — İşlem çifti (BTCUSDT, ETHUSDT, vb.)
Ticker          — Anlık fiyat bilgisi
OrderBook       — Alış/satış seviyeleri
NewsEvent       — Normalize edilmiş haber
Order           — Kullanıcının girdiği emir
Fill            — Gerçekleşen işlem detayı
Position        — Açık pozisyon
RiskCheckResult — Risk engine kararı
```

### Entity İlişkileri

```
NewsEvent ──triggers──→ User Decision ──creates──→ Order
Order ──checked_by──→ RiskEngine
Order ──sent_to──→ Exchange
Order ──produces──→ Fill(s)
Fill(s) ──updates──→ Position
Position ──tracked_by──→ PortfolioState
PortfolioState ──feeds──→ RiskEngine (circular dependency, event-driven)
```

---

## Event Flow — Ana Akışlar

### Akış 1: Haber → Alert

```
[News Source] ──HTTP/WS──→ [News Ingestion]
    │
    ├── normalize
    ├── deduplicate
    ├── extract symbols
    │
    └── publish: news.received
            │
            ├──→ [Terminal UI] → haber panelinde göster
            ├──→ [Persistence] → DB'ye yaz
            └──→ [Market Data] → ilgili symbol'ün volume/price'ına bak
                    │
                    └── eğer spike varsa → publish: market.volume_spike
                            │
                            └──→ [Terminal UI] → visual alert
```

### Akış 2: Kullanıcı Emri → Execution

```
[Terminal UI] ──komut──→ [Command Parser]
    │
    ├── parse: "buy SOLUSDT 50 market"
    ├── oluştur: Order object
    │
    └── gönder: [Risk Engine].check_order(order)
            │
            ├── REJECTED → publish: risk.blocked → UI'da göster → log
            │
            └── APPROVED → [Execution Engine].submit(order)
                    │
                    ├── publish: order.submitted
                    ├── borsaya gönder (REST/WS)
                    │
                    ├── ACK geldi → publish: order.acknowledged
                    │       │
                    │       └── [Private Order Stream] dinle
                    │               │
                    │               ├── FILL → publish: order.filled
                    │               │       │
                    │               │       ├── [Portfolio State] güncelle
                    │               │       ├── [Risk Engine] state güncelle
                    │               │       └── [Terminal UI] pozisyon paneli güncelle
                    │               │
                    │               └── REJECT → publish: order.rejected → UI + log
                    │
                    └── HATA → retry (max 2) → hâlâ hata → publish: system.error
```

### Akış 3: WebSocket Reconnect

```
[WebSocket Connection] ──koptu──→ [Market Data Service]
    │
    ├── publish: system.ws_disconnected
    ├── [Terminal UI] → status bar'da kırmızı uyarı
    │
    ├── bekle 1s → reconnect dene
    │   ├── başarılı → publish: system.ws_reconnected → status bar yeşil
    │   └── başarısız → bekle 2s → tekrar dene (exponential backoff, max 30s)
    │
    └── 5 başarısız deneme → publish: system.error → UI'da critical uyarı
        → stale data flag set → emirlere izin verme
```

---

## Concurrency Model

Tek process, çoklu async task.

```
Main Process (asyncio event loop)
  ├── Task: Textual UI loop
  ├── Task: Market Data WS consumer
  ├── Task: News polling loop
  ├── Task: Event bus consumer/dispatcher
  ├── Task: Private order stream consumer
  └── Task: Periodic state sync (her 30s balance/position REST ile doğrula)
```

**Neden thread değil async:**
- I/O-bound iş (network, disk) — async bunun için ideal
- Tek event loop = state race condition riski düşük
- Textual zaten async-native

**Dikkat edilecek noktalar:**
- CPU-bound iş olursa (ileride NLP vb.) `asyncio.to_thread()` kullan
- Blocking call yapma — her şey `await` ile
- Task exception handling — bir task crash'lerse diğerleri etkilenmemeli

---

## Hata Yönetimi Stratejisi

| Hata Tipi | Davranış |
|-----------|----------|
| WS bağlantı kopması | Exponential backoff ile reconnect (1s, 2s, 4s, 8s, max 30s) |
| REST API hatası (5xx) | 2 retry, sonra log + UI uyarı |
| REST API hatası (4xx) | Retry yok, log + UI hata mesajı |
| Rate limit (429) | Bekle (header'daki retry-after), sonra tekrar dene |
| Duplicate event | news_id veya order_id ile deduplicate |
| Stale data | Son veri timestamp'i > 10s ise "STALE" flag, emir engelle |
| Clock drift | Borsa sunucu zamanı ile local saat farkı > 2s ise uyarı |
| DB yazma hatası | Log'a yaz, UI'da uyarı, kritik değilse devam et |
| Bilinmeyen hata | Catch-all, log, UI'da göster, sistemi durdurma |

---

## Güvenlik

### API Key Yönetimi
- `.env` dosyasında sakla
- `.gitignore`'a ekle
- Terminalde asla gösterme
- Log'a asla yazma (mask)

### Network
- Sadece HTTPS ve WSS
- Exchange API endpoint'leri hardcode veya config'den
- Proxy desteği (opsiyonel, config ile)

### Emir Güvenliği
- Her emir risk engine'den geçer
- Fat finger koruması (configurable max order size)
- Duplicate order blocker
- Paper trading mode ile gerçek trade mode ayrımı net ve açık

---

## İleride Eklenebilecek Şeyler (Later)

- PostgreSQL migration (veri büyüdüğünde)
- Redis (cache, pub/sub)
- Multi-exchange support (adapter pattern zaten hazır)
- Prometheus metrics
- Signal engine / keyword scoring
- Backtesting framework
- REST API expose (başka tool'larla entegrasyon için)
