import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const STORAGE_KEY = 'nt_system_alerts'

const ALERT_TYPES = [
    { id: 'breaking',    name: 'Breaking Alerts',     desc: 'Trending & Breaking',        icon: 'B', color: '#8b5cf6', bg: '#8b5cf620' },
    { id: 'liquidations',name: 'Liquidations',         desc: 'Liquidation > $500K',         icon: 'L', color: '#ef4444', bg: '#ef444420' },
    { id: 'volume',      name: 'Volume Monitor',       desc: 'Volume spike > 2x avg',       icon: 'V', color: '#10b981', bg: '#10b98120' },
    { id: 'big-transfer',name: 'Big Transfer',         desc: 'Transfer > $10M',             icon: 'B', color: '#3b82f6', bg: '#3b82f620' },
    { id: 'token-unlock',name: 'Token Unlock',         desc: '3 gün önce bildir',           icon: 'T', color: '#8b5cf6', bg: '#8b5cf620' },
    { id: 'economic',    name: 'Economic Calendar',    desc: '3 yıldızlı olaylar',          icon: 'E', color: '#f59e0b', bg: '#f59e0b20' },
    { id: 'wallets',     name: 'Important Wallets',    desc: 'Whale cüzdan takibi',         icon: 'I', color: '#06b6d4', bg: '#06b6d420' },
    { id: 'price-alert', name: 'Price Alerts',         desc: 'Fiyat alarmı tetiklenince',   icon: 'P', color: '#f97316', bg: '#f9731620' },
]


export default function SystemAlerts() {
    const { token } = useAuth()

    // Persist toggles in localStorage
    const [alerts, setAlerts] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            const initial = {}
            ALERT_TYPES.forEach(a => { initial[a.id] = saved[a.id] ?? false })
            return initial
        } catch {
            const initial = {}
            ALERT_TYPES.forEach(a => { initial[a.id] = false })
            return initial
        }
    })

    // Real price alerts from backend
    const [priceAlerts, setPriceAlerts] = useState([])
    const [alertsLoading, setAlertsLoading] = useState(false)

    const fetchPriceAlerts = useCallback(async () => {
        if (!token) return
        setAlertsLoading(true)
        try {
            const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
            if (res.ok) setPriceAlerts(await res.json())
        } catch (err) { console.warn('[SystemAlerts] fetch alerts error', err) }
        setAlertsLoading(false)
    }, [token])

    useEffect(() => { fetchPriceAlerts() }, [fetchPriceAlerts])

    const toggle = (id) => {
        setAlerts(prev => {
            const next = { ...prev, [id]: !prev[id] }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
        })
    }

    const selectAll = () => {
        const allOn = Object.values(alerts).every(v => v)
        const next = {}
        ALERT_TYPES.forEach(a => { next[a.id] = !allOn })
        setAlerts(next)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }

    const triggeredAlerts = priceAlerts.filter(a => a.triggered)
    const activeAlerts    = priceAlerts.filter(a => !a.triggered)

    return (
        <div className="alerts-page">
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Trading Terminal (Beta)</h1>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Beta Version — Tercihler tarayıcıda saklanır</p>
            </div>

            <div className="alerts-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {/* System Alerts Column */}
                <div className="widget-card">
                    <div className="widget-header">
                        <div>
                            <div className="widget-title">System Alerts</div>
                            <div className="widget-subtitle">Bildirim Tercihleri</div>
                        </div>
                        <button className="select-all-btn" onClick={selectAll}>
                            {Object.values(alerts).every(v => v) ? 'Tümünü Kapat' : 'Tümünü Aç'}
                        </button>
                    </div>
                    <div className="widget-body" style={{ padding: '8px 0' }}>
                        {ALERT_TYPES.map(alert => (
                            <div className="alert-card" key={alert.id} style={{ margin: '0 12px 8px', border: 'none', background: 'var(--bg-secondary)' }}>
                                <div className="alert-icon" style={{ background: alert.bg, color: alert.color }}>
                                    {alert.icon}
                                </div>
                                <div className="alert-info">
                                    <div className="alert-name">{alert.name}</div>
                                    <div className="alert-desc">{alert.desc}</div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={alerts[alert.id]}
                                        onChange={() => toggle(alert.id)}
                                    />
                                    <span className="toggle-slider" />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Alert Monitoring Column */}
                <div className="widget-card">
                    <div className="widget-header">
                        <div>
                            <div className="widget-title">Alert Monitoring</div>
                            <div className="widget-subtitle">
                                {priceAlerts.length > 0
                                    ? `${activeAlerts.length} aktif · ${triggeredAlerts.length} tetiklendi`
                                    : 'Fiyat Alarmları'}
                            </div>
                        </div>
                        <button
                            onClick={fetchPriceAlerts}
                            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                            title="Yenile"
                        >↻</button>
                    </div>
                    <div className="widget-body">
                        {alertsLoading ? (
                            <div className="no-data" style={{ minHeight: 120 }}>
                                <span className="ds-spinner" style={{ marginBottom: 8 }} />
                                <span>Yükleniyor…</span>
                            </div>
                        ) : priceAlerts.length === 0 ? (
                            <div className="no-data" style={{ minHeight: 200 }}>
                                <div className="no-data-icon">🔔</div>
                                <span>Henüz alarm yok</span>
                                <span style={{ fontSize: 10 }}>Custom Alerts sayfasından alarm ekleyin</span>
                            </div>
                        ) : (
                            <div style={{ padding: '4px 8px' }}>
                                {triggeredAlerts.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 1, padding: '6px 4px 4px', fontWeight: 700 }}>TETİKLENDİ</div>
                                        {triggeredAlerts.map(a => (
                                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(0,217,146,0.05)', borderRadius: 4, marginBottom: 4, border: '1px solid rgba(0,217,146,0.15)' }}>
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.coin}/USDT</span>
                                                <span style={{ fontSize: 11, color: a.direction === 'above' ? 'var(--accent)' : 'var(--danger)' }}>
                                                    {a.direction === 'above' ? '▲' : '▼'} ${a.target_price?.toLocaleString()}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>✓</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {activeAlerts.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 1, padding: '6px 4px 4px', fontWeight: 700 }}>AKTİF</div>
                                        {activeAlerts.map(a => (
                                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.coin}/USDT</span>
                                                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                                                    {a.direction === 'above' ? '▲' : '▼'} ${a.target_price?.toLocaleString()}
                                                </span>
                                                <span style={{ fontSize: 10, color: '#fbbf24' }}>● Bekliyor</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
