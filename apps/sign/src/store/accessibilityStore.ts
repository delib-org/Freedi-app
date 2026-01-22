/**
 * Zustand store for accessibility preferences (IS 5568 compliance)
 * Persists settings to localStorage for user convenience
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSizeLevel = 'normal' | 'large' | 'larger' | 'largest';
export type ContrastMode = 'default' | 'high-light' | 'high-dark';

export interface AccessibilityState {
  // Font size settings
  fontSize: FontSizeLevel;
  setFontSize: (size: FontSizeLevel) => void;

  // Contrast mode
  contrastMode: ContrastMode;
  setContrastMode: (mode: ContrastMode) => void;

  // Reduce motion / stop animations
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;

  // Accessibility panel open state
  isPanelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;

  // Keyboard shortcuts modal
  isKeyboardModalOpen: boolean;
  openKeyboardModal: () => void;
  closeKeyboardModal: () => void;

  // Reset all settings to defaults
  resetSettings: () => void;
}

// Font size scale values (CSS font-size multipliers)
export const FONT_SIZE_SCALE: Record<FontSizeLevel, number> = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
  largest: 1.5,
};

// CSS class names for each font size level
export const FONT_SIZE_CLASSES: Record<FontSizeLevel, string> = {
  normal: 'a11y-text-normal',
  large: 'a11y-text-large',
  larger: 'a11y-text-larger',
  largest: 'a11y-text-largest',
};

// CSS class names for contrast modes
export const CONTRAST_CLASSES: Record<ContrastMode, string> = {
  default: '',
  'high-light': 'a11y-contrast-light',
  'high-dark': 'a11y-contrast-dark',
};

const DEFAULT_STATE = {
  fontSize: 'normal' as FontSizeLevel,
  contrastMode: 'default' as ContrastMode,
  reduceMotion: false,
  isPanelOpen: false,
  isKeyboardModalOpen: false,
};

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      // Font size
      fontSize: DEFAULT_STATE.fontSize,
      setFontSize: (size) => set({ fontSize: size }),

      // Contrast mode
      contrastMode: DEFAULT_STATE.contrastMode,
      setContrastMode: (mode) => set({ contrastMode: mode }),

      // Reduce motion
      reduceMotion: DEFAULT_STATE.reduceMotion,
      setReduceMotion: (value) => set({ reduceMotion: value }),

      // Panel state (not persisted)
      isPanelOpen: DEFAULT_STATE.isPanelOpen,
      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      closePanel: () => set({ isPanelOpen: false }),

      // Keyboard modal (not persisted)
      isKeyboardModalOpen: DEFAULT_STATE.isKeyboardModalOpen,
      openKeyboardModal: () => set({ isKeyboardModalOpen: true }),
      closeKeyboardModal: () => set({ isKeyboardModalOpen: false }),

      // Reset
      resetSettings: () => set({
        fontSize: DEFAULT_STATE.fontSize,
        contrastMode: DEFAULT_STATE.contrastMode,
        reduceMotion: DEFAULT_STATE.reduceMotion,
      }),
    }),
    {
      name: 'accessibility-preferences',
      // Only persist the preference values, not UI state
      partialize: (state) => ({
        fontSize: state.fontSize,
        contrastMode: state.contrastMode,
        reduceMotion: state.reduceMotion,
      }),
    }
  )
);

// Selectors
export const selectFontSize = (state: AccessibilityState) => state.fontSize;
export const selectContrastMode = (state: AccessibilityState) => state.contrastMode;
export const selectReduceMotion = (state: AccessibilityState) => state.reduceMotion;
export const selectIsPanelOpen = (state: AccessibilityState) => state.isPanelOpen;

// Helper to get current CSS classes based on accessibility state
export const getAccessibilityClasses = (state: AccessibilityState): string => {
  const classes: string[] = [];

  if (state.fontSize !== 'normal') {
    classes.push(FONT_SIZE_CLASSES[state.fontSize]);
  }

  if (state.contrastMode !== 'default') {
    classes.push(CONTRAST_CLASSES[state.contrastMode]);
  }

  if (state.reduceMotion) {
    classes.push('a11y-reduce-motion');
  }

  return classes.join(' ');
};
