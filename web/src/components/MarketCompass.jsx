import { useState, useEffect } from 'react'
import { Landmark, ArrowLeftRight, Flame, Percent, BarChart3, FileText, Globe, BarChart2, AlertTriangle, Clock } from 'lucide-react'
import { API_BASE } from '../config'

const COMPONENT_META = {
  smart_money:   { label: 'Smart Money',    Icon: Landmark,       note: 'Whale fills and real positions' },
  big_transfers: { label: 'Big Transfers',  Icon: ArrowLeftRight, note: 'Exchange flow, mint and burn' },
  liquidations:  { label: 'Liquidations',   Icon: Flame,          note: 'Long flush reads bullish (contra)' },
  funding:       { label: 'Funding Rate',   Icon: Percent,        note: 'Oversold reads bullish (contra)' },
  volume:        { label: 'Volume × Price', Icon: BarChart3,      note: 'Active buy / sell pressure' },
  etf:           { label: 'ETF Flow',       Icon: FileText,       note: 'BTC + ETH ETF net direction' },
  global:        { label: 'Global Macro',   Icon: Globe,          note: 'Fear & Greed and market cap momentum' },
}
const ORDER = ['smart_money', 'big_transfers', 'liquidations', 'funding', 'volume', 'etf', 'global']

const to100 = s => Math.round(Math.max(0, Math.min(100, ((s || 0) + 1) * 50)))
const verdictClass = v => v === 'BULLISH' ? 'ws-pos' : v === 'BEARISH' ? 'ws-neg' : 'ws-text'
const verdictLabel = v => v === 'BULLISH' ? 'Bullish' : v === 'BEARISH' ? 'Bearish' : 'Neutral'
const barClass = v => v === 'BULLISH' ? '' : v === 'BEARISH' ? 'neg' : 'neutral'
const cap = s => s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'

function scale(score, low, mid, high) {
  const a = Math.abs(score || 0)
  return a < 0.2 ? low : a < 0.5 ? mid : high
}

/* ── Master gauge ─────────────────────────────────────────────────── */
function MasterGauge({ data }) {
  const score = to100(data.score)
  const consensus = data.verdict === 'NEUTRAL' || data.confidence_label === 'LOW' ? 'Neutral' : verdictLabel(data.verdict)
  return (
    <div className="ws-card mc-master">
      <div className="mc-gauge">
        <div className="mc-gauge-labels">
          <div><div className="mc-gauge-tag ws-neg">BEARISH</div><div className="mc-gauge-range ws-neg">0 – 33</div></div>
          <div className="ws-center"><div className="mc-gauge-tag ws-muted">NEUTRAL</div><div className="mc-gauge-range ws-muted">34 – 66</div></div>
          <div className="ws-right"><div className="mc-gauge-tag ws-pos">BULLISH</div><div className="mc-gauge-range ws-pos">67 – 100</div></div>
        </div>
        <div className="mc-gauge-track">
          <span className="mc-seg mc-seg-bear" /><span className="mc-seg mc-seg-neutral" /><span className="mc-seg mc-seg-bull" />
          <i className="mc-gauge-marker" style={{ left: `${score}%` }} />
        </div>
        <div className="mc-gauge-score" style={{ left: `${score}%` }}>
          <div className="mc-gauge-score-num">{score}</div>
          <div className="mc-gauge-score-lbl">COMPASS SCORE</div>
        </div>
      </div>
      <div className="mc-conf">
        <div className="mc-conf-cell">
          <div className="mc-conf-label">CONSENSUS</div>
          <div className="mc-conf-val">{consensus}</div>
        </div>
        <div className="mc-conf-cell">
          <div className="mc-conf-label">AGREE / DIVERGE</div>
          <div className="mc-conf-val"><span className="ws-pos">{data.agree_count}</span> <span className="ws-subtle">/</span> <span className="ws-neg">{data.diverge_count}</span></div>
        </div>
        <div className="mc-conf-cell">
          <div className="mc-conf-label">CONFIDENCE</div>
          <div className="mc-conf-val">{Math.round((data.confidence || 0) * 100)}%</div>
        </div>
      </div>
    </div>
  )
}

/* ── Component table ──────────────────────────────────────────────── */
function ComponentTable({ data }) {
  return (
    <div className="ws-card">
      <div className="ws-card-head"><h3 className="ws-h4"><BarChart2 size={16} /> Component Analysis</h3></div>
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-tall">
          <thead>
            <tr>
              <th className="ws-th-caps">Component</th>
              <th className="ws-th-caps">Signal</th>
              <th className="ws-th-caps">Score (0–100)</th>
              <th className="ws-th-caps" style={{ width: '28%' }} />
              <th className="ws-th-caps">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map(id => {
              const comp = data.components?.[id]
              if (!comp) return null
              const meta = COMPONENT_META[id]
              const available = comp.available !== false
              const s = to100(comp.score)
              return (
                <tr key={id}>
                  <td className="ws-ink">
                    <span className="ws-row"><meta.Icon size={17} strokeWidth={1.6} className="ws-muted" />{meta.label}</span>
                  </td>
                  <td className={`ws-bold ${available ? verdictClass(comp.verdict) : 'ws-subtle'}`}>{available ? verdictLabel(comp.verdict) : 'No data'}</td>
                  <td className="ws-ink ws-num">{available ? s : '—'}</td>
                  <td><div className="ws-bar ws-bar-lg"><div className={`ws-bar-fill ${barClass(comp.verdict)}`} style={{ width: `${available ? s : 0}%` }} /></div></td>
                  <td className="ws-muted" style={{ whiteSpace: 'normal' }}>{comp.note || meta.note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Market setup + caution ───────────────────────────────────────── */
function SetupAndCaution({ data }) {
  const s = data.advisor?.setup || {}
  const c = data.components || {}
  const trend = s.trend || (data.verdict === 'BULLISH' ? 'Uptrend' : data.verdict === 'BEARISH' ? 'Downtrend' : 'Sideways')
  const regime = s.regime || (data.verdict === 'NEUTRAL' ? 'Range' : 'Trend')
  const volatility = s.volatility || scale(c.liquidations?.score, 'Low', 'Moderate', 'High')
  const liquidity = s.liquidity || scale(c.volume?.score, 'Thin', 'Normal', 'Deep')
  const risk = s.risk_appetite || (data.verdict === 'BULLISH' ? 'Risk-on' : data.verdict === 'BEARISH' ? 'Risk-off' : 'Neutral')
  const rows = [['Primary Trend', trend], ['Market Regime', cap(regime)], ['Volatility', cap(volatility)], ['Liquidity', cap(liquidity)], ['Risk Appetite', cap(risk)]]

  const risks = (data.advisor?.risks || []).map(r => r.message || r.title).filter(Boolean)
  const cautions = risks.length ? risks : [
    s.message || 'Signals are mixed, with no strong consensus.',
    'Watch for a clear break above or below the current range.',
    'Monitor ETF flows and macro data for confirmation.',
  ]

  return (
    <div className="ws-grid ws-grid-2 mc-setup-grid">
      <div className="ws-card">
        <div className="ws-card-head"><h3 className="ws-h4"><BarChart3 size={16} /> Market Setup</h3></div>
        <div className="ws-card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {rows.map(([k, v]) => (
            <div key={k} className="mc-setup-row"><span className="ws-text">{k}</span><span className="ws-ink">{v}</span></div>
          ))}
        </div>
      </div>
      <div className="ws-card">
        <div className="ws-card-head"><h3 className="ws-h4"><AlertTriangle size={16} /> Caution</h3></div>
        <div className="ws-card-body">
          <ul className="mc-caution">
            {cautions.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ── Historical performance ───────────────────────────────────────── */
const TITLE_MAP = { EARLY_ACCUMULATION: 'Early Accumulation', DISTRIBUTION_TOP: 'Distribution Top', CAPITULATION_BOTTOM: 'Capitulation Bottom', TREND_CONTINUATION: 'Trend Continuation' }
const H_ORDER = ['1h', '6h', '24h', '7d']

function Backtest() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/sentiment/backtest`)
      .then(r => r.json())
      .then(j => { if (alive) setData(j) })
      .catch(e => { if (alive) setError(String(e?.message || e)) })
    return () => { alive = false }
  }, [])

  const setups = data?.available ? Object.entries(data.results_by_setup || {}) : []

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3 className="ws-h4"><Clock size={16} /> Historical Performance</h3>
        {data?.available && <span className="ws-meta">{data.processed} triggers · {data.skipped} skipped</span>}
      </div>
      {error ? (
        <div className="ws-empty"><div className="ws-empty-title">Error: {error}</div></div>
      ) : !data ? (
        <div className="ws-loading"><span className="ws-spinner" /> Calculating…</div>
      ) : !data.available ? (
        <div className="ws-empty">
          <div className="ws-empty-icon"><BarChart2 size={24} strokeWidth={1.5} /></div>
          <div className="ws-empty-title">{data.message || 'Not enough samples'}</div>
          <div className="ws-empty-sub">More historical data is needed to display performance statistics.</div>
        </div>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead><tr><th>Setup</th>{H_ORDER.map(h => <th key={h} className="ws-right">{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {setups.map(([key, horizons]) => (
                <tr key={key}>
                  <td className="ws-ink">{TITLE_MAP[key] || cap(key)}</td>
                  {H_ORDER.map(h => {
                    const st = horizons[h] || {}
                    if (!st.samples) return <td key={h} className="ws-right ws-subtle">—</td>
                    const ret = st.avg_return_pct
                    return (
                      <td key={h} className={`ws-right ${st.insufficient_samples ? 'ws-subtle' : ''}`}>
                        <span className={ret >= 0 ? 'ws-pos' : 'ws-neg'}>{ret >= 0 ? '+' : ''}{ret?.toFixed(2)}%</span>
                        <span className="ws-muted ws-xs"> · {st.win_rate_pct?.toFixed(0)}% · n={st.samples}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function MarketCompass() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch(`${API_BASE}/api/sentiment/compass`)
        if (!r.ok) { if (alive) { setError('HTTP ' + r.status); setLoading(false) } return }
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
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left">
          <h1 className="ws-title">Market Compass</h1>
          <p className="ws-subtitle ws-caps">Master Compass · All Signals</p>
        </div>
        <div className="ws-page-head-right"><span className="ws-meta">7 signals · 30s refresh</span></div>
      </div>

      {loading ? (
        <div className="ws-loading"><span className="ws-spinner" /> Blending all signals…</div>
      ) : error ? (
        <div className="ws-note ws-note-err">Could not load the compass: {error}</div>
      ) : (
        <div className="ws-stack">
          <MasterGauge data={data} />
          <ComponentTable data={data} />
          <SetupAndCaution data={data} />
          <Backtest />
        </div>
      )}
    </div>
  )
}
