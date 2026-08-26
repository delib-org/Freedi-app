import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { StudioPlanMessage } from '@freedi/shared-types';
import PlanChat, { type PlanChatProps } from '../components/PlanChat';

const messages: StudioPlanMessage[] = [
	{ role: 'assistant', content: 'What is the challenge?', createdAt: 1 },
	{ role: 'user', content: 'Budget priorities', createdAt: 2 },
];

function renderChat(props: Partial<PlanChatProps> = {}) {
	const onSend = vi.fn();
	const onRetry = vi.fn();
	const utils = render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<PlanChat
				messages={messages}
				phase="chatting"
				waitingSince={null}
				failedMessage={null}
				error={null}
				onSend={onSend}
				onRetry={onRetry}
				{...props}
			/>
		</TranslationProvider>,
	);

	return { onSend, onRetry, ...utils };
}

describe('PlanChat', () => {
	afterEach(cleanup);

	it('renders the turns in a live log with You / Consultant prefixes', () => {
		renderChat();
		const log = screen.getByRole('log');
		expect(log.getAttribute('aria-live')).toBe('polite');
		expect(log.textContent).toContain('Consultant:');
		expect(log.textContent).toContain('You:');
		expect(screen.getByText('Budget priorities').getAttribute('dir')).toBe('auto');
	});

	it('Enter sends the trimmed draft and clears it; Shift+Enter does not send', () => {
		const { onSend } = renderChat();
		const field = screen.getByLabelText(/message to the consultant/i) as HTMLTextAreaElement;
		fireEvent.change(field, { target: { value: '  Hello there  ' } });
		fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
		expect(onSend).not.toHaveBeenCalled();
		fireEvent.keyDown(field, { key: 'Enter' });
		expect(onSend).toHaveBeenCalledWith('Hello there');
		expect(field.value).toBe('');
	});

	it('never sends an empty draft', () => {
		const { onSend } = renderChat();
		const field = screen.getByLabelText(/message to the consultant/i);
		fireEvent.change(field, { target: { value: '   ' } });
		fireEvent.keyDown(field, { key: 'Enter' });
		expect(onSend).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /send/i }).hasAttribute('disabled')).toBe(true);
	});

	it('is disabled and shows the typing indicator while waiting', () => {
		renderChat({ phase: 'waiting', waitingSince: Date.now() });
		expect(screen.getByLabelText(/message to the consultant/i).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('status').textContent).toMatch(/thinking/i);
	});

	it('offers Retry on a failed turn', () => {
		const { onRetry } = renderChat({ failedMessage: 'Again', error: 'Could not reach' });
		expect(screen.getByRole('alert').textContent).toContain('Could not reach');
		fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('prefills the composer from a draft seed', () => {
		renderChat({ draftSeed: { text: 'Change "Town hall": ', key: 1 } });
		const field = screen.getByLabelText(/message to the consultant/i) as HTMLTextAreaElement;
		expect(field.value).toBe('Change "Town hall": ');
	});
});
