# News Entity Resolution and Asset Mapping Spec

## Goal

Upgrade the news normalization pipeline so it can robustly identify:

- direct crypto symbols and token names
- equities and ETFs mentioned in news
- commodities and macro-sensitive assets
- thematic and geopolitical events that affect markets indirectly
- primary asset, related assets, themes, and confidence scores

The current implementation is too shallow because it only scans headlines with a small keyword dictionary and returns `related_symbols`. That approach misses:

- long-tail tokens like `PENGU`
- aliases and brand names like `Pudgy Penguins`, `Pump.fun`, `MicroStrategy`
- market symbols written as `$BTC`, `BTC/USDT`, `BTCUSD`, `NASDAQ:COIN`
- commodity and macro events like `Hormuz Strait`, `oil shock`, `Fed`, `CPI`
- news where no direct ticker is present but a market theme is obvious

This task should build a practical, rule-based, extensible entity resolution system without paid APIs or LLM calls.

## Constraints

- Do not use paid services.
- Prefer deterministic, testable, local logic.
- Design for 500+ assets and long-tail tokens.
- Make the system extensible through data files, not hardcoded Python only.
- Preserve backward compatibility where reasonable.
- Avoid overfitting only to Binance majors.

## Current State

Relevant files:

- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/normalize.py`
- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/service.py`
- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/core/models.py`

Current behavior:

- only scans `headline`
- uses small `SYMBOL_KEYWORDS`
- returns `related_symbols: list[str]`
- no confidence
- no direct-vs-indirect distinction
- no asset classes
- no theme extraction beyond a weak tags list

## High-Level Design

Implement a layered entity resolution pipeline:

1. Exact ticker extraction
2. Alias and brand matching
3. Theme extraction
4. Impact mapping
5. Tradable symbol resolution
6. Confidence scoring

The system should distinguish between:

- direct asset mentions
- indirect market impact
- canonical asset identity
- exchange-tradable symbols

## Required Data Model Changes

Extend `NormalizedNews` in `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/core/models.py`.

Keep existing fields if needed, but add richer structure. A suggested model:

```python
class MentionedAsset(BaseModel):
    asset_id: str
    asset_type: str  # crypto | equity | etf | commodity | forex | macro_theme | index
    display_name: str
    match_type: str  # exact_ticker | alias | brand | theme | inferred
    confidence: float = 0.0
    tradable_symbols: list[str] = Field(default_factory=list)
    matched_text: str | None = None


class NormalizedNews(BaseModel):
    ...
    related_symbols: list[str] = Field(default_factory=list)  # backward compatibility
    primary_symbol: str | None = None
    primary_asset_id: str | None = None
    mentioned_assets: list[MentionedAsset] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    confidence: float = 0.0
```

If you prefer a different final schema, keep the same capabilities.

## Data Files To Add

Move asset knowledge out of code and into structured data files.

Suggested files:

- `/Users/mehmetcan/Desktop/terminal/config/assets/crypto_assets.json`
- `/Users/mehmetcan/Desktop/terminal/config/assets/equity_assets.json`
- `/Users/mehmetcan/Desktop/terminal/config/assets/commodity_assets.json`
- `/Users/mehmetcan/Desktop/terminal/config/assets/theme_map.json`
- `/Users/mehmetcan/Desktop/terminal/config/assets/impact_map.json`

You may also choose one consolidated file if it is cleaner, but keep the data separate from business logic.

### Example asset record

```json
{
  "asset_id": "PENGU",
  "display_name": "Pudgy Penguins",
  "asset_type": "crypto",
  "aliases": ["pengu", "pudgy penguins"],
  "brands": ["pudgy penguins"],
  "tradable_symbols": ["PENGUUSDT"],
  "themes": ["memecoin", "nft"]
}
```

### Example commodity record

```json
{
  "asset_id": "BRENT",
  "display_name": "Brent Oil",
  "asset_type": "commodity",
  "aliases": ["brent", "brent oil", "oil", "crude oil", "crude", "wti"],
  "brands": [],
  "tradable_symbols": [],
  "themes": ["energy", "macro", "geopolitics"]
}
```

### Example theme map

```json
{
  "geopolitics": ["iran", "israel", "hormuz", "strait of hormuz", "tanker", "missile", "airstrike"],
  "etf": ["etf", "spot etf", "approval", "approved", "sec filing"],
  "listing": ["listing", "delisting", "launchpool", "launchpad"],
  "regulation": ["sec", "regulator", "lawsuit", "ban", "compliance"],
  "macro": ["cpi", "inflation", "fed", "fomc", "rate cut", "rate hike"]
}
```

### Example impact map

```json
{
  "geopolitics": {
    "primary_assets": ["BRENT", "WTI"],
    "secondary_assets": ["BTC", "ETH"],
    "notes": "Energy shock and risk sentiment effects"
  },
  "etf": {
    "primary_assets": [],
    "secondary_assets": ["BTC", "ETH", "PENGU"]
  }
}
```

## Core Behavior Requirements

### 1. Search both headline and body

Entity extraction must use:

- `headline`
- `raw_content` when available

Use headline matches as stronger evidence than body matches.

### 2. Exact ticker detection

Add robust regex support for:

- `$BTC`
- `BTC`
- `BTCUSDT`
- `BTC/USD`
- `BTC-USD`
- `NASDAQ:COIN`
- `NYSE:MSTR`

Avoid obvious false positives from common words like `ON`, `IN`, `S`, `MOVE`, `US`.

### 3. Alias and brand matching

Support aliases such as:

- `bitcoin` -> `BTC`
- `ethereum` / `ether` -> `ETH`
- `pudgy penguins` -> `PENGU`
- `microstrategy` / `strategy` -> `MSTR`
- `coinbase` -> `COIN`
- `blackrock bitcoin etf` should still imply `BTC`

### 4. Theme extraction

Themes are first-class output.

Examples:

- `Hormuz Strait tension` -> `geopolitics`, `energy`
- `ETF approval` -> `etf`
- `CPI hotter than expected` -> `macro`, `inflation`
- `Binance listing` -> `listing`, `exchange`

### 5. Direct vs indirect asset handling

Do not force every news item into a direct tradable crypto symbol.

Examples:

- `PENGU ETF approved`:
  - primary asset: `PENGU`
  - related symbols: `PENGUUSDT`
  - theme: `etf`

- `Iran threatens Hormuz Strait`:
  - primary asset: `BRENT` or `WTI` if your rules resolve that way
  - theme: `geopolitics`, `energy`
  - related symbols may be empty if no direct exchange symbol exists
  - secondary impacted assets may include `BTC`, `ETH`

### 6. Confidence scoring

Every resolved item should have a confidence score between `0.0` and `1.0`.

Suggested weighting:

- exact ticker in headline: very high
- canonical alias in headline: high
- brand alias in headline: medium-high
- body-only match: medium
- theme-only inferred asset: lower

The overall `NormalizedNews.confidence` can be the max or weighted aggregate.

### 7. Primary asset selection

Pick a `primary_asset_id` and `primary_symbol` when possible.

Priority suggestion:

1. exact ticker headline match
2. alias headline match
3. brand headline match
4. strongest theme-to-asset inferred mapping

### 8. Backward compatibility

Keep populating `related_symbols` for existing UI use.

At minimum:

- if an asset has tradable symbols, include them in `related_symbols`
- `primary_symbol` should usually be the first tradable symbol for the primary asset

## Suggested Implementation Structure

Refactor `normalize.py` into cleaner units. Suggested modules:

- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/assets_registry.py`
- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/entity_extractor.py`
- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/theme_extractor.py`
- `/Users/mehmetcan/Desktop/terminal/src/cryptoterminal/news/normalize.py`

Responsibilities:

- `assets_registry.py`
  - load and cache asset config files
  - expose canonical asset lookup

- `entity_extractor.py`
  - exact ticker regex extraction
  - alias and brand matching
  - return structured asset matches with confidence

- `theme_extractor.py`
  - detect themes from text
  - map themes to impacted assets

- `normalize.py`
  - compose outputs into final normalized payload

## Important Practical Rules

### False positive control

Be conservative with short symbols.

For example, symbols like `IN`, `ON`, `ONE`, `ACE`, `S`, `MOVE` can create garbage matches.

Strategies:

- use allowlists for exact short-token matching
- require uppercase or prefixed forms for ambiguous symbols
- prefer phrase aliases over single-token aliases for ambiguous assets

### Long-tail support

The system must support weird and newer tokens like `PENGU`.

Do not hardcode only major coins. Use asset registry data to enable growth.

### Tradable symbol resolution

If helpful, auto-bootstrap the crypto registry from Binance tradable symbols and then enrich it with alias metadata.

For example:

- discover `PENGUUSDT` from exchange symbol lists
- create or update registry entries
- then match aliases like `pudgy penguins`

Manual alias enrichment is acceptable and expected.

## Tests Required

Add focused tests covering:

- direct majors
- long-tail tokens
- equities
- commodity/macros
- theme-only inference
- false positive defense

Suggested file:

- `/Users/mehmetcan/Desktop/terminal/tests/test_news_entity_resolution.py`

Minimum test cases:

1. `Bitcoin ETF sees record inflows`
   - includes `BTCUSDT`
   - theme includes `etf`

2. `Pudgy Penguins ETF approved`
   - primary asset resolves to `PENGU`
   - related includes `PENGUUSDT`

3. `Coinbase shares jump after strong earnings`
   - detects `COIN`
   - asset type `equity`

4. `Iran may attempt to close the Strait of Hormuz`
   - themes include `geopolitics` and `energy`
   - resolves indirect commodity asset like `BRENT` or `WTI`

5. `Fed minutes signal sticky inflation`
   - themes include `macro` and `inflation`
   - no garbage token match

6. `Binance to list TOKENXYZ perpetuals`
   - listing theme detected
   - exact symbol if registry knows it

7. Ambiguous short-word headline should not create fake matches

## UI Follow-Up Compatibility

Even if UI updates are not part of this task, the backend output should support future UI improvements such as:

- showing `primary_symbol`
- showing `confidence`
- showing asset class
- showing themes
- replacing `No symbol detected` with meaningful structured output

## Deliverables

1. Refactored extraction pipeline
2. New asset registry data files
3. Updated normalized news model
4. Tests proving behavior
5. Clear inline comments only where needed

## Definition of Done

This task is done when:

- the system no longer depends on a tiny hardcoded keyword map alone
- long-tail tokens like `PENGU` can be resolved through registry data
- macro and geopolitical news can produce themes and indirect asset mappings
- `related_symbols` remains usable by the existing UI
- tests cover both direct and indirect cases
- the implementation is local, deterministic, and maintainable

## Optional Nice-to-Haves

- cache compiled regex patterns
- log unknown candidate entities for later alias enrichment
- expose a debug mode to inspect why a match happened
- rank multiple candidate assets by evidence score

## Preferred Approach

Do not jump to embeddings, paid NLP APIs, or LLM classification first.

Start with a high-quality rule-based resolver with structured asset registries and theme maps. The system should be explainable, cheap, and testable.
