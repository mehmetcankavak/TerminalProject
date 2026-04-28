import { useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

let sharedCtx = null
function getCtx() {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return sharedCtx
}

function playDoubleBeep() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()

    const tone = (at, freq, gainV, dur = 0.22) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(gainV, at)
      gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + dur)
    }
    tone(ctx.currentTime, 960, 0.14)
    tone(ctx.currentTime + 0.3, 660, 0.12)
  } catch (err) { console.warn('[GlobalAlertSound] beep error', err) }
}

export default function GlobalAlertSound() {
  const lastPlayRef = useRef(0)

  const onMessage = useCallback((msg) => {
    if (msg?.type !== 'alert_triggered') return
    const now = Date.now()
    if (now - lastPlayRef.current < 1200) return
    lastPlayRef.current = now
    playDoubleBeep()
  }, [])

  useWebSocket(onMessage)
  return null
}

