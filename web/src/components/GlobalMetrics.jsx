import { useState, useEffect, useRef } from 'react'

const COINGECKO = 'https://api.coingecko.com/api/v3'
const FEAR_GREED = 'https://api.alternative.me/fng/'

function fmtB(n) {
    if (n == null) return '—'
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
    return '$' + (n / 1e6).toFixed(0) + 'M'
}

function fmtPct(n) {
    if (n == null) return '—'
    return n.toFixed(2) + '%'
}

/* ── TradingView Widget ─────────────────────────────────────────── */
function TVWidget({ symbol, height = 340, interval = 'D', studies = [] }) {
    const ref = useRef(null)
    const id = useRef('tv_' + symbol.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now())

    useEffect(() => {
        if (!ref.current) return
        ref.current.innerHTML = ''

        const container = document.createElement('div')
        container.id = id.current
        container.style.height = '100%'
        ref.current.appendChild(container)

        const script = document.createElement('script')
        script.src = 'https://s3.tradingview.com/tv.js'
        script.async = true
        script.onload = () => {
            if (!window.TradingView) return
            new window.TradingView.widget({
                container_id: id.current,
                autosize: true,
                symbol,
                interval,
                timezone: 'Europe/Istanbul',
                theme: 'dark',
                style: '1',
                locale: 'en',
                toolbar_bg: '#0c0d12',
                backgroundColor: 'rgba(8,9,12,1)',
                gridColor: 'rgba(26,28,37,0.4)',
                hide_top_toolbar: false,
                hide_legend: false,
                hide_side_toolbar: true,
                allow_symbol_change: false,
                save_image: false,
                calendar: false,
                studies,
                overrides: {
                    'paneProperties.background': '#08090c',
                    'paneProperties.backgroundType': 'solid',
                },
            })
        }
        document.head.appendChild(script)

        return () => {
            if (document.head.contains(script)) document.head.removeChild(script)
        }
    }, [symbol])

    return <div ref={ref} style={{ width: '100%', height }} />
}

/* ── Fear & Greed Gauge ─────────────────────────────────────────── */
function FearGreedGauge({ value, label, updated }) {
    if (value == null) return (
        <div className="gm-fg-wrap">
            <div className="gm-fg-loading">Loading…</div>
        </div>
    )

    const pct = value / 100
    const angle = -135 + pct * 270       // -135° to +135°
    const rad = (angle * Math.PI) / 180
    const cx = 100, cy = 90, r = 70
    const nx = cx + r * Math.cos(rad)
    const ny = cy + r * Math.sin(rad)

    const color =
        value <= 25 ? '#ef4444' :
        value <= 45 ? '#f97316' :
        value <= 55 ? '#eab308' :
        value <= 75 ? '#84cc16' : '#00d992'

    const zones = [
        { label: 'Extreme Fear', color: '#ef4444', from: -135, to: -81 },
        { label: 'Fear',         color: '#f97316', from: -81,  to: -27 },
        { label: 'Neutral',      color: '#eab308', from: -27,  to:  27 },
        { label: 'Greed',        color: '#84cc16', from:  27,  to:  81 },
        { label: 'Extreme Greed',color: '#00d992', from:  81,  to: 135 },
    ]

    function arc(from, to, inset = 0) {
        const rr = r - inset
        const a1 = (from * Math.PI) / 180
        const a2 = (to  * Math.PI) / 180
        const x1 = cx + rr * Math.cos(a1)
        const y1 = cy + rr * Math.sin(a1)
        const x2 = cx + rr * Math.cos(a2)
        const y2 = cy + rr * Math.sin(a2)
        const large = Math.abs(to - from) > 180 ? 1 : 0
        return `M ${x1} ${y1} A ${rr} ${rr} 0 ${large} 1 ${x2} ${y2}`
    }

    return (
        <div className="gm-fg-wrap">
            <svg viewBox="0 0 200 130" className="gm-fg-svg">
                {/* track */}
                {zones.map(z => (
                    <path key={z.label} d={arc(z.from, z.to)} stroke={z.color}
                        strokeWidth="12" fill="none" strokeLinecap="butt" opacity="0.25" />
                ))}
                {/* filled arc */}
                <path d={arc(-135, angle)} stroke={color}
                    strokeWidth="12" fill="none" strokeLinecap="round" />
                {/* needle */}
                <line
                    x1={cx} y1={cy}
                    x2={nx} y2={ny}
                    stroke={color} strokeWidth="2.5" strokeLinecap="round"
                />
                <circle cx={cx} cy={cy} r="5" fill={color} />
                {/* value */}
                <text x={cx} y={cy + 28} textAnchor="middle"
                    fill={color} fontSize="26" fontWeight="700" fontFamily="'DM Mono', monospace">
                    {value}
                </text>
            </svg>
            <div className="gm-fg-label" style={{ color }}>{label}</div>
            {updated && <div className="gm-fg-updated">{updated}</div>}
        </div>
    )
}

/* ── Dominance Bar ──────────────────────────────────────────────── */
function DomBar({ name, pct, color }) {
    return (
        <div className="gm-dom-row">
            <span className="gm-dom-name">{name}</span>
            <div className="gm-dom-track">
                <div className="gm-dom-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="gm-dom-pct">{fmtPct(pct)}</span>
        </div>
    )
}

const DOM_COLORS = ['#00d992', '#627eea', '#f3ba2f', '#9945ff', '#00aaf0', '#888']

/* ── Main Component ─────────────────────────────────────────────── */
export default function GlobalMetrics() {
    const [global, setGlobal] = useState(null)
    const [fg, setFg] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchAll() {
            try {
                const [gRes, fRes] = await Promise.all([
                    fetch(`${COINGECKO}/global`),
                    fetch(`${FEAR_GREED}?limit=1`),
                ])
                const gData = await gRes.json()
                const fData = await fRes.json()

                setGlobal(gData.data)
                const fgEntry = fData.data?.[0]
                if (fgEntry) {
                    setFg({
                        value: parseInt(fgEntry.value),
                        label: fgEntry.value_classification,
                        updated: new Date(parseInt(fgEntry.timestamp) * 1000)
                            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    })
                }
            } catch (e) {
                console.error('GlobalMetrics fetch error', e)
            } finally {
                setLoading(false)
            }
        }
        fetchAll()
        const t = setInterval(fetchAll, 60_000)
        return () => clearInterval(t)
    }, [])

    const mcap    = global?.total_market_cap?.usd
    const vol24   = global?.total_volume?.usd
    const coins   = global?.active_cryptocurrencies
    const mcapChg = global?.market_cap_change_percentage_24h_usd
    const btcD    = global?.market_cap_percentage?.btc
    const ethD    = global?.market_cap_percentage?.eth
    const bnbD    = global?.market_cap_percentage?.bnb
    const solD    = global?.market_cap_percentage?.sol
    const xrpD    = global?.market_cap_percentage?.xrp

    const domList = [
        { name: 'BTC',    pct: btcD  ?? 0 },
        { name: 'ETH',    pct: ethD  ?? 0 },
        { name: 'BNB',    pct: bnbD  ?? 0 },
        { name: 'SOL',    pct: solD  ?? 0 },
        { name: 'XRP',    pct: xrpD  ?? 0 },
        { name: 'Others', pct: Math.max(0, 100 - (btcD??0) - (ethD??0) - (bnbD??0) - (solD??0) - (xrpD??0)) },
    ]

    const statCards = [
        {
            label: 'Total Market Cap',
            value: fmtB(mcap),
            sub: mcapChg != null ? `${mcapChg > 0 ? '+' : ''}${fmtPct(mcapChg)} 24h` : null,
            subClass: mcapChg >= 0 ? 'pos' : 'neg',
        },
        {
            label: '24H Volume',
            value: fmtB(vol24),
            sub: vol24 && mcap ? `${((vol24 / mcap) * 100).toFixed(1)}% of MCAP` : null,
            subClass: '',
        },
        {
            label: 'BTC Dominance',
            value: btcD != null ? fmtPct(btcD) : '—',
            sub: ethD != null ? `ETH ${fmtPct(ethD)}` : null,
            subClass: '',
        },
        {
            label: 'Active Cryptos',
            value: coins?.toLocaleString() ?? '—',
            sub: 'Listed on CoinGecko',
            subClass: '',
        },
    ]

    return (
        <div className="gm-page">
            {/* ── Stat Cards ── */}
            <div className="gm-stat-row">
                {statCards.map(c => (
                    <div key={c.label} className="gm-stat-card">
                        <div className="gm-stat-label">{c.label}</div>
                        <div className="gm-stat-value">{loading ? <span className="gm-skeleton" /> : c.value}</div>
                        {c.sub && !loading && (
                            <div className={`gm-stat-sub ${c.subClass}`}>{c.sub}</div>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Middle Row: Fear&Greed + BTC.D chart ── */}
            <div className="gm-mid-row">
                <div className="gm-panel gm-panel-fg">
                    <div className="gm-panel-title">FEAR & GREED INDEX</div>
                    <div className="gm-panel-source">alternative.me</div>
                    {loading
                        ? <div className="gm-fg-loading">Loading…</div>
                        : <FearGreedGauge value={fg?.value} label={fg?.label} updated={fg?.updated} />
                    }
                    <div className="gm-dom-block">
                        <div className="gm-panel-title" style={{ marginTop: 24 }}>DOMINANCE BREAKDOWN</div>
                        <div className="gm-panel-source" style={{ marginBottom: 12 }}>CoinGecko</div>
                        {loading
                            ? [1,2,3,4,5,6].map(i => <div key={i} className="gm-skeleton-bar" />)
                            : domList.map((d, i) => <DomBar key={d.name} name={d.name} pct={d.pct} color={DOM_COLORS[i]} />)
                        }
                    </div>
                </div>

                <div className="gm-panel gm-panel-chart">
                    <div className="gm-panel-title">BTC DOMINANCE <span className="gm-panel-source">TradingView · CRYPTOCAP:BTC.D</span></div>
                    <TVWidget symbol="CRYPTOCAP:BTC.D" height={340} interval="D" />
                </div>
            </div>

            {/* ── Total Market Cap Chart ── */}
            <div className="gm-panel gm-panel-wide">
                <div className="gm-panel-title">TOTAL CRYPTO MARKET CAP <span className="gm-panel-source">TradingView · CRYPTOCAP:TOTAL</span></div>
                <TVWidget symbol="CRYPTOCAP:TOTAL" height={380} interval="W" />
            </div>

            {/* ── TOTAL2 (ex-BTC) Chart ── */}
            <div className="gm-panel gm-panel-wide">
                <div className="gm-panel-title">ALTCOIN MARKET CAP (ex-BTC) <span className="gm-panel-source">TradingView · CRYPTOCAP:TOTAL2</span></div>
                <TVWidget symbol="CRYPTOCAP:TOTAL2" height={340} interval="W" />
            </div>
        </div>
    )
}
