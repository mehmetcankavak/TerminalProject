import { useState, useEffect, useCallback } from 'react'

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT',
  'AVAXUSDT','LINKUSDT','ADAUSDT','DOTUSDT','MATICUSDT','LTCUSDT',
  'NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
]

const PERIODS = ['5m','15m','1h','4h','1d']

async function fetchRatio(symbol, period) {
  try {
    const [globalRes, topRes] = await Promise.all([
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`),
      fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`),
    ])
    const [global, top] = await Promise.all([globalRes.json(), topRes.json()])
    const g = Array.isArray(global) ? global[0] : null
    const t = Array.isArray(top)    ? top[0]    : null
    return {
      symbol,
      longPct:     g ? parseFloat(g.longAccount)  * 100 : null,
      shortPct:    g ? parseFloat(g.shortAccount) * 100 : null,
      topLongPct:  t ? parseFloat(t.longAccount)  * 100 : null,
      topShortPct: t ? parseFloat(t.shortAccount) * 100 : null,
    }
  } catch (err) {
    console.warn('[L/S Ratio] fetch error', symbol, err)
    return { symbol, longPct: null, shortPct: null, topLongPct: null, topShortPct: null }
  }
}

function GaugeMeter({ longPct }) {
  if (longPct === null) return <div className="lsr-gauge-empty">Yükleniyor...</div>
  const shortPct = 100 - longPct
  const angle    = (longPct / 100) * 180 - 90
  const dominant = longPct > 52 ? 'LONG AĞIRLIKLI' : longPct < 48 ? 'SHORT AĞIRLIKLI' : 'NÖTR'
  const color    = longPct > 52 ? '#22ab94' : longPct < 48 ? '#f23645' : '#fbbf24'

  return (
    <div className="lsr-gauge">
      <svg viewBox="0 0 200 110" className="lsr-gauge-svg">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e2130" strokeWidth="18" strokeLinecap="round"/>
        <path d="M 20 100 A 80 80 0 0 1 100 20"  fill="none" stroke="rgba(242,54,69,.3)"   strokeWidth="18" strokeLinecap="round"/>
        <path d="M 100 20 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(34,171,148,.3)"  strokeWidth="18" strokeLinecap="round"/>
        <line
          x1="100" y1="100"
          x2={100 + 65 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={100 + 65 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={color} strokeWidth="3" strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill={color}/>
        <text x="12"  y="108" fontSize="9" fill="#f23645" fontFamily="monospace">SHORT</text>
        <text x="143" y="108" fontSize="9" fill="#22ab94" fontFamily="monospace">LONG</text>
      </svg>
      <div className="lsr-gauge-label" style={{ color }}>
        <span className="lsr-gauge-dominant">{dominant}</span>
        <div className="lsr-gauge-pcts">
          <span style={{ color: '#22ab94' }}>{longPct.toFixed(1)}%</span>
          <span style={{ color: '#555' }}> / </span>
          <span style={{ color: '#f23645' }}>{shortPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

function RatioBar({ longPct }) {
  if (longPct === null) return <div style={{ height: 6, background: '#1e2130', borderRadius: 3 }} />
  return (
    <div className="lsr-bar">
      <div style={{ width: longPct + '%', background: '#22ab94', height: '100%', borderRadius: '3px 0 0 3px', transition: 'width .6s' }} />
      <div style={{ width: (100-longPct) + '%', background: '#f23645', height: '100%', borderRadius: '0 3px 3px 0', transition: 'width .6s' }} />
    </div>
  )
}

export default function LongShortRatio() {
  const [period,  setPeriod]  = useState('1h')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUp,  setLastUp]  = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all(SYMBOLS.map(s => fetchRatio(s, period)))
    setRows(results.filter(r => r.longPct !== null))
    setLastUp(new Date())
    setLoading(false)
  }, [period])

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 60_000)
    return () => clearInterval(t)
  }, [loadAll])

  const btc = rows.find(r => r.symbol === 'BTCUSDT')

  return (
    <div className="lsr-page">

      {/* Toolbar */}
      <div className="lsr-toolbar">
        <div className="lsr-source-row">
          <span className="lsr-live-pill"><span className="lsr-live-dot2"/>LIVE</span>
          <span className="lsr-source-label">Binance FAPI · Tüm Hesaplar + Top Trader</span>
          {lastUp && <span className="lsr-updated">↻ {lastUp.toLocaleTimeString('tr-TR')}</span>}
        </div>
        <div className="lsr-periods">
          {PERIODS.map(p => (
            <button key={p} className={`lsr-period-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* BTC Spotlight */}
      <div className="lsr-spotlight">
        <div className="lsr-spotlight-title">
          <span style={{ color: '#f7931a', fontWeight: 700 }}>BTC</span>/USDT — Long/Short Oranı
        </div>
        <div className="lsr-spotlight-body">
          <GaugeMeter longPct={btc?.longPct ?? null} />
          <div className="lsr-stat-grid">
            {[
              { label: 'Tüm Hesap · Long',  val: btc?.longPct,     color: '#22ab94' },
              { label: 'Tüm Hesap · Short', val: btc ? 100 - btc.longPct : null, color: '#f23645' },
              { label: 'Top Trader · Long', val: btc?.topLongPct,  color: '#6ee7d8' },
              { label: 'Top Trader · Short',val: btc?.topShortPct, color: '#fca5a5' },
            ].map(({ label, val, color }) => (
              <div key={label} className="lsr-stat-card">
                <span className="lsr-stat-label">{label}</span>
                <span className="lsr-stat-val" style={{ color }}>{val != null ? val.toFixed(2) + '%' : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full table */}
      <div className="lsr-table-wrap">
        {loading && rows.length === 0
          ? <div className="lsr-loading"><div className="ldash-spinner"/><span>Veriler yükleniyor...</span></div>
          : (
          <table className="lsr-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Long %</th>
                <th>Short %</th>
                <th style={{ minWidth: 160 }}>Oran</th>
                <th>Top Long</th>
                <th>Top Short</th>
                <th>Sinyal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const sym      = r.symbol.replace('USDT', '')
                const dominant = r.longPct > 55 ? 'LONG' : r.longPct < 45 ? 'SHORT' : 'NÖTR'
                const sigColor = r.longPct > 55 ? '#22ab94' : r.longPct < 45 ? '#f23645' : '#fbbf24'
                return (
                  <tr key={r.symbol} className="lsr-row">
                    <td><span className="lsr-sym">{sym}</span><span className="lsr-pair">/USDT</span></td>
                    <td style={{ color: '#22ab94', fontWeight: 600 }}>{r.longPct.toFixed(2)}%</td>
                    <td style={{ color: '#f23645', fontWeight: 600 }}>{(100 - r.longPct).toFixed(2)}%</td>
                    <td><RatioBar longPct={r.longPct} /></td>
                    <td style={{ color: '#6ee7d8' }}>{r.topLongPct  ? r.topLongPct.toFixed(2)  + '%' : '—'}</td>
                    <td style={{ color: '#fca5a5' }}>{r.topShortPct ? r.topShortPct.toFixed(2) + '%' : '—'}</td>
                    <td>
                      <span className="lsr-signal" style={{ color: sigColor, borderColor: sigColor + '55', background: sigColor + '18' }}>
                        {dominant}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
