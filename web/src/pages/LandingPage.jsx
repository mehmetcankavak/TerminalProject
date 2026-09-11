import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Shield, BarChart3, Database, Menu, X } from 'lucide-react'
import { createChart, LineSeries } from 'lightweight-charts'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import './LandingPage.css'

function MarketPreview() {
  const ref = useRef(null)
  useEffect(() => {
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: '#0c0e0d' }, textColor: '#a7aea3', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addSeries(LineSeries, { color: '#d5ff5f', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    const values = [3090,3110,3104,3136,3124,3150,3131,3158,3142,3147,3118,3128,3158,3150,3182,3169,3180,3172,3209,3195,3217,3208,3230,3214,3248]
    series.setData(values.map((value, i) => ({ time: 1704067200 + i * 86400, value })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [])
  return <div className="ct-trend" ref={ref} aria-hidden="true" />
}

export default function LandingPage() {
  const { user, token, plan } = useAuth()
  const { lang, toggleLang, t } = useLang()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [yearly, setYearly] = useState(true)
  const tr = lang === 'tr'
  const copy = (en, turkish) => tr ? turkish : en
  const open = () => {
    if (!user) { navigate('/register'); return }
    if (plan === 'pro') sessionStorage.setItem('tt_start_page', 'terminal')
    navigate('/app')
  }
  const upgrade = () => {
    if (!token) { navigate('/register?plan=pro'); return }
    sessionStorage.setItem('tt_start_page', 'upgrade')
    navigate('/app#upgrade')
  }
  const cta = user && plan !== 'pro' ? t('nav_go_dashboard') : copy('Open terminal', 'Terminali aç')
  const links = [
    ['#product', copy('Product', 'Ürün')],
    ['#news', copy('News', 'Haberler')],
    ['#risk', 'Risk'],
    ['#pricing', copy('Plans', 'Planlar')],
  ]
  return (
    <main className="ct-landing">
      <section className="ct-hero" id="product">
        <nav className="ct-nav ct-container" aria-label={copy('Main navigation', 'Ana menü')}>
          <Link className="ct-wordmark" to="/">CryptoTerminal</Link>
          <div className="ct-nav-links">{links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</div>
          <div className="ct-nav-actions">
            <button className="ct-language" onClick={toggleLang} aria-label={copy('Switch to Turkish', 'İngilizceye geç')}>{tr ? 'EN' : 'TR'}</button>
            {!user && <Link className="ct-login" to="/login">{copy('Log in', 'Giriş yap')}</Link>}
            <button className="ct-button ct-nav-cta" onClick={open}>{cta}</button>
            <button className="ct-menu-button" aria-label={copy('Toggle menu', 'Menüyü aç/kapat')} aria-expanded={menuOpen} aria-controls="ct-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </nav>
        {menuOpen && <div id="ct-mobile-nav" className="ct-mobile-nav">{links.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}{!user && <Link to="/login">{copy('Log in', 'Giriş yap')}</Link>}</div>}
        <div className="ct-hero-copy ct-container">
          <h1>CryptoTerminal</h1>
          <h2>{copy('The market moves. Make your move.', 'Piyasa hareketlenir. Sıra sende.')}</h2>
          <p>{copy('News, market context and trading. All in one place.', 'Haberler, piyasa analizi ve işlemler. Hepsi bir arada.')}</p>
          <button className="ct-button ct-hero-cta" onClick={open}>{copy('Explore the terminal', 'Terminali keşfet')}<ArrowRight size={18} /></button>
        </div>
        <figure className="ct-monitor">
          <img src="/images/landing-concept.png" alt={copy('CryptoTerminal product concept showing news, a Bitcoin chart, watchlist and paper order risk checks.', 'Haberler, Bitcoin grafiği, izleme listesi ve sanal emir risk kontrollerini gösteren CryptoTerminal ürün konsepti.')} fetchPriority="high" />
        </figure>
      </section>

      <section className="ct-news" id="news">
        <div className="ct-container">
          <header className="ct-section-heading">
            <h2>{copy('Every headline. A clearer picture.', 'Her haberde. Daha net bir bakış.')}</h2>
            <p>{copy('Follow the news and the assets it affects.', 'Haberleri ve etkiledikleri varlıkları takip et.')}</p>
          </header>
          <div className="ct-workflow">
            <article className="ct-story">
              <span className="ct-eyebrow">{copy('THE NEWS', 'HABER')}</span>
              <h3>{copy('Ethereum network upgrade announced', 'Ethereum ağ güncellemesi duyuruldu')}</h3>
              <p>{copy('A network update brings scalability and transaction costs into focus.', 'Ağ güncellemesi, ölçeklenebilirliği ve işlem maliyetlerini gündeme taşıyor.')}</p>
              <span className="ct-muted">{copy('Illustrative news', 'Örnek haber')} · Ethereum</span>
            </article>
            <article className="ct-context">
              <span className="ct-eyebrow">{copy('THE CONTEXT', 'BAĞLAM')}</span>
              <div className="ct-asset"><span className="ct-eth">Ξ</span><strong>ETH</strong><span>Ethereum</span></div>
              <div className="ct-quote">$3,248.91 <span>+2.36%</span></div>
              <MarketPreview />
              <span className="ct-muted">{copy('Illustrative market data', 'Örnek piyasa verileri')}</span>
            </article>
            <article>
              <span className="ct-eyebrow">{copy('YOUR NEXT MOVE', 'SIRADAKİ HAMLE')}</span>
              <div className="ct-order">
                <div className="ct-asset"><span className="ct-eth">Ξ</span><strong>ETH</strong><span>{copy('Paper buy', 'Sanal alış')}</span></div>
                <dl><div><dt>{copy('Amount', 'Miktar')}</dt><dd>1.00 ETH</dd></div><div><dt>{copy('Order type', 'Emir türü')}</dt><dd>Limit</dd></div><div><dt>{copy('Limit price', 'Limit fiyatı')}</dt><dd>$3,250.00</dd></div></dl>
                <ul className="ct-checks">{[copy('Position limit', 'Pozisyon limiti'), copy('Daily loss limit', 'Günlük kayıp limiti'), copy('Data freshness', 'Veri güncelliği')].map(label => <li key={label}><Check size={15} />{label} OK</li>)}</ul>
                <button className="ct-button ct-lime-button" onClick={open}>{copy('Explore paper trading', 'Sanal işlemleri keşfet')}<ArrowRight size={16}/></button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="ct-risk" id="risk">
        <div className="ct-container">
          <header className="ct-section-heading"><h2>{copy('Your trade. Your rules.', 'Senin işlemin. Senin kuralların.')}</h2><p>{copy('Set your limits before entering the market.', 'Piyasaya girmeden önce sınırlarını belirle.')}</p></header>
          <div className="ct-risk-grid">
            {[
              [Shield, copy('Position limit', 'Pozisyon limiti'), copy('Define your maximum exposure per asset.', 'Varlık başına maksimum pozisyonunu belirle.')],
              [BarChart3, copy('Daily loss limit', 'Günlük kayıp limiti'), copy('Decide where your trading day ends.', 'İşlem gününün hangi noktada biteceğine karar ver.')],
              [Database, copy('Data freshness', 'Veri güncelliği'), copy('Keep current market data in your decision.', 'Kararını güncel piyasa verileriyle şekillendir.')],
            ].map(([Icon, title, desc]) => <article key={title}><Icon size={28} strokeWidth={1.5}/><div><h3>{title}</h3><p>{desc}</p><a href="#pricing">{copy('Explore plans', 'Planları incele')}<ArrowRight size={15}/></a></div></article>)}
          </div>
        </div>
      </section>

      <section className="ct-details">
        <div className="ct-container">
          <details id="pricing">
            <summary>{copy('Find your plan', 'Sana uygun planı bul')}<span>+</span></summary>
            <div className="ct-plans-content">
              <div className="ct-billing" role="group" aria-label={copy('Billing period', 'Fatura dönemi')}><button aria-pressed={!yearly} onClick={() => setYearly(false)}>{t('billing_monthly')}</button><button aria-pressed={yearly} onClick={() => setYearly(true)}>{t('billing_yearly')}</button><span>{t('billing_save')}</span></div>
              <div className="ct-plans">
                {[false, true].map(pro => <article key={String(pro)}><h3>{pro ? 'PRO' : t('free_tier')}</h3><p className="ct-price">{pro ? yearly ? '$39' : '$49' : '$0'}<small> / {pro ? copy('mo', 'ay') : t('free_period')}</small></p>{pro && yearly && <p>{t('billed_yearly')}</p>}<p>{t(pro ? 'pro_desc' : 'free_desc')}</p><ul>{Array.from({length: pro ? 11 : 6}, (_, i) => <li key={i}><Check size={16}/>{t(`${pro ? 'pro' : 'free'}_feat_${i}`)}</li>)}</ul><button className="ct-button" onClick={pro && plan !== 'pro' ? upgrade : open}>{pro ? plan === 'pro' ? t('current_plan') : t('upgrade_cta') : user ? t('open_dashboard') : t('btn_start_free')}</button></article>)}
              </div>
            </div>
          </details>
          <details id="faq"><summary>{t('faq_title')}<span>+</span></summary><div className="ct-faq">{[1,2,3,4,5,6].map(n => <details key={n}><summary>{t(`faq_q${n}`)}<span>+</span></summary><p>{t(`faq_a${n}`)}</p></details>)}</div></details>
        </div>
      </section>
      <section className="ct-closing"><div className="ct-container"><h2>{copy('Stay informed. Stay in control.', 'Haberdar ol. Kontrol sende kalsın.')}</h2><button className="ct-button" onClick={open}>{cta}<ArrowRight size={18}/></button></div></section>
      <footer className="ct-footer ct-container"><Link to="/" className="ct-wordmark">CryptoTerminal</Link><div><a href="#product">{copy('Product', 'Ürün')}</a><a href="#pricing">{copy('Plans', 'Planlar')}</a><a href="#faq">FAQ</a><Link to="/privacy">{copy('Privacy', 'Gizlilik')}</Link><Link to="/terms">{copy('Terms', 'Koşullar')}</Link></div></footer>
    </main>
  )
}
