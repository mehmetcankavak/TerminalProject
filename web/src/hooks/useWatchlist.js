import { useCallback, useEffect, useState } from 'react'

const KEYS = {
  crypto: 'tt_watchlist',
  stocks: 'tt_watchlist_stocks',
}

const DEFAULTS = {
  crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'],
  stocks: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL', 'AMZN'],
}

const EVENT = (ns) => `tt_watchlist_change_${ns}`

function read(ns) {
  const key = KEYS[ns]
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null')
    if (Array.isArray(raw) && raw.length) return raw.map(s => String(s).toUpperCase())
  } catch {}
  return DEFAULTS[ns].slice()
}

function write(ns, list) {
  const key = KEYS[ns]
  try { localStorage.setItem(key, JSON.stringify(list)) } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT(ns), { detail: list })) } catch {}
}

export function useWatchlist(namespace = 'crypto') {
  const ns = KEYS[namespace] ? namespace : 'crypto'
  const [list, setList] = useState(() => read(ns))

  useEffect(() => {
    setList(read(ns))
    const onStorage = (e) => { if (e.key === KEYS[ns]) setList(read(ns)) }
    const onLocal   = (e) => { setList(Array.isArray(e.detail) ? e.detail.slice() : read(ns)) }
    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT(ns), onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT(ns), onLocal)
    }
  }, [ns])

  const has = useCallback((sym) => list.includes(String(sym).toUpperCase()), [list])

  const add = useCallback((sym) => {
    const s = String(sym).toUpperCase().trim()
    if (!s) return
    setList(prev => {
      if (prev.includes(s)) return prev
      const next = [...prev, s]
      write(ns, next)
      return next
    })
  }, [ns])

  const remove = useCallback((sym) => {
    const s = String(sym).toUpperCase()
    setList(prev => {
      if (!prev.includes(s)) return prev
      const next = prev.filter(x => x !== s)
      write(ns, next)
      return next
    })
  }, [ns])

  const toggle = useCallback((sym) => {
    const s = String(sym).toUpperCase().trim()
    if (!s) return
    setList(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
      write(ns, next)
      return next
    })
  }, [ns])

  const reorder = useCallback((nextList) => {
    if (!Array.isArray(nextList)) return
    const next = nextList.map(s => String(s).toUpperCase())
    setList(next)
    write(ns, next)
  }, [ns])

  return { list, has, add, remove, toggle, reorder }
}

export const WATCHLIST_DEFAULT = DEFAULTS.crypto
export const WATCHLIST_DEFAULTS = DEFAULTS
