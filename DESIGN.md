---
name: SeaYou
description: Real-time marine weather intelligence for sailors, surfers, kiters, and coastal professionals
colors:
  # Deep Ocean theme (default / "light" class)
  ocean-midnight: "#031e3d"
  ocean-base: "#082d5d"
  ocean-elevated: "#052549"
  ocean-border-strong: "#01658d"
  ocean-border-subtle: "#074873"
  teal-primary: "#008d8d"
  teal-hover: "#00a5a5"
  aqua-accent: "#54e0ca"
  button-secondary: "#074873"
  button-secondary-hover: "#085a91"
  # Night Watch theme (dark class)
  night-deepest: "#020617"
  night-surface: "#0f172a"
  night-elevated: "#1e293b"
  night-border: "#334155"
  night-accent-blue: "#2563eb"
  night-accent-blue-hover: "#3b82f6"
  night-accent-light: "#60a5fa"
  # Bright Deck theme (sun / high contrast)
  bright-surface: "#ffffff"
  bright-card: "#f4f4f5"
  bright-elevated-el: "#e4e4e7"
  bright-border: "#18181b"
  bright-accent: "#0066cc"
  # Text
  text-on-dark: "#ffffff"
  text-secondary-slate: "#cbd5e1"
  text-muted-slate: "#94a3b8"
  text-dim-slate: "#64748b"
  # Semantic
  alert-orange: "#e67a32"
  success-green: "#34d399"
  error-red: "#f87171"
  warning-amber: "#fbbf24"
  chart-blue: "#3b82f6"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.125rem, 2vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  data:
    fontFamily: "ui-monospace, 'SF Mono', 'Fira Code', monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.teal-primary}"
    textColor: "{colors.text-on-dark}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.teal-hover}"
    textColor: "{colors.text-on-dark}"
  button-secondary:
    backgroundColor: "{colors.button-secondary}"
    textColor: "{colors.text-secondary-slate}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.button-secondary-hover}"
    textColor: "{colors.text-on-dark}"
  glass-panel:
    backgroundColor: "rgba(255,255,255,0.1)"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-night:
    backgroundColor: "rgba(15,23,42,0.75)"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  input-field:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.text-on-dark}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: SeaYou

## 1. Overview

**Creative North Star: "The Chart Room at Sea"**

SeaYou's design language is built for a specific human being: the person who knows the difference between a 15-knot breeze and a 25-knot gale, and needs that information without ceremony. The Chart Room at Sea captures it: dense precision arranged for instant reading, every element present because it must be, nothing decorative, the ocean making the rules.

The result is a dark-dominant, high-contrast instrument interface. The three themes are not stylistic choices but environmental responses: Deep Ocean for outdoor daylight use with blue glare-resistant surfaces, Night Watch for night passages and low-light conditions in pure slate, Bright Deck for direct-sunlight operation where maximum contrast is the only acceptable answer. The glassmorphism panels are not aesthetic flourishes; they are a technical decision that lets the map (the product) breathe through every layer of chrome. The interface is made of glass because the horizon must always be visible.

Color strategy is **committed**: the ocean blue-teal palette carries 40-60% of every surface in Deep Ocean mode. This is not a restrained accent system; the chromatic identity is the product's nautical credibility. When the scene sentence is "sailor checking wind speed on a phone in the cockpit at 0700," the answer is committed ocean blue, not neutral gray with a touch of teal.

Typography is system-native: system-ui delivers familiarity, legibility at small sizes, and zero load overhead. Instrument data uses monospace for tabular alignment. Hierarchy is achieved through weight contrast (400 body / 600-700 title/headline) and size steps of at least 1.25x between roles.

**Key Characteristics:**
- Three environment-matched themes: Deep Ocean (blue, outdoor), Night Watch (slate, night), Bright Deck (white, maximum contrast)
- Glassmorphism panels are purposeful: they frame the map without obscuring it
- Committed ocean palette; teal is the primary action color across all light themes
- System-native typography for instrument-grade legibility at every size
- Tabular data in monospace; all other content in system-ui
- Functional motion only: no choreography, no entrance animations; state changes only
- Reduced-motion respects `prefers-reduced-motion` without degrading information density

## 2. Colors: The Three-Sea Palette

Three named themes, each a direct response to a physical environment.

### Primary (Deep Ocean — default daylight mode)

- **Ocean Midnight** (`#031e3d`): Card and panel backgrounds in Deep Ocean mode. The deepest surface; conveys depth below the map layer.
- **Ocean Base / Madison Blue** (`#082d5d`): Primary app background in Deep Ocean mode. A compressed, dark navy that reads well under outdoor ambient light without washing out.
- **Ocean Elevated** (`#052549`): Elevated container surfaces sitting above the base.
- **Teal Primary** (`#008d8d`): The primary action color. Buttons, active nav items, interactive affordances. A desaturated teal that reads "instrument active" without neon aggression.
- **Aqua Accent** (`#54e0ca`): Text highlights, data readouts, chart lines, icon accents. Higher chroma than Teal; reserved for information emphasis only.

### Secondary (Night Watch — dark/night mode)

- **Night Deepest** (`#020617`): Main app background at night. Slate-950; slightly cooler than pure black, retains readability under red cockpit lighting.
- **Night Surface** (`#0f172a`): Card backgrounds. Elevated from Deepest; slate-900.
- **Night Elevated** (`#1e293b`): Panels and modals. Slate-800.
- **Night Accent Blue** (`#2563eb`): Primary action color in night mode. Shifted from teal to blue to maintain WCAG AA contrast on dark slate backgrounds.
- **Night Accent Light** (`#60a5fa`): Data readouts and text emphasis in night mode. High contrast on near-black.

### Tertiary (Bright Deck — direct sunlight mode)

- **Bright Surface** (`#ffffff`): Page background. Stark white; maximum contrast is the only design goal in this mode.
- **Bright Accent** (`#0066cc`): Primary actions in sunlight mode. A confident navy-blue that passes AA on white at all sizes.

### Neutral

- **Text On Dark** (`#ffffff`): Primary text on all dark surfaces.
- **Slate Secondary** (`#cbd5e1`): Secondary text, subtitles, supporting data.
- **Slate Muted** (`#94a3b8`): Tertiary text, labels, placeholder copy.
- **Slate Dim** (`#64748b`): Least-prominent text; coordinates, footnotes, disabled states.

### Semantic

- **Alert Orange** (`#e67a32`): Wind/wave threshold warnings. The alert banner uses a horizontal gradient from this to `#cd8b4e`.
- **Success Green** (`#34d399`): Open/active facility status, safe condition indicators.
- **Error Red** (`#f87171`): Closed status, danger conditions, form errors.
- **Warning Amber** (`#fbbf24`): Marginal conditions, star ratings, caution.

### Named Rules

**The Environment Rule.** Never choose a theme based on aesthetic preference. Deep Ocean is for outdoor daylight. Night Watch is for night passages and low-light. Bright Deck is for direct sun where glare eliminates all middle-ground contrast. The theme follows the environment; the environment does not follow the designer.

**The Teal Sovereignty Rule.** Teal (`#008d8d`) is the one action color in Deep Ocean mode. It appears on primary buttons, active nav items, and interactive indicators. It does not appear decoratively. Reserve Aqua (`#54e0ca`) for data and emphasis; reserve Teal for action. Two chromatic roles; no exceptions.

**The Glass Transparency Rule.** Glassmorphism is not decorative. Every panel using `backdrop-filter: blur()` must reveal the map behind it. If a panel's background is fully opaque, remove the blur. The product is the ocean; the UI is the glass.

## 3. Typography: Instrument Grade

**Display / Body Font:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
**Data / Tabular Font:** ui-monospace, 'SF Mono', 'Fira Code', monospace

**Character:** System-native sans for zero load latency and maximum screen legibility. Monospace reserved exclusively for numerical instrument data where tabular alignment is a functional requirement (wind speed, wave height, coordinates, bearings). The pairing is not aesthetic; it is a distinction between interface copy and instrument readout.

### Hierarchy

- **Display** (700, `clamp(1.5rem, 3vw, 2.25rem)`, lh 1.15, ls -0.02em): Section headers, modal titles, major view headings. Used sparingly; one per screen.
- **Headline** (600, `clamp(1.125rem, 2vw, 1.5rem)`, lh 1.25, ls -0.01em): Card titles, panel headers, major data labels.
- **Title** (600, `1rem`, lh 1.35): Sub-panel labels, chip text, navigation items.
- **Body** (400, `0.875rem`, lh 1.5): Supporting descriptions, longer text blocks. Cap at 65ch for readability in wider panels.
- **Label** (500, `0.6875rem`, lh 1.4, ls 0.02em): Badges, metadata, coordinate lines, overline categories.
- **Data** (600, `0.75rem`, monospace, lh 1.2, ls 0.01em): All numerical readouts: wind speed (kt), wave height (m), bearing (°), lat/lon. Tabular alignment is the function; monospace is non-negotiable.

### Named Rules

**The Monospace Gate.** If the value has a unit and is compared against other values in a column or row (wind speed, wave height, temperature, bearing), it is instrument data: use the Data role and monospace. Everything else is interface copy: system-ui.

**The Weight Cliff Rule.** There is no 500-weight in the hierarchy. Body is 400; everything above it jumps to 600 or 700. Flat-weight scales blur the instrument hierarchy. Contrast between the data and its label must be legible at a glance in low-light conditions.

## 4. Elevation: Glass Over Ocean

SeaYou does not use traditional drop shadows. Depth is conveyed through two mechanisms: **tonal layering** (darker = deeper; the map is always deepest) and **glass panels** (blur + transparency = floating above the map). The elevation system describes which components use which approach.

Three light themes have different layering depths, but the principle is consistent: surfaces are dark and layered in Ocean/Night modes; the Bright Deck mode inverts to pure white with borders replacing blur.

### Shadow Vocabulary

- **Flat (Level 0)**: No shadow. The map itself; full-screen backgrounds.
- **Glass Panel (Level 1)**: `backdrop-filter: blur(12px)` with `rgba(255,255,255,0.1)` background and `rgba(255,255,255,0.2)` border. Used for floating information panels over the map.
- **Glass Inner (Level 2)**: `background: rgba(255,255,255,0.2)`, `border-radius: 0.75rem`. Nested elements within glass panels.
- **Dark Card (Level 1, Night Watch)**: `background: rgba(15,23,42,0.75)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.4)`, `border: 1px solid rgba(255,255,255,0.06)`.
- **Popup / Modal (Level 3)**: `box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)`. Used for map popups, drawers, modals. Highest elevation.
- **Alert Glow**: `box-shadow: 0 4px 15px rgba(230,122,50,0.3)`. Orange ambient glow under alert banners only.

### Named Rules

**The Blur-or-Nothing Rule.** A panel either uses `backdrop-filter: blur()` to reveal the map behind it, or it uses a fully opaque flat background with no blur. Never set a blurred background so opaque that the map is invisible; that defeats the entire glass architecture.

**The Bright Deck Exception.** In the Bright Deck theme, all glass effects are disabled (`--glass-blur: 0px`; `backdrop-filter: none`). In direct sunlight, frosted blur is imperceptible and wastes render budget. Replace with opaque white backgrounds and dark borders.

## 5. Components

### Buttons

The primary action color tracks the theme: Teal in Deep Ocean, Blue in Night Watch, Navy Blue in Bright Deck.

- **Shape:** Gently rounded (10px radius). Not pill-shaped; not squared. A nautical object, not a consumer app bubble.
- **Primary:** Background `#008d8d` (or theme-appropriate), text `#ffffff`, padding `8px 16px`. On hover: `#00a5a5`. Transition: `background-color 0.15s ease`.
- **Secondary:** Background `#074873`, text `#cbd5e1`, padding `8px 14px`. On hover: `#085a91`.
- **Ghost / Icon:** Transparent background, `rgba(255,255,255,0.15)` on hover. Used for map control buttons and toolbar actions.
- **Disabled:** 40% opacity, `cursor: not-allowed`. No color change.

### Glass Panels

The signature container. Used for all information overlays that float above the map.

- **Background:** `rgba(255,255,255,0.1)` (Deep Ocean/Night Watch); `rgba(255,255,255,0.92)` (Bright Deck, no blur)
- **Border:** `1px solid rgba(255,255,255,0.2)` (dark themes); `1px solid rgba(0,0,0,0.08)` (Bright Deck)
- **Blur:** `backdrop-filter: blur(12px)` (disabled in Bright Deck)
- **Radius:** 20px (`rounded-xl`)
- **Internal Padding:** 24px standard; 16px compact (used in sidebar panels and popups)

Night Watch variant: `background: rgba(15,23,42,0.75)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.4)`, `border: 1px solid rgba(255,255,255,0.06)`.

### Map Popups

Three distinct popup types with shared structure: minimal padding, dark glass background, rounded corners, no title bar.

- **Query Popup (tap/click):** `background: rgba(15,23,42,0.92)`, `border: 1px solid rgba(255,255,255,0.1)`, `border-radius: 14px`, `backdrop-filter: blur(16px)`, `padding: 14px 16px`.
- **Hover Mini-Popup:** Lighter treatment, `pointer-events: none`, `background: rgba(15,23,42,0.85)`, no border, `border-radius: 10px`, `padding: 8px 12px`.
- **Marina/Harbour Popup:** Richest variant; header section, divider, data rows, action buttons. `min-width: 240px`. Buttons use gradient fills (teal-to-green for phone, blue-to-cyan for website).

### Navigation

Two layouts: sidebar (desktop, ≥768px) and bottom bar (mobile). Shared treatment:

- **Nav Items:** `color: rgba(255,255,255,0.6)` at rest; `color: #ffffff` and `background: rgba(255,255,255,0.2)` when active.
- **Typography:** Title role (600, 1rem) for labels; Label role for secondary descriptions.
- **Active Transition:** `all 0.3s ease`. The transition is visible but not theatrical; 300ms ease is the outer limit.

### Data Cards / Dashboard Panels

Used for weather data, activity scores, forecast rows.

- **Background:** `var(--app-bg-card)` (theme-tracked).
- **Border:** `1px solid var(--app-border)`.
- **Radius:** 14px for standard cards; 10px for compact rows.
- **Internal Padding:** 16px standard.
- **Data Row:** Flexbox, `justify-content: space-between`. Label in Body/Muted role, value in Data (monospace) role.

### Inputs / Fields

- **Background:** `rgba(255,255,255,0.08)` (dark themes); `#f4f4f5` (Bright Deck).
- **Border:** `1px solid rgba(255,255,255,0.15)` at rest; `1px solid var(--teal-primary)` on focus.
- **Focus ring:** 2px offset `box-shadow: 0 0 0 2px rgba(0,141,141,0.4)`.
- **Radius:** 10px.
- **Padding:** `8px 12px`.

### Signature: Activity Score Chip

A compact pill combining a letter grade and numerical score. Used throughout the dashboard.

- **Background:** `rgba(X,Y,Z,0.15)` tinted by score tier (green for high, amber for marginal, red for low).
- **Text:** Score in Data role (monospace, 700); grade letter at Headline weight.
- **Radius:** 8px (compact).
- **No border.** Tinted background conveys status; a border would double the signal.

### Alert Banner

- **Background:** `linear-gradient(90deg, #e67a32 0%, #cd8b4e 100%)`.
- **Radius:** 12px.
- **Shadow:** `0 4px 15px rgba(230,122,50,0.3)` (orange ambient glow, purpose-built).
- **Content:** Icon left-aligned, text body, optional dismiss button. Never nests inside a glass panel; it floats above.

## 6. Do's and Don'ts

### Do:

- **Do** use `var(--app-bg-base)`, `var(--app-bg-card)`, `var(--app-border)`, and the other semantic tokens for every new component. Never hardcode `#0f172a` or `#082d5d` directly; the three-theme architecture requires every surface to track the active theme.
- **Do** use monospace (Data role) for all numerical instrument readouts: wind speed, wave height, bearing, coordinates, time, scores. Legibility under adverse conditions depends on tabular alignment.
- **Do** keep glassmorphism purposeful. `backdrop-filter: blur()` only on panels floating over the map where the map behind is visible. Opaque containers get flat backgrounds.
- **Do** disable glass effects in Bright Deck mode via the `--glass-blur: 0px` token and `backdrop-filter: none` override.
- **Do** respect `prefers-reduced-motion`. Particle animations and theme transitions must respond to the media query. The `* { transition: 0.2s }` global should be disabled or reduced.
- **Do** maintain WCAG AA contrast on all text in all three themes. White on Ocean Base (`#082d5d`) is the minimum bar; verify any new surface/text pairing before shipping.
- **Do** use the Alert Orange gradient only for genuine safety warnings (wind/wave threshold exceedances, hazard alerts). Its visual weight demands restraint.

### Don't:

- **Don't** build anything that looks like a generic SaaS dashboard. SeaYou is a marine instrument, not a project management tool. Flat white cards, purple accents, and the default Tailwind/shadcn aesthetic are explicitly prohibited. If it could be confused with Linear or Notion, rework it.
- **Don't** use consumer weather app visual patterns (Weather.com gradients, iOS weather bubbles, oversized weather icons as decoration). SeaYou users are practitioners who distrust data that looks simplified.
- **Don't** use glassmorphism decoratively. A glass panel with nothing visible behind it is just a blurry opaque box. If the map cannot breathe through the component, use a flat dark background.
- **Don't** use border-left greater than 1px as a colored stripe accent on cards, list items, or alerts. Use background tints, full borders, or leading icons instead.
- **Don't** use gradient text (`background-clip: text`). All text is a solid color from the token system.
- **Don't** add choreographed entrance animations, scroll-driven sequences, or bounce/elastic easing to any element. Motion in SeaYou is limited to state changes (hover, active, selection, data update). The particle animations on the map are the motion identity; the UI chrome must be still.
- **Don't** hardcode hex colors for any themed surface. Every component that changes between Deep Ocean, Night Watch, and Bright Deck must use the semantic CSS custom property tokens (`--app-bg-base`, `--text-primary`, `--bg-button`, etc.).
- **Don't** use legacy Navionics or Garmin desktop visual patterns (beveled chrome, blue-gradient title bars, Windows XP-era form controls). The reference is the instrument, not the instrument's 2010-era software wrapper.
- **Don't** introduce a fourth color role to the action color system. There are three action colors: Teal (Deep Ocean), Blue (Night Watch), Navy Blue (Bright Deck). No purple, no green, no red for actions.
- **Don't** use `overflow: hidden` on glass panels that float over the map. Clipping the blur boundary creates visible artifact edges. Use `border-radius` on the panel itself.
