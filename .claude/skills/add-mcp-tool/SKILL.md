---
name: add-mcp-tool
description: Use this skill when adding a new tool to mcp-app/ (the tote-board-scanner's MCP App), or reviewing/extending an existing one. Covers this project's established pattern of reusing js/*.js math directly, the shared UI dispatch convention, and the input-validation/safety checklist learned from real review findings (duplicate-input bugs, unbounded enumeration/DoS, XSS via innerHTML). For general MCP Apps SDK mechanics (registerAppTool, App lifecycle, CSP), see the create-mcp-app / add-app-to-server skills instead — this one is specific to conventions already established in this repo's mcp-app/.
---

# Add an MCP Tool to tote-board-scanner's mcp-app/

`mcp-app/server.ts` currently registers two tools (`analyze-odds`, `exotic-ticket-cost`) that share
one UI resource. Follow the same conventions for a new tool rather than inventing a new pattern.

## Reuse the JS math modules directly — don't reimplement

Import from `../js/*.js` (e.g. `parseOddsDisplay` from `../js/odds.js`, `computeWinAnalysis` from
`../js/analysis.js`, `boxCost`/`keyCost`/`wheelCost` from `../js/exotics.js`). These are plain ESM
modules with no DOM dependency, so they run fine in Node. This keeps the MCP tool's math identical
to the web app's and the Python-verified engine — a fourth divergent copy of racing math is exactly
what `verify-racing-math` exists to prevent. If your new tool needs math that doesn't exist yet in
`js/`, add it there first (and mirror it into `verifier/`, per that skill) rather than writing it
inline in `server.ts`.

## `structuredContent.kind` must match the tool name

Both tools' `structuredContent` include a `kind` field whose value is the tool's own name
(`"odds-analysis"` for `analyze-odds`, `"exotic-ticket-cost"` for `exotic-ticket-cost`) — not an ad
hoc label. `mcp-app/src/mcp-app.ts` dispatches purely on this field to decide which renderer draws
into the shared `#app-root`. When adding a tool:

1. Give its `structuredContent.kind` a value matching the tool's name.
2. Add a matching `interface` in `mcp-app/src/mcp-app.ts`, include it in the `ToolResultPayload`
   union, and add a `renderXxx()` function plus a branch in `renderResult()`'s `kind` dispatch.
3. Never hardcode one tool's markup into the shared HTML shell (`mcp-app.html`) — it only contains
   the generic `#app-root` container; everything tool-specific is rendered dynamically by JS.

## Input validation checklist

These are all real findings from this repo's own review history — treat them as required, not
optional, for any tool that takes array/collection input:

- **Reject duplicate entries within a single selection.** If a field represents a set of distinct
  items (e.g. horses in a box), duplicate values make backtracking enumerators count the same
  combination twice, inflating counts/costs silently. Validate with a duplicate-finder and return
  a clear `isError` result naming the offending values — don't silently dedupe.
- **Bound enumeration work *before* calling it, not just the displayed output.** A cap on rows
  shown to the user (e.g. `.slice(0, 200)`) does nothing to stop a caller-supplied input from
  blowing up memory/CPU before that slice ever happens. Compute a cheap bound first:
  - If the true count has a closed form (e.g. a permutation `n·(n-1)·...·(n-r+1)` when every
    non-fixed slot draws from the same pool), compute it exactly and bail early once it exceeds
    the cap — don't use a looser bound like `n^r`, which can reject perfectly valid inputs.
  - If the true count has no cheap closed form (e.g. overlapping wheel groups), use the product of
    per-position group sizes as a safe worst-case upper bound, but say so honestly in the error
    message — it can refuse an input whose *actual* count would have fit.
- **Validate schema-adjacent invariants zod can't express directly** — e.g. a "key" horse must not
  also appear in the "others" list; an index into "which position" must be within range for the
  wager type.
- **Always keep the `content` text array with a fallback**, and make server-side error messages
  specific enough to self-correct from (name the bad values, state the expected format).

## Client-side rendering safety

- Any text that echoes caller-supplied input (e.g. an error message repeating an invalid string the
  user typed) **must** be rendered via `textContent`, never `innerHTML` — the caller-controlled
  string could contain markup that executes when interpreted as HTML. Values that have already
  passed strict validation (e.g. odds strings matched by a fixed regex, or numbers) are safe to
  interpolate into template strings, but re-check that assumption if the validation ever loosens.
- Manage `aria-busy`/`aria-live` on the shared `#app-root`: set busy in `ontoolinput`, clear it once
  a result (success or error) renders.

## Verification

After adding a tool:

```bash
cd mcp-app
npm install        # if node_modules isn't present
npm run typecheck
npm run build
```

Then smoke-test the actual MCP protocol rather than trusting the build alone — start the server
(`npx tsx main.ts`) and exercise `tools/list`, `tools/call` (including error paths and any boundary
input your new bound-checking logic cares about), and `resources/read`, e.g. with `curl` against
`http://localhost:3001/mcp`. Kill the background server when done.
