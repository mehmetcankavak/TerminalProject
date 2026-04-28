// Sağ paneldeki Quick Alerts kutusu — TerminalPage.jsx'ten ayrıştırıldı.
// Davranış / stil aynı; sadece dosya organizasyonu.
import { fmt } from '../../utils/format'

export default function QuickAlertsPanel({
    quickAlerts,
    quickAlertsCollapsed,
    setQuickAlertsCollapsed,
    quickAlertCoin,
    setQuickAlertCoin,
    quickAlertDirection,
    setQuickAlertDirection,
    quickAlertPrice,
    setQuickAlertPrice,
    quickAlertBusy,
    quickAlertAction,
    setQuickAlertAction,
    quickAlertActionAmount,
    setQuickAlertActionAmount,
    quickAlertActionLev,
    setQuickAlertActionLev,
    createQuickAlert,
    deleteQuickAlert,
    recentAlerts,
}) {
    return (
        <div style={{ border: '1px solid #171717', background: 'linear-gradient(180deg, #090909 0%, #050505 100%)', borderRadius: 0, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--text-2)', textTransform: 'uppercase' }}>Quick Alerts</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{quickAlerts.filter(a => !a.triggered).length} aktif</span>
                    <button
                        onClick={() => setQuickAlertsCollapsed(v => !v)}
                        title={quickAlertsCollapsed ? 'Aç' : 'Kapat'}
                        style={{ background: 'transparent', border: '1px solid #1f1f1f', color: 'var(--text-2)', borderRadius: 0, width: 22, height: 22, lineHeight: '18px', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >
                        {quickAlertsCollapsed ? '▾' : '▴'}
                    </button>
                </div>
            </div>
            {!quickAlertsCollapsed && (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 6, marginBottom: 6 }}>
                <input
                    value={quickAlertCoin}
                    onChange={e => setQuickAlertCoin(e.target.value.toUpperCase())}
                    placeholder="Coin / Hisse (örn: MSTR)"
                    style={{ background: '#0a0a0a', border: '1px solid #1d1d1d', color: 'var(--text-0)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <select
                    value={quickAlertDirection}
                    onChange={e => setQuickAlertDirection(e.target.value)}
                    style={{ background: '#0a0a0a', border: '1px solid #1d1d1d', color: 'var(--text-1)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                >
                    <option value="above">▲ Above</option>
                    <option value="below">▼ Below</option>
                </select>
                <input
                    value={quickAlertPrice}
                    onChange={e => setQuickAlertPrice(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createQuickAlert() } }}
                    placeholder="Hedef fiyat"
                    style={{ background: '#0a0a0a', border: '1px solid #1d1d1d', color: 'var(--text-0)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <button
                    onClick={createQuickAlert}
                    disabled={quickAlertBusy}
                    style={{ background: quickAlertBusy ? '#0a0a0a' : 'var(--accent)', color: quickAlertBusy ? 'var(--text-3)' : '#000', border: quickAlertBusy ? '1px solid #1d1d1d' : '1px solid rgba(0,217,146,0.45)', borderRadius: 0, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: quickAlertBusy ? 'not-allowed' : 'pointer' }}
                >
                    + Alarm
                </button>
            </div>
            {/* Conditional order satırı */}
            <div style={{ display: 'grid', gridTemplateColumns: quickAlertAction === 'long' || quickAlertAction === 'short' ? '1fr 1fr 1fr' : '1fr', gap: 6, marginBottom: 6 }}>
                <select
                    value={quickAlertAction}
                    onChange={e => setQuickAlertAction(e.target.value)}
                    title="Alarm tetiklendiğinde yapılacak işlem"
                    style={{ background: '#0a0a0a', border: `1px solid ${quickAlertAction === 'notify' ? '#1d1d1d' : 'rgba(0,217,146,0.4)'}`, color: quickAlertAction === 'notify' ? 'var(--text-2)' : 'var(--accent)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                >
                    <option value="notify">🔔 Sadece bildir</option>
                    <option value="long">🟢 Otomatik LONG aç</option>
                    <option value="short">🔴 Otomatik SHORT aç</option>
                    <option value="close">✕ Pozisyonu kapat</option>
                </select>
                {(quickAlertAction === 'long' || quickAlertAction === 'short') && (
                    <>
                        <input
                            value={quickAlertActionAmount}
                            onChange={e => setQuickAlertActionAmount(e.target.value)}
                            placeholder="Marjin (USD)"
                            style={{ background: '#0a0a0a', border: '1px solid #1d1d1d', color: 'var(--text-0)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                        />
                        <input
                            value={quickAlertActionLev}
                            onChange={e => setQuickAlertActionLev(e.target.value)}
                            placeholder="Kaldıraç"
                            style={{ background: '#0a0a0a', border: '1px solid #1d1d1d', color: 'var(--text-0)', borderRadius: 0, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                        />
                    </>
                )}
            </div>
            {recentAlerts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 90, overflowY: 'auto' }}>
                    {recentAlerts.map(a => {
                        const hasAction = a.action && a.action !== 'notify'
                        const actionColor = a.action === 'long' ? '#00d992' : a.action === 'short' ? '#ff3b5c' : '#f5a623'
                        const actionLabel = a.action === 'long' ? 'L' : a.action === 'short' ? 'S' : a.action === 'close' ? '✕' : ''
                        return (
                            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 6, alignItems: 'center', fontSize: 10, padding: '4px 6px', border: '1px solid #191919', borderRadius: 0, background: '#080808' }}>
                                <span style={{ color: 'var(--text-1)' }}>{String(a.coin).toUpperCase()}</span>
                                <span style={{ color: a.direction === 'above' ? '#00d992' : '#ff3b5c' }}>{a.direction === 'above' ? '▲' : '▼'}</span>
                                <span style={{ color: a.triggered ? '#f5a623' : 'var(--text-2)' }}>${fmt(a.target_price)}</span>
                                {hasAction ? (
                                    <span
                                        title={`Tetiklenince: ${String(a.action).toUpperCase()}${a.action_amount_usd ? ' $' + a.action_amount_usd : ''}${a.action_leverage ? ' · ' + a.action_leverage + 'x' : ''}${a.action_fired ? ' (tetiklendi)' : ''}`}
                                        style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: actionColor + '22', color: actionColor, border: `1px solid ${actionColor}44` }}
                                    >
                                        🤖 {actionLabel}
                                    </span>
                                ) : <span />}
                                <button onClick={() => deleteQuickAlert(a.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                            </div>
                        )
                    })}
                </div>
            )}
            </>
            )}
        </div>
    )
}
