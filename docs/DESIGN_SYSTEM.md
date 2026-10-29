# Design system

Tokens: `packages/ui/src/tokens.ts` (TS, tested) mirrored as CSS variables in `apps/web/src/styles/globals.css`.
Fonts (working defaults, open question): Cormorant Garamond (headings), DM Sans (UI).

## Colour contrast (computed, WCAG 2.1 AA = 4.5:1 normal text)
Run `npx tsx packages/ui/scripts/contrast-report.ts` for the full matrix.

| Use as text | On | Ratio | OK |
|---|---|---|---|
| Espresso | Ivory / White / Beige / Sand / Champagne | 13.3 / 14.2 / 10.5 / 7.9 / 6.1 | yes |
| Cocoa | Ivory / White / Beige | 6.1 / 6.5 / 4.8 | yes |
| Ivory / White | Espresso / Cocoa | 13.3–14.2 / 6.1–6.5 | yes |
| Sand, Taupe, Champagne | Ivory | 1.7 / 2.3 / 2.2 | **no** |

Sand, Taupe and Champagne are decorative only (borders, dividers, fills), never body text on light backgrounds. `allowedTextPairs` in tokens.ts is asserted by tests. Placeholder text uses Cocoa. Danger `#8A2C1F` and success `#2F5D3A` are not brand tokens; add them to the tested pair list when first used on new backgrounds.

## Components (Phase 1)
Button, Field (label + hint + error, ARIA-linked), Alert, Card; admin shell. Min touch target 44px. Radius ≤ 4px. Motion respects `prefers-reduced-motion`. More components are added when a phase needs them.

Not done yet: dark mode (not in spec), kiosk layout shell, storefront shell. Kiosk/storefront layouts come with their phases.
