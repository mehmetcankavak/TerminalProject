import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react'

// Data comes from the TradingView events widget. The toolbar drives the widget's own
// filters (country / importance) and reloads it; date range is the widget's week view.
const COUNTRIES = [['us', 'US'], ['eu', 'EU'], ['gb', 'GB'], ['jp', 'JP'], ['cn', 'CN']]
const IMPORTANCE = [['-1,0,1', 'All Importance'], ['0,1', 'Medium & High'], ['1', 'High only']]

export default function EconomicCalendar() {
  const containerRef = useRef(null)
  const [countries, setCountries] = useState(['us', 'eu', 'gb', 'jp', 'cn'])
  const [importance, setImportance] = useState('-1,0,1')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''
    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget'
    widget.style.height = '100%'
    containerRef.current.appendChild(widget)
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      colorTheme: 'light', isTransparent: true, width: '100%', height: '100%', locale: 'en',
      importanceFilter: importance, countryFilter: countries.join(','),
    })
    containerRef.current.appendChild(script)
  }, [countries, importance])

  const toggleCountry = c => setCountries(prev => prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c])

  return (
    <div className="ws-page ws-page-flush ec-page">
      <div className="ec-topbar">
        <div className="ws-search" style={{ width: 400 }}><Search size={15} /><input className="ws-input" placeholder="Search markets, symbols, or events..." value={query} onChange={e => setQuery(e.target.value)} /></div>
      </div>
      <div className="ec-body">
        <div className="ws-page-head">
          <div className="ws-page-head-left">
            <h1 className="ws-title">Economic Calendar</h1>
            <p className="ws-subtitle" style={{ fontSize: 15 }}>Source: TradingView</p>
          </div>
        </div>
        <div className="ec-toolbar">
          <button className="ws-btn ws-btn-icon ws-btn-lg" title="Previous week" disabled><ChevronLeft size={16} /></button>
          <button className="ws-btn ws-btn-lg">Today</button>
          <button className="ws-btn ws-btn-lg ws-btn-primary">This Week</button>
          <button className="ws-btn ws-btn-icon ws-btn-lg" title="Next week" disabled><ChevronRight size={16} /></button>
          <div className="ws-pills" style={{ marginLeft: 8 }}>
            {COUNTRIES.map(([c, l]) => <button key={c} className={`ws-pill ${countries.includes(c) ? 'active' : ''}`} style={{ height: 44, padding: '0 18px' }} onClick={() => toggleCountry(c)}>{l}</button>)}
          </div>
          <div className="ws-vdivider" style={{ height: 30 }} />
          <div className="ws-inline-select" style={{ minWidth: 180, height: 44 }}>{IMPORTANCE.find(i => i[0] === importance)[1]}<ChevronDown size={15} />
            <select value={importance} onChange={e => setImportance(e.target.value)}>{IMPORTANCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
        </div>
        <div className="ec-widget">
          <div className="tradingview-widget-container" ref={containerRef} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
    </div>
  )
}
