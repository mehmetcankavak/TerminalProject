import { useState, useEffect, useRef } from 'react'

const NO_BINANCE_FUTURES = new Set(['HYPEUSDT'])

const fmtUSD = (n) => {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
    return '$' + n.toFixed(0)
}
const fmtPrice = (n) => n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : n.toFixed(4)

const THRESHOLDS    = [100_000, 250_000, 500_000, 1_000_000]
const THRESH_LABELS = ['$100K', '$250K', '$500K', '$1M']

export default function WhaleWalls({ symbol = 'BTCUSDT' }) {
    const [bids,       setBids]       = useState([])
    const [asks,       setAsks]       = useState([])
    const [rawCount,   setRawCount]   = useState({ b: 0, a: 0 })
    const [totalDepth, setTotalDepth] = useState({ bid: 0, ask: 0 })
    const [imbalance,  setImbalance]  = useState(null)
    const [wsStatus,   setWsStatus]   = useState('connecting')
    const [alerts,     setAlerts]     = useState([])
    const [threshold,  setThreshold]  = useState(() => {
        try { return parseInt(localStorage.getItem('ww_threshold')) || 100_000 } catch { return 100_000 }
    })
    const prevRef  = useRef({ bids: [], asks: [] })
    const wsRef    = useRef(null)
    const timerRef = useRef(null)

    const unavailable = NO_BINANCE_FUTURES.has(symbol)

    useEffect(() => {
        if (unavailable) { setWsStatus('unavailable'); return }

        const sym = symbol.toLowerCase()
        setBids([]); setAsks([]); setRawCount({ b: 0, a: 0 })

        // Futures → spot fallback
        const URLS = [
            `wss://fstream.binance.com/ws/${sym}@depth20@250ms`,
            `wss://stream.binance.com:9443/ws/${sym}@depth20@250ms`,
        ]
        let urlIdx = 0
        let ws
        let dead = false

        const connect = () => {
            if (dead) return
            setWsStatus('connecting')
            ws = new WebSocket(URLS[urlIdx % URLS.length])
            wsRef.current = ws

            // Eğer 6 saniyede bağlanamazsa diğer URL'yi dene
            const timeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    urlIdx++
                    ws.close()
                }
            }, 6000)

            ws.onopen = () => {
                clearTimeout(timeout)
                setWsStatus('ok')
            }

            ws.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data)
                    const rawBids = d.b || d.bids || []
                    const rawAsks = d.a || d.asks || []

                    const parse = (arr) => arr
                        .map(([p, q]) => {
                            const price = parseFloat(p)
                            const qty   = parseFloat(q)
                            return { price, qty, usd: price * qty }
                        })
                        .filter(x => x.usd > 0)
                        .sort((a, b) => b.usd - a.usd)

                    const allBids = parse(rawBids)
                    const allAsks = parse(rawAsks)

                    setRawCount({ b: allBids.length, a: allAsks.length })

                    const totalBid = allBids.reduce((s, x) => s + x.usd, 0)
                    const totalAsk = allAsks.reduce((s, x) => s + x.usd, 0)
                    setTotalDepth({ bid: totalBid, ask: totalAsk })
                    if (totalBid + totalAsk > 0)
                        setImbalance(Math.round(totalBid / (totalBid + totalAsk) * 100))

                    const wallBids = allBids.filter(x => x.usd >= threshold)
                    const wallAsks = allAsks.filter(x => x.usd >= threshold)

                    // Duvar kayboldu tespiti (2× threshold kadar büyük olanlar)
                    const newPrices = new Set([
                        ...wallBids.map(b => b.price.toFixed(1)),
                        ...wallAsks.map(a => a.price.toFixed(1)),
                    ])
                    const gone = [
                        ...prevRef.current.bids.filter(w => w.usd >= threshold * 2),
                        ...prevRef.current.asks.filter(w => w.usd >= threshold * 2),
                    ].filter(w => !newPrices.has(w.price.toFixed(1)))

                    if (gone.length) {
                        const newAlerts = gone.map(w => ({
                            id: `${w.price}-${Date.now()}`,
                            msg: `⚡ WALL YENİLDİ — $${fmtPrice(w.price)} @ ${fmtUSD(w.usd)}`,
                        }))
                        setAlerts(prev => [...prev.slice(-3), ...newAlerts])
                        clearTimeout(timerRef.current)
                        timerRef.current = setTimeout(() => setAlerts([]), 6000)
                    }

                    prevRef.current = { bids: wallBids, asks: wallAsks }
                    setBids(wallBids.slice(0, 6))
                    setAsks(wallAsks.slice(0, 6))
                } catch (err) { console.warn('[WhaleWalls] WS parse error', err) }
            }

            ws.onerror = () => clearTimeout(timeout)
            ws.onclose = () => {
                clearTimeout(timeout)
                if (!dead) setTimeout(connect, 3000)
            }
        }

        connect()
        return () => {
            dead = true
            clearTimeout(timerRef.current)
            ws?.close()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, threshold, unavailable])

    const maxUSD = Math.max(...bids.map(b => b.usd), ...asks.map(a => a.usd), threshold)
    const imbalanceColor = imbalance == null ? 'var(--text-3)'
        : imbalance >= 60 ? '#00d992'
        : imbalance <= 40 ? '#ff3b5c'
        : '#e5a236'

    return (
        <div className="ww-root">
            {/* ── Header ── */}
            <div className="ww-header">
                <span className="ww-title">
                    WHALE WALLS
                    <span className={`ww-dot ${wsStatus}`} title={wsStatus} />
                    {wsStatus === 'connecting' && <span className="ww-status-txt">bağlanıyor...</span>}
                    {wsStatus === 'ok' && rawCount.b > 0 &&
                        <span className="ww-status-txt ok">{rawCount.b}B/{rawCount.a}A seviye</span>}
                </span>

                <span className="ww-sym">{symbol.replace('USDT', '')}/USDT-PERP</span>

                {imbalance != null && (
                    <span className="ww-imbalance" style={{ color: imbalanceColor }}>
                        {imbalance >= 60 ? '▲' : imbalance <= 40 ? '▼' : '◆'} {imbalance}% BUY
                    </span>
                )}

                {totalDepth.bid + totalDepth.ask > 0 && (
                    <span className="ww-depth-total">
                        <span className="ww-depth-bid">{fmtUSD(totalDepth.bid)}</span>
                        <span className="ww-depth-sep"> / </span>
                        <span className="ww-depth-ask">{fmtUSD(totalDepth.ask)}</span>
                        <span className="ww-depth-label"> top-20 depth</span>
                    </span>
                )}

                <div className="ww-thresholds">
                    <span className="ww-thresh-label">min wall:</span>
                    {THRESHOLDS.map((t, i) => (
                        <button key={t}
                            className={`ww-thresh-btn ${threshold === t ? 'active' : ''}`}
                            onClick={() => { setThreshold(t); localStorage.setItem('ww_threshold', String(t)) }}
                        >{THRESH_LABELS[i]}</button>
                    ))}
                </div>
            </div>

            {/* ── Unavailable ── */}
            {unavailable && (
                <div className="ww-unavail">
                    {symbol.replace('USDT', '')} — Binance Futures verisi yok. HyperLiquid entegrasyonu yakında.
                </div>
            )}

            {/* ── Walls grid ── */}
            {!unavailable && (
                <div className="ww-grid">
                    {/* BID */}
                    <div className="ww-side bid">
                        <div className="ww-side-label">BID WALLS (DESTEK)</div>
                        {wsStatus === 'connecting' && <div className="ww-no-wall" style={{ color: 'var(--warn)' }}>bağlanıyor...</div>}
                        {wsStatus === 'ok' && bids.length === 0 && (
                            <div className="ww-no-wall">
                                {rawCount.b > 0
                                    ? `Eşik altında duvar yok — en büyük: ${fmtUSD(Math.max(...(prevRef.current.bids.map(b=>b.usd).concat([0]))))}`
                                    : 'veri bekleniyor...'}
                            </div>
                        )}
                        {bids.map((b, i) => (
                            <div key={i} className="ww-row bid">
                                <span className="ww-price">${fmtPrice(b.price)}</span>
                                <div className="ww-bar-wrap">
                                    <div className="ww-bar bid" style={{ width: Math.max(4, b.usd / maxUSD * 100) + '%' }} />
                                </div>
                                <span className="ww-usd bid">{fmtUSD(b.usd)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="ww-divider">
                        <div className="ww-spread-label">BASIN</div>
                        <div className="ww-spread-bar">
                            {imbalance != null && (
                                <>
                                    <div className="ww-spread-bid" style={{ width: imbalance + '%' }} />
                                    <div className="ww-spread-ask" style={{ width: (100 - imbalance) + '%' }} />
                                </>
                            )}
                        </div>
                    </div>

                    {/* ASK */}
                    <div className="ww-side ask">
                        <div className="ww-side-label">ASK WALLS (DİRENÇ)</div>
                        {wsStatus === 'ok' && asks.length === 0 && (
                            <div className="ww-no-wall">
                                {rawCount.a > 0 ? 'Eşik altında duvar yok' : 'veri bekleniyor...'}
                            </div>
                        )}
                        {asks.map((a, i) => (
                            <div key={i} className="ww-row ask">
                                <span className="ww-usd ask">{fmtUSD(a.usd)}</span>
                                <div className="ww-bar-wrap">
                                    <div className="ww-bar ask" style={{ width: Math.max(4, a.usd / maxUSD * 100) + '%' }} />
                                </div>
                                <span className="ww-price">${fmtPrice(a.price)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Alerts ── */}
            {alerts.length > 0 && (
                <div className="ww-alerts">
                    {alerts.map(a => <div key={a.id} className="ww-alert">{a.msg}</div>)}
                </div>
            )}
        </div>
    )
}
