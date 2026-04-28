import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'

const ETF_TYPE_LOGOS = {
  BTC: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
}

function fmtM(v) {
  if (!v && v !== 0) return '—'
  const abs = Math.abs(v)
  if (abs >= 1000) return (v >= 0 ? '+' : '') + '$' + (v / 1000).toFixed(2) + 'B'
  if (abs >= 1)    return (v >= 0 ? '+' : '') + '$' + v.toFixed(0) + 'M'
  return (v >= 0 ? '+' : '') + '$' + (v * 1000).toFixed(0) + 'K'
}

function fmtPrice(v) {
  if (!v) return '—'
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toFixed(2)
}

function fmtAssets(v) {
  if (!v) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(2) + 'M'
  return '$' + v.toFixed(0)
}

function fmtVol(v) {
  if (!v) return '—'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v
}

/* ─── Flow Bar Chart ─── */
function FlowChart({ flows }) {
  if (!flows || flows.length === 0) return null
  const maxVal = Math.max(...flows.map(f => Math.abs(f.value)), 1)
  const showEvery = Math.ceil(flows.length / 8)
  return (
    <div className="etf-flow-chart-wrap">
      <div className="etf-flow-centerline" />
      <div className="etf-flow-bars">
        {flows.map((f, i) => {
          const isPos = f.value >= 0
          const heightPct = (Math.abs(f.value) / maxVal) * 45
          const showLabel = i % showEvery === 0 || i === flows.length - 1
          const dateStr = f.date ? f.date.slice(5) : ''
          return (
            <div key={i} className="etf-bar-col" title={`${f.date}: ${fmtM(f.value)}`}>
              <div className="etf-bar-top">
                {isPos && <div className="etf-bar green" style={{ height: `${heightPct}%` }} />}
              </div>
              <div className="etf-bar-bottom">
                {!isPos && <div className="etf-bar red" style={{ height: `${heightPct}%` }} />}
              </div>
              {showLabel && <div className="etf-bar-label">{dateStr}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── ETF Share Bar ─── */
function EtfShareBar({ etfs }) {
  const total = etfs.reduce((s, e) => s + (e.volume || 0), 0)
  if (!total) return null
  return (
    <div className="etf-share-bar-wrap">
      <div className="etf-share-labels">
        {etfs.slice(0, 6).map(e => {
          const pct = total > 0 ? ((e.volume || 0) / total * 100) : 0
          return (
            <span key={e.symbol}>
              <span className="etf-sym-dot" style={{ background: e.color }} />
              <b>{e.symbol}</b> {pct.toFixed(1)}%
            </span>
          )
        })}
      </div>
      <div className="etf-share-bar-container">
        {etfs.slice(0, 6).map(e => {
          const pct = total > 0 ? ((e.volume || 0) / total * 100) : 0
          return (
            <div key={e.symbol} className="etf-share-segment" style={{ width: `${pct}%`, background: e.color }} />
          )
        })}
      </div>
    </div>
  )
}

export default function ETFPage() {
  const [type, setType]     = useState('BTC')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchData = useCallback(async (etfType, attempt = 0) => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/api/etf-data?type=${etfType}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!Array.isArray(json.etfs)) throw new Error('Invalid response')
      setData(json)
      setLastUpdate(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
      if (attempt < 5) {
        setTimeout(() => fetchData(etfType, attempt + 1), 3000)
      }
    } finally {
      if (attempt === 0 || attempt >= 5) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setError(null)
    setData(null)
    fetchData(type)
    const t = setInterval(() => fetchData(type), 3 * 60_000)
    return () => clearInterval(t)
  }, [type, fetchData])

  const etfs    = data?.etfs || []
  const summary = data?.summary || {}
  const flows   = data?.flowHistory || []
  const hasFlow = data?.hasFlowData

  // Largest ETF by volume
  const dominant = etfs.reduce((a, b) => (b.volume > (a.volume || 0) ? b : a), {})

  // Flow signal based on average price change
  const avgChg = etfs.length ? etfs.reduce((s, e) => s + (e.changePct || 0), 0) / etfs.length : 0
  const flowSignal = avgChg > 1 ? 'Strong Inflow' : avgChg > 0 ? 'Moderate Inflow' : avgChg > -1 ? 'Moderate Outflow' : 'Strong Outflow'
  const flowSignalClass = avgChg >= 0 ? 'text-green' : 'text-red'

  return (
    <div className="etf-page">
      <div className="etf-header-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h2 className="etf-title">ETF Data</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {lastUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {!loading && (
            <button onClick={() => fetchData(type)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>↻</button>
          )}
        </div>
      </div>

      {/* Type Tabs */}
      <div className="etf-tabs" style={{ marginBottom: 12 }}>
        {['BTC', 'ETH'].map(t => (
          <button
            key={t}
            className={`etf-tab ${type === t ? 'active' : ''}`}
            onClick={() => setType(t)}
          >
            <img src={ETF_TYPE_LOGOS[t]} alt={`${t} logo`} className="etf-tab-logo" />
            {t} ETFs
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(242,54,69,.1)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 6, fontSize: 12, color: '#f23645', marginBottom: 12 }}>
          ⚠ Failed to fetch data — {error}
        </div>
      )}

      {/* Flow Panel */}
      <div className="etf-panel">
        <div className="etf-panel-header">
          <div className="etf-panel-title">
            ETF Flow History
            <span className="etf-info-icon">i</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {hasFlow ? '● CoinGlass' : '● CoinGlass API key required'}
          </div>
        </div>

        {hasFlow ? (
          <>
            <FlowChart flows={flows} />
            <div className="etf-flow-summary">
              {summary.today  !== undefined && <span>1g: <span className={summary.today  >= 0 ? 'text-green' : 'text-red'}>{fmtM(summary.today)}</span></span>}
              {summary.week   !== undefined && <span>7g: <span className={summary.week   >= 0 ? 'text-green' : 'text-red'}>{fmtM(summary.week)}</span></span>}
              {summary.month  !== undefined && <span>30g: <span className={summary.month  >= 0 ? 'text-green' : 'text-red'}>{fmtM(summary.month)}</span></span>}
            </div>
          </>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
            CoinGlass API key is required for daily flow data
          </div>
        )}
      </div>

      {/* Live ETF Data Panel */}
      <div className="etf-panel">
        <div className="etf-panel-header">
          <div className="etf-panel-title">
            {type} ETF List <span className="etf-info-icon">i</span>
          </div>
          <div className="status-badge connected" style={{ background: 'rgba(0,217,146,.1)', color: 'var(--accent)', border: '1px solid rgba(0,217,146,.2)' }}>
            <span className="status-dot" /> Yahoo Finance
          </div>
        </div>

        <div className="etf-metrics-grid">
          <div className="etf-metric-card">
            <div className="etf-metric-label">Total Volume</div>
            <div className="etf-metric-val">
              {loading ? '...' : fmtVol(data?.totalVolume)}
            </div>
          </div>
          <div className="etf-metric-card">
            <div className="etf-metric-label">Flow Signal</div>
            <div className={`etf-metric-val ${flowSignalClass}`}>
              {loading ? '...' : flowSignal}
            </div>
          </div>
          <div className="etf-metric-card">
            <div className="etf-metric-label">Dominant ETF</div>
            <div className="etf-metric-val">{loading ? '...' : (dominant.symbol || '—')}</div>
          </div>
        </div>

        {!loading && etfs.length > 0 && <EtfShareBar etfs={etfs} />}

        <table className="data-table" style={{ marginTop: 16 }}>
          <thead>
            <tr style={{ fontSize: 10, color: 'var(--text-3)' }}>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>ETF</th>
              <th style={{ textAlign: 'right', paddingBottom: 6 }}>Price</th>
              <th style={{ textAlign: 'right', paddingBottom: 6 }}>Change</th>
              <th style={{ textAlign: 'right', paddingBottom: 6 }}>Volume</th>
              <th style={{ textAlign: 'right', paddingBottom: 6 }}>AUM</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px 0', fontSize: 11 }}>Loading...</td></tr>
            ) : etfs.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px 0', fontSize: 11 }}>No data</td></tr>
            ) : (
              etfs.map(e => {
                const isPos = (e.changePct || 0) >= 0
                const volUsd = (e.volume || 0) * (e.price || 0)
                return (
                  <tr key={e.symbol}>
                    <td style={{ width: '30%' }}>
                      <div className="symbol-cell">
                        <span className="etf-sym-bg-dot" style={{ background: e.color }} />
                        <div>
                          <span className="symbol-name">{e.symbol}</span>
                          <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.longName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', width: '18%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {fmtPrice(e.price)}
                    </td>
                    <td style={{ textAlign: 'right', width: '18%' }}>
                      <span className={isPos ? 'text-green' : 'text-red'} style={{ fontSize: 12, fontWeight: 700 }}>
                        {isPos ? '+' : ''}{(e.changePct || 0).toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', width: '18%', fontSize: 11, color: 'var(--text-2)' }}>
                      {fmtVol(volUsd)}
                    </td>
                    <td style={{ textAlign: 'right', width: '16%', fontSize: 11, color: 'var(--text-2)' }}>
                      {fmtAssets(e.totalAssets)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
