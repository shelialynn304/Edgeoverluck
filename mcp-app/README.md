# tote-board-scanner MCP App

Exposes the odds-analysis engine (`js/odds.js`, `js/analysis.js`, `js/exotics.js`) as MCP tools
with an interactive UI, so it can run inside MCP-enabled hosts like Claude Desktop. This covers
the math-analysis half of the scanner — win-pool fair odds and exotic ticket costs — not the AI
vision scan step (`api/scan.js`).

The server imports `../js/odds.js`, `../js/analysis.js`, and `../js/exotics.js` directly rather
than duplicating the logic, so it stays in sync with the Python-verified math in `verifier/`.

Both tools share the same UI resource (`ui://tote-board-scanner/mcp-app.html`); the client
dispatches on the `kind` field of the result's `structuredContent` to decide which table to render.

## Tools

- **`analyze-odds`** — takes a list of `{ number, oddsDisplay }` horses (odds exactly as displayed,
  e.g. `"5/2"`, `"9-2"`, `"3"`, `"EVEN"`) and an optional `sourceType`. Returns implied probability,
  overround, effective takeout, and fair odds, rendered as an interactive table where you can type a
  win-probability estimate per horse to see a live overlay/underlay edge.
- **`exotic-ticket-cost`** — takes a `wagerType` (`exacta`/`trifecta`/`superfecta`), a `base` bet
  unit, and a `wager` (one of `box`, `key`, or `wheel`, matching `js/exotics.js`'s structures).
  Returns the combination count and total cost by combinatorial enumeration, rendered as a table of
  every winning combination (capped at 200 rows; the reported cost/count always reflect the full
  total even when the table is truncated).

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

## Testing with basic-host

```bash
git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 \
  https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm run start
# open http://localhost:8080
```
