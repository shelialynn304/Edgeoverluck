---
name: brand-style-check
description: Use this skill whenever adding or changing UI for Edge Over Luck — the main scanner frontend (index.html, css/), or the mcp-app UI — to keep new markup consistent with the established dark/gold design system instead of introducing ad hoc colors or spacing. Trigger on "match the site style", "use the brand colors", "make this look consistent", or any new component/page/card.
---

# Edge Over Luck Brand Style Check

Edge Over Luck's look is a dark, gold-accented design system defined once in `css/style.css` and
already echoed (with host-theme fallbacks) in `mcp-app/src/global.css`. New UI should reuse these
variables rather than hardcoding new colors — that's what keeps the scanner, the marketing pages,
and the MCP App looking like one product.

## Core palette (`css/style.css` `:root`)

| Variable | Value | Use |
|---|---|---|
| `--bg` | `#0f1115` | Page background |
| `--bg-alt` | `#121722` | Secondary background |
| `--panel` / `--panel-2` | `#171a21` / `#1e2430` | Card/panel surfaces |
| `--text` | `#eef2f7` | Primary text |
| `--muted` | `#a7b0be` | Secondary text |
| `--gold` | `#f1c45b` | Primary brand accent |
| `--gold-dark` | `#d4a93d` | Gold hover/pressed state |
| `--accent` | `#4db6ff` | Secondary (cyan) accent |
| `--success` | `#58d68d` | Positive values (overlay, gains) |
| `--danger` | `#ff7171` | Negative values (underlay, errors) |
| `--border` / `--border-strong` | translucent white / translucent gold | Dividers, card borders |
| `--gold-glow` / `--cyan-glow` / `--red-glow` | translucent glows | Emphasis/hover effects |
| `--shadow` / `--shadow-soft` / `--shadow-depth` / `--shadow-gold` | layered box-shadows | Card elevation |
| `--radius` / `--radius-sm` | `18px` / `12px` | Corner rounding |

Before adding a new color, check whether one of these already fits — a new hardcoded hex value is
a sign the design system was skipped rather than extended.

## The mcp-app UI is a guest in someone else's window

`mcp-app/src/global.css` mirrors the same gold accent (`--color-accent: #f1c45b`) but layers it on
top of **host-provided** CSS variables (`--color-background-*`, `--color-text-*`, `--font-sans`,
etc.), since the MCP App renders inside a host like Claude Desktop that controls light/dark theme,
fonts, and base colors. When touching `mcp-app/` UI:

- Use the host variables for anything structural (backgrounds, primary text, fonts, border radius)
  so it adapts to the host's theme.
- Use Edge Over Luck's own accent color only for genuinely branded elements (not the whole
  surface) — this app is a guest inside another product's chrome, not a full takeover.
- Always provide a `light-dark()` or explicit fallback for any custom variable, since the host may
  not define it.

## Checklist for new UI

1. Reuse an existing CSS variable before introducing a new color, radius, or shadow.
2. Match existing spacing/typography conventions in the file you're editing rather than inventing
   new scale values.
3. For `mcp-app/`, confirm the component still looks right in both light and dark host themes (the
   host may switch this at runtime via `onhostcontextchanged`).
4. For the main site, keep the dark/gold mobile-first feel — this is a scanning tool used at the
   track, often on a phone in variable lighting, so contrast and tap-target size matter more than
   decorative flourishes.
5. If a genuinely new brand color or pattern seems necessary, add it as a named variable in the
   relevant `:root` block (not an inline hex) so it's reusable and easy to audit later.
