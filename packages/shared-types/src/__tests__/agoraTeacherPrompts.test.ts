import { applyTeacherPrompts, AgoraStage } from '../index';
import type { AgoraStagePlanItem, AgoraTeacherPromptMap } from '../index';

const round = (itemId: string, kind: 'story' | 'needs' | 'vision'): AgoraStagePlanItem => ({
	itemId,
	stage: AgoraStage.question,
	kind,
});

const wording = (title: string, explanation: string) => ({ title, explanation, updatedAt: 1 });

describe('applyTeacherPrompts', () => {
	const prompts: AgoraTeacherPromptMap = {
		needs: wording('What do you actually need?', 'Not a solution — a need.'),
	};

	it('fills a blank round of the matching kind', () => {
		const plan = applyTeacherPrompts([round('a', 'needs')], prompts);

		expect(plan[0].title).toBe('What do you actually need?');
		expect(plan[0].explanation).toBe('Not a solution — a need.');
	});

	it('leaves rounds of other kinds alone', () => {
		const plan = applyTeacherPrompts([round('a', 'story')], prompts);

		expect(plan[0].title).toBeUndefined();
	});

	it('never overwrites wording typed for this game', () => {
		const typed = { ...round('a', 'needs'), title: 'Ours', explanation: 'Our hint' };
		const plan = applyTeacherPrompts([typed], prompts);

		expect(plan[0].title).toBe('Ours');
		expect(plan[0].explanation).toBe('Our hint');
	});

	it('fills only the half that is blank', () => {
		const plan = applyTeacherPrompts([{ ...round('a', 'needs'), title: 'Ours' }], prompts);

		expect(plan[0].title).toBe('Ours');
		expect(plan[0].explanation).toBe('Not a solution — a need.');
	});

	it('never touches an open question — it has no shared prompt', () => {
		const open: AgoraStagePlanItem = {
			itemId: 'q',
			stage: AgoraStage.question,
			kind: 'open',
			title: 'Ours',
		};
		const plan = applyTeacherPrompts([open], { open: wording('nope', 'nope') });

		expect(plan[0].title).toBe('Ours');
	});

	it('passes the plan through when the teacher has saved nothing', () => {
		const plan = applyTeacherPrompts([round('a', 'needs')], undefined);

		expect(plan[0].title).toBeUndefined();
	});

	it('leaves non-question stages exactly as they were', () => {
		const item: AgoraStagePlanItem = { itemId: 'd', stage: AgoraStage.deliberation };
		const plan = applyTeacherPrompts([item], prompts);

		expect(plan[0]).toBe(item);
	});
});
