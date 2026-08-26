import type { StudioPlanMessage } from '@freedi/shared-types';

jest.mock('../../../db', () => ({ db: {} }));

import { buildHistory, openerFor } from '../planPrompt';

function msg(role: 'user' | 'assistant', content: string): StudioPlanMessage {
	return { role, content, createdAt: 1 };
}

describe('planPrompt', () => {
	it('keeps the original problem statement and the recent window when truncating', () => {
		const messages: StudioPlanMessage[] = [msg('assistant', 'opener'), msg('user', 'ORIGINAL')];
		for (let i = 0; i < 30; i++) {
			messages.push(msg(i % 2 === 0 ? 'assistant' : 'user', `turn ${i}`));
		}
		messages.push(msg('user', 'LATEST'));
		const history = buildHistory('SYSTEM', messages, 'CONTEXT');
		expect(history[0]).toEqual({ role: 'system', content: 'SYSTEM' });
		expect(history[1]).toEqual({ role: 'user', content: 'ORIGINAL' });
		expect(history[2].content).toBe('[earlier turns omitted]');
		expect(history[history.length - 1]).toEqual({ role: 'user', content: 'LATEST' });
		expect(history[history.length - 2]).toEqual({ role: 'user', content: 'CONTEXT' });
		// system + original + marker + 16 recent + context + latest
		expect(history).toHaveLength(21);
	});

	it('does not truncate short conversations', () => {
		const messages = [
			msg('assistant', 'opener'),
			msg('user', 'hi'),
			msg('assistant', 'a'),
			msg('user', 'b'),
		];
		const history = buildHistory('S', messages, 'C');
		expect(history.map((m) => m.content)).toEqual(['S', 'opener', 'hi', 'a', 'C', 'b']);
	});

	it('localizes the opener with an English fallback', () => {
		expect(openerFor('he')).toMatch(/ספרו/);
		expect(openerFor('xx')).toBe(openerFor('en'));
	});
});
