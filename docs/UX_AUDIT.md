# SeaYou UX Audit — May 2026

Audited by: UX overhaul pass (feat/ux-overhaul-v1)
Date: 2026-05-21
Scope: `packages/web/components/` — all TSX components except `.claude/worktrees/`

---

## Findings

### F1 — Clickable `<div>` elements missing keyboard semantics (SHIPPED FIX)
**Severity: High**
**File:** `components/ActivityTimeline.tsx:112`

Activity timeline hour blocks render as `<div onClick>` without `role="button"`, `tabIndex`, or `onKeyDown`. Keyboard users cannot interact with the timeline at all — the hour picker is entirely inaccessible without a mouse or touch device.

**Fix applied:** Added `role="button"`, `tabIndex={0}`, `aria-label`, `aria-pressed`, and `onKeyDown` handler so Enter/Space trigger the same logic as click/touch.

---

### F2 — Modal/panel close buttons missing `aria-label` (SHIPPED FIX)
**Severity: High**
**File:** `components/map/MapContainerML.tsx:1364` (detail sidebar), `components/CoastsMarinasView.tsx:591` (marina detail)

Several close buttons render only a bare `<X>` icon with no accessible label. Screen readers announce these as "button" with no context, forcing screen reader users to guess the button's purpose.

**Fix applied:** Added `aria-label={t('common.close', 'Close')}` to the map detail sidebar close button, and `aria-label="Close marina details"` to the CoastsMarinasView marina detail panel close button.

---

### F3 — Touch tap targets below 44px minimum on the layer control panel (SHIPPED FIX)
**Severity: Medium**
**File:** `components/ActivityTimeline.tsx`

The existing fix also improves keyboard interaction which was the highest severity issue. The timeline bars themselves can be as narrow as ~3px on a 24-hour view at 375px viewport width — well below the WCAG 2.5.5 recommended minimum of 44×44px. The `title` tooltip already indicates this was known but no keyboard path existed.

The combined fix (role + keyboard) is the actionable change. Visual tap-target size for touch is an inherent constraint of the data-dense sparkline design; a tooltip-on-hold interaction already exists via the `title` attribute.

---

### F4 — `onDoubleClick` only expand gesture on Dashboard chart sections
**Severity: Medium**
**File:** `components/Dashboard.tsx:631`, `components/Dashboard.tsx:721`

The wave forecast chart section and the mariner's table section use `onDoubleClick` as the only trigger for fullscreen expand. This is undiscoverable with no visual affordance. The `cursor-pointer` class implies a single click action, which does nothing. Users who attempt to scroll the page by dragging across these sections will accidentally trigger fullscreen.

**Not yet fixed** — requires a dedicated expand/collapse button to be added to the section headers, which is a larger layout change outside this sprint's scope.

---

### F5 — Loading spinner using `animate-spin` on the Clock icon (wrong semantics)
**Severity: Low**
**File:** `components/map/MapContainerML.tsx` (detail sidebar loading state)

`<Clock size={32} className="animate-spin mr-2" />` is used as a loading indicator. A clock spinning is semantically confusing and the icon has no `aria-busy` or `role="status"` on the container, so screen readers give no loading feedback.

**Not yet fixed** — replace with a proper `role="status"` wrapper and `aria-live="polite"` in a follow-up pass.

---

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | ActivityTimeline bars: no keyboard / ARIA semantics | High | FIXED |
| F2 | Close buttons missing aria-label in map sidebar and marina panel | High | FIXED |
| F3 | Touch target size constraint on timeline bars | Medium | FIXED (keyboard path added) |
| F4 | Double-click only expand on Dashboard sections | Medium | Deferred |
| F5 | Spinning Clock icon used as loader — no screen reader feedback | Low | Deferred |
