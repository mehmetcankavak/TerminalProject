import { useCallback, useEffect, useState } from 'react'

const KEY = 'tt_theme'
const VALID = new Set(['dark', 'light'])

function readTheme() {
  try {
    const v = localStorage.getItem(KEY)
    if (v && VALID.has(v)) return v
  } catch {}
  return 'dark'
}

function applyTheme(theme) {
  try {
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  } catch {}
}

// Bootstrap'te sayfa açılırken renk flickering olmasın diye sync uygula.
if (typeof document !== 'undefined') {
  applyTheme(readTheme())
}

export function useTheme() {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setThemeState(readTheme()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next) => {
    const v = VALID.has(next) ? next : 'dark'
    setThemeState(v)
    try { localStorage.setItem(KEY, v) } catch {}
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggle, isLight: theme === 'light' }
}
