/**
 * DEV-ONLY badge — makes a mock-auth session impossible to mistake for a real one.
 * Rendered only under `import.meta.env.DEV` (see index.tsx), so it is tree-shaken
 * out of the production bundle. Pure presentational, no props, no context.
 */
import React from 'react';
import { DEV_MOCK_MARKER } from './mockAuth';

export function DevModeBadge() {
  return (
    <div
      data-dev-mock-auth={DEV_MOCK_MARKER}
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 2147483647,
        background: 'rgba(220,38,38,0.92)',
        color: '#fff',
        font: '600 11px system-ui, -apple-system, sans-serif',
        letterSpacing: '0.02em',
        padding: '4px 8px',
        borderRadius: 6,
        pointerEvents: 'none',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      DEV MODE — mock auth
    </div>
  );
}
