const LogoTT = ({ width = 48, height = 48, className = "" }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0px 0px 8px rgba(0, 217, 146, 0.4))" }}
    >
      <defs>
        <linearGradient id="neonGreen" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00d992" />
          <stop offset="100%" stopColor="#00f0a3" />
        </linearGradient>
        <linearGradient id="dataStream" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#00d992" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00d992" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="40" fill="rgba(0, 217, 146, 0.04)" />

      <g transform="translate(8, 18)">
        {/* ── FIRST 'T' — Left side ── */}

        {/* Horizontal bar */}
        <path d="M 2 4 L 36 4" stroke="url(#neonGreen)" strokeWidth="3" strokeLinecap="round" />
        <path d="M 6 10 L 32 10" stroke="url(#dataStream)" strokeWidth="1" strokeLinecap="round" />

        {/* Candlesticks on horizontal */}
        <line x1="10" y1="-2" x2="10" y2="8" stroke="url(#neonGreen)" strokeWidth="1" strokeLinecap="round" />
        <rect x="8" y="0" width="4" height="6" fill="url(#neonGreen)" rx="0.5" />

        <line x1="20" y1="-5" x2="20" y2="5" stroke="url(#neonGreen)" strokeWidth="1" strokeLinecap="round" />
        <rect x="18" y="-3" width="4" height="6" fill="#000" stroke="url(#neonGreen)" strokeWidth="1" rx="0.5" />

        <line x1="30" y1="-3" x2="30" y2="7" stroke="url(#neonGreen)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="28" y="-1" width="4" height="8" fill="url(#neonGreen)" rx="0.5" />

        {/* Vertical stem */}
        <line x1="19" y1="12" x2="19" y2="62" stroke="url(#neonGreen)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="16" y="18" width="6" height="28" fill="url(#neonGreen)" rx="1" />
        <rect x="16" y="50" width="6" height="8" fill="#000" stroke="url(#neonGreen)" strokeWidth="1" rx="1" />

        {/* ── SECOND 'T' — Right side ── */}

        {/* Horizontal bar with curve from first T */}
        <path d="M 36 12 Q 46 2 54 2 L 82 2" stroke="url(#neonGreen)" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M 40 18 Q 50 8 58 8 L 80 8" stroke="url(#dataStream)" strokeWidth="1" strokeLinecap="round" fill="none" />

        {/* Candlesticks */}
        <line x1="60" y1="-2" x2="60" y2="8" stroke="url(#neonGreen)" strokeWidth="1" strokeLinecap="round" />
        <rect x="58" y="0" width="4" height="6" fill="url(#neonGreen)" rx="0.5" />

        <line x1="70" y1="-5" x2="70" y2="5" stroke="url(#neonGreen)" strokeWidth="1" strokeLinecap="round" />
        <rect x="68" y="-3" width="4" height="6" fill="#000" stroke="url(#neonGreen)" strokeWidth="1" rx="0.5" />

        <line x1="80" y1="-8" x2="80" y2="2" stroke="url(#neonGreen)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="78" y="-6" width="4" height="8" fill="url(#neonGreen)" rx="0.5" />

        {/* Vertical stem */}
        <line x1="62" y1="12" x2="62" y2="62" stroke="url(#neonGreen)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="59" y="16" width="6" height="30" fill="url(#neonGreen)" rx="1" />
        <rect x="59" y="50" width="6" height="8" fill="#000" stroke="url(#neonGreen)" strokeWidth="1" rx="1" />

        {/* ── Digital noise particles ── */}
        <circle cx="5" cy="8" r="0.8" fill="url(#neonGreen)" />
        <circle cx="42" cy="20" r="1" fill="#fff" opacity="0.6" />
        <circle cx="74" cy="16" r="0.8" fill="url(#neonGreen)" />
        <circle cx="84" cy="-2" r="0.5" fill="url(#neonGreen)" />
      </g>
    </svg>
  )
}

export default LogoTT
