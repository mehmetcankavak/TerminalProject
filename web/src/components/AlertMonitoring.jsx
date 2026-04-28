import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

function fmtDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AlertMonitoring() {
  const { token } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchAlerts = useCallback(async () => {
    if (!token) {
      setAlerts([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setAlerts([])
        return
      }
      const data = await res.json()
      setAlerts(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('[AlertMonitoring] fetch error', err)
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, 20_000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  return (
    <div className="widget-card animate-fade-in">
      <div className="widget-header">
        <div>
          <div className="widget-title">Alert Monitoring</div>
          <div className="widget-subtitle">
            {alerts.length > 0 ? `${alerts.filter(a => !a.triggered).length} aktif · ${alerts.filter(a => a.triggered).length} tetiklendi` : 'Fiyat Alarmları'}
          </div>
        </div>
      </div>

      <div className="widget-body">
        {loading ? (
          <div className="no-data">
            <span>Yükleniyor…</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🔔</div>
            <span>No alerts yet</span>
            <span style={{ fontSize: 10 }}>Configure alerts in Custom Alerts</span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Text</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 8).map((a) => (
                <tr key={a.id}>
                  <td>{a.triggered ? 'Triggered' : 'Active'}</td>
                  <td>
                    {a.coin}/USDT {a.direction === 'above' ? '▲' : '▼'} ${Number(a.target_price || 0).toLocaleString('en-US')}
                  </td>
                  <td>{fmtDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
