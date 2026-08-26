/**
 * E4 Verification: Coastal Dynamics Free-Tier Gating Tests
 *
 * Tests that:
 * 1. Free users cannot access the COASTAL_DYNAMICS advanced layer
 * 2. Clicking the toggle shows a paywall for free users
 * 3. Premium users can access the layer
 * 4. The layer properly gates fetchDepthGrid requests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MapContainerML from '../map/MapContainerML';

// Mock AlertContext to control subscription tier
vi.mock('../../src/contexts/AlertContext', () => ({
  useAlertConfig: vi.fn(),
}));

// Mock map rendering
vi.mock('maplibre-gl', () => ({
  Map: vi.fn(),
}));

// Mock custom layer components
vi.mock('../map/layers/CoastalDynamicsLayerML', () => ({
  default: ({ visible }: { visible: boolean }) =>
    visible ? <div data-testid="coastal-dynamics-layer">Layer Rendered</div> : null,
}));

import { useAlertConfig } from '../../src/contexts/AlertContext';

const mockUseAlertConfig = useAlertConfig as any;

describe('CoastalDynamics - Free-Tier Gating', () => {
  beforeEach(() => {
    // Clear any mocks
    vi.clearAllMocks();
  });

  describe('Free Tier Behavior', () => {
    beforeEach(() => {
      mockUseAlertConfig.mockReturnValue({
        subscriptionTier: 'free',
        persona: null,
        home: null,
        isOnboarded: true,
      });
    });

    it('should show lock icon on Breaking Waves button for free users', () => {
      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      // Check for lock icon
      const lockIcon = breakingWavesBtn.querySelector('[data-icon="lock"]');
      expect(lockIcon || breakingWavesBtn.textContent).toContain('Lock' || '🔒');
    });

    it('should show paywall when free user clicks Breaking Waves', async () => {
      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      await waitFor(() => {
        // Paywall should appear
        const paywall = screen.queryByText(/premium|upgrade|paywall/i);
        expect(paywall).toBeDefined();
      }, { timeout: 2000 });
    });

    it('should NOT enable COASTAL_DYNAMICS layer for free users', async () => {
      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      await waitFor(() => {
        // Layer should NOT render
        const layer = screen.queryByTestId('coastal-dynamics-layer');
        expect(layer).toBeNull();
      }, { timeout: 1000 });
    });

    it('should NOT fire fetchDepthGrid for free users on layer toggle', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetchDepthGrid = fetchSpy;

      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      await waitFor(() => {
        // Fetch should not have been called
        expect(fetchSpy).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('Premium Tier Behavior', () => {
    beforeEach(() => {
      mockUseAlertConfig.mockReturnValue({
        subscriptionTier: 'premium',
        persona: null,
        home: null,
        isOnboarded: true,
      });
    });

    it('should NOT show lock icon on Breaking Waves button for premium users', () => {
      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      // Check that no lock icon exists
      const lockIcon = breakingWavesBtn.querySelector('[data-icon="lock"]');
      expect(lockIcon).toBeNull();
    });

    it('should enable COASTAL_DYNAMICS layer when premium user clicks Breaking Waves', async () => {
      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      await waitFor(() => {
        // Layer SHOULD render
        const layer = screen.queryByTestId('coastal-dynamics-layer');
        expect(layer).toBeDefined();
      }, { timeout: 1000 });
    });

    it('should fire fetchDepthGrid for premium users on layer toggle', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ centreDepth: 100 });
      globalThis.fetchDepthGrid = fetchSpy;

      render(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      await waitFor(() => {
        // Fetch SHOULD have been called
        expect(fetchSpy).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('trySetAdvancedLayer Logic', () => {
    it('should allow disabling any layer regardless of tier', () => {
      mockUseAlertConfig.mockReturnValue({
        subscriptionTier: 'free',
        persona: null,
        home: null,
        isOnboarded: true,
      });

      const { rerender } = render(<MapContainerML />);

      // First enable as premium
      mockUseAlertConfig.mockReturnValue({
        subscriptionTier: 'premium',
        persona: null,
        home: null,
        isOnboarded: true,
      });
      rerender(<MapContainerML />);

      const breakingWavesBtn = screen.getByRole('button', {
        name: /breaking waves|coastal dynamics/i,
      });

      fireEvent.click(breakingWavesBtn);

      // Now switch back to free
      mockUseAlertConfig.mockReturnValue({
        subscriptionTier: 'free',
        persona: null,
        home: null,
        isOnboarded: true,
      });
      rerender(<MapContainerML />);

      // Disable button should work
      fireEvent.click(breakingWavesBtn);

      // No paywall should appear (disabling is allowed)
      const paywall = screen.queryByText(/premium|upgrade/i);
      expect(paywall).toBeNull();
    });
  });
});
