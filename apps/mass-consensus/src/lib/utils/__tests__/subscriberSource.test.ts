import {
  resolveSubscriberSource,
  groupSubscribersBySource,
  SUBSCRIBER_SOURCE_ACTIVE,
  SUBSCRIBER_SOURCE_POST_CLOSE,
  RawSubscriberRecord,
} from '../subscriberSource';

describe('resolveSubscriberSource', () => {
  it('returns the active source for "mass-consensus"', () => {
    expect(resolveSubscriberSource('mass-consensus')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('returns the post-close source for "mass-consensus-closed"', () => {
    expect(resolveSubscriberSource('mass-consensus-closed')).toBe(
      SUBSCRIBER_SOURCE_POST_CLOSE
    );
  });

  it('defaults to active when input is undefined', () => {
    expect(resolveSubscriberSource(undefined)).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('defaults to active when input is null', () => {
    expect(resolveSubscriberSource(null)).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('defaults to active when input is an empty string', () => {
    expect(resolveSubscriberSource('')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('defaults to active for non-whitelisted strings', () => {
    expect(resolveSubscriberSource('something-else')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource('admin')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('defaults to active for non-string inputs', () => {
    expect(resolveSubscriberSource(42)).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource(true)).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource({})).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource([])).toBe(SUBSCRIBER_SOURCE_ACTIVE);
  });

  it('is case sensitive and rejects misformatted variants', () => {
    expect(resolveSubscriberSource('Mass-Consensus')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource(' mass-consensus ')).toBe(SUBSCRIBER_SOURCE_ACTIVE);
    expect(resolveSubscriberSource('mass-consensus-CLOSED')).toBe(
      SUBSCRIBER_SOURCE_ACTIVE
    );
  });
});

describe('groupSubscribersBySource', () => {
  it('returns empty groups for empty input', () => {
    const result = groupSubscribersBySource([]);
    expect(result).toEqual({
      activeEmails: [],
      closedEmails: [],
      allEmails: [],
      activeCount: 0,
      closedCount: 0,
    });
  });

  it('groups active subscribers (default source)', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'a@example.com', source: 'mass-consensus' },
      { email: 'b@example.com', source: 'mass-consensus' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['a@example.com', 'b@example.com']);
    expect(result.closedEmails).toEqual([]);
    expect(result.activeCount).toBe(2);
    expect(result.closedCount).toBe(0);
  });

  it('groups post-close subscribers', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'post@example.com', source: 'mass-consensus-closed' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual([]);
    expect(result.closedEmails).toEqual(['post@example.com']);
  });

  it('treats missing or unknown source as active', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'unknown@example.com' },
      { email: 'other@example.com', source: 'third-party' },
      { email: 'legacy@example.com', source: null },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails.sort()).toEqual([
      'legacy@example.com',
      'other@example.com',
      'unknown@example.com',
    ]);
    expect(result.closedEmails).toEqual([]);
  });

  it('separates mixed sources into two groups', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'active@example.com', source: 'mass-consensus' },
      { email: 'late@example.com', source: 'mass-consensus-closed' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['active@example.com']);
    expect(result.closedEmails).toEqual(['late@example.com']);
    expect(result.allEmails).toEqual(['active@example.com', 'late@example.com']);
  });

  it('lowercases emails before deduping', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'User@Example.com', source: 'mass-consensus' },
      { email: 'user@example.com', source: 'mass-consensus' },
      { email: 'USER@EXAMPLE.COM', source: 'mass-consensus' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['user@example.com']);
    expect(result.activeCount).toBe(1);
  });

  it('trims whitespace around emails', () => {
    const records: RawSubscriberRecord[] = [
      { email: '  padded@example.com  ', source: 'mass-consensus' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['padded@example.com']);
  });

  it('skips records without a valid email', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'valid@example.com', source: 'mass-consensus' },
      { email: '', source: 'mass-consensus' },
      { email: '   ', source: 'mass-consensus' },
      { email: undefined, source: 'mass-consensus' },
      { email: null, source: 'mass-consensus' },
      { email: 42, source: 'mass-consensus' },
      { email: {}, source: 'mass-consensus' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['valid@example.com']);
    expect(result.closedEmails).toEqual([]);
  });

  it('moves cross-group duplicates to the post-close group', () => {
    // Same person subscribed during the survey, then again after close.
    // Latest intent (post-close) wins so admins address them as the new
    // audience and don't double-count.
    const records: RawSubscriberRecord[] = [
      { email: 'both@example.com', source: 'mass-consensus' },
      { email: 'both@example.com', source: 'mass-consensus-closed' },
      { email: 'only-active@example.com', source: 'mass-consensus' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['only-active@example.com']);
    expect(result.closedEmails).toEqual(['both@example.com']);
    expect(result.activeCount).toBe(1);
    expect(result.closedCount).toBe(1);
  });

  it('returns both groups sorted alphabetically', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'zulu@example.com', source: 'mass-consensus' },
      { email: 'alpha@example.com', source: 'mass-consensus' },
      { email: 'mike@example.com', source: 'mass-consensus' },
      { email: 'yankee@example.com', source: 'mass-consensus-closed' },
      { email: 'bravo@example.com', source: 'mass-consensus-closed' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual([
      'alpha@example.com',
      'mike@example.com',
      'zulu@example.com',
    ]);
    expect(result.closedEmails).toEqual([
      'bravo@example.com',
      'yankee@example.com',
    ]);
    expect(result.allEmails).toEqual([
      'alpha@example.com',
      'bravo@example.com',
      'mike@example.com',
      'yankee@example.com',
      'zulu@example.com',
    ]);
  });

  it('unions allEmails without duplicates across groups', () => {
    // After moving cross-group duplicates to post-close, allEmails still
    // ends up unique because activeSet already had the duplicate removed.
    const records: RawSubscriberRecord[] = [
      { email: 'both@example.com', source: 'mass-consensus' },
      { email: 'both@example.com', source: 'mass-consensus-closed' },
    ];
    const result = groupSubscribersBySource(records);
    expect(result.allEmails).toEqual(['both@example.com']);
  });

  it('handles a realistic mixed dataset', () => {
    const records: RawSubscriberRecord[] = [
      { email: 'first@example.com', source: 'mass-consensus' },
      { email: 'first@example.com', source: 'mass-consensus' }, // in-group duplicate
      { email: 'Second@example.com', source: 'mass-consensus' }, // casing
      { email: 'third@example.com', source: 'mass-consensus-closed' },
      { email: 'first@example.com', source: 'mass-consensus-closed' }, // cross-group dup
      { email: '', source: 'mass-consensus' }, // invalid
      { email: undefined }, // invalid
    ];
    const result = groupSubscribersBySource(records);
    expect(result.activeEmails).toEqual(['second@example.com']);
    expect(result.closedEmails).toEqual(['first@example.com', 'third@example.com']);
    expect(result.activeCount).toBe(1);
    expect(result.closedCount).toBe(2);
    expect(result.allEmails).toEqual([
      'first@example.com',
      'second@example.com',
      'third@example.com',
    ]);
  });
});
