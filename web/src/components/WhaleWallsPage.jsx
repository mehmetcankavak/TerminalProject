import { useState } from 'react'
import WhaleWalls from './WhaleWalls'

const COINS = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','ADAUSDT','NEARUSDT','ARBUSDT','OPUSDT','INJUSDT']

export default function WhaleWallsPage() {
  const [sym, setSym] = useState(() => localStorage.getItem('ww_sym') || 'BTCUSDT')
  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {COINS.map(c => (
          <button key={c}
            onClick={() => { setSym(c); localStorage.setItem('ww_sym', c) }}
            style={{
              background: sym === c ? 'rgba(168,85,247,0.15)' : '#0a0a0a',
              border: `1px solid ${sym === c ? 'rgba(168,85,247,0.5)' : '#1a1a1a'}`,
              color: sym === c ? '#c084fc' : 'var(--text-2)',
              borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: sym === c ? 700 : 400,
              cursor: 'pointer', letterSpacing: '.04em',
            }}
          >{c.replace('USDT', '')}</button>
        ))}
      </div>
      <WhaleWalls symbol={sym} />
    </div>
  )
}
