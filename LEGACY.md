# SeaYou — Legacy Versions

## The Leaflet Era (v1.0)

The original SeaYou shipped on Leaflet + leaflet-velocity, with Canvas 2D heatmaps and
runtime GeoJSON land masking. It deployed to https://ben1137.github.io/SeaYou1.0/ and
proved the persona-driven concept.

That codebase lives on as `archive/leaflet-v1` and tag `v1.0-leaflet-final`. It is
preserved unchanged as a memorial — the first verse. Do not delete, do not rebase,
do not force-push.

- Branch: [`archive/leaflet-v1`](../../tree/archive/leaflet-v1)
- Tag: `v1.0-leaflet-final`
- Tag commit: `48e4fa0` (2026-01-22)
- GitHub Pages deployment: https://ben1137.github.io/SeaYou1.0/ (still live)

## The WebGL / MapLibre Era (v2.x — current)

Started: 2026-03-04 (commit `a3f8829`: "feat: complete webgl marine engine, remove
leaflet, add rate limiting"). Goal: GPGPU particles, stencil masking, sub-second
load, 60 fps with 256k particles. This is what `main` is today.
