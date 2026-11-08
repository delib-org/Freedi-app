import { pieceTextOf, piecesMeetSubmissionRules } from '../splitPieces';

describe('pieceTextOf', () => {
  it('submits a piece as "title: description"', () => {
    expect(pieceTextOf({ title: 'More trees', description: 'Plant them on Herzl St.' })).toBe(
      'More trees: Plant them on Herzl St.',
    );
  });
});

describe('piecesMeetSubmissionRules', () => {
  const MIN_CHARS = 3;

  it('accepts pieces when the question has no word minimum', () => {
    const check = piecesMeetSubmissionRules(['Trees: on Herzl St.', 'Roads: fix the potholes'], {
      minChars: MIN_CHARS,
    });

    expect(check).toEqual({ ok: true, rejected: [] });
  });

  it('treats a minimum of 0 or undefined as no minimum', () => {
    const texts = ['a: b'];

    expect(piecesMeetSubmissionRules(texts, { minWords: 0, minChars: 1 }).ok).toBe(true);
    expect(piecesMeetSubmissionRules(texts, { minWords: undefined, minChars: 1 }).ok).toBe(true);
  });

  it('rejects a piece under the question word minimum, naming its index', () => {
    // The whole submission clears a 6-word minimum; the second piece does not.
    const check = piecesMeetSubmissionRules(
      ['Trees: plant more of them downtown', 'Roads: fix them'],
      { minWords: 6, minChars: MIN_CHARS },
    );

    expect(check.ok).toBe(false);
    expect(check.rejected).toEqual([1]);
  });

  it('rejects a piece shorter than the character minimum', () => {
    const check = piecesMeetSubmissionRules(['ok', 'a proper suggestion'], { minChars: 5 });

    expect(check.ok).toBe(false);
    expect(check.rejected).toEqual([0]);
  });

  it('ignores surrounding whitespace when counting words', () => {
    const check = piecesMeetSubmissionRules(['   Trees: plant more   '], {
      minWords: 3,
      minChars: MIN_CHARS,
    });

    expect(check.ok).toBe(true);
  });

  it('does not let padding pass the character minimum', () => {
    // 6 raw characters, 2 once trimmed — the server trims before measuring.
    const check = piecesMeetSubmissionRules(['  ab  '], { minChars: 4 });

    expect(check.ok).toBe(false);
    expect(check.rejected).toEqual([0]);
  });

  it('counts Hebrew words the same way', () => {
    const check = piecesMeetSubmissionRules(['עצים: לשתול עוד ברחוב הרצל', 'כבישים: לתקן'], {
      minWords: 4,
      minChars: MIN_CHARS,
    });

    expect(check.ok).toBe(false);
    expect(check.rejected).toEqual([1]);
  });

  it('reports every failing piece, not just the first', () => {
    const check = piecesMeetSubmissionRules(['a: b', 'fine: this one is long enough', 'c: d'], {
      minWords: 5,
      minChars: MIN_CHARS,
    });

    expect(check.rejected).toEqual([0, 2]);
  });
});
