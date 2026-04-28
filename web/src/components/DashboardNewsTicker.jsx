import { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'

export default function DashboardNewsTicker() {
    const [news, setNews] = useState([])

    useEffect(() => {
        fetch(`${API_BASE}/api/status`)
            .then(r => r.json())
            .then(data => {
                if (data.news) setNews(data.news)
            })
            .catch(() => {})
    }, [])

    useWebSocket((msg) => {
        if (msg.type === 'news') {
            setNews(prev => {
                if (prev.find(n => n.id === msg.id)) return prev
                return [msg, ...prev.slice(0, 49)]
            })
        }
    }, [], {})

    if (!news || news.length === 0) return null

    // Bütün haberleri (veya son 50) göster
    const displayNews = news.slice(0, 50)
    
    // Haber sayısına göre dinamik bir hız belirliyoruz, 
    // Biraz daha yavaşlatılması istendiği için çarpanı 7.5'ten 10.5'e çıkarıyoruz
    const animDuration = Math.max(displayNews.length * 10.5, 10) 

    return (
        <div className="db-news-ticker-wrap">
            <div 
                className="db-news-ticker-inner" 
                style={{ animationDuration: `${animDuration}s` }}
            >
                {/* İki kez render ediyoruz ki sonsuz döngü (marquee) pürüzsüz olsun */}
                {displayNews.map((n, i) => (
                    <div key={`n1-${n.id || i}`} className="db-news-ticker-item">
                        <span className="db-news-pulse"></span>
                        <span className="db-news-source">{n.source?.split('.')[0] || 'NEWS'}</span>
                        <span className="db-news-headline">{n.headline}</span>
                        <span className="db-news-dot">•</span>
                    </div>
                ))}
                {displayNews.map((n, i) => (
                    <div key={`n2-${n.id || i}`} className="db-news-ticker-item">
                        <span className="db-news-pulse"></span>
                        <span className="db-news-source">{n.source?.split('.')[0] || 'NEWS'}</span>
                        <span className="db-news-headline">{n.headline}</span>
                        <span className="db-news-dot">•</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
