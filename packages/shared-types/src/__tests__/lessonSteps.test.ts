import { safeParse } from 'valibot';
import { CLASS_BATCH_SIZE, LessonPlanSchema, LessonStepKeySchema } from '../index';

/** IA 19: 'allProposals' joins the step keys; lessons stored with 8 steps keep parsing. */

const OLD_STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
const NEW_STEPS = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'allProposals',
	'vote',
	'summary',
];

describe('lesson step keys', () => {
	it('accepts allProposals as a step key', () => {
		expect(safeParse(LessonStepKeySchema, 'allProposals').success).toBe(true);
	});

	it('still parses an old 8-step plan sitting at Vote', () => {
		const parsed = safeParse(LessonPlanSchema, { steps: OLD_STEPS, stepIndex: 6 });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.output.steps[parsed.output.stepIndex]).toBe('vote');
	});

	it('parses the new 9-step plan', () => {
		const parsed = safeParse(LessonPlanSchema, { steps: NEW_STEPS, stepIndex: 6 });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.output.steps[parsed.output.stepIndex]).toBe('allProposals');
	});

	it('serves six proposals at a time', () => {
		expect(CLASS_BATCH_SIZE).toBe(6);
	});
});
