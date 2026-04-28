import { useEffect, useRef } from 'react'

export default function EconomicCalendar() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      colorTheme:       'dark',
      isTransparent:    true,
      width:            '100%',
      height:           '100%',
      locale:           'tr',
      importanceFilter: '-1,0,1',
      countryFilter:    'us,eu,gb,jp,cn,ca,au,ch,de,fr',
    })
    containerRef.current.appendChild(script)
  }, [])

  return (
    <div className="ecal-page">
      <div className="ecal-info">
        <span className="ecal-badge">● CANLI</span>
        <span className="ecal-note">TradingView · Makroekonomik takvim · ABD, AB, GB, JP, CN</span>
      </div>
      <div className="ecal-widget-wrap">
        <div className="tradingview-widget-container" ref={containerRef} style={{ height: '100%', width: '100%' }}>
          <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
        </div>
      </div>
    </div>
  )
}
