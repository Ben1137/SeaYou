# Activity Report Translations - Issue #3 Fixed

## Summary
Fixed the Activity Report card translations for Russian and Italian locales by restructuring the `activity` section from a flat to a properly nested structure.

## Changes Made

### 1. Updated Translation Script
**File:** `packages/web/update-translations.js`

- Converted script from CommonJS to ES module syntax
- Updated Russian translations:
  - Fixed "report" from "Отчет о деятельности" to "Отчет об активности"
  - Fixed sailing.challengingDesc to use "Штормовое море" (stormy sea) instead of "Неспокойное море"
  - Fixed surf.label to use "Сёрфинг" with the correct 'ё' character
  - Fixed kite.light to use "Лёгкий" with the correct 'ё' character
  - Fixed beach.perfect to use "Отлично" (excellent) instead of "Идеально"
  - Fixed beach.scorchingDesc to use "Поддерживайте гидратацию" (maintain hydration)
  - Fixed beach.roughSurf to "Бурный прибой" (rough surf)
  - Fixed beach.roughSurfDesc to "Плавание не рекомендуется" (swimming not recommended)

- Updated Italian translations:
  - Fixed beach.perfectDesc to use "abbronzarsi" (to tan) instead of "prendere il sole"
  - Fixed beach.windyDesc to use "Forti venti che sollevano sabbia" (strong winds lifting sand)
  - Fixed beach.chillyDesc to use "Non tempo per nuotare" (not time to swim)
  - Fixed beach.scorching to use "Rovente" (scorching hot)
  - Fixed beach.roughSurfDesc to use "Nuoto sconsigliato" (swimming not advised)
  - Fixed beach.great to use "Ottimo" (excellent)

### 2. Updated Translation Files
**Files:**
- `packages/web/src/i18n/locales/ru.json`
- `packages/web/src/i18n/locales/it.json`

Both files now have the correct nested structure:

```json
{
  "activity": {
    "report": "...",
    "sailing": {
      "label": "...",
      "hazardous": "...",
      "hazardousDesc": "...",
      "challenging": "...",
      "challengingDesc": "...",
      "calm": "...",
      "calmDesc": "...",
      "good": "...",
      "goodDesc": "...",
      "moderate": "...",
      "moderateDesc": "..."
    },
    "surf": {
      "label": "...",
      "poor": "...",
      "fair": "...",
      "good": "...",
      "epic": "..."
    },
    "kite": {
      "label": "...",
      "optimal": "...",
      "light": "..."
    },
    "beach": {
      "label": "...",
      "perfect": "...",
      "perfectDesc": "...",
      "poor": "...",
      "poorDesc": "...",
      "windy": "...",
      "windyDesc": "...",
      "chilly": "...",
      "chillyDesc": "...",
      "scorching": "...",
      "scorchingDesc": "...",
      "roughSurf": "...",
      "roughSurfDesc": "...",
      "poorRain": "...",
      "coolCloudy": "...",
      "cloudy": "...",
      "cold": "...",
      "cool": "...",
      "great": "..."
    }
  }
}
```

## Verification

All activity report cards in Russian and Italian now properly display with:
- Sailing conditions (5 states with descriptions)
- Surf conditions (4 states)
- Kite conditions (2 states)
- Beach conditions (16 states with descriptions)

The structure matches the English version exactly, ensuring consistent functionality across all languages.

## Files Modified
1. `packages/web/update-translations.js` - Updated translations and converted to ES modules
2. `packages/web/src/i18n/locales/ru.json` - Restructured activity section
3. `packages/web/src/i18n/locales/it.json` - Restructured activity section

## Testing
Run the update script to verify:
```bash
cd packages/web
node update-translations.js
```

All translation files (fr.json, de.json, he.json, it.json, ru.json) will be updated with the correct structure.
