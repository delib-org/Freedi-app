import { describe, it, expect } from 'vitest';
import { blankPen, penFor, typedInto, type Pen } from '../flows/penState';

const story = { statementId: 's1', statement: 'I hate being told what to do' };

describe('penState', () => {
	it('starts empty', () => {
		expect(penFor(blankPen, 'item-story')).toEqual({ text: '', itemId: 'item-story', from: '' });
	});

	it('keeps what the student typed across redraws', () => {
		const typing = typedInto(penFor(blankPen, 'item-story'), 'half a sen');

		expect(penFor(typing, 'item-story')).toBe(typing);
		expect(penFor(typing, 'item-story').text).toBe('half a sen');
	});

	it('empties the box when the room moves to the next question', () => {
		const typed = typedInto(penFor(blankPen, 'item-story'), story.statement);

		const next = penFor(typed, 'item-needs');

		expect(next.text).toBe('');
		expect(next.itemId).toBe('item-needs');
	});

	it('does not carry a SAVED answer into the next question either', () => {
		const afterSaving = penFor(penFor(blankPen, 'item-story'), 'item-story', story);
		expect(afterSaving.text).toBe(story.statement);

		expect(penFor(afterSaving, 'item-needs').text).toBe('');
	});

	it('pre-fills with my own saved answer, so re-opening a question shows it', () => {
		const filled = penFor(penFor(blankPen, 'item-story'), 'item-story', story);

		expect(filled.text).toBe(story.statement);
		expect(filled.from).toBe('s1:I hate being told what to do');
	});

	it('pre-fills once, so an edit in progress is not overwritten every redraw', () => {
		const filled = penFor(penFor(blankPen, 'item-story'), 'item-story', story);
		const editing = typedInto(filled, 'I hate being told what to do — usually');

		expect(penFor(editing, 'item-story', story)).toBe(editing);
	});

	it('re-fills when the saved text itself changes (my save landed)', () => {
		const filled = penFor(penFor(blankPen, 'item-story'), 'item-story', story);
		const saved = { statementId: 's1', statement: 'I hate being told what to do!' };

		expect(penFor(filled, 'item-story', saved).text).toBe(saved.statement);
	});

	it('leaving a question and coming back shows what I saved, not what I abandoned', () => {
		const abandoned = typedInto(penFor(blankPen, 'item-story', story), 'never sent');
		const elsewhere = penFor(abandoned, 'item-needs');

		const back: Pen = penFor(elsewhere, 'item-story', story);

		expect(back.text).toBe(story.statement);
	});
});
