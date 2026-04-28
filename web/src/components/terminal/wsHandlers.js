// WebSocket message handler factory — TerminalPage.jsx switch'inden ayrıştırıldı.
// Davranış aynı; sadece organizasyon. deps objesi ile state setter ve helper'lar geçilir.
import { fmt } from '../../utils/format'

export function createWsMessageHandler(deps) {
    const {
        setTickers,
        setNews,
        setPositions,
        setSlInputs,
        setTpInputs,
        setBalance,
        setConnected,
        setWsRetries,
        setWsGaveUp,
        addLog,
        alertNews,
        alertAlarm,
        notifEnabledRef,
        sendNotif,
        fetchStatus,
        fetchQuickAlerts,
        lastTickRef,
    } = deps
    return (msg) => {
        switch (msg.type) {
            case 'ticker': {
                lastTickRef.current[msg.symbol] = Date.now()
                const patch = {}
                if (msg.last_price != null) patch.last_price = msg.last_price
                if (msg.change_24h_pct != null) patch.change_24h_pct = msg.change_24h_pct
                if (msg.volume_24h != null) patch.volume_24h = msg.volume_24h
                if (msg.high_24h != null) patch.high_24h = msg.high_24h
                if (msg.low_24h != null) patch.low_24h = msg.low_24h
                if (msg.spread != null) patch.spread = msg.spread
                setTickers(prev => ({
                    ...prev,
                    [msg.symbol]: { ...prev[msg.symbol], ...patch },
                }))
                break
            }
            case 'news':
                setNews(prev => {
                    if (prev.find(n => n.id === msg.id)) return prev
                    const ageMs = Date.now() - new Date(msg.published_at || msg.received_at || 0).getTime()
                    if (ageMs < 5 * 60 * 1000) {
                        alertNews(msg.headline, msg.source || 'NEWS', (msg.priority || 'LOW').toUpperCase())
                        if (notifEnabledRef.current) sendNotif(`📰 ${msg.source || 'NEWS'}`, msg.headline)
                    }
                    return [msg, ...prev.slice(0, 99)]
                })
                break
            case 'news_alarm':
                alertAlarm(msg.headline, msg.source || 'NEWS', (msg.priority || 'HIGH').toUpperCase())
                break
            case 'order_filled':
                addLog(`[fill] ${msg.symbol} ${msg.side} @ $${fmt(msg.fill_price)} qty=${msg.qty?.toFixed(4)}`, 'order')
                if (msg.balance != null) setBalance(msg.balance)
                if (msg.position) {
                    setPositions(prev => ({ ...prev, [msg.symbol]: msg.position }))
                    if (msg.position.stop_loss) setSlInputs(prev => ({ ...prev, [msg.symbol]: String(msg.position.stop_loss) }))
                    if (msg.position.take_profit) setTpInputs(prev => ({ ...prev, [msg.symbol]: String(msg.position.take_profit) }))
                    if (notifEnabledRef.current) sendNotif(
                        `${msg.side?.toUpperCase() === 'LONG' || msg.side?.toUpperCase() === 'BUY' ? '🟢' : '🔴'} Pozisyon Açıldı — ${msg.symbol}`,
                        `${msg.side?.toUpperCase()} @ $${fmt(msg.fill_price)}  qty: ${msg.qty?.toFixed(4)}`,
                    )
                } else if ('position' in msg) {
                    setPositions(prev => { const next = { ...prev }; delete next[msg.symbol]; return next })
                    setTpInputs(prev => { const n = { ...prev }; delete n[msg.symbol]; return n })
                    setSlInputs(prev => { const n = { ...prev }; delete n[msg.symbol]; return n })
                }
                break
            case 'position_closed':
                if (notifEnabledRef.current) {
                    const pnl = msg.realized_pnl ?? 0
                    const sign = pnl >= 0 ? '+' : ''
                    sendNotif(
                        `${pnl >= 0 ? '✅' : '❌'} Pozisyon Kapatıldı — ${msg.symbol}`,
                        `${msg.side?.toUpperCase()} | Giriş $${fmt(msg.entry_price)} → Çıkış $${fmt(msg.exit_price)} | P&L: ${sign}$${fmt(pnl)}`,
                    )
                }
                break
            case 'hl_user_event':
                fetchStatus({ silent: true })
                if (msg.channel === 'userFills' && notifEnabledRef.current) {
                    sendNotif('📡 HL fill', 'Borsa tarafından yeni fill alındı')
                }
                break
            case 'order_rejected': addLog(`[rejected] ${msg.reason}`, 'error'); break
            case 'risk_blocked': addLog(`[risk] ${msg.reason}`, 'risk'); break
            case 'volume_spike': addLog(`[spike] ${msg.symbol} ${msg.multiplier?.toFixed(1)}x`, 'warning'); break
            case 'funding_fee': {
                const sign = msg.fee >= 0 ? '+' : ''
                addLog(`[funding] ${msg.symbol} rate=${(msg.rate * 100).toFixed(4)}% fee=${sign}$${Math.abs(msg.fee).toFixed(4)}`, msg.fee >= 0 ? 'success' : 'warning')
                break
            }
            case 'alert_triggered': {
                const arrow = msg.direction === 'above' ? '▲' : '▼'
                const actionTag = msg.action && msg.action !== 'notify' ? ` · 🤖 ${String(msg.action).toUpperCase()}` : ''
                addLog(`[alarm] ${arrow} ${msg.coin} ${msg.direction} $${msg.target.toLocaleString()} — şu an $${msg.price?.toLocaleString()}${actionTag}`, 'order')
                alertNews(`${msg.coin} fiyat alarmı tetiklendi`, 'ALARM', 'HIGH')
                fetchQuickAlerts()
                if (notifEnabledRef.current) sendNotif(
                    `🔔 Fiyat Alarmı — ${msg.coin}`,
                    `${arrow} Hedef $${msg.target?.toLocaleString()} ${msg.direction === 'above' ? 'aşıldı' : 'altına indi'} | Şu an: $${msg.price?.toLocaleString()}${actionTag}`,
                )
                break
            }
            case 'alert_action_fired': {
                const a = String(msg.action || '').toUpperCase()
                const sizeLbl = msg.amount_usd ? `$${msg.amount_usd}` : ''
                const levLbl = msg.leverage ? `${msg.leverage}x` : ''
                addLog(`[auto] Alarm #${msg.alert_id} → ${a} ${msg.symbol} ${sizeLbl} ${levLbl}`, 'order')
                if (notifEnabledRef.current) sendNotif(
                    `🤖 Otomatik Emir — ${msg.symbol}`,
                    `${a} ${sizeLbl} ${levLbl} @ $${msg.price?.toLocaleString?.() ?? msg.price}`,
                )
                break
            }
            case 'ws_connected': setConnected(true); setWsRetries(0); setWsGaveUp(false); break
            case 'ws_disconnected': setConnected(false); break
        }
    }
}
