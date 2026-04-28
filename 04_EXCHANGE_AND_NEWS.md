# Exchange & News Integration — CryptoTerminal

## Borsa Entegrasyonu

### Exchange Seçimi: Binance

**Neden Binance:**
- En yüksek likidite ve volume
- Kapsamlı API dökümantasyonu
- WebSocket ve REST API olgun
- `ccxt.pro` ile iyi destekleniyor
- Testnet mevcut (futures + spot)
- Türkiye'den erişilebilir (kontrol gerekebilir, VPN opsiyonu düşünülmeli)

**Alternatif: Bybit**
- Binance'te erişim sorunu olursa Bybit'e geçiş kolay
- ccxt her ikisini de destekliyor
- Adapter pattern sayesinde exchange değişimi tek config satırı

### Bağlantı Mimarisi

```
CryptoTerminal
  │
  ├── PUBLIC WebSocket (market data)
  │     ├── ticker stream
  │     ├── orderbook stream
  │     ├── trade stream
  │     └── (auth gerektirmez)
  │
  ├── PRIVATE WebSocket (user data)
  │     ├── order updates
  │     ├── position updates
  │     ├── balance updates
  │     └── (listenKey ile auth)
  │
  └── REST API (emir gönderme + sorgulama)
        ├── POST orders
        ├── DELETE orders (cancel)
        ├── GET account
        ├── GET positions
        └── (HMAC signature ile auth)
```

### Public Market Data Streams

#### Ticker Stream

```python
# ccxt.pro ile basitleştirilmiş kullanım
ticker = await exchange.watch_ticker("BTC/USDT")

# Beklenen veri
{
    "symbol": "BTC/USDT",
    "last": 67842.50,
    "bid": 67841.20,
    "ask": 67843.80,
    "high": 68100.00,
    "low": 66200.00,
    "volume": 28451.23,        # 24h volume (base currency)
    "quoteVolume": 1930000000,  # 24h volume (quote currency)
    "percentage": 2.34,
    "timestamp": 1709906551442
}
```

#### Orderbook Stream

```python
orderbook = await exchange.watch_order_book("BTC/USDT", limit=10)

# Beklenen veri
{
    "symbol": "BTC/USDT",
    "bids": [[67841.20, 0.22], [67840.00, 1.73], ...],
    "asks": [[67843.80, 0.15], [67844.90, 2.88], ...],
    "timestamp": 1709906551442
}
```

#### Trade Stream

```python
trades = await exchange.watch_trades("BTC/USDT")

# Son işlemler — volume spike tespiti için kullanılır
```

### Private User Data Stream

Binance'te private stream için `listenKey` alınır (REST ile), sonra WebSocket'e bağlanılır. ccxt.pro bunu soyutlar.

```python
# Order güncellemeleri
orders = await exchange.watch_orders()

# Balance güncellemeleri
balance = await exchange.watch_balance()

# Position güncellemeleri (futures)
positions = await exchange.watch_positions()
```

### Emir Gönderme (REST)

```python
# Market buy
order = await exchange.create_market_buy_order(
    symbol="SOL/USDT",
    amount=2.5,  # quantity in base currency
)

# Limit buy
order = await exchange.create_limit_buy_order(
    symbol="BTC/USDT",
    amount=0.003,
    price=67250.00,
)

# Futures long with leverage
await exchange.set_leverage(5, "BTC/USDT")
order = await exchange.create_market_buy_order(
    symbol="BTC/USDT",
    amount=0.015,
    params={"positionSide": "LONG"}
)

# Stop-loss
sl_order = await exchange.create_order(
    symbol="SOL/USDT",
    type="stop_market",
    side="sell",
    amount=2.5,
    params={"stopPrice": 179.44, "closePosition": True}
)
```

### Amount Hesaplama

Kullanıcı USD cinsinden girer, sistem quantity'ye çevirir:

```python
# Kullanıcı: "buy SOLUSDT 50 market"
# amount_usd = 50
# current_price = 187.42
# quantity = 50 / 187.42 = 0.2668
# Borsa precision'a yuvarla: 0.26 (SOL min step: 0.01)
```

Bu dönüşüm execution engine'de yapılır. Her symbol'ün `min_quantity`, `step_size`, `min_notional` değerleri exchange'den alınır ve cache'lenir.

### WebSocket Yönetimi

#### Reconnect Stratejisi

```
Bağlantı koptu
  │
  ├── Durum: DISCONNECTED (status bar'da kırmızı)
  ├── Stale data flag: TRUE (emir göndermeyi engelle)
  │
  ├── Deneme 1: 1 saniye bekle → bağlan
  ├── Deneme 2: 2 saniye bekle → bağlan
  ├── Deneme 3: 4 saniye bekle → bağlan
  ├── Deneme 4: 8 saniye bekle → bağlan
  ├── Deneme 5: 16 saniye bekle → bağlan
  ├── Deneme 6+: 30 saniye bekle → bağlan (max interval)
  │
  └── Bağlantı başarılı
        ├── Durum: CONNECTED
        ├── Stale data flag: FALSE
        ├── Backoff sayacı sıfırla
        └── Stream'lere yeniden subscribe ol
```

#### Heartbeat / Ping

- Binance WS: her 3 dakikada ping gönder, 10 dakika cevap gelmezse timeout
- ccxt.pro bunu yönetiyor ama custom monitoring ekle
- Son mesaj zamanını takip et: 30 saniye sessizlik = uyarı, 60 saniye = reconnect tetikle

#### Stale Data Kontrolü

```python
class StaleDataChecker:
    MAX_AGE_SECONDS = 10

    def is_stale(self, symbol: str) -> bool:
        last_update = self.last_update_times.get(symbol)
        if last_update is None:
            return True
        age = time.time() - last_update
        return age > self.MAX_AGE_SECONDS
```

Stale data varken:
- Ticker'da `[STALE]` etiketi göster
- Market emir göndermeye izin verme
- Limit emir gönderilebilir (kullanıcı riski biliyor)

### Rate Limit Yönetimi

Binance rate limitleri:
- REST: 1200 request weight / dakika (endpoint'e göre weight değişir)
- Order: 10 emir / saniye, 100,000 / gün
- WebSocket: 5 mesaj / saniye

Strateji:
- Her REST çağrısından sonra response header'daki `X-MBX-USED-WEIGHT` takip et
- Weight %80'e ulaşınca yavaşla
- %95'te sadece kritik çağrıları yap (cancel, emergency close)
- WebSocket mesajları sıralayarak gönder (queue)

### Testnet Kullanımı

Gerçek trade'den önce testnet'te test:

```python
# .env
EXCHANGE=binance
EXCHANGE_TESTNET=true

# ccxt config
exchange = ccxt.pro.binance({
    "apiKey": "testnet_key",
    "secret": "testnet_secret",
    "sandbox": True,  # testnet aktif
})
```

Testnet limitleri:
- Binance Futures testnet: testnet.binancefuture.com
- Gerçek API ile aynı yapı ama sahte para
- Likidite düşük olabilir, fill simülasyonu farklılık gösterebilir
- Ama emir akışı, WebSocket yapısı, hata kodları gerçeğiyle aynı

### Exchange Adapter Interface

İleride multi-exchange desteği için adapter pattern:

```python
from abc import ABC, abstractmethod

class ExchangeAdapter(ABC):

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def watch_ticker(self, symbol: str) -> AsyncIterator[Ticker]: ...

    @abstractmethod
    async def watch_orderbook(self, symbol: str, depth: int) -> AsyncIterator[OrderBook]: ...

    @abstractmethod
    async def watch_orders(self) -> AsyncIterator[Order]: ...

    @abstractmethod
    async def create_market_order(self, symbol: str, side: str, amount_usd: float) -> Order: ...

    @abstractmethod
    async def create_limit_order(self, symbol: str, side: str, amount_usd: float, price: float) -> Order: ...

    @abstractmethod
    async def cancel_order(self, order_id: str, symbol: str) -> bool: ...

    @abstractmethod
    async def get_balance(self) -> Balance: ...

    @abstractmethod
    async def get_positions(self) -> list[Position]: ...

    @abstractmethod
    async def set_leverage(self, symbol: str, leverage: int) -> None: ...
```

MVP'de sadece `BinanceAdapter` implement edilir. Ama bu interface sayesinde `BybitAdapter` eklemek kolay olur.

---

## Haber Entegrasyonu

### Kaynak Stratejisi

Tek kaynağa bağımlı olma. Çoklu kaynak + ortak format.

MVP'de kullanılacak kaynaklar (öncelik sırasına göre):

| Kaynak | Tip | Avantaj | Dezavantaj |
|--------|-----|---------|------------|
| CryptoPanic API | REST poll | Kripto odaklı, filtrelenmiş, ücretsiz plan var | Latency yüksek olabilir |
| Binance Announcements | REST poll | Listing/delisting için en hızlı | Sadece Binance haberleri |
| RSS Feeds (CoinDesk vb.) | REST poll | Ücretsiz, çeşitli | Genel, çok gürültülü |

### Later Kaynaklar (MVP Sonrası)

| Kaynak | Neden sonra |
|--------|-------------|
| Twitter/X API | Pahalı, rate limit sıkı, spam filtresi gerek |
| Telegram channel scraping | Gri alan, bakımı zor |
| Finnhub News WS | WebSocket haber akışı — ücretli plan gerekebilir |
| The Block / Decrypt RSS | Ek kaynak olarak eklenebilir |

### Haber Adapter Interface

```python
from abc import ABC, abstractmethod

class NewsAdapter(ABC):

    @abstractmethod
    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]: ...

    @abstractmethod
    def source_name(self) -> str: ...

    @abstractmethod
    def source_priority(self) -> int:
        """1 = en güvenilir, 5 = en az güvenilir"""
        ...
```

### Haber Normalizasyonu

Her kaynaktan gelen ham veri ortak formata dönüştürülür:

```python
class NormalizedNews(BaseModel):
    id: str                         # unique, kaynak bazlı
    headline: str
    source: str
    source_priority: int            # 1-5
    published_at: datetime          # kaynaktaki zaman
    received_at: datetime           # bize ulaştığı an
    latency_ms: int                 # fark (ms)
    related_symbols: list[str]      # ["BTCUSDT", "SOLUSDT"]
    tags: list[str]                 # ["ETF", "SEC", "listing"]
    priority: str                   # HIGH / MED / LOW
    url: str | None
    raw_content: str | None         # opsiyonel, tam metin
```

### Symbol Extraction (Coin Eşleştirme)

Haber başlığından hangi coin'in ilgili olduğunu çıkar:

```python
# Basit keyword matching (MVP)
SYMBOL_KEYWORDS = {
    "bitcoin": "BTC",
    "btc": "BTC",
    "ethereum": "BTC",
    "eth": "ETH",
    "solana": "SOL",
    "sol": "SOL",
    "xrp": "XRP",
    "ripple": "XRP",
    "dogecoin": "DOGE",
    "doge": "DOGE",
    # ... configurable, genişletilebilir
}

def extract_symbols(headline: str) -> list[str]:
    headline_lower = headline.lower()
    found = set()
    for keyword, symbol in SYMBOL_KEYWORDS.items():
        if keyword in headline_lower:
            found.add(f"{symbol}USDT")
    return list(found)
```

**Later:** NLP-based extraction, entity recognition.

### Priority Belirleme

```python
HIGH_KEYWORDS = [
    "hack", "exploit", "SEC", "ETF", "approved", "rejected",
    "listing", "delisting", "ban", "regulation", "crash",
    "emergency", "blackrock", "fed", "rate"
]

MED_KEYWORDS = [
    "partnership", "launch", "update", "upgrade", "fork",
    "airdrop", "token", "mainnet", "testnet"
]

def determine_priority(headline: str) -> str:
    headline_lower = headline.lower()
    if any(kw in headline_lower for kw in HIGH_KEYWORDS):
        return "HIGH"
    if any(kw in headline_lower for kw in MED_KEYWORDS):
        return "MED"
    return "LOW"
```

Keyword listeleri config dosyasından yüklenir, çalışırken güncellenebilir.

### Duplicate Detection

Aynı haber farklı kaynaklardan gelebilir. Basit deduplicate:

```python
class DeduplicateFilter:
    def __init__(self, window_seconds: int = 300):
        self.seen: dict[str, datetime] = {}  # hash → first seen time
        self.window = timedelta(seconds=window_seconds)

    def is_duplicate(self, news: NormalizedNews) -> bool:
        # Başlığın normalize edilmiş hash'i
        key = self._hash_headline(news.headline)
        now = datetime.utcnow()

        # Eski entry'leri temizle
        self._cleanup(now)

        if key in self.seen:
            return True
        self.seen[key] = now
        return False

    def _hash_headline(self, headline: str) -> str:
        # lowercase, strip, ilk 100 karakter, hash
        normalized = headline.lower().strip()[:100]
        return hashlib.md5(normalized.encode()).hexdigest()
```

### Polling Döngüsü

```python
async def news_polling_loop(adapters: list[NewsAdapter], bus: EventBus):
    last_check: dict[str, datetime] = {}

    while True:
        for adapter in adapters:
            try:
                since = last_check.get(adapter.source_name())
                raw_items = await adapter.fetch_latest(since=since)
                last_check[adapter.source_name()] = datetime.utcnow()

                for item in raw_items:
                    normalized = normalize(item, adapter)

                    if dedup_filter.is_duplicate(normalized):
                        continue

                    await bus.publish("news.received", normalized)

            except Exception as e:
                logger.error("news_fetch_error",
                    source=adapter.source_name(),
                    error=str(e)
                )

        await asyncio.sleep(NEWS_POLL_INTERVAL)  # config: 10-30 saniye
```

### Haber Latency Takibi

Çok kritik. Kullanıcı "bu haber ne kadar eski" bilmeli.

```
Haber kaynakta yayınlandı: 14:22:15
Bize ulaştı:               14:22:28
Latency:                    13 saniye

Terminalde gösterimi:
  [14:22:28] +13s  SEC Approves Solana ETF...
```

- `+5s` altı: iyi
- `+5-30s`: kabul edilebilir
- `+30s-2m`: uyarı (sarı)
- `+2m` üstü: eski haber (gri, düşük öncelik)

### CryptoPanic API Örnek Entegrasyon

```python
class CryptoPanicAdapter(NewsAdapter):
    BASE_URL = "https://cryptopanic.com/api/free/v1/posts/"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = httpx.AsyncClient()

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        params = {
            "auth_token": self.api_key,
            "kind": "news",
            "filter": "hot",  # veya "rising", "bullish", "bearish"
        }
        resp = await self.client.get(self.BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        items = []
        for post in data.get("results", []):
            items.append(RawNewsItem(
                id=f"cp_{post['id']}",
                headline=post["title"],
                published_at=parse_datetime(post["published_at"]),
                url=post.get("url"),
                source="cryptopanic",
                currencies=[c["code"] for c in post.get("currencies", [])],
            ))
        return items

    def source_name(self) -> str:
        return "cryptopanic"

    def source_priority(self) -> int:
        return 2
```

### Config: Haber Kaynakları

```python
# .env
NEWS_SOURCES=cryptopanic,binance_announcements,rss

# Kaynak bazlı config
CRYPTOPANIC_API_KEY=xxx
CRYPTOPANIC_FILTER=hot
CRYPTOPANIC_POLL_INTERVAL=15

BINANCE_ANN_POLL_INTERVAL=30

RSS_FEEDS=https://www.coindesk.com/arc/outboundfeeds/rss/,https://cointelegraph.com/rss
RSS_POLL_INTERVAL=60
```
