
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'
const TOKEN_KEY = 'nt_token'
const REFRESH_KEY = 'nt_refresh'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [plan, setPlan] = useState('free')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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

  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (storedToken) {
        const userData = await fetchMe(storedToken)
        if (userData) {
          setUser(userData)
          setPlan(userData.plan || 'free')
          setIsAdmin(userData.is_admin || false)
          setToken(storedToken)
        } else {
          // Try refresh
          const refreshToken = localStorage.getItem(REFRESH_KEY)
          if (refreshToken) {
            try {
              const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
              })
              if (res.ok) {
                const tokens = await res.json()
                localStorage.setItem(TOKEN_KEY, tokens.access_token)
                localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
                setToken(tokens.access_token)
                const userData2 = await fetchMe(tokens.access_token)
                if (userData2) {
                  setUser(userData2)
                  setPlan(userData2.plan || 'free')
                  setIsAdmin(userData2.is_admin || false)
                }
              } else {
                localStorage.removeItem(TOKEN_KEY)
                localStorage.removeItem(REFRESH_KEY)
              }
            } catch {
              localStorage.removeItem(TOKEN_KEY)
              localStorage.removeItem(REFRESH_KEY)
            }
          } else {
            localStorage.removeItem(TOKEN_KEY)
          }
        }
      }
      setIsLoading(false)
    }
    init()
  }, [fetchMe])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Login failed')

    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe])

  const register = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Registration failed')

    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe])

  const googleLogin = useCallback(async (idToken) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: idToken }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Google login failed')

    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem(REFRESH_KEY, data.refresh_token)
    setToken(data.access_token)

    const userData = await fetchMe(data.access_token)
    if (userData) {
      setUser(userData)
      setPlan(userData.plan || 'free')
      setIsAdmin(userData.is_admin || false)
    }
    return data
  }, [fetchMe])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
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
