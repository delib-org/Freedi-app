/**
 * Helpers for a submission the AI split into several separate answers.
 *
 * A split piece is submitted through the same route as any other suggestion,
 * so it faces the same server-side rules: the minimum character length and the
 * question's optional `minResponseWords`. The original submission passing those
 * rules says nothing about the pieces — "Build a park and fix the roads" is 7
 * words, each half is 3 — so pieces are checked before we submit them
 * automatically, and the participant keeps the preview when they would fail.
 */

import { countWords } from './wordCount';

/** The text one detected piece is submitted as. */
export function pieceTextOf(piece: { title: string; description: string }): string {
  return `${piece.title}: ${piece.description}`;
}

export interface PieceSubmissionRules {
  /** The question's minimum word count; undefined or <= 0 means no minimum. */
  minWords?: number;
  /** Shortest accepted text, in characters. */
  minChars: number;
}

export interface PieceSubmissionCheck {
  /** Every piece would be accepted. */
  ok: boolean;
  /** Indexes of the pieces that would be refused. */
  rejected: number[];
}

/**
 * Whether every piece would survive the submit route's validation. Used to
 * decide if a split can be submitted without asking: pieces that would 400 are
 * better shown in the preview, where they can be edited or merged back, than
 * sent one by one into a failure.
 */
export function piecesMeetSubmissionRules(
  texts: string[],
  { minWords, minChars }: PieceSubmissionRules,
): PieceSubmissionCheck {
  const hasWordMinimum = typeof minWords === 'number' && minWords > 0;

  const rejected = texts.reduce<number[]>((failing, text, index) => {
    const trimmed = text.trim();
    const tooShort = trimmed.length < minChars;
    const tooFewWords = hasWordMinimum && countWords(trimmed) < (minWords as number);

    if (tooShort || tooFewWords) failing.push(index);

    return failing;
  }, []);

  return { ok: rejected.length === 0, rejected };
}
