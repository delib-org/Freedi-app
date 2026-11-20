import { describe, expect, it } from 'vitest';
import { isolate } from '../bidi';

describe('isolate', () => {
	it('wraps the text in a first-strong isolate and nothing else', () => {
		expect(isolate('Why phones?')).toBe('⁨Why phones?⁩');
	});

	it('keeps the text itself intact, so it can still be read back', () => {
		expect(isolate('למה?').replace(/[⁨⁩]/g, '')).toBe('למה?');
	});
});
