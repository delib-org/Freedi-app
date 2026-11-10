import { needsProgressRebuild } from '../questionProgressHealth';

const counters = (evaluated: number, options: number) => ({ evaluated, options });

describe('needsProgressRebuild', () => {
	it('rebuilds a question with activity and no counters', () => {
		expect(needsProgressRebuild(null, { raters: 300, answers: 0 })).toBe(true);
		expect(needsProgressRebuild(null, { raters: 0, answers: 2 })).toBe(true);
	});

	it('leaves a question with no activity and no counters alone', () => {
		expect(needsProgressRebuild(null, { raters: 0, answers: 0 })).toBe(false);
	});

	it('rebuilds counters far behind the question', () => {
		expect(needsProgressRebuild(counters(0, 40), { raters: 300, answers: 40 })).toBe(true);
		expect(needsProgressRebuild(counters(300, 2), { raters: 300, answers: 40 })).toBe(true);
	});

	it('tolerates the small lag of a live question', () => {
		expect(needsProgressRebuild(counters(9, 10), { raters: 10, answers: 11 })).toBe(false);
		expect(needsProgressRebuild(counters(270, 40), { raters: 300, answers: 40 })).toBe(false);
	});

	it('rebuilds just past the tolerance', () => {
		expect(needsProgressRebuild(counters(269, 40), { raters: 300, answers: 40 })).toBe(true);
		expect(needsProgressRebuild(counters(0, 0), { raters: 2, answers: 0 })).toBe(true);
	});

	it('never reads one person adding many answers as a problem', () => {
		expect(needsProgressRebuild(counters(5, 50), { raters: 5, answers: 50 })).toBe(false);
	});
});
