/**
 * CryptoTerminal API Service
 * Binance FAPI, CoinGecko, Alternative.me API calls
 * 
 * Dual-mode: If backend is running, uses /api/metrics proxy.
 * Otherwise, calls public APIs directly.
 */

import { API_BASE } from '../config'

const BINANCE_FAPI = 'https://fapi.binance.com'
const BINANCE_API = 'https://api.binance.com'
const FEAR_GREED_API = 'https://api.alternative.me'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// ─── Cache ──────────────────────────────────────────────
const cache = new Map()
const CACHE_TTL = 30_000 // 30s default
const CACHE_MAX_SIZE = 200

function getCached(key, ttl = CACHE_TTL) {
    const entry = cache.get(key)
    if (entry && Date.now() - entry.ts < ttl) return entry.data
    return null
}

function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() })
    // Expired entry'leri temizle + size limit
    if (cache.size > CACHE_MAX_SIZE) {
        const now = Date.now()
        for (const [k, v] of cache) {
            if (now - v.ts > CACHE_TTL * 10) cache.delete(k)
        }
        // Hâlâ büyükse en eskileri sil
        if (cache.size > CACHE_MAX_SIZE) {
            const excess = cache.size - CACHE_MAX_SIZE
            let i = 0
            for (const k of cache.keys()) {
                if (i++ >= excess) break
                cache.delete(k)
            }
        }
    }
}

async function fetchJSON(url, ttl = CACHE_TTL) {
    const cached = getCached(url, ttl)
    if (cached) return cached
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setCache(url, data)
        return data
    } catch (err) {
        // Stale cache fallback — skip logging in production
        // Return stale cache if available
        const stale = cache.get(url)
        return stale ? stale.data : null
    }
}

// ─── Long/Short Ratio ───────────────────────────────────
export async function fetchLongShortRatio(symbol = 'BTCUSDT', period = '1h') {
    const url = `${BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`
    const data = await fetchJSON(url, 30_000)
    if (!data || !data.length) return null
    const item = data[0]
    return {
        longPct: parseFloat(item.longAccount) * 100,
        shortPct: parseFloat(item.shortAccount) * 100,
        ratio: parseFloat(item.longShortRatio),
        timestamp: item.timestamp,
    }
}

// Fetch long/short ratios from multiple real exchanges
export async function fetchMultiLongShort(period = '1h') {
    const periodMap = { '1 hour': '1h', '4h': '4h', '24h': '1d' }
    const p = periodMap[period] || period
    const bybitPeriod = p === '1d' ? '1d' : p  // Bybit supports 5min,15min,30min,1h,4h,1d

    const [globalData, topTraderData, bybitData] = await Promise.all([
        fetchJSON(`${BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=${p}&limit=1`, 30_000),
        fetchJSON(`${BINANCE_FAPI}/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=${p}&limit=1`, 30_000),
        fetchJSON(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=${bybitPeriod}&limit=1`, 30_000),
    ])

    const parseBinance = (data) => {
        if (!data || !data.length) return null
        return {
            long: parseFloat(data[0].longAccount) * 100,
            short: parseFloat(data[0].shortAccount) * 100,
        }
    }

    const parseBybit = (data) => {
        const item = data?.result?.list?.[0]
        if (!item) return null
        const long = parseFloat(item.buyRatio) * 100
        return { long: parseFloat(long.toFixed(2)), short: parseFloat((100 - long).toFixed(2)) }
    }

    const global = parseBinance(globalData)
    const topTrader = parseBinance(topTraderData)
    const bybit = parseBybit(bybitData)

    const results = []
    if (global)    results.push({ name: 'All Exchange', sub: 'Binance Global', icon: '₿', color: '#f7931a', bg: '#f7931a20', ...global })
    if (topTrader) results.push({ name: 'Binance', sub: 'Top Traders', icon: 'B', color: '#f0b90b', bg: '#f0b90b20', ...topTrader })
    if (bybit)     results.push({ name: 'Bybit', sub: 'Exchange', icon: 'Y', color: '#f7a600', bg: '#f7a60020', ...bybit })
    return results
}

// ─── Liquidations (Force Orders) ────────────────────────
let liqWs = null
let liqListeners = []
let liqBuffer = []
let liqRetries = 0
const LIQ_MAX_RETRIES = 8
const LIQ_BASE_DELAY = 2000

export function subscribeLiquidations(callback) {
    liqListeners.push(callback)

    if (liqBuffer.length > 0) {
        callback(liqBuffer)
    }

    if (!liqWs) {
        liqRetries = 0
        connectLiquidationWs()
    }

    return () => {
        liqListeners = liqListeners.filter(l => l !== callback)
        if (liqListeners.length === 0 && liqWs) {
            liqWs.onclose = null
            liqWs.close()
            liqWs = null
            liqRetries = 0
        }
    }
}

function connectLiquidationWs() {
    if (liqListeners.length === 0) return
    if (liqRetries >= LIQ_MAX_RETRIES) return

    try {
        liqWs = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr')

        liqWs.onopen = () => { liqRetries = 0 }

        liqWs.onmessage = (event) => {
            try {
                const raw = JSON.parse(event.data)
                const o = raw.o || raw
                const liq = {
                    id: Date.now() + Math.random(),
                    symbol: (o.s || '').replace('USDT', ''),
                    side: o.S === 'BUY' ? 'SHORT' : 'LONG',
                    amount: parseFloat(o.q || 0) * parseFloat(o.p || 0),
                    price: parseFloat(o.p || 0),
                    qty: parseFloat(o.q || 0),
                    type: o.o || 'LIMIT',
                    orderType: o.f || 'IOC',
                    time: new Date(o.T || Date.now()).toLocaleTimeString('tr-TR', { hour12: false }),
                    timestamp: o.T || Date.now(),
                }
                liqBuffer = [liq, ...liqBuffer.slice(0, 99)]
                liqListeners.forEach(cb => cb([liq]))
            } catch { /* parse error - skip frame */ }
        }

        liqWs.onclose = () => {
            liqWs = null
            if (liqListeners.length === 0) return
            liqRetries++
            if (liqRetries < LIQ_MAX_RETRIES) {
                const delay = Math.min(LIQ_BASE_DELAY * Math.pow(2, liqRetries - 1), 30000)
                setTimeout(connectLiquidationWs, delay)
            }
        }

        liqWs.onerror = () => { liqWs?.close() }
    } catch {
        liqRetries++
        if (liqRetries < LIQ_MAX_RETRIES) {
            setTimeout(connectLiquidationWs, 5000)
        }
    }
}

// ─── Fetch Recent Force Orders (REST fallback) ──────────
export async function fetchRecentLiquidations() {
    const url = `${BINANCE_FAPI}/fapi/v1/allForceOrders?limit=20`
    const data = await fetchJSON(url, 10_000)
    if (!data) return []
    return data.map(o => ({
        id: o.time + Math.random(),
        symbol: (o.symbol || '').replace('USDT', ''),
        side: o.side === 'BUY' ? 'SHORT' : 'LONG',
        amount: parseFloat(o.origQty || 0) * parseFloat(o.price || 0),
        price: parseFloat(o.price || 0),
        qty: parseFloat(o.origQty || 0),
        type: o.type || 'LIMIT',
        orderType: o.timeInForce || 'IOC',
        time: new Date(o.time).toLocaleTimeString('tr-TR', { hour12: false }),
        timestamp: o.time,
    }))
}

// ─── Volume Monitor (24h Tickers) ───────────────────────
export async function fetchVolume24h(limit = 20) {
    const url = `${BINANCE_API}/api/v3/ticker/24hr`
    const data = await fetchJSON(url, 60_000)
    if (!data) return []

    // Filter USDT pairs, sort by quote volume
    const usdtPairs = data
        .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('_'))
        .map(t => {
            const sym = t.symbol.replace('USDT', '')
            const quoteVol = parseFloat(t.quoteVolume || 0)
            const priceChange = parseFloat(t.priceChangePercent || 0)
            return {
                symbol: sym,
                pair: 'USDT',
                price: parseFloat(t.lastPrice || 0),
                volume24h: quoteVol,
                volumeBtc: quoteVol / 100000, // approx BTC equivalent  
                priceChangePct: priceChange,
                highPrice: parseFloat(t.highPrice || 0),
                lowPrice: parseFloat(t.lowPrice || 0),
                trades: parseInt(t.count || 0),
            }
        })
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, limit)

    // Assign ranks
    return usdtPairs.map((item, i) => ({ ...item, rank: i + 1 }))
}

// ─── Funding Rates ──────────────────────────────────────
export async function fetchFundingRates(symbols = null) {
    const url = `${BINANCE_FAPI}/fapi/v1/premiumIndex`
    const data = await fetchJSON(url, 30_000)
    if (!data) return []

    const targetSyms = symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
        'DOGEUSDT', 'AVAXUSDT', 'ADAUSDT', 'LINKUSDT', 'DOTUSDT']

    return data
        .filter(item => targetSyms.includes(item.symbol))
        .map(item => ({
            symbol: item.symbol,
            fundingRate: parseFloat(item.lastFundingRate || 0) * 100,
            markPrice: parseFloat(item.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            nextFundingTime: item.nextFundingTime,
        }))
        .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
}

// ─── Open Interest ──────────────────────────────────────
export async function fetchOpenInterest(symbol = 'BTCUSDT', period = '1h') {
    const url = `${BINANCE_FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=24`
    const data = await fetchJSON(url, 60_000)
    if (!data) return []
    return data.map(x => ({
        time: x.timestamp,
        oiUsdt: parseFloat(x.sumOpenInterestValue || 0),
        oiCoin: parseFloat(x.sumOpenInterest || 0),
    })).reverse()
}

// ─── Fear & Greed Index ─────────────────────────────────
export async function fetchFearGreed() {
    const url = `${FEAR_GREED_API}/fng/?limit=10`
    const data = await fetchJSON(url, 300_000)
    if (!data || !data.data) return null
    const latest = data.data[0]
    return {
        value: parseInt(latest.value),
        label: latest.value_classification,
        timestamp: latest.timestamp,
        history: data.data.map(x => ({
            value: parseInt(x.value),
            label: x.value_classification,
        })),
    }
}

// ─── BTC Dominance / Global Market ──────────────────────
export async function fetchDominance() {
    const url = `${COINGECKO_API}/global`
    const data = await fetchJSON(url, 300_000)
    if (!data || !data.data) return null
    const d = data.data
    return {
        btcDominance: (d.market_cap_percentage?.btc || 0).toFixed(2),
        ethDominance: (d.market_cap_percentage?.eth || 0).toFixed(2),
        totalMarketCap: d.total_market_cap?.usd || 0,
        totalVolume: d.total_volume?.usd || 0,
        activeCryptos: d.active_cryptocurrencies || 0,
    }
}

// ─── Symbol Icon/Color mappings ─────────────────────────
export const SYMBOL_META = {
    BTC: { icon: '₿', color: '#f7931a', bg: '#f7931a20' },
    ETH: { icon: 'Ξ', color: '#627eea', bg: '#627eea20' },
    SOL: { icon: '◎', color: '#9945ff', bg: '#9945ff20' },
    BNB: { icon: 'B', color: '#f0b90b', bg: '#f0b90b20' },
    XRP: { icon: '✕', color: '#23293a', bg: '#ffffff15' },
    DOGE: { icon: 'Ð', color: '#c3a634', bg: '#c3a63420' },
    ADA: { icon: 'A', color: '#0033ad', bg: '#0033ad20' },
    AVAX: { icon: 'A', color: '#e84142', bg: '#e8414220' },
    LINK: { icon: '⬡', color: '#2a5ada', bg: '#2a5ada20' },
    DOT: { icon: '●', color: '#e6007a', bg: '#e6007a20' },
    MATIC: { icon: 'M', color: '#8247e5', bg: '#8247e520' },
    RNDR: { icon: 'R', color: '#ff6600', bg: '#ff660020' },
    UNI: { icon: '🦄', color: '#ff007a', bg: '#ff007a20' },
    ATOM: { icon: '⚛', color: '#2e3148', bg: '#6f7390' },
    OP: { icon: 'O', color: '#ff0420', bg: '#ff042020' },
    ARB: { icon: 'A', color: '#28a0f0', bg: '#28a0f020' },
    SUI: { icon: 'S', color: '#6fbcf0', bg: '#6fbcf020' },
    PEPE: { icon: '🐸', color: '#00b84c', bg: '#00b84c20' },
}

export function getSymbolMeta(symbol) {
    const clean = symbol.replace('USDT', '').replace('BTC', symbol === 'BTC' ? 'BTC' : '').toUpperCase()
    return SYMBOL_META[clean] || {
        icon: clean[0] || '?',
        color: '#64748b',
        bg: '#64748b20',
    }
}

// ─── Format Helpers ─────────────────────────────────────
export function formatUSD(n) {
    if (n == null) return '—'
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
    return '$' + n.toFixed(2)
}

export function formatNumber(n, decimals = 2) {
    if (n == null) return '—'
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

export async function sendNewsToTelegram(token, { headline, source, latency_ms }) {
    const res = await fetch(`${API_BASE}/api/news/send-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ headline, source, latency_ms }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Gönderilemedi')
    }
    return res.json()
}
