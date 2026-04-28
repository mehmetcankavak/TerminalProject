# CLI & Terminal Specification — CryptoTerminal

## Terminal Ekran Düzeni

```
┌─────────────────────────────── STATUS BAR ──────────────────────────────────┐
│ ● Binance WS: CONNECTED  │  Ping: 42ms  │  Mode: PAPER  │  USDT: 10,000  │
├──────────────────────────────┬──────────────────────────────────────────────┤
│      📰 NEWS FEED            │         📊 WATCHLIST                         │
│                              │                                              │
│  [14:22:28] +13s             │  BTCUSDT   67,842.50  +2.34%  Vol: 28.4K    │
│  SEC Approves Solana ETF     │  ETHUSDT    3,421.80  +1.12%  Vol: 142.1K   │
│  Source: CryptoPanic  HIGH   │  SOLUSDT      187.42  +8.71%  Vol: 891.2K ▲ │
│  Tags: SOL, ETF, SEC        │  DOGEUSDT      0.182  -0.45%  Vol: 2.1B     │
│                              │                                              │
│  [14:21:05] +2s              │  ▲ = volume spike (>2x avg)                  │
│  Binance Lists New Perp...   │                                              │
│  Source: Binance Ann.  MED   │                                              │
├──────────────────────────────┼──────────────────────────────────────────────┤
│      💼 POSITIONS & PnL      │         ⌨️  COMMAND & LOG                    │
│                              │                                              │
│  SOLUSDT  LONG  2.5 SOL     │  [14:22:35] buy SOLUSDT 50 market            │
│  Entry: 185.20  Now: 187.42 │  [14:22:35] ✓ Risk check passed              │
│  PnL: +$5.55 (+1.20%)       │  [14:22:35] → Order submitted                │
│  SL: 179.44 (-3%)           │  [14:22:36] ✓ Filled @ 187.42 qty=2.5       │
│                              │  [14:22:36] Position opened: SOLUSDT LONG    │
│  Daily PnL: +$12.30         │                                              │
│  Open: 1/3  Risk: 23%/100%  │                                              │
│                              │  ──────────────────────────────              │
│                              │  > _                                         │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### Panel Açıklamaları

**Status Bar (üst çubuk):**
- Exchange WebSocket durumu (CONNECTED / DISCONNECTED / RECONNECTING)
- Ping/latency
- Trading mode (PAPER / LIVE / LOCKED)
- Hesap bakiyesi

**News Feed (sol üst):**
- Haber başlığı
- Kaynak adı
- Öncelik seviyesi (HIGH / MED / LOW)
- İlgili tag'ler
- Timestamp + latency (`+13s` = haberin kaynakta yayınlanmasından bize ulaşmasına kadar geçen süre)
- Yeni HIGH priority haber gelince visual flash

**Watchlist (sağ üst):**
- İzlenen coin'lerin anlık fiyatı
- 24h yüzde değişim
- 24h volume
- Volume spike göstergesi (▲)
- Fiyat yukarı = yeşil, aşağı = kırmızı

**Positions & PnL (sol alt):**
- Açık pozisyonlar (symbol, yön, miktar, giriş fiyatı, anlık fiyat, PnL)
- Stop-loss / take-profit seviyeleri
- Günlük toplam PnL
- Açık pozisyon sayısı / limit
- Risk kullanım oranı

**Command & Log (sağ alt):**
- Komut geçmişi ve sonuçları
- Order event'leri (submitted, filled, rejected)
- Sistem mesajları
- Aktif komut satırı (`> _`)

---

## Komut Referansı

### Watchlist ve Piyasa Verisi

```
watch <symbols...>
  Watchlist'e coin ekle.
  Örnek: watch BTC ETH SOL DOGE
  Not: Symbol sonuna USDT eklenmezse otomatik eklenir.

unwatch <symbols...>
  Watchlist'ten çıkar.
  Örnek: unwatch DOGE

ticker <symbol>
  Tek coin'in detaylı fiyat bilgisi.
  Çıktı: last, bid, ask, spread, 24h high/low, volume, funding rate
  Örnek: ticker BTCUSDT

book <symbol> [depth]
  Orderbook göster. Varsayılan derinlik: 10.
  Çıktı: bid/ask seviyeleri, toplam miktar, spread
  Örnek: book BTCUSDT 20
```

### Haber

```
news [count]
  Son haberleri göster. Varsayılan: 10.
  Örnek: news 20

news <symbol>
  Belirli coin ile ilgili son haberleri filtrele.
  Örnek: news SOL
```

### Emir Komutları

```
buy <symbol> <amount_usd> <type> [price]
  Alış emri gir.
  type: market | limit
  amount_usd: USDT cinsinden işlem büyüklüğü
  Örnekler:
    buy BTCUSDT 200 market
    buy ETHUSDT 150 limit 3400

sell <symbol> <amount_usd> <type> [price]
  Satış emri gir.
  Örnekler:
    sell BTCUSDT 200 market
    sell ETHUSDT 150 limit 3500

long <symbol> <amount_usd> <leverage>
  Kaldıraçlı long pozisyon aç (futures). Market emir.
  Örnek: long BTCUSDT 100 5x

short <symbol> <amount_usd> <leverage>
  Kaldıraçlı short pozisyon aç (futures). Market emir.
  Örnek: short ETHUSDT 100 3x

close <symbol>
  Pozisyonu kapat (market ile).
  Örnek: close SOLUSDT

close all
  Tüm açık pozisyonları kapat.
```

### Stop-Loss ve Take-Profit

```
sl <symbol> <percentage>
  Stop-loss ayarla (giriş fiyatından yüzde olarak).
  Örnek: sl BTCUSDT 2.5%

tp <symbol> <percentage>
  Take-profit ayarla.
  Örnek: tp BTCUSDT 4%

sl <symbol> <price>
  Stop-loss kesin fiyat olarak.
  Örnek: sl BTCUSDT 66000

tp <symbol> <price>
  Take-profit kesin fiyat olarak.
  Örnek: tp BTCUSDT 70000
```

### Emir Yönetimi

```
orders
  Açık emirleri listele.

cancel <order_id>
  Belirli emri iptal et.
  Örnek: cancel ord_001

cancel <symbol>
  Belirli coin'deki tüm emirleri iptal et.
  Örnek: cancel BTCUSDT

cancel all
  Tüm açık emirleri iptal et.
```

### Pozisyon ve Portföy

```
positions | pos
  Açık pozisyonları göster.

pnl
  Günlük PnL özeti (realized + unrealized).

pnl <symbol>
  Belirli coin'in PnL'i.

balance | bal
  Hesap bakiyesi.

history [count]
  Son işlem geçmişi. Varsayılan: 20.
```

### Risk

```
risk
  Risk durumu özeti: günlük zarar, açık pozisyon sayısı, kullanılan marj, vb.

limits
  Aktif risk limitleri.
```

### Sistem

```
panic
  ACİL ÇIKIŞ. Tüm pozisyonları kapat + tüm emirleri iptal et + cooldown.
  Onay ister: "PANIC CLOSE: 2 positions, 3 orders. Type YES to confirm:"

status
  Sistem durumu: WS bağlantıları, son veri zamanları, mode.

mode paper
  Paper trading moduna geç.

mode live
  Gerçek trading moduna geç. Onay ister.

ping
  Exchange API latency ölç.

clear
  Komut log panelini temizle.

help [command]
  Yardım. Parametresiz: tüm komutlar. Parametreli: detay.

quit | exit
  Terminali kapat. Açık pozisyon varsa uyarı verir.
```

---

## Komut Parser Kuralları

### Genel Kurallar

1. Komutlar case-insensitive: `BUY` = `buy` = `Buy`
2. Symbol case-insensitive: `btcusdt` = `BTCUSDT`
3. Symbol kısaltma: `BTC` → otomatik `BTCUSDT` (config'deki quote currency'ye göre)
4. Leverage formatı: `5x` veya `5`
5. Yüzde formatı: `2.5%` veya `2.5`
6. Bilinmeyen komut: `Unknown command. Type 'help' for available commands.`
7. Eksik parametre: `Missing parameter: <param>. Usage: <usage>`

### Parse Sırası

```
input: "buy BTCUSDT 200 market"
  │
  ├── tokenize: ["buy", "BTCUSDT", "200", "market"]
  ├── command: "buy"
  ├── resolve symbol: "BTCUSDT" (geçerli mi? watchlist'te mi?)
  ├── parse amount: 200.0 (sayısal mı?)
  ├── parse type: "market" (market|limit?)
  ├── validate: tüm required field'lar var mı?
  │
  └── result: BuyOrder(symbol="BTCUSDT", amount_usd=200.0, type="market")
```

### Hata Örnekleri

```
> buy BTCUSDT
  ✗ Missing parameter: amount. Usage: buy <symbol> <amount_usd> <type> [price]

> buy BTCUSDT 200 limit
  ✗ Limit order requires price. Usage: buy <symbol> <amount_usd> limit <price>

> buy XYZUSDT 200 market
  ✗ Unknown symbol: XYZUSDT. Add to watchlist first: watch XYZ

> sell BTCUSDT 99999 market
  ✗ Risk check failed: amount $99,999 exceeds max trade size ($200)
```

---

## Macro / Alias Sistemi

Sık kullanılan komutları kısayola bağla.

### Tanımlama

```
alias <name> <command>
  Örnek:
    alias b1 buy BTCUSDT 100 market
    alias s1 close BTCUSDT
    alias n news 20
    alias r risk
    alias p positions

unalias <name>
  Kaldır.

aliases
  Tüm alias'ları listele.
```

### Kullanım

```
> b1
  → buy BTCUSDT 100 market (otomatik genişler)
```

### Hotkey Binding

```
bind <key> <command>
  Örnek:
    bind f1 buy BTCUSDT 100 market
    bind f2 close BTCUSDT
    bind f5 panic
    bind f12 news 10

unbind <key>
  Kaldır.

bindings
  Tüm binding'leri listele.
```

Desteklenen tuşlar: `f1`-`f12`, `ctrl+1`-`ctrl+9`

### Alias ve Binding Kalıcılığı

Config dosyasında (`config/aliases.json`) saklanır. Terminal açılınca yüklenir.

```json
{
  "aliases": {
    "b1": "buy BTCUSDT 100 market",
    "s1": "close BTCUSDT",
    "n": "news 20",
    "r": "risk",
    "p": "positions"
  },
  "bindings": {
    "f1": "buy BTCUSDT 100 market",
    "f2": "close BTCUSDT",
    "f5": "panic"
  }
}
```

---

## Komut Çıktı Formatları

### Ticker Çıktısı

```
> ticker BTCUSDT
  ┌─────────────────────────────────┐
  │ BTCUSDT          Binance       │
  │ Last:    67,842.50              │
  │ Bid:     67,841.20              │
  │ Ask:     67,843.80              │
  │ Spread:  2.60 (0.004%)         │
  │ 24h:     +2.34%                │
  │ High:    68,100.00              │
  │ Low:     66,200.00              │
  │ Vol:     28,451 BTC             │
  │ Funding: 0.0100%               │
  └─────────────────────────────────┘
```

### Orderbook Çıktısı

```
> book BTCUSDT 5
  ┌──────────────────────────────────────┐
  │ BTCUSDT Orderbook     Spread: 2.60  │
  ├──────────────────────────────────────┤
  │ ASK                                  │
  │  67,850.00   3.21 BTC   ████████    │
  │  67,848.40   1.05 BTC   ███         │
  │  67,846.10   0.42 BTC   █           │
  │  67,844.90   2.88 BTC   ███████     │
  │  67,843.80   0.15 BTC   ▏           │
  │ ──── spread: 2.60 ────              │
  │  67,841.20   0.22 BTC   █           │
  │  67,840.00   1.73 BTC   █████       │
  │  67,838.50   4.10 BTC   ██████████  │
  │  67,836.00   0.89 BTC   ██          │
  │  67,834.20   2.44 BTC   ██████      │
  │ BID                                  │
  └──────────────────────────────────────┘
```

### Positions Çıktısı

```
> positions
  ┌─────────┬──────┬───────┬──────────┬──────────┬──────────┬────────┐
  │ Symbol  │ Side │  Qty  │  Entry   │ Current  │   PnL    │  SL/TP │
  ├─────────┼──────┼───────┼──────────┼──────────┼──────────┼────────┤
  │ SOLUSDT │ LONG │  2.50 │  185.20  │  187.42  │ +$5.55   │ SL:3%  │
  │ ETHUSDT │ SHORT│  0.15 │ 3,450.00 │ 3,421.80 │ +$4.23   │ SL:2%  │
  └─────────┴──────┴───────┴──────────┴──────────┴──────────┴────────┘
  Daily PnL: +$12.30 | Positions: 2/3 | Risk used: 23%
```

---

## Komut Geçmişi

- Yukarı/aşağı ok tuşları ile önceki komutlara erişim
- Son 100 komut hafızada
- `history` dosyasına da yazılır (`data/command_history.txt`)
- Boş komut: hiçbir şey yapma
- Tab completion: ileride (MVP sonrası)

---

## UI Renk Kodları

| Durum | Renk |
|-------|------|
| Fiyat artış | Yeşil |
| Fiyat düşüş | Kırmızı |
| Pozitif PnL | Yeşil |
| Negatif PnL | Kırmızı |
| WS Connected | Yeşil |
| WS Disconnected | Kırmızı |
| WS Reconnecting | Sarı |
| HIGH priority haber | Kırmızı flash |
| MED priority haber | Sarı |
| LOW priority haber | Beyaz/gri |
| Risk uyarı | Sarı |
| Risk engel | Kırmızı |
| Emir başarılı | Yeşil |
| Emir başarısız | Kırmızı |
| Paper mode | Mavi |
| Live mode | Turuncu |
