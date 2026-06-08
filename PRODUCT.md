# Product

## Register

product

## Users

SeaYou serves a wide spectrum of water-sports and maritime users, unified by one moment: the pre-session decision. Who they are:

- **Recreational sailors, kiters, and surfers** — checking wind speed, swell height, and tide before heading out. Primarily on mobile, one-handed, often outdoors in bright light. They need a fast answer to "can I go?" and trust a number that is wrong will put them in danger.
- **Coastal professionals** — marina operators, dive instructors, sailing coaches, coastal guides. Need reliability, multi-day forecasting, and route planning. Mix of mobile and desktop.
- **Serious offshore navigators** — passage planning, voyage logging, MOB awareness. Desktop primary. Expect instrument-grade information density and unambiguous hierarchy.

Primary job to be done: **get a confident, fast, accurate read on current and upcoming marine conditions at a specific location.**

## Product Purpose

SeaYou is real-time marine weather intelligence built for the water. It combines GPU-accelerated particle animations that make wind and ocean currents visible on a live map, heatmap overlays (wave height, sea surface temperature, air temperature, precipitation, cloud cover), a persona-driven activity scoring engine, a safety-first route planner with waypoint navigation, voyage logging, and a full PWA with offline capability — all across 7 languages, desktop, mobile, and wearables.

Success looks like: a sailor opens the app, glances at the map, reads the wind particles + score, and makes the right call — in under 10 seconds, without consulting a second app.

## Brand Personality

**Precise · nautical · reliable · immersive**

SeaYou should feel like the best marine instrument you've ever used: it gives you information with confidence, not hedging. It does not entertain — it informs. The mood is the ocean at 0600 before a passage: focused, alive, serious.

Visual references: Garmin chartplotter UI density, Windy.com's dark-map-as-identity, PredictWind's professional-grade layout, Surfline's sport-native credibility, Savvy-Navvy's clean routing, the kinetic quality of foiling and offshore sailing photography (spray, speed, deep blue-green water).

## Anti-references

- **Generic SaaS dashboard** (Linear, Notion, shadcn defaults) — flat white cards, purple accents, rounded sans-serif everything. SeaYou must look nothing like a productivity tool.
- **Consumer weather apps** (iOS Weather, Weather.com) — dumbed-down simplicity built for mass market, no sport credibility.
- **Overly gamified dark mode** — Discord/cyberpunk neon-on-black, RGB glow effects. Dark here is nautical and purposeful, not aesthetic gamer.
- **Corporate maritime software** (old Navionics, legacy Garmin desktop) — dated, clunky 2010-era chart plotter UI patterns.

## Design Principles

1. **The map is the product.** The WebGL map and particle animations are the identity, not a background. Every chrome element — nav, panels, overlays — is a frame for the map. If a UI element competes with the map, the map wins.

2. **Instruments earn trust.** Information hierarchy and data precision matter more than decoration. A misread number on the water is a safety failure. Numerical data must be unambiguous: clear hierarchy, high contrast, no ambiguity between "21 kt" and "2.1 kt".

3. **Ambient, not alarming.** Real-time animations (particles, live updates) should make the environment feel alive — not trigger cognitive load. Motion serves information. Static states feel dead; over-animated states feel noisy. Find the calibration where the ocean breathes.

4. **Depth over decoration.** The palette and theme reflect the actual environment: deep ocean water at various light conditions. Dark mode is not aesthetic — it is functional for night passages, pre-dawn sessions, and bright-screen outdoor use where glare demands high contrast.

5. **Adaptive density.** The same data serves a navigator on a 27" desktop building a route and a kiter on a 5" phone with one hand free. Layout decisions must survive both contexts. Information density scales — it does not collapse to uselessness on mobile or expand to emptiness on desktop.

## Accessibility & Inclusion

- WCAG AA on all interactive elements (4.5:1 contrast ratio for normal text, 3:1 for large text and UI components)
- Support `prefers-reduced-motion` — particle animations are the visual identity but must be pausable for users with vestibular disorders
- All map controls keyboard-accessible
- Color is never the sole carrier of safety-critical information (wind speed bands, warning states must also use iconography or text)
