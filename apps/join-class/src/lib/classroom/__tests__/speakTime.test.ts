import { describe, expect, it } from 'vitest';
import { lessonSpeakMs, tableSpeakMs } from '../speakTime';

const SECOND = 1000;

describe('lessonSpeakMs', () => {
	it('is two minutes when the lesson sets nothing', () => {
		expect(lessonSpeakMs(null)).toBe(120 * SECOND);
		expect(lessonSpeakMs({ statementSettings: {} })).toBe(120 * SECOND);
	});

	it("follows the lesson's choice", () => {
		expect(lessonSpeakMs({ statementSettings: { speakSeconds: 30 } })).toBe(30 * SECOND);
		expect(lessonSpeakMs({ statementSettings: { speakSeconds: 300 } })).toBe(300 * SECOND);
	});
});

describe('tableSpeakMs', () => {
	const lesson = { statementSettings: { speakSeconds: 180 } };

	it('keeps the length the server wrote with the running turn', () => {
		expect(tableSpeakMs({ speakerMs: 60 * SECOND }, lesson)).toBe(60 * SECOND);
	});

	it('falls back to the lesson setting for a table without speakerMs', () => {
		expect(tableSpeakMs({}, lesson)).toBe(180 * SECOND);
	});

	it('ignores a nonsense speakerMs', () => {
		expect(tableSpeakMs({ speakerMs: 0 }, lesson)).toBe(180 * SECOND);
	});
});
