import { describe, expect, it } from 'vitest';
import type { TextRow } from '../flows/moderationQueue';
import {
	groupByQuestion,
	rowsOfStudent,
	runsOf,
	searchRows,
	summarizeStudents,
} from '../flows/writingGroups';
import { quote } from '../flows/writingContext';

function line(overrides: Partial<TextRow>): TextRow {
	return {
		statementId: 'x',
		kind: 'answer',
		authorUid: 'a',
		anonName: 'Alpha',
		text: 'words',
		createdAt: 1,
		lastUpdate: 1,
		hidden: false,
		editedByTeacher: false,
		contextKey: 'q:1',
		contextOrder: 1,
		...overrides,
	};
}

const rows: TextRow[] = [
	line({ statementId: 'a2', createdAt: 20, contextKey: 'square', contextOrder: 4 }),
	line({ statementId: 'a1', createdAt: 10 }),
	line({ statementId: 'b1', authorUid: 'b', anonName: 'Beta', createdAt: 30, hidden: true }),
	line({
		statementId: 'b2',
		authorUid: 'b',
		anonName: 'Beta',
		createdAt: 5,
		contextKey: 'q:2',
		contextOrder: 2,
	}),
];

describe('writing lenses', () => {
	it("lists one student's path oldest first", () => {
		expect(rowsOfStudent(rows, 'a').map((r) => r.statementId)).toEqual(['a1', 'a2']);
	});

	it('summarizes students, latest writer first, removed last, even with no lines', () => {
		const list = summarizeStudents(rows, { c: 'Gamma', a: 'Alpha' });
		expect(list.map((s) => s.uid)).toEqual(['b', 'a', 'c']);
		expect(list[0]).toMatchObject({ count: 2, hiddenCount: 1, removed: false });
		expect(list[1].removed).toBe(true);
		expect(list[2]).toMatchObject({ count: 0, anonName: 'Gamma' });
	});

	it('groups by place in lesson order', () => {
		const groups = groupByQuestion(rows);
		expect(groups.map((g) => g.key)).toEqual(['q:1', 'q:2', 'square']);
		expect(groups[0].rows.map((r) => r.statementId)).toEqual(['a1', 'b1']);
	});

	it('cuts runs where the place changes', () => {
		const runs = runsOf(rowsOfStudent(rows, 'a'));
		expect(runs.map((r) => r.contextKey)).toEqual(['q:1', 'square']);
	});

	it('searches text, pseudonym and real name', () => {
		const withText = [line({ statementId: 't', text: 'Green PARK' }), ...rows];
		const real = (uid: string): string | undefined => (uid === 'b' ? 'Dana Levi' : undefined);
		expect(searchRows(withText, ' park ', real).map((r) => r.statementId)).toEqual(['t']);
		expect(searchRows(withText, 'dana', real)).toHaveLength(2);
		expect(searchRows(withText, 'alpha', real)).toHaveLength(3);
		expect(searchRows(withText, '', real)).toHaveLength(withText.length);
	});

	it('quotes long words with an ellipsis', () => {
		expect(quote('short')).toBe('short');
		expect(quote('x'.repeat(60), 10)).toBe('xxxxxxxxx…');
	});
});
