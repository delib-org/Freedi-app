import { describe, expect, it } from 'vitest';
import { DEFAULT_GATE } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import {
	SIDE_CLAIM_MAX_LENGTH,
	SIDE_NAME_MAX_LENGTH,
	SIDE_QUESTION_MAX_LENGTH,
	gateOf,
	sideClaimsOf,
	sideNamesOf,
	sideQuestionOf,
} from '../classSettings';

function stmt(partial: Record<string, unknown>): Statement {
	return partial as unknown as Statement;
}

describe('gateOf', () => {
	it('defaults to DEFAULT_GATE', () => {
		expect(gateOf(null)).toBe(DEFAULT_GATE);
		expect(gateOf(undefined, null)).toBe(DEFAULT_GATE);
	});

	it('reads the challenge first, then the main statement', () => {
		const challenge = stmt({ votingSettings: { threshold: 0.5 } });
		const main = stmt({ votingSettings: { threshold: 0.3 } });
		expect(gateOf(challenge, main)).toBe(0.5);
		expect(gateOf(stmt({}), main)).toBe(0.3);
		expect(gateOf(null, main)).toBe(0.3);
	});

	it('ignores values that are not finite numbers', () => {
		expect(gateOf(stmt({ votingSettings: { threshold: 'x' } }))).toBe(DEFAULT_GATE);
		expect(gateOf(stmt({ votingSettings: { threshold: Number.NaN } }))).toBe(DEFAULT_GATE);
	});
});

describe('sideNamesOf', () => {
	it('uses the lesson names, trimmed and capped', () => {
		const long = 'x'.repeat(SIDE_NAME_MAX_LENGTH + 5);
		const names = sideNamesOf(stmt({ statementSettings: { sideNames: { a: '  Dan ', b: long } } }));
		expect(names.a).toBe('Dan');
		expect(names.b).toHaveLength(SIDE_NAME_MAX_LENGTH);
	});

	it('falls back to the translated defaults', () => {
		const names = sideNamesOf(stmt({}));
		expect(names.a).not.toBe('');
		expect(names.b).not.toBe('');
		expect(names.a).not.toBe(names.b);
	});
});

describe('sideQuestionOf', () => {
	it('uses the lesson question, trimmed and capped', () => {
		expect(
			sideQuestionOf(stmt({ statementSettings: { sideQuestion: '  Must Roni invite Dor? ' } })),
		).toBe('Must Roni invite Dor?');
		const long = 'q'.repeat(SIDE_QUESTION_MAX_LENGTH + 5);
		expect(sideQuestionOf(stmt({ statementSettings: { sideQuestion: long } }))).toHaveLength(
			SIDE_QUESTION_MAX_LENGTH,
		);
	});

	it('falls back to the translated default when empty or absent', () => {
		const fallback = sideQuestionOf(stmt({}));
		expect(fallback).not.toBe('');
		expect(sideQuestionOf(stmt({ statementSettings: { sideQuestion: '   ' } }))).toBe(fallback);
		expect(sideQuestionOf(null)).toBe(fallback);
	});
});

describe('sideClaimsOf', () => {
	it('reads each claim, trimmed and capped', () => {
		const long = 'c'.repeat(SIDE_CLAIM_MAX_LENGTH + 5);
		const claims = sideClaimsOf(
			stmt({ statementSettings: { sideClaims: { a: ' Must invite ', b: long } } }),
		);
		expect(claims.a).toBe('Must invite');
		expect(claims.b).toHaveLength(SIDE_CLAIM_MAX_LENGTH);
	});

	it('is null per side when empty or absent', () => {
		expect(sideClaimsOf(stmt({}))).toEqual({ a: null, b: null });
		expect(
			sideClaimsOf(stmt({ statementSettings: { sideClaims: { a: '', b: 'Allowed not to' } } })),
		).toEqual({
			a: null,
			b: 'Allowed not to',
		});
	});
});
