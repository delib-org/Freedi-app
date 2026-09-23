/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_A11Y_PREFS,
  a11yHtmlAttributes,
  applyA11yPrefs,
  clampFontScale,
  parseA11yCookie,
  serializeA11yCookie,
  stepFontScale,
} from '../a11yPrefs';
import { ACCESSIBILITY } from '@/constants/common';

describe('a11yPrefs', () => {
  describe('clampFontScale', () => {
    it('keeps allowed steps', () => {
      expect(clampFontScale(125)).toBe(125);
    });

    it('snaps to the nearest step', () => {
      expect(clampFontScale(118)).toBe(112.5);
      expect(clampFontScale(400)).toBe(150);
      expect(clampFontScale(10)).toBe(87.5);
    });

    it('falls back to the default for non-numbers', () => {
      expect(clampFontScale('big')).toBe(ACCESSIBILITY.DEFAULT_FONT_SCALE);
      expect(clampFontScale(Number.NaN)).toBe(ACCESSIBILITY.DEFAULT_FONT_SCALE);
      expect(clampFontScale(undefined)).toBe(ACCESSIBILITY.DEFAULT_FONT_SCALE);
    });
  });

  describe('stepFontScale', () => {
    it('moves one step up and down', () => {
      expect(stepFontScale(100, 1)).toBe(112.5);
      expect(stepFontScale(100, -1)).toBe(87.5);
    });

    it('stops at both ends', () => {
      expect(stepFontScale(150, 1)).toBe(150);
      expect(stepFontScale(87.5, -1)).toBe(87.5);
    });
  });

  describe('parseA11yCookie / serializeA11yCookie', () => {
    it('round-trips prefs', () => {
      const prefs = { theme: 'dark' as const, highContrast: true, fontScale: 125 };
      expect(parseA11yCookie(serializeA11yCookie(prefs))).toEqual(prefs);
    });

    it('returns defaults for missing or malformed input', () => {
      expect(parseA11yCookie(undefined)).toEqual(DEFAULT_A11Y_PREFS);
      expect(parseA11yCookie('')).toEqual(DEFAULT_A11Y_PREFS);
      expect(parseA11yCookie('%7Bnot json')).toEqual(DEFAULT_A11Y_PREFS);
      expect(parseA11yCookie(encodeURIComponent('"a string"'))).toEqual(DEFAULT_A11Y_PREFS);
    });

    it('sanitises each field on its own', () => {
      const raw = encodeURIComponent(
        JSON.stringify({ theme: 'neon', highContrast: 'yes', fontScale: 131 })
      );
      expect(parseA11yCookie(raw)).toEqual({
        theme: DEFAULT_A11Y_PREFS.theme,
        highContrast: false,
        fontScale: 125,
      });
    });
  });

  describe('a11yHtmlAttributes', () => {
    it('omits the font size at the default scale', () => {
      expect(a11yHtmlAttributes(DEFAULT_A11Y_PREFS)).toEqual({
        'data-theme': DEFAULT_A11Y_PREFS.theme,
        'data-contrast': 'normal',
        fontSize: undefined,
      });
    });

    it('maps contrast and scale', () => {
      const attrs = a11yHtmlAttributes({ theme: 'system', highContrast: true, fontScale: 150 });
      expect(attrs['data-contrast']).toBe('high');
      expect(attrs.fontSize).toBe('150%');
    });
  });

  describe('applyA11yPrefs', () => {
    it('writes attributes to <html> and saves the cookie', () => {
      applyA11yPrefs(document, { theme: 'dark', highContrast: true, fontScale: 112.5 });
      const root = document.documentElement;
      expect(root.dataset.theme).toBe('dark');
      expect(root.dataset.contrast).toBe('high');
      expect(root.style.fontSize).toBe('112.5%');
      expect(document.cookie).toContain(`${ACCESSIBILITY.COOKIE}=`);

      applyA11yPrefs(document, DEFAULT_A11Y_PREFS);
      expect(root.style.fontSize).toBe('');
      expect(root.dataset.contrast).toBe('normal');
    });
  });
});
