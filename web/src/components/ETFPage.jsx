import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'

function fmtUSD(n) {
  if (n == null || !isFinite(n)) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

const TYPES = [
  { key: 'BTC', label: 'BTC ETFs' },
  { key: 'ETH', label: 'ETH ETFs' },
]

/* ── Sentiment Panel ──────────────────────────────────────────────── */
function ETFSentiment({ etfs, summary }) {
  if (!etfs?.length) {
    return (
      <div className="etx-sentiment etx-sentiment-loading">
        <span className="etx-section-label">SENTIMENT · ETF · loading…</span>
      </div>
    )
  }

  let bullVol = 0, bearVol = 0, gainers = 0, losers = 0
  let dominant = null
  for (const e of etfs) {
    const vol = (e.volume || 0) * (e.price || 0)
    if ((e.changePct || 0) >= 0) { bullVol += vol; gainers++ }
    else                          { bearVol += vol; losers++ }
    if (!dominant || vol > (dominant.volume || 0) * (dominant.price || 0)) dominant = e
  }
  const total    = bullVol + bearVol
  const score    = total > 0 ? (bullVol - bearVol) / total : 0
  const verdict  = score >  0.3 ? 'INFLOW' : score < -0.3 ? 'OUTFLOW' : 'NEUTRAL'
  const tone     = verdict === 'INFLOW' ? '#00e87a' : verdict === 'OUTFLOW' ? '#f43f5e' : '#fbbf24'
  const pct      = Math.max(0, Math.min(100, (score + 1) * 50))
  const avgChg   = total > 0 ? etfs.reduce((s, e) => s + (e.changePct || 0) * ((e.volume || 0) * (e.price || 0)), 0) / total : 0
  const cgToday  = summary?.today ?? null

  return (
    <div className="etx-sentiment">
      <div className="etx-sentiment-hdr">
        <span className="etx-section-label">SENTIMENT · ETF · 24H</span>
        <div className="etx-sentiment-score">
          <span className="etx-score-num" style={{ color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span className="etx-verdict" style={{ color: tone }}>{verdict}</span>
        </div>
      </div>

      {/* Gauge */}
      <div className="etx-gauge-track">
        <div className="etx-gauge-bg" />
        <div className="etx-gauge-mid" />
        <div className="etx-gauge-dot" style={{ left: pct + '%', background: tone, boxShadow: `0 0 10px ${tone}99` }} />
      </div>
      <div className="etx-gauge-axis">
        <span>OUTFLOW</span><span>NEUTRAL</span><span>INFLOW</span>
      </div>

      {/* 4-stat grid */}
      <div className="etx-stat4-grid">
        <div className="etx-stat-card neutral">
          <div className="etx-stat-label">TOTAL VOL</div>
          <div className="etx-stat-val">{fmtUSD(total)}</div>
          <div className="etx-stat-sub">{etfs.length} ETF</div>
        </div>

        <div className={`etx-stat-card ${avgChg >= 0 ? 'buy' : 'sell'}`}>
          <div className="etx-stat-label" style={{ color: avgChg >= 0 ? '#00e87a' : '#f43f5e' }}>AVG CHANGE</div>
          <div className="etx-stat-val">{avgChg >= 0 ? '+' : ''}{avgChg.toFixed(2)}%</div>
          <div className="etx-stat-sub">volume weighted</div>
        </div>

        <div className="etx-stat-card neutral">
          <div className="etx-stat-label" style={{ color: '#fbbf24' }}>DOMINANT</div>
          <div className="etx-stat-val">{dominant?.symbol || '—'}</div>
          <div className="etx-stat-sub">{dominant ? fmtUSD((dominant.volume || 0) * (dominant.price || 0)) : '—'}</div>
        </div>

        <div className={`etx-stat-card ${cgToday != null ? (cgToday >= 0 ? 'buy' : 'sell') : 'neutral'}`}>
          <div className="etx-stat-label" style={{ color: cgToday != null ? (cgToday >= 0 ? '#00e87a' : '#f43f5e') : '#666' }}>
            NET FLOW
          </div>
          <div className="etx-stat-val">
            {cgToday != null ? (cgToday >= 0 ? '+' : '') + cgToday.toFixed(0) + 'M' : '—'}
          </div>
          <div className="etx-stat-sub">{cgToday != null ? 'Coinglass · today' : 'no Coinglass key'}</div>
        </div>
      </div>
    </div>
  )
}

/* ── ETF Row ──────────────────────────────────────────────────────── */
function ETFRow({ etf, maxVol }) {
  const isUp = (etf.changePct || 0) >= 0
  const tone = isUp ? '#00e87a' : '#f43f5e'
  const vol  = (etf.volume || 0) * (etf.price || 0)
  const pct  = maxVol > 0 ? Math.min(100, (vol / maxVol) * 100) : 0

  return (
    <div className="etx-etf-row">
      <div className="etx-etf-dot" style={{ background: etf.color || '#6b7280' }} />

      <div className="etx-etf-id">
        <div className="etx-etf-sym">{etf.symbol}</div>
        <div className="etx-etf-name">{(etf.longName || '').slice(0, 22)}</div>
      </div>

      <div className="etx-etf-vol-block">
        <div className="etx-vol-bar-track">
          <div className="etx-vol-bar-fill" style={{ width: pct + '%', background: tone }} />
        </div>
        <div className="etx-etf-vol-amt">{fmtUSD(vol)}</div>
      </div>

      <div className="etx-etf-price-block">
        <div className="etx-etf-price">{fmtPrice(etf.price)}</div>
        <div className={`etx-etf-chg ${isUp ? 'up' : 'dn'}`}>
          {isUp ? '+' : ''}{(etf.changePct || 0).toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

/* ── Netflow Section (Coinglass) ──────────────────────────────────── */
function NetflowSection({ summary }) {
  if (!summary || !Object.keys(summary).length) return null
  const rows = [
    { key: 'today',      label: 'Today',   v: summary.today },
    { key: 'week',       label: '7 Days',  v: summary.week },
    { key: 'month',      label: '30 Days', v: summary.month },
    { key: 'threeMonth', label: '90 Days', v: summary.threeMonth },
  ]
  return (
    <div className="etx-netflow">
      <div className="etx-section-label etx-netflow-label">NETFLOW · COINGLASS</div>
      <div className="etx-netflow-grid">
        {rows.map(({ key, label, v }) => {
          const up  = v != null && v >= 0
          const cls = v != null ? (up ? 'buy' : 'sell') : 'neutral'
          return (
            <div key={key} className={`etx-nf-card ${cls}`}>
              <div className="etx-nf-label">{label}</div>
              <div className="etx-nf-val" style={{ color: v != null ? (up ? '#00e87a' : '#f43f5e') : '#555' }}>
                {v != null ? (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) + 'M' : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="etx-skeleton-row">
          <div className="etx-skel-dot" />
          <div style={{ width: 110 }}>
            <div className="etx-skel-rect" style={{ width: 55, height: 13, marginBottom: 4 }} />
            <div className="etx-skel-rect" style={{ width: 80, height: 9 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="etx-skel-rect" style={{ width: '65%', height: 3, marginBottom: 6 }} />
            <div className="etx-skel-rect" style={{ width: 65, height: 10 }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="etx-skel-rect" style={{ width: 64, height: 13, marginBottom: 3, marginLeft: 'auto' }} />
            <div className="etx-skel-rect" style={{ width: 44, height: 11, marginLeft: 'auto' }} />
          </div>
        </div>
      ))}
    </>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function ETFPage() {
  const [type,    setType]    = useState('BTC')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpd, setLastUpd] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/etf-data?type=${type}`)
      if (!r.ok) return
      const d = await r.json()
      setData(d)
      setLastUpd(new Date())
    } catch {}
    finally { setLoading(false) }
  }, [type])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const etfs       = data?.etfs    || []
  const summary    = data?.summary || null
  const sorted     = [...etfs].sort((a, b) => ((b.volume || 0) * (b.price || 0)) - ((a.volume || 0) * (a.price || 0)))
  const maxVol     = sorted.length ? (sorted[0].volume || 0) * (sorted[0].price || 0) : 1

  return (
    <div className="etx-page">

      {/* Header */}
      <div className="etx-page-header">
        <div className="etx-header-top">
          <div>
            <div className="etx-page-title">ETF Data</div>
            <div className="etx-page-subtitle">
              <span className="etx-live-dot" />
              Yahoo Finance{data?.hasCoinGlass ? ' + Coinglass netflow' : ''} · 60s refresh
              {lastUpd && (
                <span className="etx-updated">
                  ↻ {lastUpd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {data?.totalAUM > 0 && (
            <div className="etx-aum">
              <div className="etx-aum-label">TOTAL AUM</div>
              <div className="etx-aum-val">{fmtUSD(data.totalAUM)}</div>
            </div>
          )}
        </div>

        {/* BTC / ETH tabs */}
        <div className="etx-tabs">
          {TYPES.map(t => (
            <button
              key={t.key}
              className={`etx-tab ${type === t.key ? 'active' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sentiment */}
      <ETFSentiment etfs={etfs} summary={summary} />

      {/* Column labels */}
      <div className="etx-col-labels">
        <span style={{ width: 10 }} />
        <span style={{ width: 110 }}>ETF</span>
        <span style={{ flex: 1 }}>VOLUME</span>
        <span>PRICE · CHANGE</span>
      </div>

      {/* List */}
      <div className="etx-etf-list">
        {loading
          ? <Skeleton />
          : sorted.length === 0
            ? <div className="etx-empty">No ETF data available</div>
            : sorted.map(etf => <ETFRow key={etf.symbol} etf={etf} maxVol={maxVol} />)
        }
      </div>

      {/* Netflow section */}
      <NetflowSection summary={summary} />

    </div>
  )
}
