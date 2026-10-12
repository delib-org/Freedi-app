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

describe('penState — parking unsent words when the teacher calls', () => {
	it('keeps a half-written first answer while the student is walked away, and brings it back', () => {
		const typing = typedInto(penFor(blankPen, 'item-story'), 'half a sen');

		const elsewhere = penFor(typing, 'item-needs');
		expect(elsewhere.text).toBe('');
		expect(elsewhere.parked).toEqual({ 'item-story': 'half a sen' });

		const back = penFor(elsewhere, 'item-story');
		expect(back.text).toBe('half a sen');
		expect(back.parked).toBeUndefined();
	});

	it('parks nothing for an empty box, and carries the park across several moves', () => {
		const empty = penFor(penFor(blankPen, 'item-story'), 'item-needs');
		expect(empty.parked).toBeUndefined();

		const typed = typedInto(penFor(blankPen, 'item-story'), 'my story');
		const atNeeds = typedInto(penFor(typed, 'item-needs'), 'my need');
		const atDelib = penFor(atNeeds, 'item-delib');
		expect(atDelib.parked).toEqual({ 'item-story': 'my story', 'item-needs': 'my need' });
		expect(penFor(atDelib, 'item-needs').text).toBe('my need');
	});

	it('a saved answer still wins over anything parked for that question', () => {
		const typed = typedInto(penFor(blankPen, 'item-story'), 'draft');
		const elsewhere = penFor(typed, 'item-needs');
		expect(penFor(elsewhere, 'item-story', story).text).toBe(story.statement);
	});
});
