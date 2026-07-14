# Edgeoverluck Tote Board Scanner

**AI-powered horse racing odds analysis for [EdgeOverLuck.com](https://edgeoverluck.com)**

Snap a photo or screenshot of any racing odds display — tote board, ADW app, TV graphic, or program — and get instant verified math: implied probabilities, effective takeout, fair odds, and exotic ticket costs.

Built by Edge Over Luck. Every formula is validated by an automated Python math verifier before it ships.

---

## What It Does

| Feature | Status |
|---|---|
| Scan odds from photo/screenshot (AI vision) | ✅ MVP |
| Editable extraction review (confirm before analysis) | ✅ MVP |
| Implied win probability per horse | ✅ MVP |
| Overround & effective takeout | ✅ MVP |
| Fair odds column | ✅ MVP |
| Overlay/underlay flags (user-entered estimates) | ✅ MVP |
| Exacta / trifecta / superfecta ticket cost calculator (box, key, wheel) | ✅ MVP |
| Share results as branded image | ✅ MVP |
| Exotic value analysis (Harville model estimates) | 🔜 v1.1 |
| Discounted probability models (favorite-longshot bias correction) | 🔜 v1.2 (premium) |

## How It Works

```
Photo / screenshot
      │
      ▼
Claude vision API → structured JSON (horse #, odds, confidence)
      │
      ▼
User review & correction  ← low-confidence rows flagged for checking
      │
      ▼
Client-side math engine → analysis table + ticket cost calculator
```

- **Vision extraction** runs through the Anthropic API via a server-side proxy (API key never exposed to the browser).
- **All math runs client-side** in vanilla JS — fast, private, no odds data stored.
- **No accounts required.** Scan history is a planned premium feature.

## The Math

- Implied probability: `1 / decimal odds`, with **ranges** shown for tote boards (displayed odds are rounded down — a board "5/2" means 2.5–2.9 actual)
- Effective takeout: `1 − (1 / overround)`
- Fair odds: implied probability normalized to remove the overround
- Exotic ticket costs: computed by **combinatorial enumeration**, not shortcut formulas, so overlapping key/wheel position groups are always counted correctly
- Exotic probabilities (v1.1): Harville model, explicitly labeled as estimates with known favorite-longshot bias

All formulas are tested in a Python verifier pipeline via GitHub Actions. No math module ships without passing verification.

## Tech Stack

- **Frontend:** HTML / CSS / vanilla JS, Edge Over Luck dark/gold design system, mobile-first
- **AI:** Anthropic Claude API (vision) via serverless proxy
- **QA:** Python math verifier + GitHub Actions (runs on every pull request)
- **SEO:** SoftwareApplication + FAQPage structured data

## Project Structure

```
/
├── index.html          # Scanner page
├── css/                # Design system styles
├── js/
│   ├── vision.js       # API proxy calls + JSON parsing
│   ├── odds.js         # Odds format parsing (fractional, dash, EVEN, etc.)
│   ├── analysis.js     # Implied prob, overround, fair odds, overlays
│   ├── exotics.js      # Ticket cost enumeration engine
│   ├── bankroll.js     # Kelly criterion stake sizing
│   ├── roulette.js     # Bet payout / house edge / EV
│   ├── blackjack.js    # Approximate house-edge estimate
│   └── slots.js        # Expected-loss estimate (given caller-supplied RTP)
├── api/
│   └── scan.js         # Serverless proxy for Anthropic API
├── verifier/
│   └── *.py            # Python math validation suite (mirrors every js/*.js module above)
├── mcp-app/            # MCP App: Edge Over Luck tools (odds analysis, exotic tickets, bankroll,
│                       # roulette, blackjack, slots) as MCP tools with interactive UI
└── .github/workflows/  # CI: math verification on every PR
```

## Setup

1. Clone the repo
2. Set `ANTHROPIC_API_KEY` as an environment variable for the serverless proxy (never commit it)
3. Deploy the `api/` proxy to your serverless platform of choice
4. Serve the static frontend from the site

## Roadmap

- **v1.0** — Scan → win analysis → exotic ticket costs (current)
- **v1.1** — Harville exotic value analysis (gated behind verifier validation)
- **v1.2** — Discounted probability models, saved scan history, overlay tracking (premium)
- **Later** — Android app wrapper if web usage validates demand

## Honest Limitations

- A scan is a **snapshot** — odds move until post. Every result is timestamped.
- Board odds are rounded; probability ranges reflect that.
- Model-based exotic probabilities are estimates, labeled as such.
- This tool provides math analysis, **not picks or guarantees**.
- Check your track's phone-use policies; screenshots and programs are the primary supported inputs.

## About Edge Over Luck

Edge Over Luck teaches gambling mathematics and strategy with verified numbers — house edge, takeout, expected value, and bankroll management across ten casino games. The [Edge Over Luck Workbook](https://a.co/d/04zhfpT0) and free newsletter cover the full system.

*Play smarter. The math is the edge.*

---

**License:** All rights reserved. This is proprietary software of EdgeOverLuck.com.
