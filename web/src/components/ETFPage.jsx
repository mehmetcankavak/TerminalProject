import { useState, useEffect, useCallback, useMemo } from 'react'
import { Calendar, ChevronDown, Download } from 'lucide-react'
import { API_BASE } from '../config'

const fmtM = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '-') + '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(2) + 'B' : Math.abs(v).toFixed(1) + 'M')
const fmtCell = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1)
const fmtUSD = n => n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + Math.round(n).toLocaleString('en-US')
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const RANGES = [[14, 'Last 2 weeks'], [30, 'Last 30 days'], [60, 'Last 60 days'], [90, 'Last 90 days']]

/* ── Daily net flow bar chart ───────────────────────────────────────────── */
function FlowChart({ rows }) {
  const W = 1000, H = 220, mid = H / 2, pad = 6
  if (rows.length < 2) return <div className="ws-empty"><div className="ws-empty-title">No flow history for this range.</div><div className="ws-empty-sub">Daily net flows need a Coinglass key on the backend.</div></div>
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1)
  const bw = W / rows.length
  const ticks = [1, 0.5, 0, -0.5, -1]
  const labelEvery = Math.max(1, Math.round(rows.length / 10))
  return (
    <div className="liq-timeline">
      <div className="liq-timeline-y">{ticks.map(t => <span key={t}>{t === 0 ? '0' : (t < 0 ? '-' : '') + (Math.abs(t) * max >= 1000 ? (Math.abs(t) * max / 1000).toFixed(1) + 'B' : Math.round(Math.abs(t) * max) + 'M')}</span>)}</div>
      <div className="liq-timeline-plot" style={{ paddingBottom: 26 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {ticks.map(t => <line key={t} x1="0" x2={W} y1={mid - t * (mid - pad)} y2={mid - t * (mid - pad)} stroke="#e5e7eb" strokeDasharray={t === 0 ? '' : '3 4'} />)}
          {rows.map((r, i) => {
            const h = (Math.abs(r.value) / max) * (mid - pad)
            return <rect key={i} x={i * bw + bw * 0.22} y={r.value >= 0 ? mid - h : mid} width={bw * 0.56} height={Math.max(1, h)} fill={r.value >= 0 ? '#22c55e' : '#ef4444'} rx="1" />
          })}
        </svg>
        <div className="liq-timeline-x" style={{ height: 20 }}>
          {rows.map((r, i) => i % labelEvery === 0 ? <span key={i} style={{ left: `${((i + 0.5) / rows.length) * 100}%` }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null)}
        </div>
      </div>
    </div>
  )
}

export default function ETFPage() {
  const [type, setType]       = useState('BTC')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]       = useState(30)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/etf-data?type=${type}`)
      if (!r.ok) return
      setData(await r.json())
    } catch { /* keep the previous snapshot */ }
    finally { setLoading(false) }
  }, [type])
  useEffect(() => { setLoading(true); load(); const id = setInterval(load, 60_000); return () => clearInterval(id) }, [load])

  const etfs = data?.etfs || []
  const summary = data?.summary || {}
  const history = useMemo(() => {
    const rows = [...(data?.flowHistory || [])].filter(r => r.date && isFinite(r.value)).sort((a, b) => a.date.localeCompare(b.date))
    return rows.slice(-days)
  }, [data, days])
  const tableRows = useMemo(() => [...history].reverse().slice(0, 14), [history])
  const shownTotal = tableRows.reduce((s, r) => s + r.value, 0)
  const rangeLabel = history.length ? `${fmtDate(history[0].date)} - ${fmtDate(history[history.length - 1].date)}` : RANGES.find(r => r[0] === days)[1]

  const exportCsv = () => {
    const lines = ['date,net_flow_musd', ...history.map(r => `${r.date},${r.value}`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${type.toLowerCase()}-etf-flows.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }

  const kpis = [['Today Net Flow', summary.today], ['7 Days Net Flow', summary.week], ['30 Days Net Flow', summary.month], ['90 Days Net Flow', summary.threeMonth]]

  return (
    <div className="ws-page">
      <div className="ws-page-head" style={{ marginBottom: 10 }}>
        <div className="ws-page-head-left"><h1 className="ws-title">ETF Data</h1></div>
        <div className="ws-page-head-right">
          <div className="ws-inline-select" style={{ minWidth: 250 }}><Calendar size={15} className="ws-muted" /> {rangeLabel} <ChevronDown size={14} />
            <select value={days} onChange={e => setDays(Number(e.target.value))}>{RANGES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="ws-tabs ws-tabs-lg ws-mb-16">
        {['BTC', 'ETH'].map(t => <button key={t} className={`ws-tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>{t} ETFs</button>)}
      </div>

      <div className="ws-grid ws-grid-4">
        {kpis.map(([label, v]) => (
          <div key={label} className="ws-kpi">
            <div className="ws-kpi-label" style={{ fontSize: 14 }}>{label}</div>
            <div className={`ws-kpi-value ${v == null ? 'ws-muted' : v >= 0 ? 'ws-pos' : 'ws-neg'}`} style={{ fontSize: 26 }}>{v == null ? '—' : fmtM(v).replace(/^([+-])\$/, '$1 $')}</div>
          </div>
        ))}
      </div>

      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <h3 className="ws-h3">Total ETF Net Flow ({type})</h3>
          <div className="ws-chart-legend"><span><i style={{ background: '#16a34a' }} /> Net Inflow</span><span><i style={{ background: '#ef4444' }} /> Net Outflow</span></div>
        </div>
        <div className="ws-card-body">{loading ? <div className="ws-loading"><span className="ws-spinner" /> Loading flows…</div> : <FlowChart rows={history} />}</div>
      </div>

      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <h3 className="ws-h3">{type} ETF Flows (US$ Millions)</h3>
          <button className="ws-link" onClick={exportCsv} disabled={!history.length}><Download size={14} /> Export CSV</button>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-bordered ws-table-dense">
            <thead><tr><th>Date</th><th className="ws-right">Net Flow</th><th className="ws-right">7D Avg</th><th className="ws-right">Cumulative (shown)</th></tr></thead>
            <tbody>
              {tableRows.length === 0 ? <tr><td colSpan={4}><div className="ws-empty"><div className="ws-empty-title">No daily flow rows.</div></div></td></tr>
              : tableRows.map((r, i) => {
                const idx = history.length - 1 - i
                const window = history.slice(Math.max(0, idx - 6), idx + 1)
                const avg = window.reduce((s, x) => s + x.value, 0) / window.length
                const cum = tableRows.slice(i).reduce((s, x) => s + x.value, 0)
                return (
                  <tr key={r.date}>
                    <td className="ws-ink">{fmtDate(r.date)}</td>
                    <td className={`ws-right ws-num ${r.value >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtCell(r.value)}</td>
                    <td className={`ws-right ws-num ${avg >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtCell(avg)}</td>
                    <td className={`ws-right ws-num ws-bold ${cum >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtCell(cum)}</td>
                  </tr>
                )
              })}
            </tbody>
            {tableRows.length > 0 && <tfoot><tr><td>Total (Shown)</td><td className={`ws-right ws-num ${shownTotal >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtCell(shownTotal)}</td><td /><td /></tr></tfoot>}
          </table>
        </div>
      </div>

      <div className="ws-card ws-mt-16">
        <div className="ws-card-head"><h3 className="ws-h3">{type} Spot ETFs</h3><span className="ws-meta">Total AUM {fmtUSD(data?.totalAUM)}</span></div>
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-dense">
            <thead><tr><th>ETF</th><th>Name</th><th className="ws-right">Price</th><th className="ws-right">24h</th><th className="ws-right">Volume</th><th className="ws-right">AUM</th></tr></thead>
            <tbody>
              {etfs.length === 0 ? <tr><td colSpan={6}><div className="ws-empty"><div className="ws-empty-title">{loading ? 'Loading…' : 'No ETF quotes available.'}</div></div></td></tr>
              : [...etfs].sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0)).map(e => (
                <tr key={e.symbol}>
                  <td className="ws-ink ws-bold">{e.symbol}</td>
                  <td className="ws-text">{e.longName || e.shortName || ''}</td>
                  <td className="ws-right ws-num ws-ink">{e.price != null ? '$' + Number(e.price).toFixed(2) : '—'}</td>
                  <td className={`ws-right ws-num ${(e.changePct || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{e.changePct != null ? (e.changePct >= 0 ? '+' : '') + e.changePct.toFixed(2) + '%' : '—'}</td>
                  <td className="ws-right ws-num">{fmtUSD((e.volume || 0) * (e.price || 0))}</td>
                  <td className="ws-right ws-num">{fmtUSD(e.totalAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
