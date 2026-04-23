import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { HelpOverlay } from '../HelpOverlay';
import { useUIStore } from '@/stores/useUIStore';

function createMatchMedia(desktopMatches: boolean) {
  return (query: string) => ({
    matches: query === '(min-width: 1024px)' ? desktopMatches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

function stubDesktop() {
  vi.stubGlobal('matchMedia', createMatchMedia(true));
}

function stubMobile() {
  vi.stubGlobal('matchMedia', createMatchMedia(false));
}

describe('HelpOverlay', () => {
  beforeEach(() => {
    useUIStore.setState({ helpOverlayOpen: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('desktop viewport', () => {
    beforeEach(() => stubDesktop());

    it('renders nothing when helpOverlayOpen is false', () => {
      render(<HelpOverlay />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders the dialog with title and all expected shortcut rows when open', () => {
      useUIStore.setState({ helpOverlayOpen: true });
      render(<HelpOverlay />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeTruthy();

      expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();

      // Every shortcut description is rendered
      expect(screen.getByText('Move focus to next todo')).toBeTruthy();
      expect(screen.getByText('Move focus to previous todo')).toBeTruthy();
      expect(screen.getByText('Focus the add input')).toBeTruthy();
      expect(screen.getByText('Submit new todo')).toBeTruthy();
      expect(screen.getByText('Toggle complete on focused row')).toBeTruthy();
      expect(screen.getByText('Undo last delete')).toBeTruthy();
      expect(screen.getByText('Delete focused row')).toBeTruthy();
      expect(screen.getByText('Toggle this help')).toBeTruthy();
    });

    it('renders key glyphs inside <kbd> elements', () => {
      useUIStore.setState({ helpOverlayOpen: true });
      const { baseElement } = render(<HelpOverlay />);
      const kbds = baseElement.querySelectorAll('kbd');
      // 1+1+1+1+1+2+2+1 = 10 kbd elements total
      expect(kbds.length).toBe(10);

      const keyTexts = Array.from(kbds).map((k) => k.textContent);
      expect(keyTexts).toContain('j');
      expect(keyTexts).toContain('k');
      expect(keyTexts).toContain('n');
      expect(keyTexts).toContain('Enter');
      expect(keyTexts).toContain('Space');
      expect(keyTexts).toContain('Z');
      expect(keyTexts).toContain('Backspace');
      expect(keyTexts).toContain('?');
      // Cmd/Ctrl appears twice (Undo and Delete rows)
      expect(keyTexts.filter((t) => t === 'Cmd/Ctrl').length).toBe(2);
    });

    it('title references the dialog via aria-labelledby', () => {
      useUIStore.setState({ helpOverlayOpen: true });
      render(<HelpOverlay />);
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const title = document.getElementById(labelledBy!);
      expect(title?.textContent).toBe('Keyboard shortcuts');
    });
  });

  describe('mobile viewport', () => {
    beforeEach(() => stubMobile());

    it('renders nothing when helpOverlayOpen is false', () => {
      render(<HelpOverlay />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders nothing and resets helpOverlayOpen to false when it was somehow true', async () => {
      act(() => {
        useUIStore.setState({ helpOverlayOpen: true });
      });
      render(<HelpOverlay />);

      expect(screen.queryByRole('dialog')).toBeNull();

      await waitFor(() => {
        expect(useUIStore.getState().helpOverlayOpen).toBe(false);
      });
    });
  });
});
