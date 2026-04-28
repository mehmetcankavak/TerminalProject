// /api/status ve /api/alerts polling + tt-trading-sync listener.
// TerminalPage.jsx'ten ayrıştırıldı; davranış aynen korundu.
import { useCallback, useEffect } from 'react'
import { API_BASE } from '../config'

export function useTerminalStatus({
    token,
    tokenRef,
    connectRef,
    addLogRef,
    setTickers,
    setNews,
    setNewsHealth,
    setPositions,
    setSlInputs,
    setTpInputs,
    setStaleSymbols,
    setBalance,
    setFreeMargin,
    setMarginUsed,
    setHlSpot,
    setUnrealizedTotal,
    setRealizedToday,
    setQuickAlerts,
}) {
    const fetchQuickAlerts = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) return
            const data = await res.json()
            setQuickAlerts(Array.isArray(data) ? data : [])
        } catch (err) {
            console.warn('[Terminal] fetchAlerts error', err)
        }
    }, [token, setQuickAlerts])

    const fetchStatus = useCallback(async ({ silent = false } = {}) => {
        try {
            const t = tokenRef.current
            const res = await fetch(`${API_BASE}/api/status`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            if (data.tickers) {
                setTickers(prev => {
                    const next = { ...prev }
                    Object.entries(data.tickers).forEach(([sym, patch]) => {
                        const cleanPatch = {}
                        Object.entries(patch || {}).forEach(([key, value]) => {
                            if (value != null) cleanPatch[key] = value
                        })
                        if (Object.keys(cleanPatch).length) {
                            next[sym] = { ...next[sym], ...cleanPatch }
                        }
                    })
                    return next
                })
            }
            if (data.news) {
                setNews(prev => {
                    const byId = new Map()
                    for (const n of prev) if (n?.id) byId.set(n.id, n)
                    for (const n of (data.news || [])) if (n?.id) byId.set(n.id, n)
                    const merged = Array.from(byId.values())
                    merged.sort((a, b) => {
                        const ta = Math.max(new Date(a.received_at || 0).getTime(), new Date(a.published_at || 0).getTime())
                        const tb = Math.max(new Date(b.received_at || 0).getTime(), new Date(b.published_at || 0).getTime())
                        return tb - ta
                    })
                    return merged.slice(0, 300)
                })
            }
            if (data.news_health) setNewsHealth(data.news_health)
            if (data.positions !== undefined && data.positions !== null) {
                setPositions(data.positions)
                const sl = {}, tp = {}
                Object.entries(data.positions || {}).forEach(([sym, pos]) => {
                    if (pos?.stop_loss) sl[sym] = String(pos.stop_loss)
                    if (pos?.take_profit) tp[sym] = String(pos.take_profit)
                })
                setSlInputs(sl)
                setTpInputs(tp)
            }
            if (Array.isArray(data.stale_symbols)) setStaleSymbols(data.stale_symbols)
            if (data.balance != null) setBalance(data.balance)
            if (data.free_margin !== undefined) setFreeMargin(data.free_margin)
            if (data.margin_used !== undefined) setMarginUsed(Number(data.margin_used) || 0)
            if (data.hl_spot !== undefined && setHlSpot) setHlSpot(Number(data.hl_spot) || 0)
            if (data.unrealized_total != null) setUnrealizedTotal(data.unrealized_total)
            if (data.realized_today != null) setRealizedToday(data.realized_today)
            if (data.mode) {
                const backendMode = data.mode
                if (backendMode === 'PAPER' && connectRef.current.tradingMode !== 'PAPER') {
                    const restored = await connectRef.current.restoreSavedConnection()
                    if (restored) return
                }
                connectRef.current.setTradingMode(backendMode)
            }
            if (data.hl_wallet) connectRef.current.setHlWallet(data.hl_wallet)
            if ('hl_testnet' in data) connectRef.current.setHlTestnet(Boolean(data.hl_testnet))
        } catch (err) {
            if (!silent) addLogRef.current(`[warn] backend disconnected: ${err.message}`, 'warning')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Initial status fetch + 5s poll
    useEffect(() => {
        fetchStatus()
        const id = setInterval(() => fetchStatus({ silent: true }), 5000)
        return () => clearInterval(id)
    }, [fetchStatus])

    // tt-trading-sync — connect/disconnect event'lerinde anlık refresh
    useEffect(() => {
        const onTradingSync = (ev) => {
            const detail = ev?.detail || {}
            if (detail.mode) connectRef.current.setTradingMode(detail.mode)
            if ('hl_wallet' in detail) connectRef.current.setHlWallet(detail.hl_wallet || '')
            if (detail.balance != null) setBalance(detail.balance)
            if (detail.free_margin != null) setFreeMargin(detail.free_margin)
            if (detail.margin_used != null) setMarginUsed(Number(detail.margin_used) || 0)
            if (Array.isArray(detail.positions)) {
                const mapped = Object.fromEntries(
                    detail.positions
                        .map((pos) => [pos?.symbol, pos])
                        .filter(([symbol]) => Boolean(symbol))
                )
                setPositions(mapped)
            }
            if (detail.mode === 'PAPER') {
                setPositions({})
                setFreeMargin(null)
                setMarginUsed(0)
                setUnrealizedTotal(0)
                setRealizedToday(0)
            }
            fetchStatus({ silent: true })
        }
        window.addEventListener('tt-trading-sync', onTradingSync)
        return () => window.removeEventListener('tt-trading-sync', onTradingSync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchStatus])

    // Alerts initial + 15s poll
    useEffect(() => {
        fetchQuickAlerts()
    }, [fetchQuickAlerts])
    useEffect(() => {
        const id = setInterval(fetchQuickAlerts, 15000)
        return () => clearInterval(id)
    }, [fetchQuickAlerts])

    return { fetchStatus, fetchQuickAlerts }
}
