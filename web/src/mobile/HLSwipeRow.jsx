import { useRef, useState } from 'react'
import { haptic } from '../capacitor'

const REVEAL = 84

export default function HLSwipeRow({ enabled = true, onAction, children }) {
  const [dx, setDx] = useState(0)
  const startX = useRef(0)
  const lastX = useRef(0)
  const dragging = useRef(false)
  const opened = useRef(false)
  const hapticFired = useRef(false)

  const onTouchStart = (e) => {
    if (!enabled) return
    startX.current = e.touches[0].clientX
    lastX.current = opened.current ? -REVEAL : 0
    dragging.current = true
    hapticFired.current = false
  }

  const onTouchMove = (e) => {
    if (!dragging.current) return
    const delta = e.touches[0].clientX - startX.current
    let next = lastX.current + delta
    if (next > 0) next = 0
    if (next < -REVEAL - 30) next = -REVEAL - 30
    if (!hapticFired.current && next < -REVEAL * 0.5) {
      hapticFired.current = true
      haptic('light')
    }
    setDx(next)
  }

  const onTouchEnd = () => {
    if (!dragging.current) return
    dragging.current = false
    if (dx < -REVEAL * 0.4) {
      setDx(-REVEAL)
      opened.current = true
    } else {
      setDx(0)
      opened.current = false
    }
  }

  const close = () => {
    setDx(0)
    opened.current = false
  }

  const tapAction = (e) => {
    e.stopPropagation()
    haptic('medium')
    onAction?.()
    close()
  }

  if (!enabled) return children

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Reveal button (right side) */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: REVEAL,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          borderLeft: '1px solid #1a1a1a',
        }}
        onClick={tapAction}
      >
        <img
          src="/logos/hyperliquid.png"
          alt="Hyperliquid"
          style={{ width: 36, height: 36, borderRadius: 8 }}
        />
      </div>

      {/* Foreground (slides left) */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? 'none' : 'transform 0.22s ease',
          background: 'var(--bg-1, #000)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}
