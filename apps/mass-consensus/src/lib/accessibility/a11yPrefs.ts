import { ACCESSIBILITY } from '@/constants/common';

export type A11yTheme = (typeof ACCESSIBILITY.THEMES)[number];

export interface A11yPrefs {
  theme: A11yTheme;
  highContrast: boolean;
  /** Root font-size in percent — one of ACCESSIBILITY.FONT_SCALE_STEPS */
  fontScale: number;
}

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  theme: ACCESSIBILITY.DEFAULT_THEME,
  highContrast: false,
  fontScale: ACCESSIBILITY.DEFAULT_FONT_SCALE,
};

const FONT_STEPS: readonly number[] = ACCESSIBILITY.FONT_SCALE_STEPS;

function isTheme(value: unknown): value is A11yTheme {
  return typeof value === 'string' && (ACCESSIBILITY.THEMES as readonly string[]).includes(value);
}

/** Snap any number to the nearest allowed font-scale step. */
export function clampFontScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ACCESSIBILITY.DEFAULT_FONT_SCALE;
  }

  return FONT_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best
  );
}

/** Move one step up (+1) or down (-1) the font-scale ladder. */
export function stepFontScale(current: number, direction: 1 | -1): number {
  const index = FONT_STEPS.indexOf(clampFontScale(current));
  const next = Math.min(FONT_STEPS.length - 1, Math.max(0, index + direction));

  return FONT_STEPS[next];
}

/** Read the cookie value; anything malformed falls back to defaults. */
export function parseA11yCookie(raw: string | undefined | null): A11yPrefs {
  if (!raw) return { ...DEFAULT_A11Y_PREFS };

  try {
    const data: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_A11Y_PREFS };
    const record = data as Record<string, unknown>;

    return {
      theme: isTheme(record.theme) ? record.theme : DEFAULT_A11Y_PREFS.theme,
      highContrast: record.highContrast === true,
      fontScale: clampFontScale(record.fontScale),
    };
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

export function serializeA11yCookie(prefs: A11yPrefs): string {
  return encodeURIComponent(
    JSON.stringify({
      theme: prefs.theme,
      highContrast: prefs.highContrast,
      fontScale: clampFontScale(prefs.fontScale),
    })
  );
}

/** Attributes for <html>, shared by the server render and the client update. */
export function a11yHtmlAttributes(prefs: A11yPrefs): {
  'data-theme': A11yTheme;
  'data-contrast': 'high' | 'normal';
  fontSize: string | undefined;
} {
  const fontScale = clampFontScale(prefs.fontScale);

  return {
    'data-theme': prefs.theme,
    'data-contrast': prefs.highContrast ? 'high' : 'normal',
    fontSize: fontScale === ACCESSIBILITY.DEFAULT_FONT_SCALE ? undefined : `${fontScale}%`,
  };
}

/** Apply prefs to the live document and persist them in the cookie. */
export function applyA11yPrefs(doc: Document, prefs: A11yPrefs): void {
  const attrs = a11yHtmlAttributes(prefs);
  const root = doc.documentElement;
  root.dataset.theme = attrs['data-theme'];
  root.dataset.contrast = attrs['data-contrast'];
  root.style.fontSize = attrs.fontSize ?? '';

  doc.cookie = `${ACCESSIBILITY.COOKIE}=${serializeA11yCookie(prefs)}; path=/; max-age=${ACCESSIBILITY.COOKIE_MAX_AGE_S}; samesite=lax`;
}
