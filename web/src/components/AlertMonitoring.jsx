import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing, ClipboardList } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import AssetLogo from './AssetLogo'

const fmtDate = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5)
}
const fmtTarget = n => n == null ? '—' : n >= 1000 ? Math.round(n).toLocaleString('en-US') : n >= 1 ? Number(n).toFixed(2) : Number(n).toFixed(4)

export default function AlertMonitoring() {
  const { token } = useAuth()
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [sort, setSort]       = useState({ key: 'date', dir: 'desc' })

  const fetchAlerts = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      setAlerts(res.ok ? await res.json() : [])
    } catch { setAlerts([]) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { fetchAlerts(); const id = setInterval(fetchAlerts, 20_000); return () => clearInterval(id) }, [fetchAlerts])

  const active = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  const sorted = [...alerts].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'coin') return a.coin.localeCompare(b.coin) * dir
    if (sort.key === 'direction') return a.direction.localeCompare(b.direction) * dir
    if (sort.key === 'target') return (a.target_price - b.target_price) * dir
    if (sort.key === 'status') return (Number(a.triggered) - Number(b.triggered)) * dir
    return (new Date(a.created_at) - new Date(b.created_at)) * dir
  })
  const toggle = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  const Th = ({ k, children }) => <th className="ws-th-caps"><span className="ws-th-sort" onClick={() => toggle(k)}>{children} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg></span></th>

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Alert Monitoring</h1></div>
      </div>

      <div className="ws-grid ws-grid-3">
        <div className="ws-kpi alm-kpi"><div><div className="ws-kpi-label">Active</div><div className="ws-kpi-value ws-pos">{active.length}</div></div><Bell size={26} strokeWidth={1.5} className="ws-kpi-icon" /></div>
        <div className="ws-kpi alm-kpi"><div><div className="ws-kpi-label">Triggered</div><div className="ws-kpi-value">{triggered.length}</div></div><BellRing size={26} strokeWidth={1.5} className="ws-kpi-icon" /></div>
        <div className="ws-kpi alm-kpi"><div><div className="ws-kpi-label">Total</div><div className="ws-kpi-value">{alerts.length}</div></div><ClipboardList size={26} strokeWidth={1.5} className="ws-kpi-icon" /></div>
      </div>

      <div className="ws-card ws-mt-16">
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-tall alm-table">
            <thead><tr><Th k="coin">Coin</Th><Th k="direction">Direction</Th><Th k="target">Target</Th><Th k="date">Date</Th><Th k="status">Status</Th></tr></thead>
            <tbody>
              {loading && alerts.length === 0 ? (
                <tr><td colSpan={5}><div className="ws-loading"><span className="ws-spinner" /> Loading…</div></td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={5}><div className="ws-empty"><div className="ws-empty-icon"><Bell size={26} strokeWidth={1.4} /></div><div className="ws-empty-title">No alerts yet</div><div className="ws-empty-sub">Set up price alerts in Custom Alerts.</div></div></td></tr>
              ) : sorted.map(a => (
                <tr key={a.id}>
                  <td><div className="ws-asset"><span className="ws-asset-logo"><AssetLogo symbol={a.coin} type="crypto" size={28} radius={14} /></span><span className="ws-asset-sym ws-mono" style={{ fontSize: 14 }}>{a.coin}</span></div></td>
                  <td className={`ws-mono ${a.direction === 'above' ? 'ws-pos' : 'ws-neg'}`} style={{ fontSize: 14 }}>{a.direction === 'above' ? 'Above' : 'Below'}</td>
                  <td className="ws-mono ws-ink" style={{ fontSize: 14 }}>{fmtTarget(a.target_price)}</td>
                  <td className="ws-mono ws-text" style={{ fontSize: 14 }}>{fmtDate(a.created_at)}</td>
                  <td>{a.triggered ? <span className="ws-badge">Triggered</span> : <span className="ws-badge ws-badge-pos">Active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
