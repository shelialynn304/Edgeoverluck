# tote-board-scanner MCP App

Exposes the odds-analysis engine (`js/odds.js`, `js/analysis.js`) as an MCP tool with an
interactive UI, so it can run inside MCP-enabled hosts like Claude Desktop. This covers the
math-analysis half of the scanner — implied win probability, overround, effective takeout, and
fair odds — not the AI vision scan step (`api/scan.js`).

The server imports `../js/odds.js` and `../js/analysis.js` directly rather than duplicating the
logic, so it stays in sync with the Python-verified math in `verifier/`.

## Tool

`analyze-odds` — takes a list of `{ number, oddsDisplay }` horses (odds exactly as displayed, e.g.
`"5/2"`, `"9-2"`, `"3"`, `"EVEN"`) and an optional `sourceType`. Returns implied probability,
overround, effective takeout, and fair odds, rendered as an interactive table where you can type a
win-probability estimate per horse to see a live overlay/underlay edge.

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
