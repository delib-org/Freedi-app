/**
 * Pictures an admin drops into a survey's own pages (an explanation page's
 * hero, a picture inside its markdown). They live under the survey, not under
 * a statement, so the card-image helpers do not fit as they are.
 */

import { CARD_IMAGE } from '@/constants/common';
import type { CardImageType } from './cardImage';

const EXTENSIONS: Record<CardImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Accepted types, for a file input's `accept`. */
export const SURVEY_IMAGE_ACCEPT = CARD_IMAGE.ALLOWED_TYPES.join(',');

/**
 * Where a survey page picture lives: surveys/{surveyId}/images/, with a fresh
 * name per upload so a replaced picture is never served from a stale cache.
 */
export function buildSurveyImagePath(surveyId: string, type: CardImageType, now: number): string {
  const randomId = Math.random().toString(36).substring(2, 9);

  return `surveys/${surveyId}/images/${now}-${randomId}.${EXTENSIONS[type]}`;
}

/** The alt text for a dropped file: its name without the extension, capped. */
export function altFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, CARD_IMAGE.ALT_MAX_LENGTH);
}

/**
 * Put a markdown image at the caret, on its own line, and say where the
 * caret should land afterwards (right after the inserted image).
 */
export function insertMarkdownImage(
  content: string,
  caret: number,
  url: string,
  alt: string
): { content: string; caret: number } {
  const at = Math.max(0, Math.min(caret, content.length));
  const before = content.slice(0, at);
  const after = content.slice(at);
  const image = `![${alt.replace(/[[\]]/g, '')}](${url})`;

  const leadIn = before.length === 0 || before.endsWith('\n') ? '' : '\n';
  const leadOut = after.length === 0 || after.startsWith('\n') ? '' : '\n';
  const inserted = `${leadIn}${image}${leadOut}`;

  return {
    content: `${before}${inserted}${after}`,
    caret: before.length + leadIn.length + image.length,
  };
}
