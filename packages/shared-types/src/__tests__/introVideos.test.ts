// The package's setup mocks valibot; these tests need the real schema checks.
jest.unmock('valibot');

import { safeParse } from 'valibot';
import { LessonPlanSchema, StatementSettingsSchema } from '../index';

const STEPS = ['waiting', 'opening'] as const;

describe('StatementSettingsSchema introVideos', () => {
	it('accepts an ordered list of {id, title, url}', () => {
		const parsed = safeParse(StatementSettingsSchema, {
			introVideos: [{ id: 'a', title: 'One', url: 'https://youtu.be/abcDEF12345' }],
		});
		expect(parsed.success).toBe(true);
	});

	it('still accepts the deprecated videoUrl and a lesson with neither', () => {
		expect(
			safeParse(StatementSettingsSchema, { videoUrl: 'https://x.test/a.mp4' }).success,
		).toBe(true);
		expect(safeParse(StatementSettingsSchema, {}).success).toBe(true);
	});

	it('refuses a video without a url', () => {
		const parsed = safeParse(StatementSettingsSchema, {
			introVideos: [{ id: 'a', title: 'One' }],
		});
		expect(parsed.success).toBe(false);
	});
});

describe('LessonPlanSchema projectorVideoId', () => {
	it('accepts a video id, null (the text) and absence', () => {
		for (const projectorVideoId of ['v1', null, undefined]) {
			const parsed = safeParse(LessonPlanSchema, {
				steps: [...STEPS],
				stepIndex: 1,
				projectorVideoId,
			});
			expect(parsed.success).toBe(true);
		}
	});

	it('refuses a non-string id', () => {
		const parsed = safeParse(LessonPlanSchema, {
			steps: [...STEPS],
			stepIndex: 1,
			projectorVideoId: 3,
		});
		expect(parsed.success).toBe(false);
	});
});
