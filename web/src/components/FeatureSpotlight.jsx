import { useState } from 'react'

function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

export default function FeatureSpotlight({ featureKey, title, description }) {
  const storageKey = `tt_spot_${featureKey}`
  const [visible, setVisible] = useState(() => localStorage.getItem(storageKey) !== '1')

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  return (
    <div className="feat-spotlight">
      <span className="feat-spot-icon"><IconInfo /></span>
      <div className="feat-spot-body">
        <span className="feat-spot-title">{title}</span>
        <span className="feat-spot-desc">{description}</span>
      </div>
      <button className="feat-spot-dismiss" onClick={dismiss}>Tamam</button>
    </div>
  )
}
