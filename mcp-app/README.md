# Edge Over Luck MCP App

Exposes Edge Over Luck's gambling-math engines as MCP tools with an interactive shared UI, so they
can run inside MCP-enabled hosts like Claude Desktop. The horse-racing tools are fully implemented
against this repo's Python-verified math (`js/odds.js`, `js/analysis.js`, `js/exotics.js`); the
other game domains (bankroll, roulette, blackjack, slots) are standalone specialists, each with
their own `js/*.js` + `verifier/*.py` pair. The AI vision scan step (`api/scan.js`) is out of scope
for all tools here — horses/odds are entered directly, not scanned from an image.

Every tool imports its math from `js/*.js` directly rather than duplicating it, so results stay in
sync with the Python-verified engine in `verifier/`. `mcp-app/tools/shared.ts` holds the one shared
`resolveWagerCost` used by every tool that prices a box/key/wheel exotic ticket.

All tools share one UI resource (`ui://tote-board-scanner/mcp-app.html`); the client
(`mcp-app/src/mcp-app.ts`) dispatches on the `kind` field of the result's `structuredContent` to
decide which view to render.

## Tools

### Horse racing

- **`analyze-odds`** — takes a list of `{ number, oddsDisplay }` horses (odds exactly as displayed,
  e.g. `"5/2"`, `"9-2"`, `"3"`, `"EVEN"`) and an optional `sourceType`. Returns implied probability,
  overround, effective takeout, and fair odds, rendered as an interactive table where you can type a
  win-probability estimate per horse to see a live overlay/underlay edge.
- **`exotic-ticket-cost`** — takes a `wagerType` (`exacta`/`trifecta`/`superfecta`), a `base` bet
  unit, and a `wager` (`box`, `key`, or `wheel`, matching `js/exotics.js`'s structures). Returns the
  combination count and total cost by combinatorial enumeration (capped at 200 displayed rows; the
  reported total count/cost always reflect every combination). If `maxBudget` is given and the
  ticket costs more, returns concrete cheaper alternatives (smaller box/key pool, or a lower base
  bet) rather than just an error.
- **`compare-exotic-tickets`** — compares two or more tickets of the same `wagerType` side by side:
  cost, combination count, how much of each ticket's coverage is unique versus redundant with the
  others, and cost per unique combination. Flags a ticket that adds no new coverage at all.
- **`review-wager-plan`** — consolidates odds analysis, an optional exotic ticket, and optional
  bankroll context into one reviewed report. Enforces that a ticket is never shown without its
  cost, that low/medium-confidence horse data is flagged (never silently treated as confirmed),
  that a ticket referencing horses outside the analyzed set is flagged, and that market odds alone
  are never turned into a betting recommendation.

### Other game domains

- **`bankroll-check`** — Kelly-criterion stake sizing given your bankroll, your own independent
  win-probability estimate, and the market's decimal odds. Flags stakes exceeding common
  single-wager bankroll-management guidance. Deliberately does not compute a risk-of-ruin
  probability — that needs variance assumptions this tool doesn't model, and an unverified number
  would be worse than none.
- **`roulette-bet-analysis`** — payout, house edge, and expected value for a standard bet
  (straight/split/street/corner/six-line/column/dozen/even-money) on an American or European wheel,
  including the European "la partage"/"en prison" rule for even-money bets.
- **`blackjack-house-edge`** — an *approximate* house-edge estimate from rule variants (deck count,
  dealer soft-17 behavior, double after split, late surrender, resplit aces, blackjack payout).
  This is a baseline-plus-rule-adjustment model, not a full combinatorial solver, and is always
  returned with an explicit disclaimer to that effect.
- **`slots-ev-estimate`** — expected loss per spin/session given a bet amount and a
  **caller-supplied** RTP (return to player cannot be derived from outside the machine, so it's
  always a required input, never defaulted). Optional qualitative volatility note.

## Development

```bash
npm install
npm run dev          # watches the UI bundle + runs the HTTP server with reload
```

```bash
npm run build         # type-check + bundle the UI into dist/mcp-app.html
npm run serve          # run the HTTP server (reads dist/mcp-app.html)
npm run serve:stdio    # run over stdio instead
```

Tool implementations live one-per-file under `mcp-app/tools/`; `server.ts` is just a thin
composition root that registers each one plus the shared UI resource.

## Testing with basic-host

```bash
git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 \
  https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm run start
# open http://localhost:8080
```
