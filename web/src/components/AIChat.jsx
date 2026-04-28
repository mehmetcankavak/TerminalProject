import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const SUGGESTIONS = [
  'Bitcoin şu an için ne düşünüyorsun?',
  'Son haberleri özetle',
  'Piyasa genel durumu nasıl?',
  'En son Binance duyurularını analiz et',
]

function TypingDots() {
  return (
    <span className="ai-typing-dots">
      <span /><span /><span />
    </span>
  )
}

export default function AIChat() {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [modelName, setModelName] = useState('Llama 3.3 70B')
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Merhaba! Ben AI Piyasa Analistinizim. Son haberler ve canlı fiyat verileriyle sizi bilgilendireyim. Ne sormak istersiniz?',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, messages])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${data.error}`, error: true }])
      } else {
        if (data.model) setModelName(data.model)
        setMessages(prev => [...prev, { role: 'assistant', text: data.answer }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Bağlantı hatası.', error: true }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        className={`ai-chat-bubble ${open ? 'ai-chat-bubble-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="AI Piyasa Analisti"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="12" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/>
          </svg>
        )}
        {!open && <span className="ai-chat-badge">AI</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="ai-chat-panel">
          {/* Header */}
          <div className="ai-chat-header">
            <div className="ai-chat-header-info">
              <div className="ai-chat-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                </svg>
              </div>
              <div>
                <div className="ai-chat-title">AI Piyasa Analisti</div>
                <div className="ai-chat-subtitle">{modelName} · Son 20 haber + canlı fiyatlar</div>
              </div>
            </div>
            <button className="ai-chat-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Messages */}
          <div className="ai-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role} ${m.error ? 'ai-msg-error' : ''}`}>
                {m.role === 'assistant' && (
                  <div className="ai-msg-avatar">AI</div>
                )}
                <div className="ai-msg-bubble">
                  {(m.text || '').split('\n').map((line, li, arr) => (
                    <span key={li}>{line}{li < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg-assistant">
                <div className="ai-msg-avatar">AI</div>
                <div className="ai-msg-bubble"><TypingDots /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="ai-chat-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="ai-suggestion-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="ai-chat-input-row">
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              placeholder="Sorunuzu yazın... (Enter gönderin)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={loading}
            />
            <button
              className="ai-chat-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
