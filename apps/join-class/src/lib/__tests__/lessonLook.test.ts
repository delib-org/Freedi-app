import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import { StatementSettingsSchema } from '@freedi/shared-types';
import { LOOK_ATTRIBUTE, applyLessonLook, applyLessonLookOf } from '../lessonLook';
import type { LookTarget } from '../lessonLook';

function fakeRoot(): LookTarget & { attrs: Map<string, string> } {
	const attrs = new Map<string, string>();

	return {
		attrs,
		setAttribute: (name, value) => void attrs.set(name, value),
		removeAttribute: (name) => void attrs.delete(name),
	};
}

describe('applyLessonLookOf', () => {
	it('leaves the attribute off when the lesson has no look (game)', () => {
		const root = fakeRoot();
		applyLessonLookOf(root, { statementSettings: {} });
		expect(root.attrs.has(LOOK_ATTRIBUTE)).toBe(false);
		applyLessonLookOf(root, null);
		expect(root.attrs.has(LOOK_ATTRIBUTE)).toBe(false);
	});

	it('sets data-look="solid" for a solid lesson', () => {
		const root = fakeRoot();
		applyLessonLookOf(root, { statementSettings: { lessonLook: 'solid' } });
		expect(root.attrs.get(LOOK_ATTRIBUTE)).toBe('solid');
	});

	it('removes the attribute when the lesson switches back to game', () => {
		const root = fakeRoot();
		applyLessonLook(root, 'solid');
		applyLessonLookOf(root, { statementSettings: { lessonLook: 'game' } });
		expect(root.attrs.has(LOOK_ATTRIBUTE)).toBe(false);
	});
});

describe('StatementSettingsSchema.lessonLook', () => {
	it('is optional and accepts both looks', () => {
		expect(safeParse(StatementSettingsSchema, {}).success).toBe(true);
		expect(safeParse(StatementSettingsSchema, { lessonLook: 'solid' }).success).toBe(true);
		expect(safeParse(StatementSettingsSchema, { lessonLook: 'game' }).success).toBe(true);
	});

	it('refuses an unknown look', () => {
		expect(safeParse(StatementSettingsSchema, { lessonLook: 'neon' }).success).toBe(false);
	});
});

describe('StatementSettingsSchema.tableSize', () => {
	it('is optional (old lessons parse) and accepts 2..8', () => {
		expect(safeParse(StatementSettingsSchema, {}).success).toBe(true);
		expect(safeParse(StatementSettingsSchema, { tableSize: 2 }).success).toBe(true);
		expect(safeParse(StatementSettingsSchema, { tableSize: 6 }).success).toBe(true);
		expect(safeParse(StatementSettingsSchema, { tableSize: 8 }).success).toBe(true);
	});

	it('refuses out-of-range and fractional sizes', () => {
		expect(safeParse(StatementSettingsSchema, { tableSize: 1 }).success).toBe(false);
		expect(safeParse(StatementSettingsSchema, { tableSize: 9 }).success).toBe(false);
		expect(safeParse(StatementSettingsSchema, { tableSize: 3.5 }).success).toBe(false);
	});
});
