import { describe, expect, it } from 'vitest';
import {
	formatDialogue,
	formatLines,
	formatValues,
	megabytes,
	parseDialogue,
	parseLines,
	parseValues,
	saveErrorKey,
} from '../scenarioEditor';

describe('parseLines / formatLines', () => {
	it('keeps one entry per non-blank line', () => {
		expect(parseLines('one\n\n  \ntwo')).toEqual(['one', 'two']);
	});

	it('round-trips a stored list', () => {
		const lines = ['one', 'two'];
		expect(parseLines(formatLines(lines))).toEqual(lines);
	});

	it('formats a missing list as an empty box', () => {
		expect(formatLines(undefined)).toBe('');
	});

	it('drops the trailing empty line, which is why the box must keep its own draft', () => {
		// "one" + Enter is "one\n": the stored list is still ["one"], so a box that
		// re-rendered from the list would lose the new line the teacher just made
		expect(formatLines(parseLines('one\n'))).toBe('one');
	});
});

describe('parseValues / formatValues', () => {
	const previous = [{ valueId: 'v-a', label: 'Focus', description: 'Attention' }];

	it('splits label and description on the first bar and keeps the rest', () => {
		expect(parseValues('Trust | Teachers | trust the class', [], 0)).toEqual([
			{ valueId: 'val-0-0', label: 'Trust', description: 'Teachers | trust the class' },
		]);
	});

	it('keeps an existing value id by position and gives new ones a stable id', () => {
		const values = parseValues('Focus | Attention\nTrust | Safety', previous, 1);
		expect(values.map((value) => value.valueId)).toEqual(['v-a', 'val-1-1']);
	});

	it('tolerates a line with no description yet', () => {
		expect(parseValues('Focus', previous, 0)[0]).toMatchObject({ label: 'Focus', description: '' });
	});

	it('round-trips', () => {
		expect(parseValues(formatValues(previous), previous, 0)).toEqual(previous);
	});
});

describe('parseDialogue / formatDialogue', () => {
	it('reads "speaker: line" and keeps colons inside the line', () => {
		expect(parseDialogue('Rivka: hello: world\nNoa: hi')).toEqual([
			{ speaker: 'Rivka', line: 'hello: world' },
			{ speaker: 'Noa', line: 'hi' },
		]);
	});

	it('waits on a line with no colon instead of storing a half line', () => {
		expect(parseDialogue('Rivka: hello\nNoa')).toEqual([{ speaker: 'Rivka', line: 'hello' }]);
	});

	it('round-trips', () => {
		const lines = [{ speaker: 'Rivka', line: 'hello' }];
		expect(parseDialogue(formatDialogue(lines))).toEqual(lines);
	});
});

describe('saveErrorKey', () => {
	it('names a refused write, a lost session and a lost connection separately', () => {
		expect(saveErrorKey({ code: 'permission-denied' })).toBe('editor.save_err_denied');
		expect(saveErrorKey({ code: 'unauthenticated' })).toBe('editor.save_err_signin');
		expect(saveErrorKey({ code: 'unavailable' })).toBe('editor.save_err_network');
		expect(saveErrorKey({ code: 'deadline-exceeded' })).toBe('editor.save_err_network');
		expect(saveErrorKey({ code: 'not-found' })).toBe('editor.save_err_missing');
	});

	it('reads a callable code the same way', () => {
		expect(saveErrorKey({ code: 'functions/permission-denied' })).toBe('editor.save_err_denied');
	});

	it('falls back to a general message, never to silence', () => {
		expect(saveErrorKey(new Error('boom'))).toBe('editor.save_err');
		expect(saveErrorKey(undefined)).toBe('editor.save_err');
		expect(saveErrorKey({ code: 'something-new' })).toBe('editor.save_err');
	});
});

describe('megabytes', () => {
	it('rounds a limit to whole megabytes', () => {
		expect(megabytes(5 * 1024 * 1024)).toBe(5);
		expect(megabytes(300 * 1024 * 1024)).toBe(300);
	});
});
