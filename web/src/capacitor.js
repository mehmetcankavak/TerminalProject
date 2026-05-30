// Capacitor native bridge — sadece iOS app içinde yüklüdür, web'de no-op
// Kullanım: import { haptic, isNative, secureSet, secureGet, secureRemove } from './capacitor'

export const isNative = typeof window !== 'undefined' && !!(window?.Capacitor?.isNativePlatform?.())

// ── Secure key/value storage
// iOS: NSUserDefaults (native sandboxed) — web/dev: localStorage fallback
export async function secureSet(key, value) {
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key, value: JSON.stringify(value) })
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {}
}

export async function secureGet(key) {
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key })
      return value ? JSON.parse(value) : null
    } else {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : null
    }
  } catch { return null }
}

export async function secureRemove(key) {
  try {
    if (isNative) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  } catch {}
}

// Haptic feedback — emir gönderilince, alarm tetiklenince çağır
export async function haptic(style = 'medium') {
  if (!isNative) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
    await Haptics.impact({ style: map[style] ?? ImpactStyle.Medium })
  } catch {}
}

// Status bar rengini ayarla
export async function setStatusBarDark() {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#000000' })
  } catch {}
}

// Push notification izni iste + token'ı backend'e kaydet
// authToken: JWT (useAuth().token) — token kaydı için gerekli
export async function requestPushPermission(authToken) {
  if (!isNative) return null
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return result.receive

    await PushNotifications.register()

    // Registration event — iOS APNs token'ı burada gelir
    PushNotifications.addListener('registration', async ({ value: token }) => {
      if (!token || !authToken) return
      try {
        const { API_BASE } = await import('./config.js')
        await fetch(`${API_BASE}/api/push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      } catch {}
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] registration error', err)
    })

    return result.receive
  } catch { return null }
}

// Logout olunduğunda token'ı backend'den sil
export async function unregisterPushToken(authToken) {
  if (!isNative) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    // Mevcut token'ı al — re-register edip dinleyerek alabiliriz
    PushNotifications.addListener('registration', async ({ value: token }) => {
      if (!token || !authToken) return
      try {
        const { API_BASE } = await import('./config.js')
        await fetch(`${API_BASE}/api/push-token`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token }),
        })
      } catch {}
      await PushNotifications.removeAllListeners()
    })
    await PushNotifications.register()
  } catch {}
}

// ── Local notification izni iste (uygulama açılışında bir kez)
export async function requestNotificationPermission() {
  if (!isNative) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const status = await LocalNotifications.checkPermissions()
    if (status.display === 'granted') return true
    const req = await LocalNotifications.requestPermissions()
    return req.display === 'granted'
  } catch { return false }
}

let _notifId = 1
// ── Haber bildirimi gönder
export async function sendNewsNotification({ title, body, priority = 'LOW' }) {
  if (!isNative) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: _notifId++,
        title,
        body,
        sound: priority === 'HIGH' ? 'default' : undefined,
        smallIcon: 'ic_stat_icon_config_sample',
        channelId: priority === 'HIGH' ? 'news_high' : 'news_low',
        extra: { priority },
      }],
    })
  } catch {}
}
