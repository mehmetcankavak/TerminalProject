import { useState, useEffect } from 'react'
import { API_BASE } from '../config'

const COMPONENT_META = {
  smart_money:   { label: 'Smart Money',    note: 'Whale fills, real positions' },
  big_transfers: { label: 'Big Transfers',  note: 'CEX flow + mint/burn' },
  liquidations:  { label: 'Liquidations',   note: 'Long flush → bullish (contra)' },
  funding:       { label: 'Funding Rate',   note: 'Oversold → bullish (contra)' },
  volume:        { label: 'Volume × Price', note: 'Active buy/sell pressure' },
  etf:           { label: 'ETF Flow',       note: 'BTC + ETH ETF net direction' },
  global:        { label: 'Global Macro',   note: 'F&G + market cap momentum' },
}

const ORDER = ['smart_money', 'big_transfers', 'liquidations', 'funding', 'volume', 'etf', 'global']

function toneColor(verdict) {
  if (verdict === 'BULLISH') return '#00e87a'
  if (verdict === 'BEARISH') return '#f43f5e'
  return '#fbbf24'
}

function advisorTone(tone) {
  if (tone === 'bullish')         return '#00e87a'
  if (tone === 'bearish')         return '#f43f5e'
  if (tone === 'contrarian_bull') return '#22d3ee'
  if (tone === 'contrarian_bear') return '#f59e0b'
  return '#aaa'
}

/* ── Master Gauge ───────────────────────────────────────────────────── */
function MasterGauge({ data }) {
  if (!data) return null
  const score = data.score || 0
  const tone  = toneColor(data.verdict)
  const pct   = Math.max(0, Math.min(100, (score + 1) * 50))

  const confColor =
    data.confidence_label === 'HIGH'   ? '#00e87a' :
    data.confidence_label === 'MEDIUM' ? '#fbbf24' : '#f43f5e'

  return (
    <div className="mco-master-gauge">
      <div className="mco-master-hdr">
        <span className="mco-section-label">MASTER COMPASS · ALL SIGNALS</span>
        <div className="mco-master-score">
          <span className="mco-score-num" style={{ color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span className="mco-verdict-lbl" style={{ color: tone }}>{data.verdict}</span>
        </div>
      </div>

      {/* Large gauge */}
      <div className="mco-gauge-track mco-gauge-lg">
        <div className="mco-gauge-bg" />
        <div className="mco-gauge-mid" />
        <div className="mco-gauge-dot mco-gauge-dot-lg"
          style={{ left: pct + '%', background: tone, boxShadow: `0 0 18px ${tone}cc` }}
        />
      </div>
      <div className="mco-gauge-axis">
        <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
      </div>

      {/* Confidence row */}
      <div className="mco-conf-row">
        <div className="mco-conf-cell">
          <div className="mco-conf-label">CONSENSUS</div>
          <div className="mco-conf-val" style={{ color: confColor }}>
            {data.confidence_label}
          </div>
        </div>
        <div className="mco-conf-divider" />
        <div className="mco-conf-cell">
          <div className="mco-conf-label">AGREE / DIVERGE</div>
          <div className="mco-conf-val">
            <span style={{ color: '#00e87a' }}>{data.agree_count}</span>
            <span style={{ color: '#444' }}> / </span>
            <span style={{ color: '#f43f5e' }}>{data.diverge_count}</span>
            <span style={{ color: '#444', fontSize: 11, marginLeft: 3 }}>/ {data.total_components}</span>
          </div>
        </div>
        <div className="mco-conf-divider" />
        <div className="mco-conf-cell">
          <div className="mco-conf-label">CONFIDENCE</div>
          <div className="mco-conf-val">{(data.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  )
}

/* ── Component Row ──────────────────────────────────────────────────── */
function ComponentRow({ id, comp, weight }) {
  const meta      = COMPONENT_META[id]
  const score     = comp.score || 0
  const tone      = toneColor(comp.verdict)
  const pct       = Math.max(0, Math.min(100, (score + 1) * 50))
  const available = comp.available !== false

  return (
    <div className={`mco-comp-row ${available ? '' : 'mco-comp-row-unavail'}`}>
      <div className="mco-comp-top">
        <div>
          <div className="mco-comp-name">
            {meta?.label || id}
            <span className="mco-comp-weight">×{(weight * 100).toFixed(0)}%</span>
          </div>
          <div className="mco-comp-note">{meta?.note}</div>
        </div>
        <div className="mco-comp-right">
          <div className="mco-comp-score" style={{ color: tone }}>
            {available ? (score >= 0 ? '+' : '') + score.toFixed(2) : '—'}
          </div>
          <div className="mco-comp-verdict" style={{ color: tone }}>
            {available ? comp.verdict : 'NO DATA'}
          </div>
        </div>
      </div>

      {/* Mini gauge */}
      <div className="mco-gauge-track mco-gauge-sm">
        <div className="mco-gauge-bg" />
        <div className="mco-gauge-mid" />
        {available && (
          <div className="mco-gauge-dot mco-gauge-dot-sm"
            style={{ left: pct + '%', background: tone, boxShadow: `0 0 6px ${tone}aa` }}
          />
        )}
      </div>
    </div>
  )
}

/* ── Watch Item ─────────────────────────────────────────────────────── */
function WatchItem({ w }) {
  const [open, setOpen] = useState(false)
  const tone = advisorTone(w.tone)

  return (
    <div className="mco-watch-item">
      <button className="mco-watch-btn" onClick={() => setOpen(v => !v)}>
        <span className="mco-watch-chevron" style={{ color: tone }}>{open ? '▾' : '▸'}</span>
        <div className="mco-watch-info">
          <div className="mco-watch-title" style={{ color: tone }}>{w.title}</div>
          <div className="mco-watch-hook">{w.hook}</div>
        </div>
        <div className="mco-watch-progress-bar">
          <div className="mco-watch-progress-fill" style={{ width: `${w.progress * 100}%`, background: tone }} />
        </div>
      </button>
      {open && (
        <div className="mco-watch-conditions">
          {w.conditions.map((c, i) => (
            <div key={i} className="mco-condition-row">
              <span className={`mco-condition-check ${c.met ? 'met' : ''}`}>{c.met ? '✓' : '○'}</span>
              <span className={`mco-condition-label ${c.met ? 'met' : ''}`}>{c.label}</span>
              <span className="mco-condition-val">
                {c.current.toFixed(2)} {c.op === 'gt' ? '→' : '←'} {c.threshold}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WatchList({ watch }) {
  if (!watch?.length) return null
  return (
    <div className="mco-watchlist">
      <div className="mco-section-label mco-watchlist-label">WATCHING</div>
      {watch.map(w => <WatchItem key={w.key} w={w} />)}
    </div>
  )
}

/* ── Advisor Card ───────────────────────────────────────────────────── */
function AdvisorCard({ advisor }) {
  const [showReasons, setShowReasons] = useState(false)
  if (!advisor?.setup) return null
  const s     = advisor.setup
  const risks = advisor.risks || []
  const tone  = advisorTone(s.tone)

  return (
    <div className="mco-advisor">
      {/* Setup card */}
      <div className="mco-setup-card" style={{
        background: `linear-gradient(180deg, ${tone}14 0%, rgba(255,255,255,0.02) 100%)`,
        borderColor: tone + '33',
      }}>
        <div className="mco-setup-hdr">
          <span className="mco-setup-badge" style={{ color: tone }}>MARKET SETUP</span>
          <span className="mco-setup-key">{s.key}</span>
        </div>
        <div className="mco-setup-title" style={{ color: tone }}>{s.title}</div>
        <div className="mco-setup-msg">{s.message}</div>

        {s.reasons?.length > 0 && (
          <>
            <button className="mco-reasons-btn" onClick={() => setShowReasons(v => !v)}>
              {showReasons ? '▾' : '▸'} WHY
            </button>
            {showReasons && (
              <ul className="mco-reasons-list">
                {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Risk warnings */}
      {risks.length > 0 && (
        <div className="mco-risks">
          <div className="mco-risks-label">CAUTION</div>
          {risks.map(r => (
            <div key={r.key} className="mco-risk-card">
              <div className="mco-risk-title">{r.title}</div>
              <div className="mco-risk-msg">{r.message}</div>
            </div>
          ))}
        </div>
      )}

      <WatchList watch={advisor.watch || []} />
    </div>
  )
}

/* ── Backtest Section ───────────────────────────────────────────────── */
function BacktestSection() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [opened,  setOpened]  = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/sentiment/backtest`)
      const j = await r.json()
      setData(j)
    } catch (e) { setError(String(e?.message || e)) }
    finally { setLoading(false) }
  }

  const toggle = () => {
    if (!opened && !data) load()
    setOpened(v => !v)
  }

  const TITLE_MAP = {
    EARLY_ACCUMULATION:  'Early Accumulation',
    DISTRIBUTION_TOP:    'Distribution Top',
    CAPITULATION_BOTTOM: 'Capitulation Bottom',
    TREND_CONTINUATION:  'Trend Continuation',
  }
  const H_ORDER = ['1h', '6h', '24h', '7d']

  return (
    <div className="mco-backtest-section">
      <button className="mco-backtest-toggle" onClick={toggle}>
        <span className="mco-backtest-chevron">{opened ? '▾' : '▸'}</span>
        <span className="mco-backtest-title">HISTORICAL PERFORMANCE</span>
        <span className="mco-backtest-sub">BTC · setup → return</span>
      </button>

      {opened && (
        <div className="mco-backtest-body">
          {loading && <div className="mco-bt-loading">Calculating…</div>}
          {error && <div className="mco-bt-error">Error: {error}</div>}
          {data && !loading && !error && (
            !data.available
              ? (
                <div className="mco-bt-empty">
                  <div className="mco-bt-empty-msg">{data.message || 'Not enough data yet.'}</div>
                  <div className="mco-bt-empty-sub">Results will appear as compass_history fills.</div>
                </div>
              )
              : (
                <>
                  <div className="mco-bt-stats">{data.processed} triggers · {data.skipped} skipped</div>
                  {Object.entries(data.results_by_setup || {}).map(([key, horizons]) => (
                    <div key={key} className="mco-bt-card">
                      <div className="mco-bt-card-hdr">
                        <span className="mco-bt-card-name">{TITLE_MAP[key] || key}</span>
                        <span className="mco-bt-card-key">{key}</span>
                      </div>
                      <div className="mco-bt-horizons">
                        {H_ORDER.map(h => {
                          const s    = horizons[h] || {}
                          const ret  = s.avg_return_pct
                          const win  = s.win_rate_pct
                          const tone = ret == null ? '#555' : ret >= 0 ? '#00e87a' : '#f43f5e'
                          return (
                            <div key={h} className={`mco-bt-cell ${s.insufficient_samples ? 'weak' : ''}`}>
                              <div className="mco-bt-cell-h">{h.toUpperCase()}</div>
                              {!s.samples
                                ? <div className="mco-bt-cell-empty">—</div>
                                : <>
                                  <div className="mco-bt-cell-ret" style={{ color: tone }}>
                                    {ret >= 0 ? '+' : ''}{ret?.toFixed(2)}%
                                  </div>
                                  <div className="mco-bt-cell-win">
                                    {win?.toFixed(0)}% · n={s.samples}
                                  </div>
                                </>
                              }
                            </div>
                          )
                        })}
                      </div>
                      {H_ORDER.some(h => horizons[h]?.insufficient_samples) && (
                        <div className="mco-bt-card-note">Faded cells: &lt; 10 samples, not yet statistically reliable.</div>
                      )}
                    </div>
                  ))}
                </>
              )
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────────── */
export default function MarketCompass() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch(`${API_BASE}/api/sentiment/compass`)
        if (!r.ok) { setError('HTTP ' + r.status); setLoading(false); return }
        const d = await r.json()
        if (!alive) return
        setData(d)
        setError(null)
      } catch (e) {
        if (alive) setError(String(e?.message || e))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <div className="mco-page">

      {/* Header */}
      <div className="mco-page-header">
        <div>
          <div className="mco-page-title">Market Compass</div>
          <div className="mco-page-subtitle">
            <span className="mco-live-dot" />
            Composite direction from 7 underlying signals · 30s refresh
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="mco-loading">
          <div className="ldash-spinner" />
          <span>Blending all signals…</span>
        </div>
      ) : error ? (
        <div className="mco-error">Error: {error}</div>
      ) : (
        <>
          <MasterGauge data={data} />
          <AdvisorCard advisor={data.advisor} />

          <div className="mco-components">
            <div className="mco-components-hdr">
              <span className="mco-section-label">COMPONENT ANALYSIS</span>
            </div>
            {ORDER.map(id => {
              const comp   = data.components?.[id]
              const weight = data.weights?.[id] || 0
              if (!comp) return null
              return <ComponentRow key={id} id={id} comp={comp} weight={weight} />
            })}
          </div>

          <BacktestSection />
        </>
      )}
    </div>
  )
}
