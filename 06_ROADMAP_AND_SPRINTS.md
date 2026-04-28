# Roadmap & Sprints — CryptoTerminal

## Geliştirme Fazları

### Faz 0 — Proje İskeleti (1-2 gün)

**Amaç:** Çalışan bir boş proje, doğru klasör yapısı, temel config.

Yapılacaklar:
- Python projesi oluştur (pyproject.toml, poetry veya uv)
- Klasör yapısını kur
- .env.example oluştur
- pydantic-settings ile config modülü
- structlog ile logging altyapısı
- SQLite bağlantısı ve tablo oluşturma (migration script)
- Basit event bus iskeleti (asyncio.Queue)
- pytest altyapısı
- .gitignore, README.md

Çıktı: `python -m cryptoterminal` çalıştırınca boş terminal açılır, log dosyası oluşur, config yüklenir.

---

### Faz 1 — Sadece Okuma: Market Data + Haber (1-2 hafta)

**Amaç:** Borsadan canlı veri al, haber çek, terminalde göster. Hiçbir emir gönderme.

#### Sprint 1.1 — Market Data (3-4 gün)

Görevler:
- [ ] ccxt.pro ile Binance WebSocket bağlantısı
- [ ] Ticker stream: watchlist'teki coinlerin fiyatını al
- [ ] Orderbook stream: istendiğinde derinlik göster
- [ ] Reconnect mekanizması (exponential backoff)
- [ ] Stale data detection
- [ ] Market data event'lerini event bus'a yayınla
- [ ] Basit terminal çıktısı (Rich ile tablo)

Kabul kriterleri:
- Terminal açılınca BTC, ETH, SOL fiyatları canlı güncellenir
- WS koparsan 3 saniye içinde reconnect olur
- 10 saniye veri gelmezse STALE uyarısı çıkar

#### Sprint 1.2 — News Ingestion (3-4 gün)

Görevler:
- [ ] NewsAdapter interface
- [ ] CryptoPanic adapter
- [ ] Binance Announcements adapter (RSS veya scrape)
- [ ] Haber normalizasyonu (NormalizedNews model)
- [ ] Duplicate detection
- [ ] Symbol extraction (keyword matching)
- [ ] Priority belirleme (keyword based)
- [ ] Latency hesaplama (published_at vs received_at)
- [ ] Polling loop (configurable interval)
- [ ] news.received event'ini event bus'a yayınla

Kabul kriterleri:
- Terminal açılınca haberler akıyor
- Duplicate haber gösterilmiyor
- HIGH priority haber kırmızı renkte görünüyor
- Latency gösteriliyor (+Xs formatında)

#### Sprint 1.3 — Terminal UI v1 (3-4 gün)

Görevler:
- [ ] Textual app iskeleti
- [ ] 4 panelli layout
- [ ] Status bar (WS durumu, mode, balance placeholder)
- [ ] News feed paneli (scrollable)
- [ ] Watchlist paneli (canlı güncellenen tablo)
- [ ] Positions paneli (boş, placeholder)
- [ ] Command input paneli
- [ ] Event bus'tan gelen event'leri UI'a yönlendir
- [ ] Renk kodları

Kabul kriterleri:
- 4 panelli ekran düzgün render ediliyor
- Haberler ve fiyatlar canlı güncelleniyor
- Resize'da layout bozulmuyor

---

### Faz 2 — Komut Sistemi (1 hafta)

**Amaç:** Komut parse et, bilgi komutlarını çalıştır. Emir komutu henüz yok.

#### Sprint 2.1 — Command Parser (2-3 gün)

Görevler:
- [ ] Command tokenizer
- [ ] Command registry (komut adı → handler mapping)
- [ ] Parametre parsing ve validasyon
- [ ] Hata mesajları (eksik param, geçersiz değer)
- [ ] Komut geçmişi (yukarı/aşağı ok)
- [ ] Symbol kısaltma (BTC → BTCUSDT)

#### Sprint 2.2 — Bilgi Komutları (2-3 gün)

Görevler:
- [ ] `watch` / `unwatch`
- [ ] `ticker`
- [ ] `book`
- [ ] `news`
- [ ] `status`
- [ ] `ping`
- [ ] `help`
- [ ] `clear`

Kabul kriterleri:
- Tüm bilgi komutları çalışır
- Hatalı komut anlamlı hata mesajı verir
- Komut geçmişi ok tuşlarıyla çalışır

---

### Faz 3 — Paper Trading (1-2 hafta)

**Amaç:** Gerçek fiyat verisini kullanarak sahte emir simülasyonu. Gerçek para riski yok.

#### Sprint 3.1 — Execution Engine (Paper Mode) (3-4 gün)

Görevler:
- [ ] Order model (pydantic)
- [ ] Paper execution engine
  - Market emir: anlık fiyattan simüle fill (spread + slippage eklenerek)
  - Limit emir: fiyata ulaşınca simüle fill
- [ ] Order lifecycle state machine (CREATED → SUBMITTED → FILLED / REJECTED)
- [ ] Fill event yayınlama
- [ ] Orders ve fills'i DB'ye kaydet

#### Sprint 3.2 — Risk Engine v1 (3-4 gün)

Görevler:
- [ ] RiskEngine class
- [ ] Pre-trade check pipeline:
  - Max trade size
  - Max daily loss
  - Max open positions
  - Max leverage
  - Duplicate order blocker
  - Stale data check
- [ ] Risk state tracking
- [ ] `risk` ve `limits` komutları
- [ ] Risk check loglaması

#### Sprint 3.3 — Portfolio State + Emir Komutları (3-4 gün)

Görevler:
- [ ] Portfolio state manager (pozisyonlar, bakiye, PnL)
- [ ] `buy` / `sell` komutları
- [ ] `long` / `short` komutları
- [ ] `close` komutu
- [ ] `sl` / `tp` komutları
- [ ] `positions` / `orders` / `pnl` / `balance` komutları
- [ ] `cancel` komutu
- [ ] `panic` komutu (paper mode'da simüle)
- [ ] Positions panelini canlı PnL ile güncelle

Kabul kriterleri:
- Paper mode'da emir girebilirsin
- Risk engine emri kontrol eder, geçerse simüle fill olur
- PnL canlı güncellenir
- Günlük zarar limiti aşılınca trading kilitlenir
- panic komutu çalışır

---

### Faz 4 — Gerçek Trade (1-2 hafta)

**Amaç:** Testnet'te, sonra küçük miktarla gerçek trade.

#### Sprint 4.1 — Testnet Trading (3-4 gün)

Görevler:
- [ ] API key yönetimi (.env, secrets masking)
- [ ] Exchange adapter: real execution (ccxt ile emir gönderme)
- [ ] Mode switching: `mode paper` / `mode live`
- [ ] Testnet config (`EXCHANGE_TESTNET=true`)
- [ ] Order acknowledgement handling
- [ ] Private order stream: gerçek fill/cancel event'leri
- [ ] REST ile periyodik state doğrulama (balance, positions)

#### Sprint 4.2 — Live Trading (2-3 gün)

Görevler:
- [ ] Testnet → mainnet geçiş (config değişikliği)
- [ ] Küçük miktarlarla test (RISK_MAX_TRADE_USD=20 ile başla)
- [ ] Fat finger koruması double-check
- [ ] Error handling sağlamlaştırma
- [ ] Retry logic (network hatası, 5xx)
- [ ] Rate limit tracking

Kabul kriterleri:
- Testnet'te gerçek emir gider ve fill gelir
- Private stream'den order update'ler doğru parse edilir
- Bağlantı kopunca reconnect olur, state tutarlı kalır
- Rate limit aşılmaz

---

### Faz 5 — Risk Otomasyonu + İyileştirmeler (1-2 hafta)

Görevler:
- [ ] Spread kontrolü (uyarı + onay)
- [ ] Haber sonrası delay filtresi
- [ ] Stop-loss reminder
- [ ] Cooldown sistemi (normal + panic sonrası)
- [ ] Alias / macro sistemi (`alias`, `bind`)
- [ ] Komut auto-complete (tab completion)
- [ ] Daha iyi orderbook görselleştirme
- [ ] Volume spike detection ve alert

---

### Faz 6 — Later (Backlog)

Tahmini süre yok, ihtiyaca göre:

- [ ] Multi-exchange support (Bybit adapter)
- [ ] Keyword engine (gelişmiş haber analizi)
- [ ] Confidence scoring
- [ ] PostgreSQL migration
- [ ] Redis (cache, pub/sub)
- [ ] Backtesting framework
- [ ] REST API (dış entegrasyon)
- [ ] Telegram/Discord alert
- [ ] Twitter/X haber kaynağı
- [ ] Prometheus/Grafana monitoring
- [ ] Session replay (tüm event'leri tekrar oynatma)

---

## Klasör Yapısı

```
cryptoterminal/
├── pyproject.toml              # proje tanımı, bağımlılıklar
├── README.md
├── .env.example                # örnek config
├── .env                        # gerçek config (gitignore'da)
├── .gitignore
│
├── src/
│   └── cryptoterminal/
│       ├── __init__.py
│       ├── __main__.py         # entry point: python -m cryptoterminal
│       ├── app.py              # ana uygulama başlatıcı, task orchestration
│       │
│       ├── config/
│       │   ├── __init__.py
│       │   └── settings.py     # pydantic-settings, tüm config
│       │
│       ├── core/
│       │   ├── __init__.py
│       │   ├── event_bus.py    # async event bus
│       │   ├── models.py       # domain modelleri (Order, Position, Ticker, vb.)
│       │   └── enums.py        # OrderSide, OrderType, OrderStatus, vb.
│       │
│       ├── market/
│       │   ├── __init__.py
│       │   ├── service.py      # market data service (WS yönetimi)
│       │   ├── adapter.py      # exchange adapter interface + binance impl
│       │   └── stale.py        # stale data checker
│       │
│       ├── news/
│       │   ├── __init__.py
│       │   ├── service.py      # news ingestion service (polling loop)
│       │   ├── adapter.py      # news adapter interface
│       │   ├── cryptopanic.py  # CryptoPanic adapter
│       │   ├── binance_ann.py  # Binance announcements adapter
│       │   ├── rss.py          # RSS adapter
│       │   ├── normalize.py    # normalizasyon, symbol extraction, priority
│       │   └── dedup.py        # duplicate detection
│       │
│       ├── execution/
│       │   ├── __init__.py
│       │   ├── engine.py       # execution engine (paper + real mode switch)
│       │   ├── paper.py        # paper trading simulator
│       │   └── live.py         # gerçek exchange execution
│       │
│       ├── risk/
│       │   ├── __init__.py
│       │   ├── engine.py       # risk engine, pre-trade checks
│       │   ├── rules.py        # her bir risk kuralı (ayrı fonksiyonlar)
│       │   └── state.py        # risk state tracking
│       │
│       ├── portfolio/
│       │   ├── __init__.py
│       │   ├── manager.py      # pozisyon ve bakiye yönetimi
│       │   └── pnl.py          # PnL hesaplamaları
│       │
│       ├── cli/
│       │   ├── __init__.py
│       │   ├── parser.py       # komut tokenizer ve parser
│       │   ├── registry.py     # komut registry
│       │   ├── handlers.py     # komut handler fonksiyonları
│       │   └── aliases.py      # alias ve hotkey yönetimi
│       │
│       ├── ui/
│       │   ├── __init__.py
│       │   ├── app.py          # Textual app ana sınıf
│       │   ├── layout.py       # panel düzeni
│       │   ├── news_panel.py   # haber paneli widget
│       │   ├── market_panel.py # watchlist paneli widget
│       │   ├── position_panel.py # pozisyon paneli widget
│       │   ├── command_panel.py  # komut + log paneli widget
│       │   └── status_bar.py   # üst status bar widget
│       │
│       ├── persistence/
│       │   ├── __init__.py
│       │   ├── database.py     # SQLite bağlantı yönetimi
│       │   ├── migrations.py   # tablo oluşturma SQL'leri
│       │   └── repository.py   # CRUD operasyonları
│       │
│       └── utils/
│           ├── __init__.py
│           ├── logging.py      # structlog konfigürasyonu
│           ├── time.py         # timestamp yardımcıları
│           └── formatting.py   # sayı, para formatlaması
│
├── config/
│   └── aliases.json            # kullanıcı alias ve binding'leri
│
├── data/
│   └── terminal.db             # SQLite veritabanı (gitignore'da)
│
├── logs/
│   └── terminal.log            # log dosyası (gitignore'da)
│
└── tests/
    ├── __init__.py
    ├── conftest.py             # pytest fixtures
    ├── test_event_bus.py
    ├── test_command_parser.py
    ├── test_risk_engine.py
    ├── test_paper_execution.py
    ├── test_news_normalize.py
    ├── test_pnl.py
    └── test_models.py
```

### Klasör Yapısı Kararları

**Neden `src/` layout:**
- Import sorunlarını önler
- Test dosyaları ile kaynak kodu net ayrılır
- Python packaging best practice

**Neden her modül ayrı klasör:**
- Market, news, execution, risk → bağımsız sorumluluklar
- Bir modül büyüdüğünde kendi içinde dosya bölünür
- Ama hepsi tek process'te çalışır, mikroservis değil

**Neden `core/` klasörü:**
- Tüm modüllerin paylaştığı şeyler: event bus, domain modelleri, enum'lar
- Circular dependency riski azalır

---

## Sprint 1 Task Listesi (Detaylı)

İlk sprint = Faz 0 + Sprint 1.1 (ilk hafta)

### Gün 1-2: Proje İskeleti

```
[ ] pyproject.toml oluştur
    - python >= 3.12
    - dependencies: textual, rich, httpx, websockets, ccxt,
      pydantic, pydantic-settings, structlog, aiosqlite,
      python-dotenv
    - dev dependencies: pytest, pytest-asyncio, ruff

[ ] Klasör yapısını oluştur (boş __init__.py dosyaları ile)

[ ] .env.example yaz (tüm config key'leri)

[ ] config/settings.py — pydantic-settings ile Settings class
    - exchange ayarları
    - watchlist
    - risk limitleri
    - news ayarları
    - log ayarları
    - db path

[ ] utils/logging.py — structlog setup
    - JSON formatında dosyaya yaz
    - Console'a renkli çıktı

[ ] persistence/database.py — SQLite bağlantı
[ ] persistence/migrations.py — tablo oluşturma

[ ] core/event_bus.py — basit async event bus
    - publish, subscribe, start
    - test yaz

[ ] core/models.py — temel pydantic modelleri
    - Ticker, OrderBook, NormalizedNews, Order, Fill, Position

[ ] core/enums.py
    - OrderSide, OrderType, OrderStatus, TradingMode

[ ] __main__.py — entry point
    - config yükle, log başlat, DB oluştur, "Ready" yazdır

[ ] Test: python -m cryptoterminal çalışır, log oluşur
```

### Gün 3-4: Market Data

```
[ ] market/adapter.py — ExchangeAdapter interface
[ ] market/adapter.py — BinanceAdapter (ccxt.pro)
    - connect()
    - watch_ticker()
    - watch_order_book()
    - reconnect handling

[ ] market/stale.py — StaleDataChecker
    - is_stale(symbol) → bool
    - update(symbol, timestamp)

[ ] market/service.py — MarketDataService
    - watchlist'teki her symbol için ticker stream başlat
    - event bus'a market.ticker_update yayınla
    - reconnect logic
    - stale data check

[ ] Rich ile basit terminal çıktısı
    - Tablo: Symbol | Price | 24h% | Volume
    - Her güncelleme tabloyu refresh eder

[ ] Test: 3 coin fiyatı canlı güncelleniyor
[ ] Test: WS koparınca reconnect oluyor
[ ] Test: 10s veri gelmezse STALE uyarısı
```

### Gün 5 (opsiyonel): İlk news adapter

```
[ ] news/adapter.py — NewsAdapter interface
[ ] news/cryptopanic.py — CryptoPanic basit polling
[ ] news/normalize.py — headline → NormalizedNews
[ ] Console'da haber listesi göster

[ ] Test: haberler geliyor, normalize ediliyor
```

---

## Bağımlılık Listesi

```toml
[project]
name = "cryptoterminal"
version = "0.1.0"
requires-python = ">=3.12"

dependencies = [
    "textual>=0.85.0",
    "rich>=13.0",
    "httpx>=0.27",
    "websockets>=12.0",
    "ccxt>=4.0",
    "pydantic>=2.5",
    "pydantic-settings>=2.1",
    "structlog>=24.0",
    "aiosqlite>=0.20",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "ruff>=0.4",
]
```

---

## Çalıştırma

```bash
# Kurulum
cd cryptoterminal
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Config
cp .env.example .env
# .env'yi düzenle: API key'leri gir

# Çalıştır
python -m cryptoterminal

# Test
pytest tests/ -v
```
