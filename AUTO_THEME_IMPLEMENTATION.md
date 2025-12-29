# Automatic Theme Switching Implementation

## Overview
Successfully implemented automatic theme switching based on time of day (Issue #7). The theme now automatically switches between light and dark modes based on sunrise/sunset times or simple time-based logic, while always respecting manual user preferences.

## Features Implemented

### 1. Automatic Theme Detection
- **Smart Detection**: Uses actual sunrise/sunset times from weather data when available
- **Fallback Logic**: Falls back to simple time-based detection (6 AM - 6 PM = light mode) when weather data is unavailable
- **Real-time Updates**: Theme automatically updates every minute to detect sunrise/sunset transitions

### 2. User Preference Management
- **Manual Override**: When users click the theme toggle button, their preference is saved and auto-switching is disabled
- **Persistent Storage**: Uses localStorage to track both theme preference and manual override flag
- **Seamless Experience**: Auto-switching only applies on initial load for new users or those who haven't manually set a theme

### 3. Weather Data Integration
- Integrates with existing weather data to get accurate sunrise/sunset times
- Automatically updates when location changes (new sunrise/sunset times)
- Works with both `general.sunrise/sunset` and `daily.sunrise[0]/sunset[0]` data structures

## Technical Implementation

### Files Modified

#### 1. `packages/web/src/contexts/ThemeContext.tsx`
**Key Changes:**
- Added `setAutoThemeData()` function to receive sunrise/sunset times
- Added `getAutoTheme()` function for smart day/night detection
- Added `isManualTheme()` and `setManualThemeFlag()` for preference tracking
- Added auto-update effect that checks theme every minute
- Modified `setTheme()` and `toggleTheme()` to mark theme as manually set

**New Functions:**
```typescript
function getAutoTheme(sunrise?: string, sunset?: string): ResolvedTheme
function isManualTheme(): boolean
function setManualThemeFlag(isManual: boolean): void
setAutoThemeData(sunrise?: string, sunset?: string): void
```

**Storage Keys:**
- `seayou-theme`: Stores the current theme preference
- `seayou-manual-theme`: Tracks whether user has manually overridden the theme

#### 2. `packages/web/App.tsx`
**Key Changes:**
- Added `setAutoThemeData` from useTheme hook
- Added useEffect to pass sunrise/sunset data from weather to theme context
- Automatically updates when weather data changes

### Logic Flow

```
1. App Loads
   ├─> Check if user has manual theme preference
   │   ├─> YES: Use stored preference (auto-switching disabled)
   │   └─> NO: Use auto theme based on time
   │
2. Auto Theme Determination
   ├─> Weather data available with sunrise/sunset?
   │   ├─> YES: Use actual sunrise/sunset times
   │   └─> NO: Use simple 6 AM - 6 PM rule
   │
3. User Toggles Theme
   ├─> Set manual theme flag = true
   ├─> Save theme preference
   └─> Disable auto-switching
   │
4. Every Minute (if auto-switching enabled)
   └─> Re-check if theme should change based on time
```

### Time Detection Logic

**With Weather Data:**
```typescript
if (currentTime >= sunrise && currentTime < sunset) {
  theme = 'light';  // Daytime
} else {
  theme = 'dark';   // Nighttime
}
```

**Without Weather Data:**
```typescript
const hour = new Date().getHours();
theme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
```

## User Experience

### First-Time Users
1. App loads and automatically detects time of day
2. Shows light theme during day (6 AM - 6 PM or sunrise to sunset)
3. Shows dark theme during night
4. Theme updates automatically as time passes

### After Manual Toggle
1. User clicks theme toggle button
2. App saves their preference and disables auto-switching
3. Theme stays as user selected, even if time changes
4. Preference persists across sessions

### Resetting to Auto Mode
Users can reset to auto mode by:
1. Clearing browser localStorage for the site
2. Or by removing the `seayou-manual-theme` key specifically

## Testing Recommendations

### Manual Testing
1. **Initial Load Test**: Clear localStorage and reload - verify theme matches time of day
2. **Toggle Test**: Click theme toggle - verify preference is saved
3. **Persistence Test**: Reload page after toggling - verify manual preference persists
4. **Time Update Test**: Wait for auto-update (or manually change system time) - verify theme updates when in auto mode
5. **Location Change Test**: Change location - verify sunrise/sunset times update

### Automated Testing
Consider adding tests for:
- `getAutoTheme()` with and without sunrise/sunset data
- `isManualTheme()` flag persistence
- Theme resolution logic
- Auto-update interval behavior

## Browser Compatibility

The implementation uses:
- `localStorage`: Supported in all modern browsers
- `Date` objects: Universal support
- `setInterval`: Universal support
- ES6+ syntax: Requires transpilation for older browsers (already handled by Vite)

## Performance Considerations

- Auto-update interval runs every 60 seconds (only when auto-switching is enabled)
- Minimal performance impact: just a time comparison every minute
- No external API calls for time detection
- localStorage operations are synchronous but very fast

## Future Enhancements

Potential improvements:
1. **User Settings UI**: Add a settings panel where users can:
   - Choose between auto/light/dark modes
   - Re-enable auto-switching after manual override
   - Customize auto-switching hours

2. **Transition Effects**: Add smooth CSS transitions when theme changes

3. **Notification**: Show a subtle notification when theme auto-switches

4. **Advanced Scheduling**: Allow users to set custom theme schedules

5. **Location-Based**: Automatically detect user's timezone for more accurate fallback

## Notes

- The implementation is backward compatible - existing users with manual theme preferences won't see any changes
- Auto-switching only affects new users or users without saved preferences
- The feature respects user privacy - no external services or tracking
- Sunrise/sunset times come from existing weather API, no additional API calls needed
