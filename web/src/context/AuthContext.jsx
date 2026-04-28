import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../config'
const REFRESH_KEY = 'nt_refresh'

const AuthContext = createContext(null)

// Access token artık sadece memory'de — XSS ile localStorage'dan çalınamaz
// Sayfa yenilendiğinde refresh token ile yeni access token alınır

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) return null
  const tokens = await res.json()
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  return tokens.access_token
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)  // memory-only, localStorage'da saklanmaz
  const [plan, setPlan] = useState('free')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const refreshTimerRef = useRef(null)

  const fetchMe = useCallback(async (accessToken) => {
    if (!accessToken) return null
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return null
      const data = await res.json()
      return data
    } catch {
      return null
    }
  }, [])

  // Access token'ı expire'dan önce otomatik yenile (her 12 dakikada — 15dk expire varsayımı)
  const scheduleRefresh = useCallback((accessToken) => {
    clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(async () => {
      const rt = localStorage.getItem(REFRESH_KEY)
      if (!rt) return
      try {
        const newToken = await refreshAccessToken(rt)
        if (newToken) {
          setToken(newToken)
          scheduleRefresh(newToken)
        } else {
          // Refresh başarısız — oturumu kapat
          localStorage.removeItem(REFRESH_KEY)
          setToken(null)
          setUser(null)
          setPlan('free')
          setIsAdmin(false)
          window.dispatchEvent(new CustomEvent('tt-session-expired'))
        }
      } catch {
        // Network hatası — bir sonraki cycle'da tekrar dener
      }
    }, 12 * 60 * 1000)
  }, [])

  // Sayfa yüklendiğinde: refresh token ile access token al
  useEffect(() => {
    const init = async () => {
      // Eski localStorage access token'ı temizle (migration)
      localStorage.removeItem('nt_token')

      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (refreshToken) {
        try {
          const accessToken = await refreshAccessToken(refreshToken)
          if (accessToken) {
            setToken(accessToken)
            const userData = await fetchMe(accessToken)
            if (userData) {
              setUser(userData)
              setPlan(userData.plan || 'free')
              setIsAdmin(userData.is_admin || false)
            }
            scheduleRefresh(accessToken)
          } else {
            localStorage.removeItem(REFRESH_KEY)
          }
        } catch {
          localStorage.removeItem(REFRESH_KEY)
        }
      }
      setIsLoading(false)
    }
    init()
    return () => clearTimeout(refreshTimerRef.current)
  }, [fetchMe, scheduleRefresh])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Login failed')

    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)
    scheduleRefresh(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe, scheduleRefresh])

  const register = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Registration failed')

    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)
    scheduleRefresh(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe, scheduleRefresh])

  const googleLogin = useCallback(async (credential) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Google login failed')

    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)
    scheduleRefresh(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe, scheduleRefresh])

  const logout = useCallback(() => {
    clearTimeout(refreshTimerRef.current)
    localStorage.removeItem(REFRESH_KEY)
    setToken(null)
    setUser(null)
    setPlan('free')
    setIsAdmin(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, plan, isAdmin, isLoading, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
