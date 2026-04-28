/**
 * useNewsAlert — Haber + Alarm bildirimleri
 *
 * İki senaryo:
 *   1. type:"news"       → Anlık: ses + tab flash (terminaldeysen görürsün)
 *   2. type:"news_alarm" → 3 saniye sonra backend'den gelir:
 *                          ses + browser notification + tab flash
 *                          Başka sekmede/sitede olsan bile çalışır.
 */
import { useEffect, useRef, useCallback } from 'react'

// ── AudioContext singleton — browser'da max 6 context limiti var, yeni yaratma ─
let _sharedCtx = null
function getAudioCtx() {
    if (!_sharedCtx || _sharedCtx.state === 'closed') {
        _sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (_sharedCtx.state === 'suspended') {
        _sharedCtx.resume()
    }
    return _sharedCtx
}

// ── Ses sentezleyici ─────────────────────────────────────────────────────────
function playBeep(priority = 'LOW', isAlarm = false) {
    try {
        const ctx = getAudioCtx()

        if (isAlarm || priority === 'HIGH') {
            // Alarm: üçlü bip, güçlü ve uzun
            const times = isAlarm ? [0, 0.22, 0.44] : [0, 0.22]
            times.forEach(offset => {
                const osc  = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.type = 'sine'
                osc.frequency.setValueAtTime(1200, ctx.currentTime + offset)
                osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + offset + 0.18)
                gain.gain.setValueAtTime(0.0, ctx.currentTime + offset)
                gain.gain.linearRampToValueAtTime(isAlarm ? 0.5 : 0.35, ctx.currentTime + offset + 0.01)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2)
                osc.start(ctx.currentTime + offset)
                osc.stop(ctx.currentTime + offset + 0.22)
            })
        } else if (priority === 'MEDIUM' || priority === 'MED') {
            const osc  = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(660, ctx.currentTime)
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12)
            gain.gain.setValueAtTime(0.0, ctx.currentTime)
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.28)
        } else {
            const osc  = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'triangle'
            osc.frequency.setValueAtTime(520, ctx.currentTime)
            gain.gain.setValueAtTime(0.0, ctx.currentTime)
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.005)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.32)
        }

    } catch (err) { console.warn('[NewsAlert] playBeep error', err) }
}

// ── Tab title flash ───────────────────────────────────────────────────────────
let _flashTimer = null
const _originalTitle = document.title

function flashTitle(text, durationMs = 10000) {
    clearInterval(_flashTimer)
    let show = true
    _flashTimer = setInterval(() => {
        document.title = show ? `🚨 ${text}` : _originalTitle
        show = !show
    }, 700)
    setTimeout(() => {
        clearInterval(_flashTimer)
        document.title = _originalTitle
    }, durationMs)
}

// ── Browser Notification ─────────────────────────────────────────────────────
export async function requestNotifPermission() {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    return result === 'granted'
}

function showBrowserNotif(headline, source, priority, isAlarm = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const icons = { HIGH: '🚨', MEDIUM: '⚠️', MED: '⚠️', LOW: '📰' }
    const icon  = icons[priority] || '📰'
    const title = isAlarm
        ? `🔔 ALARM — ${source}`
        : `${icon} ${source}`

    // Her alarm ayrı notification (tag yoksa stack'lenir)
    // HIGH alarm: requireInteraction=true → kullanıcı tıklayana kadar kapanmaz
    const notif = new Notification(title, {
        body: headline,
        tag: isAlarm ? `alarm-${Date.now()}` : 'crypto-news',
        silent: true,                           // ses JS'den geliyor
        requireInteraction: isAlarm || priority === 'HIGH',
    })
    notif.onclick = () => { window.focus(); notif.close() }

    // Düşük öncelikte 6 saniye sonra kapat
    if (!isAlarm && priority === 'LOW') {
        setTimeout(() => notif.close(), 6000)
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useNewsAlert(enabled = true) {
    const enabledRef = useRef(enabled)
    enabledRef.current = enabled

    useEffect(() => {
        if (enabled) requestNotifPermission()
    }, [enabled])

    /**
     * Anlık haber bildirimi (type:"news" geldiğinde)
     * Sadece ses — kullanıcı terminaldeyse yeterli.
     */
    const alertNews = useCallback((headline, source, priority = 'LOW') => {
        if (!enabledRef.current) return
        playBeep(priority, false)

        // Sekme arka plandaysa tab flash + browser notif
        if (document.hidden) {
            flashTitle(headline.slice(0, 45), 8000)
            showBrowserNotif(headline, source, priority, false)
        }
    }, [])

    /**
     * Alarm bildirimi (type:"news_alarm" — backend 3s sonra gönderir)
     * Her zaman çalışır: sekme aktif de olsa, arka planda da olsa.
     * Kullanıcı başka sitede/uygulamada olsa bile browser notification görür.
     */
    const alertAlarm = useCallback((headline, source, priority = 'HIGH') => {
        if (!enabledRef.current) return

        // Her zaman ses çal
        playBeep(priority, true)

        // Her zaman tab flash (aktif sekmede bile görünür)
        flashTitle(headline.slice(0, 45), 12000)

        // Her zaman browser notification — başka sekmedeyse de gelir
        showBrowserNotif(headline, source, priority, true)
    }, [])

    return { alertNews, alertAlarm, requestPermission: requestNotifPermission }
}
