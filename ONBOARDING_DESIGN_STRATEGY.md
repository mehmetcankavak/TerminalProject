# Onboarding Design Strategy
## Trading Terminal — Mobile App

> Senior Product Design / UX Strategy Brief  
> Scope: Mobile-first (iOS Capacitor), dark theme, power-user audience  
> Status: Strategy only — implementation spec, not code

---

## 1. Strategy Overview

### North Star
The onboarding must answer one question in under 60 seconds: **"Is this app worth my attention?"** — not explain every feature, not teach trading, not upsell.

The target user is already a trader. They have Binance, Hyperliquid, or TradingView open. They are evaluating whether to replace or augment their existing stack. Treat them accordingly: no tutorial tone, no "what is a liquidation?" explainers, no encouraging emoji. Signal-dense, fast, confident.

### Core Tension to Resolve
Most onboarding flows assume ignorance. This one must assume competence. The risk isn't confusion — it's **dismissal**. A power user who sees generic feature cards ("Stay on top of the market!") will close the app in 8 seconds.

### Strategic Principles

**1. Proof over promise.** Show real UI snapshots or live data previews — not marketing copy. If the liquidation stream is live, surface it.

**2. One decision per screen.** Each screen asks for exactly one thing: orientation, mode selection, exchange connection, or notification consent. No decision fatigue.

**3. Earn each swipe.** Every screen must justify its existence with new value — no "Next →" padding screens, no repeat of prior info.

**4. Exit at any point, no friction.** "Skip" is always visible. Power users will skip and explore manually. That's fine — let them. The onboarding is not the only acquisition path.

**5. Terminal aesthetic throughout.** The onboarding should feel like it belongs to the same design system as the dashboard: dark, dense, structured — not "softer" to ease users in.

### Recommended Flow Length
**5 screens** — long enough to establish context and capture configuration intent, short enough that a focused user clears it in under 45 seconds.

Optional extended variant: 6–7 screens for users who engage (tap feature cards, explore mode).

---

## 2. Full Onboarding Flow — Screen by Screen

---

### Screen 1 — Identity Establishment

**Purpose:** Immediately signal what kind of app this is and who it's for. Eliminate the wrong-fit users, confirm the right-fit ones.

**Headline:**
```
Professional Trading Intelligence.
On your phone.
```

**Subheadline:**
```
Smart Money signals, whale flows, liquidation data, funding rates — unified in one terminal.
```

**Key Visual Concept:**
A dark split-panel: left side shows a condensed, real-looking dashboard preview (miniature version of the Crypto Markets tab — coin list with % changes, a liquidation ticker scrolling, green/red PnL numbers). Right side or overlay: the app wordmark/logo in neon green on black. The visual language says "this is a real tool, not a concept."

Avoid: hero illustrations, abstract gradient blobs, floating phone mockups with fake data.

**UI Layout:**
- Full-screen dark background (`#0b0c10`)
- Logo top-left (small, not hero-sized)
- Split content area: live-ish preview left, copy right (or stacked on small screens: preview top third, copy below)
- Progress bar at bottom: 5 dots, first active
- Primary CTA bottom: full-width button
- Skip link: top-right, `14px`, `#6b7280` — always visible

**Microcopy:**
- CTA: **"Get Started"**
- Skip: "Skip intro"
- Legal footnote (optional, 10px, #4b5563): "No card required. Features unlock after account creation."

**Primary CTA:** Get Started  
**Secondary CTA:** Skip intro (top right, persistent across all screens)

**Why this screen exists:** First impression sets the user's mental model. If this screen feels like every other fintech app, the user will engage with it like every other fintech app — superficially. It must immediately communicate premium, terminal-grade, professional.

---

### Screen 2 — Signal Stack Preview

**Purpose:** Show the breadth and depth of the intelligence layer without listing features. Make the user feel "I need all of this."

**Headline:**
```
Every signal. One place.
```

**Subheadline:**
```
From on-chain whale flows to exchange liquidations — structured, live, actionable.
```

**Key Visual Concept:**
A scrollable (or animated carousel) of real-looking data module previews — 4 compact cards, each representing a signal category:

1. **Whale Transfers** — `$12.4M USDT → Binance · 3 min ago` (on-chain flow card)
2. **Liquidation Stream** — `BTC Long $4.2M · Binance · 14:32:07` (live feed row)
3. **Funding Rates** — small sparkline-style rate grid across BTC/ETH/SOL with color coding
4. **Smart Money** — `Top Trader #3 · +$847K PnL 24H · Net Long BTC` (leaderboard row)

Cards appear with a subtle stagger-in animation (100ms offset each). They look like miniature versions of the actual app UI, not marketing cards.

**UI Layout:**
- Headline + subheadline: top 30% of screen
- 4 data preview cards stacked with `8px` gap, slightly inset (`16px` horizontal padding)
- Each card: `#14161b` background, `1px solid #1e2028` border, `10px border-radius`, left accent bar in signal category color
- Progress indicator: 2nd dot active
- CTA anchored to bottom

**Microcopy:**
- Signal category labels (above each card, uppercase, 10px, `#6b7280`): `ON-CHAIN FLOW`, `LIQUIDATION FEED`, `FUNDING MONITOR`, `SMART MONEY`
- CTA: **"See the full picture →"**

**Animation note:** Cards stagger in from opacity: 0 with a 12px upward translate. Total entrance: ~400ms. Feels alive, not decorative.

**Primary CTA:** See the full picture →  
**Secondary:** Skip (persistent)

**Why this screen exists:** Feature lists are ignored. Data previews create desire. Showing a `$12.4M USDT → Binance` row triggers more engagement than writing "Monitor large transfers."

---

### Screen 3 — Tab Structure Orientation

**Purpose:** Give the user a mental map of the app's structure so they can navigate independently the moment onboarding ends.

**Headline:**
```
Five surfaces. Zero fluff.
```

**Subheadline:**
```
Everything is one tab away. Here's where to find it.
```

**Key Visual Concept:**
A stylized bottom tab bar — rendered large, center-screen — with the 5 tabs labeled and annotated. Each tab has a brief one-line description below its icon. When a user taps a tab, it highlights in neon green and a subtle expansion shows 2–3 sub-features inside.

This is interactive: tapping a tab gives the user the feeling of agency before they're in the real app.

**Tab Annotations:**

| Tab | Icon | One-liner |
|-----|------|-----------|
| **Stocks** | TrendingUp | Global equities, ETF flows, earnings |
| **Crypto** | Bitcoin | Markets, liquidations, funding, sentiment |
| **Terminal** | `>_` | Order entry, Smart Money, Whale Alerts |
| **Wallet** | Wallet | Connect exchange, track portfolio, PnL |
| **More** | Grid | Alerts, Market Compass, On-chain data |

**UI Layout:**
- Header copy: top 25%
- Large tab bar visual: vertically centered, 64px tall, `#0d0e12` bg, active = `#00d992` icon + label
- Expandable annotation cards: appear below tapped tab (120ms ease), show 2 feature names in small type
- CTA at bottom

**Microcopy:**
- Expand state label: "Inside this tab:" (10px, `#6b7280`)
- CTA: **"Got it, continue →"**

**Animation note:** Tab tap → icon scales to 1.1x → label turns green → annotation card fades in below. Smooth, 150ms easing.

**Primary CTA:** Got it, continue →  
**Secondary:** Skip

**Why this screen exists:** Power users hate getting lost on first open. Giving them a structural map in 15 seconds means they explore confidently instead of rage-tapping. Reduces day-1 drop-off from navigation confusion.

---

### Screen 4 — Exchange Connection / Mode Selection

**Purpose:** Capture intent: will this user connect an exchange now, or explore first? This single decision shapes their first-session experience.

**Headline:**
```
Connect your exchange.
Or don't — yet.
```

**Subheadline:**
```
Live portfolio, PnL tracking, and order execution require an API key. Everything else works immediately.
```

**Key Visual Concept:**
Two cards, side by side (or stacked on small screens). Not a toggle — two distinct visual states that communicate different things.

**Card A — Connect Exchange:**
- Border: `1px solid #00d992` (neon green, selected state)
- Header: `LIVE TRADING` label, small green dot ("active")
- Icons: Hyperliquid + Binance logos (small, greyscale unless selected)
- Body: "Real-time positions, orders, and PnL tracking."
- Note: "Read-only key is sufficient for portfolio view."

**Card B — Explore First:**
- Border: `1px solid #1e2028` (dim, not selected by default)
- Header: `MARKET INTELLIGENCE` label
- Body: "Full access to signals, flows, and analytics. Exchange features locked."
- Note: "Add exchange anytime from Settings."

Default selection: **Card B** (Explore First). This is intentional — forcing connection upfront is a conversion killer. Users who want to connect will select Card A.

If Card A selected → secondary exchange selection appears (Hyperliquid / Binance / OKX selector, icon-based).

**UI Layout:**
- Copy: top 30%
- 2 cards: middle 45%, `16px gap`, `12px border-radius`
- Security note (if Card A selected): inline beneath cards, lock icon, 11px text: "API keys are encrypted at rest. Read-only permission recommended."
- Risk disclosure (if live trading): subtle warning strip below, amber tone, one sentence
- CTA at bottom

**Microcopy:**
- CTA (Card B selected): **"Start Exploring →"**
- CTA (Card A selected): **"Connect Exchange →"**
- Card A footer: "You can switch anytime."
- Exchange selector label: "Select your exchange:"
- Security note: "🔒 Keys stored encrypted. We never request withdrawal permissions."

**Animation note:** Card selection → selected card border transitions to green (200ms) → deselected dims → if Card A, exchange selector slides down (height animation, 250ms ease-out).

**Primary CTA:** Context-dependent (see microcopy above)  
**Secondary:** "Skip for now" (text link, not button — beneath primary CTA)

**Why this screen exists:** This is the highest-leverage decision in onboarding. Getting it right (non-coercive, clear about what each path enables) directly impacts week-1 retention. Users who connect feel invested; users who don't connect but get immediate value from signal features convert later.

---

### Screen 5 — Activation / Launch

**Purpose:** Send the user into the app with clear direction, a sense of momentum, and one explicit first action.

**Headline (exchange connected path):**
```
You're in.
Your exchange is connected.
```

**Headline (explore path):**
```
You're in.
Start with the signals.
```

**Subheadline (exchange connected):**
```
Portfolio sync takes ~30 seconds. Head to Wallet to see your positions.
```

**Subheadline (explore path):**
```
Liquidation stream, whale flows, and funding rates are live. No setup needed.
```

**Key Visual Concept:**
Minimal. This is not a feature recap. Full-screen dark with a single large animated element: the logo mark (TT monogram or wordmark) briefly glows neon green, then the CTA button appears. The feeling is: system ready, launch.

Optional addition: a subtle animated "data flowing" visual — extremely subtle scrolling rows of data (market ticker style) as a background texture at 5% opacity. This communicates "live" without being distracting.

**UI Layout:**
- Centered vertical stack: logo → headline → subheadline → 1 primary CTA → 1 secondary link
- No progress dots (journey complete)
- Logo: 48px, centered, brief glow animation (box-shadow pulse, `#00d992`, 600ms)
- Headline: 24px, bold, white
- Subheadline: 14px, `#9ca3af`
- CTA: full-width, 48px height, green fill

**Microcopy:**
- CTA (exchange connected): **"View My Portfolio"**
- CTA (explore path): **"Open Crypto Feed"**
- Secondary link: "Go to home screen" (takes to Markets tab, the default)
- Notification permission hook (beneath CTA, if not yet requested): "Allow notifications to receive price alert triggers." — small text with an inline "Enable" link.

**Animation note:** Screen fades in from black. Logo appears at scale 0.8, springs to 1.0 (spring easing, 400ms). CTA fades in 200ms later. No other motion.

**Primary CTA:** Context-dependent (Portfolio or Crypto Feed)  
**Secondary:** Go to home screen

**Why this screen exists:** Onboarding that ends with "You're all set!" drops users into the app disoriented. This screen gives them one directed action — a first step — which measurably improves day-1 engagement.

---

## 3. UI Layout Architecture — Per Screen

| Screen | Layout Type | Key Structural Elements |
|--------|-------------|------------------------|
| 1 — Identity | Full bleed, split content | Logo TL, preview panel, copy block, bottom-anchored CTA |
| 2 — Signal Stack | Card list | Stacked data preview cards, category labels, bottom CTA |
| 3 — Structure | Interactive tab map | Large tab bar visual, expandable annotations, bottom CTA |
| 4 — Connection | Choice cards | 2 cards (default B selected), conditional exchange picker, CTA |
| 5 — Activation | Minimal centered | Logo glyph, 2-line copy, single CTA, optional notification hook |

**Persistent elements across all screens:**
- Progress indicator: 5 dots, bottom of screen above CTA zone — `4px` dot width (inactive: `#2d2f3a`), `12px` width (active: `#00d992`), `6px` dot (completed: `#00d992` at 40% opacity, filled)
- Skip: top-right, always `14px`, `#6b7280`, tap target `44x44px`
- CTA zone: fixed bottom, `16px` horizontal padding, `24px` bottom padding (safe area aware)

**Safe area handling:**
All screens must respect iOS safe areas. CTA zone adds `max(24px, env(safe-area-inset-bottom))` bottom padding. Top elements clear the status bar with `env(safe-area-inset-top) + 16px`.

---

## 4. Visual Direction — Per Screen

### Screen 1 — Identity
**Direction:** Control room, not app store. The UI preview panel should look like actual data — tight rows, monospace numbers, green/red deltas. Reference: Bloomberg Terminal screenshot aesthetic, but mobile-native. Avoid full-screen gradients. The background should be `#0b0c10` with no gradient. The logo should be `#00d992` on black, not white.

**Typography:** Headline in `DM Mono` or equivalent monospace — this is a terminal, lean into it. Weight: 600. Size: 28–32px.

### Screen 2 — Signal Stack
**Direction:** Think "intelligence dashboard miniaturized." Each card should look like a shrunken real module — not an icon + text description. The funding rate card can show a tiny 3×3 grid of coins with rate numbers. The liquidation feed card shows an actual-looking scrolling row. The goal is recognition from existing users ("I've seen this in Bloomberg/Hyperliquid"), not explanation.

**Color language:** Each category gets a consistent accent: on-chain flow → amber/orange, liquidations → red/pink, funding → blue, Smart Money → purple. These become system-wide category colors.

### Screen 3 — Structure
**Direction:** The tab bar should look pixel-perfect identical to the in-app tab bar. This is not an illustration — it's the actual UI component. Surrounding it with a faint device frame (just the bottom portion, no full phone chrome) grounds it in context.

**Interaction feel:** The tap-to-expand annotations should feel like they belong to the real app's information architecture, not like onboarding tooltips.

### Screen 4 — Connection
**Direction:** Card A (Connect) should feel aspirational but serious — no gamification, no "⚡ Unlock your potential" — just clear technical framing. The lock icon for API security note should be the Tabler `lock` icon, not an emoji. Exchange logos should be monochrome/greyscale until selected.

**Risk tone:** If live trading is selected, the risk note is not a warning in the "danger" sense — it's a competence signal. Treat it like a terms acknowledgment that a professional trader would recognize and respect.

### Screen 5 — Activation
**Direction:** Restraint. This screen earns attention through minimal visual weight. The glow animation on the logo is the only motion. White space (dark space) is intentional. Resist adding feature reminders, tips, or badges here.

---

## 5. Microcopy Reference — Full Set

### Headlines
| Screen | Headline |
|--------|----------|
| Identity | "Professional Trading Intelligence. On your phone." |
| Signal Stack | "Every signal. One place." |
| Structure | "Five surfaces. Zero fluff." |
| Connection | "Connect your exchange. Or don't — yet." |
| Activation (connected) | "You're in. Your exchange is connected." |
| Activation (explore) | "You're in. Start with the signals." |

### Subheadlines
| Screen | Subheadline |
|--------|-------------|
| Identity | "Smart Money signals, whale flows, liquidation data, funding rates — unified in one terminal." |
| Signal Stack | "From on-chain whale flows to exchange liquidations — structured, live, actionable." |
| Structure | "Everything is one tab away. Here's where to find it." |
| Connection | "Live portfolio, PnL tracking, and order execution require an API key. Everything else works immediately." |
| Activation (connected) | "Portfolio sync takes ~30 seconds. Head to Wallet to see your positions." |
| Activation (explore) | "Liquidation stream, whale flows, and funding rates are live. No setup needed." |

### CTA Labels
| Context | Primary CTA | Secondary |
|---------|-------------|-----------|
| Screen 1 | "Get Started" | "Skip intro" |
| Screen 2 | "See the full picture →" | Skip |
| Screen 3 | "Got it, continue →" | Skip |
| Screen 4, Card B selected | "Start Exploring →" | "Skip for now" |
| Screen 4, Card A selected | "Connect Exchange →" | "Skip for now" |
| Screen 5, connected | "View My Portfolio" | "Go to home screen" |
| Screen 5, explore | "Open Crypto Feed" | "Go to home screen" |

### Error / Edge States
| State | Copy |
|-------|------|
| API key validation fail | "Couldn't verify this key. Check permissions and try again." |
| Exchange connection timeout | "Connection timed out. You can retry from Settings." |
| No internet on launch | "No connection. Signal data will load when online." |

### Security + Trust Notes
- "🔒 Keys stored encrypted. We never request withdrawal permissions."
- "Read-only API access is sufficient for portfolio and PnL tracking."
- "Your data stays on-device. Exchange credentials are never shared."

### Tone Rules
- Do: confident, direct, specific ("$12.4M USDT → Binance" not "large transfers")
- Do: treat user as expert ("Read-only API is sufficient" not "Don't worry, we keep you safe")
- Don't: hype ("🚀 Level up your trading game")
- Don't: over-explain ("A liquidation is when a position is forcibly closed...")
- Don't: false urgency ("Complete setup now to unlock features")
- Don't: generic fintech warmth ("Welcome aboard! We're so excited to have you.")

---

## 6. Final CTA / Activation Screen — Decision Architecture

This screen (Screen 5) handles three paths based on Screen 4 selection:

### Path A — Exchange Connected

```
┌─────────────────────────────────┐
│                                 │
│         [ TT LOGO GLOW ]        │
│                                 │
│    You're in.                   │
│    Your exchange is connected.  │
│                                 │
│    Portfolio sync takes ~30s.   │
│    Head to Wallet to see        │
│    your positions.              │
│                                 │
│  ┌─────────────────────────┐    │
│  │    View My Portfolio    │    │  ← #00d992 fill, white text
│  └─────────────────────────┘    │
│                                 │
│      Go to home screen          │  ← text link, #6b7280
│                                 │
│  [ Allow price alert notifications ] │  ← conditional, if not yet prompted
│                                 │
└─────────────────────────────────┘
```

### Path B — Explore First (no exchange)

```
┌─────────────────────────────────┐
│                                 │
│         [ TT LOGO GLOW ]        │
│                                 │
│    You're in.                   │
│    Start with the signals.      │
│                                 │
│    Liquidation stream, whale    │
│    flows, and funding rates     │
│    are live. No setup needed.   │
│                                 │
│  ┌─────────────────────────┐    │
│  │    Open Crypto Feed     │    │  ← #00d992 fill, white text
│  └─────────────────────────┘    │
│                                 │
│      Go to home screen          │  ← text link, #6b7280
│                                 │
│  Connect exchange later →       │  ← text link, #00d992, subtle
│                                 │
└─────────────────────────────────┘
```

### Notification Permission Hook
Shown beneath the primary CTA on Screen 5 if push permission hasn't been requested:
```
┌───────────────────────────────────┐
│  🔔  Get instant price alerts     │
│  and whale movement notifications │
│  [ Enable Notifications ]         │  ← inline button, ghost style
└───────────────────────────────────┘
```
This surfaces the notification prompt naturally, in context, rather than as a cold system dialog on first launch.

---

## 7. Design System Notes

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-0` | `#0b0c10` | Deepest background, overlays |
| `--bg-1` | `#0d0e12` | Card backgrounds |
| `--bg-2` | `#14161b` | Elevated cards, modals |
| `--bg-3` | `#1a1c22` | Hover states, active bg |
| `--accent` | `#00d992` | Primary CTA, active states, logo, selected indicators |
| `--accent-dim` | `#00d99233` | Selected card borders, progress dots (done state) |
| `--text-1` | `#f0ede8` | Primary text, headlines |
| `--text-2` | `#9ca3af` | Subheadlines, secondary copy |
| `--text-3` | `#6b7280` | Skip links, footnotes, labels |
| `--danger` | `#e2484a` | Short/bearish, liquidations, risk warnings |
| `--border-1` | `#1e2028` | Default card borders |
| `--border-2` | `#2d2f3a` | Inactive progress dots |

**Category accent colors (signal modules):**
- On-chain / Whale Transfers: `#f59e0b` (amber)
- Liquidations: `#e2484a` (red)
- Funding Rates: `#3b82f6` (blue)
- Smart Money: `#a855f7` (purple)
- Market / Crypto general: `#00d992` (green)

### Typography

| Role | Font | Size | Weight | Color |
|------|------|------|--------|-------|
| Screen headline | DM Mono or system monospace | 26–30px | 600 | `#f0ede8` |
| Card headline | Inter / system sans | 15px | 600 | `#f0ede8` |
| Body / subhead | Inter / system sans | 14px | 400 | `#9ca3af` |
| Labels / tags | Inter | 10–11px | 700 | Category accent or `#6b7280` |
| CTA buttons | Inter | 16px | 700 | White (on green) or green (on transparent) |
| Skip / links | Inter | 14px | 400 | `#6b7280` |
| Data preview numbers | DM Mono | 13–14px | 500 | `#f0ede8` or delta-colored |

**Rule:** Headlines in onboarding should use monospace for terminal identity. Body and UI text uses sans-serif for readability.

### Spacing
- Screen horizontal padding: `16px`
- Card internal padding: `14px 16px`
- Card border-radius: `10px` (matches app cards)
- Card gap in list: `8px`
- Section gaps: `24px`
- CTA button height: `48px`, `border-radius: 10px`
- Progress dot spacing: `8px` gap between dots

### Component Style

**Primary CTA Button:**
```
background: #00d992
color: #000 (black text on green — max contrast)
height: 48px
border-radius: 10px
font: 16px/700 Inter
letter-spacing: 0.2px
active state: opacity 0.85, scale 0.98 (brief)
```

**Ghost / Secondary Button:**
```
background: transparent
border: 1px solid #2d2f3a
color: #f0ede8
height: 44px
border-radius: 10px
font: 15px/600 Inter
```

**Data preview card:**
```
background: #14161b
border: 1px solid #1e2028
border-radius: 10px
left accent bar: 3px wide, category color, top-to-bottom
padding: 12px 14px
```

**Selected card (Screen 4):**
```
border: 1px solid #00d992
background: #00d99208 (barely tinted)
transition: border-color 200ms ease, background 200ms ease
```

### Icons
Use Tabler Icons (outline variant) throughout. Size: 20px in cards, 22px in tab bar, 16px in labels/tags. Never filled icons in data modules — filled icons only for selected/active states.

### Motion Principles
- Entrance animations: opacity + translateY(8–12px), 250–400ms, `ease-out`
- Card stagger: 80–120ms offset per card
- State transitions (card selection): 150–200ms, `ease`
- Logo glow (Screen 5): `box-shadow` pulse, 600ms, single pass — not a loop
- CTA press: `scale(0.97)`, 80ms — immediate physical feedback
- Screen transitions: horizontal slide (left→right forward, right→left back), 280ms, `ease-in-out`

---

## 8. Mistakes to Avoid

### UX Mistakes

**1. Gating content behind onboarding completion.**
Never block the app until the user "finishes" onboarding. Skip must always work. Users who skip and explore independently often have higher LTV than those who complete onboarding passively.

**2. Forcing exchange connection before showing value.**
Asking for an API key before demonstrating what the app does is a major funnel drop. Screen 4 deliberately defaults to "Explore First" to let the user experience the signal intelligence layer before committing credentials.

**3. Repeating information between screens.**
Each screen must introduce strictly new content or request strictly one new decision. Recapping the previous screen (even briefly) signals weak design and wastes the user's attention budget.

**4. Using onboarding to teach trading concepts.**
The target user knows what a liquidation cascade is. Explaining it insults their intelligence and wastes screen time. Onboarding should show that the app handles these concepts fluently, not explain them.

**5. Progress indicator mismatch.**
If there are 5 screens, show 5 dots from screen 1. Never reveal additional screens mid-flow (the "surprise" extra step pattern). Power users feel deceived.

**6. Bottom sheet / modal onboarding inside the main app UI.**
Onboarding rendered as a sheet over the dashboard creates visual contamination (exactly the layering bug encountered in the current implementation). Full-screen, portal-rendered to document.body, with its own z-index context. No peeking of app UI underneath.

### Design Mistakes

**7. Illustration characters or lifestyle imagery.**
No traders staring at screens, no coin imagery, no rocket ships. This audience reads these as inexperience signals.

**8. Blue as primary color.**
Blue = bank = trusted but generic. `#00d992` (neon green) is the identity differentiator. Use it aggressively in onboarding as it is used in the app.

**9. White or light backgrounds on any screen.**
Even a single light-background screen breaks the immersion. The user is transitioning from a loading screen to onboarding to the dark app — any light flash registers as visual error.

**10. Large, decorative headline typography with zero information density.**
"The Terminal for the Modern Trader" at 40px with lots of breathing room is wasted space when the user is holding a phone and has 30 seconds of attention. Headlines should be specific and fast.

**11. Making "Skip" feel like a mistake.**
Never say "Are you sure?" Never dim the skip button. Never add guilt copy ("You'll miss out on X"). A skip is a valid path — treat it as such. Users who skip but stay in the app are still users.

**12. Notification permission as screen 1 or 2.**
This is a common mistake. Permission dialogs before trust is established get denied at 70%+ rates. Surface notification permission only on the final screen, after the user has expressed intent (completing or skipping the flow).

---

## 9. Premium / Power-User Variant

> For a future "elite tier" identity or for users identified as high-frequency or institutional. Same flow, different tone and visual treatment.

### Tone Shift
Current: Confident, modern, premium  
Variant: Sparse, clinical, Bloomberg-adjacent. Less copy. More data.

### Headline Variants

| Screen | Standard | Premium Variant |
|--------|----------|-----------------|
| 1 — Identity | "Professional Trading Intelligence. On your phone." | "The terminal. Everywhere." |
| 2 — Signals | "Every signal. One place." | "Signal stack. No noise." |
| 3 — Structure | "Five surfaces. Zero fluff." | "Five modules. Infinite depth." |
| 4 — Connection | "Connect your exchange. Or don't — yet." | "Exchange API. Optional. Powerful." |
| 5 — Activation | "You're in. Start with the signals." | "Terminal ready." |

### Visual Direction Changes

**Screen 1:** No split panel. Full dark screen. Single line of monospace text, center-aligned, white, 22px. Below it: a live (or live-mimicking) data feed — actual liquidation rows scrolling at low opacity. Copy appears to float over real data.

**Screen 2:** No category cards. A single continuous data stream — alternating between whale transfer, funding rate, liquidation, Smart Money update — scrolling upward behind frosted copy overlay. Like watching a real terminal log.

**Screen 4:** No card illustrations. Two simple radio selectors. Monospace labels. No icons. The restraint communicates professionalism.

**Screen 5:** Zero animation. Static. Two lines of text. One button. Done.

### Color Variation
Consider a monochromatic variant: pure `#f0ede8` (off-white) as the ONLY accent color on `#030303` (near-pure black). No green until the CTA. The green CTA button becomes the highest-contrast element on screen — the only color in a black/white composition. Extremely striking.

### CTA Style Variation
Premium variant CTAs: no fill, just a `1px solid #00d992` border, white text. Feels like a command input. On press: border flashes to full green fill for 80ms, then returns. Clinical, fast.

### Target Trigger
Offer this variant if:
- User connects a high-volume exchange on Screen 4
- User skips all screens (power behavior)
- User is re-onboarding after a plan upgrade

The variant can be surfaced as a preference: "Minimal mode" toggle in Settings → Display → Onboarding Style.

---

*Document version: 1.0 — Strategy only. Does not modify OnboardingModal.jsx or any implementation files.*
