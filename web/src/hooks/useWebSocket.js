import { useEffect, useRef, useCallback, useMemo } from 'react'
import { API_BASE } from '../config'

const DEFAULT_SYMBOLS   = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'HYPEUSDT', 'AVAXUSDT']
const BASE_DELAY_MS     = 2_000   // ilk yeniden bağlanma gecikmesi
const MAX_BACKOFF_MS    = 30_000  // max 30 saniye bekleme
const MAX_RETRIES       = 20      // mobil 4G/WiFi geçişlerinde uzun süre denemeli
const PING_INTERVAL_MS  = 30_000  // her 30 saniyede bir ping gönder
const PONG_TIMEOUT_MS   = 15_000  // mobil ağ latency'si için 15 saniye
const PONG_MISS_LIMIT   = 3       // bağlantıyı ölü saymadan önce kaç pong miss olabilir

// Exponential backoff + jitter: aynı anda çok client yeniden bağlanırsa sunucu spam olmaz
function backoffDelay(retries) {
    const exp = Math.min(BASE_DELAY_MS * Math.pow(2, retries - 1), MAX_BACKOFF_MS)
    const jitter = (Math.random() - 0.5) * 0.6 * exp   // ±%30 jitter
    return Math.floor(Math.min(exp + jitter, MAX_BACKOFF_MS))
}

export function useWebSocket(onMessage, symbols = DEFAULT_SYMBOLS, { onStatusChange, token } = {}) {
    const ws              = useRef(null)
    const onMessageRef    = useRef(onMessage)
    const onStatusRef     = useRef(onStatusChange)
    const symbolsRef      = useRef(symbols)
    const tokenRef        = useRef(token)
    const retryCount      = useRef(0)
    const retryTimer      = useRef(null)
    const pingTimer       = useRef(null)
    const pongTimer       = useRef(null)
    const pongMissCount   = useRef(0)
    const unmounted       = useRef(false)
    const manualStop      = useRef(false)  // MAX_RETRIES aşıldıktan sonra otomatik denemeyi durdur

    onMessageRef.current  = onMessage
    onStatusRef.current   = onStatusChange
    symbolsRef.current    = symbols
    tokenRef.current      = token

    // ── Heartbeat: ping gönder; ardışık PONG_MISS_LIMIT pong eksikse bağlantıyı kapat
    const startPing = useCallback((socket) => {
        pongMissCount.current = 0
        pingTimer.current = setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) return
            try { socket.send(JSON.stringify({ type: 'ping', ts: Date.now() })) } catch {}
            clearTimeout(pongTimer.current)
            pongTimer.current = setTimeout(() => {
                pongMissCount.current += 1
                if (pongMissCount.current >= PONG_MISS_LIMIT) {
                    console.warn('[WS] pong miss limit reached, closing socket')
                    try { socket.close() } catch {}
                } else {
                    console.warn(`[WS] pong missed (${pongMissCount.current}/${PONG_MISS_LIMIT})`)
                }
            }, PONG_TIMEOUT_MS)
        }, PING_INTERVAL_MS)
    }, [])

    const stopPing = useCallback(() => {
        clearInterval(pingTimer.current)
        clearTimeout(pongTimer.current)
        pongMissCount.current = 0
    }, [])

    const connect = useCallback(() => {
        if (unmounted.current || manualStop.current) return

        const baseWsUrl = API_BASE.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws'
        const wsUrl = tokenRef.current ? `${baseWsUrl}?token=${encodeURIComponent(tokenRef.current)}` : baseWsUrl
        const socket = new WebSocket(wsUrl)
        ws.current = socket

        socket.onopen = () => {
            if (unmounted.current) { socket.close(); return }
            retryCount.current = 0
            manualStop.current = false
            socket.send(JSON.stringify({ type: 'subscribe', symbols: symbolsRef.current, token: tokenRef.current }))
            onStatusRef.current?.({ connected: true, retries: 0 })
            onMessageRef.current({ type: 'ws_connected' })
            startPing(socket)
        }

        socket.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data)
                if (msg.type === 'pong') {
                    // Bağlantı canlı — pong timeout'unu iptal et ve miss counter'ı sıfırla
                    clearTimeout(pongTimer.current)
                    pongMissCount.current = 0
                    return
                }
                onMessageRef.current(msg)
            } catch (err) { console.warn('[WS] message parse error', err) }
        }

        socket.onclose = () => {
            stopPing()
            if (unmounted.current) return
            onMessageRef.current({ type: 'ws_disconnected' })

            retryCount.current += 1

            if (retryCount.current > MAX_RETRIES) {
                manualStop.current = true
                onStatusRef.current?.({ connected: false, retries: retryCount.current, gaveUp: true })
                return
            }

            const delay = backoffDelay(retryCount.current)
            onStatusRef.current?.({ connected: false, retries: retryCount.current, nextRetryMs: delay })
            retryTimer.current = setTimeout(connect, delay)
        }

        socket.onerror = () => {
            socket.close()
        }
    }, [startPing, stopPing])

    // ── Manuel yeniden bağlanma (kullanıcı butona bastığında)
    const reconnect = useCallback(() => {
        manualStop.current = false
        retryCount.current = 0
        clearTimeout(retryTimer.current)
        ws.current?.close()
        connect()
    }, [connect])

    // ── Sekme görünürlük değişince: gizlenmişken bağlantı kopmuş olabilir
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                const state = ws.current?.readyState
                if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
                    reconnect()
                }
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [reconnect])

    // ── Capacitor (iOS/Android): app foreground/background değişince WS'yi tazele
    useEffect(() => {
        const isNative = typeof window !== 'undefined' && !!(window?.Capacitor?.isNativePlatform?.())
        if (!isNative) return
        let listener = null
        let cancelled = false
        ;(async () => {
            try {
                const { App } = await import('@capacitor/app')
                listener = await App.addListener('appStateChange', ({ isActive }) => {
                    if (cancelled) return
                    if (isActive) {
                        const state = ws.current?.readyState
                        if (state === WebSocket.CLOSED || state === WebSocket.CLOSING || state === undefined) {
                            reconnect()
                        }
                    }
                })
            } catch {}
        })()
        return () => {
            cancelled = true
            try { listener?.remove?.() } catch {}
        }
    }, [reconnect])

    // ── İnternet bağlantısı geri gelince hemen yeniden bağlan
    useEffect(() => {
        const handleOnline = () => reconnect()
        window.addEventListener('online', handleOnline)
        return () => window.removeEventListener('online', handleOnline)
    }, [reconnect])

    useEffect(() => {
        unmounted.current = false
        manualStop.current = false
        connect()
        return () => {
            unmounted.current = true
            clearTimeout(retryTimer.current)
            clearInterval(pingTimer.current)
            clearTimeout(pongTimer.current)
            ws.current?.close()
        }
    }, [connect])

    // Content-based dep: parent array reference her render değişse de,
    // sembol kümesi gerçekten değişmedikçe yeniden subscribe atılmasın.
    const symbolsKey = useMemo(() => [...(symbols || [])].sort().join('|'), [symbols])
    useEffect(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'subscribe', symbols: symbolsRef.current, token: tokenRef.current }))
        }
    }, [symbolsKey, token])

    return { reconnect }
}
