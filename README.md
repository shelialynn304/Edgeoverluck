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
Protected serverless proxy → Claude vision API → structured JSON
      │
      ▼
User review & correction  ← low-confidence rows flagged for checking
      │
      ▼
Client-side math engine → analysis table + ticket cost calculator
```

- **Vision extraction** runs through the Anthropic API via a protected server-side proxy; the API key is never exposed to the browser.
- **All math runs client-side** in vanilla JS — fast, private, and no odds data is stored by this application.
- **No accounts required.** Scan history is a planned premium feature.

## Scanner API Protection

The paid `/api/scan` endpoint is protected before it calls the vision provider:

- Atomic per-IP fixed-window limits through Upstash Redis REST: **5/minute** and **20/hour** by default.
- Daily quotas: **40 scans per IP** and **400 scans globally** by default.
- IP addresses are SHA-256 hashed before they are used in Redis keys; raw addresses are not stored by the limiter.
- Cross-site browser requests and unapproved `Origin` headers are rejected.
- JSON content type, request length, base64 integrity, decoded image size, and image magic bytes are validated.
- Optional Cloudflare Turnstile tokens are generated client-side and validated server-side, including expected action and hostname checks.
- The limiter fails closed when Redis is unavailable or missing unless `SCAN_SECURITY_FAIL_OPEN=true` is explicitly set.
- Anthropic requests have a timeout and internal provider errors are not exposed to clients.

The limits are environment-configurable. See `.env.example` for every available setting.

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
- **Abuse protection:** Upstash Redis REST quotas; optional Cloudflare Turnstile
- **QA:** Python math verifier, Node security tests, and GitHub Actions
- **SEO:** SoftwareApplication + FAQPage structured data

## Project Structure

```
/
├── index.html          # Scanner page
├── css/                # Design system styles
├── js/
│   ├── vision.js       # Security challenge + API proxy calls + JSON parsing
│   ├── odds.js         # Odds format parsing (fractional, dash, EVEN, etc.)
│   ├── analysis.js     # Implied prob, overround, fair odds, overlays
│   ├── exotics.js      # Ticket cost enumeration engine
│   ├── bankroll.js     # Kelly criterion stake sizing
│   ├── roulette.js     # Bet payout / house edge / EV
│   ├── blackjack.js    # Approximate house-edge estimate
│   └── slots.js        # Expected-loss estimate (given caller-supplied RTP)
├── api/
│   ├── scan.js         # Protected serverless proxy for Anthropic API
│   ├── scan-config.js  # Public client security configuration
│   ├── security.js     # Validation, rate limits, quotas, Turnstile verification
│   └── *.test.js       # Node security and endpoint tests
├── verifier/
│   └── *.py            # Python math validation suite (mirrors every js/*.js module above)
├── mcp-app/            # MCP App: Edge Over Luck tools (odds analysis, exotic tickets, bankroll,
│                       # roulette, blackjack, slots) as MCP tools with interactive UI
└── .github/workflows/  # CI: math and scanner-security verification
```

## Setup

1. Clone the repo.
2. Copy `.env.example` into your deployment platform's environment settings.
3. Set `ANTHROPIC_API_KEY`.
4. Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and the standard read/write `UPSTASH_REDIS_REST_TOKEN`.
5. Recommended: create a Cloudflare Turnstile widget for `edgeoverluck.com`, then set both Turnstile keys.
6. Deploy the `api/` functions and serve the static frontend from the same origin.

The production endpoint intentionally returns `503 security_not_configured` when Redis credentials are missing. For local-only development, set `SCAN_SECURITY_DISABLED=true`; never use that setting in production.

### Default limits

| Setting | Default |
|---|---:|
| `SCAN_RATE_LIMIT_PER_MINUTE` | 5 |
| `SCAN_RATE_LIMIT_PER_HOUR` | 20 |
| `SCAN_DAILY_IP_QUOTA` | 40 |
| `SCAN_DAILY_GLOBAL_QUOTA` | 400 |
| `SCAN_MAX_IMAGE_BYTES` | 8 MiB |

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
- IP-based quotas can affect people sharing the same public network.
- Check your track's phone-use policies; screenshots and programs are the primary supported inputs.

## About Edge Over Luck

Edge Over Luck teaches gambling mathematics and strategy with verified numbers — house edge, takeout, expected value, and bankroll management across ten casino games. The [Edge Over Luck Workbook](https://a.co/d/04zhfpT0) and free newsletter cover the full system.

*Play smarter. The math is the edge.*

---

**License:** All rights reserved. This is proprietary software of EdgeOverLuck.com.
