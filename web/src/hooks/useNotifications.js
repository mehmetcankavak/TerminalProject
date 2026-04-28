import { useState, useEffect, useRef, useCallback } from 'react'

export function useNotifications() {
    const [notifEnabled, setNotifEnabled] = useState(false)
    const notifEnabledRef = useRef(false)
    const swRegRef = useRef(null)

    useEffect(() => { notifEnabledRef.current = notifEnabled }, [notifEnabled])

    // Service Worker kaydı
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => { swRegRef.current = reg })
                .catch(() => {})
        }
    }, [])

    // Açılışta izin zaten verilmişse otomatik aç
    useEffect(() => {
        if (Notification.permission === 'granted') setNotifEnabled(true)
    }, [])

    const sendNotif = useCallback((title, body) => {
        if (Notification.permission !== 'granted') return
        const opts = { body, icon: '/favicon.svg', badge: '/favicon.svg', silent: false }
        if (swRegRef.current) {
            swRegRef.current.showNotification(title, opts)
        } else {
            new Notification(title, opts)
        }
    }, [])

    const toggleNotif = useCallback(async () => {
        if (notifEnabled) { setNotifEnabled(false); return }
        if (Notification.permission === 'granted') { setNotifEnabled(true); return }
        const perm = await Notification.requestPermission()
        if (perm === 'granted') setNotifEnabled(true)
    }, [notifEnabled])

    return { notifEnabled, notifEnabledRef, sendNotif, toggleNotif }
}
