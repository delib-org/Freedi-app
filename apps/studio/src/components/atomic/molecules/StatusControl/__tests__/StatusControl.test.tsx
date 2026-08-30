import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { StatusControl, type StatusControlProps } from '../index';

function renderControl(props: Partial<StatusControlProps> = {}) {
	const onChange = vi.fn<(next: 'open' | 'frozen' | 'closed') => void>();
	const utils = render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<StatusControl value="open" onChange={onChange} {...props} />
		</TranslationProvider>,
	);

	return { onChange, ...utils };
}

describe('StatusControl', () => {
	afterEach(cleanup);

	it('renders Open / Freeze / Close radios with the current value checked', () => {
		renderControl();
		const radios = screen.getAllByRole('radio');
		expect(radios).toHaveLength(3);
		expect(screen.getByRole('radio', { name: /open/i }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: /freeze/i }).getAttribute('aria-checked')).toBe(
			'false',
		);
		expect(screen.getByText('Participants can take part.')).toBeTruthy();
	});

	it('uses the document vocabulary when asked', () => {
		renderControl({ document: true, value: 'queued' });
		expect(screen.getByRole('radiogroup', { name: /document status/i })).toBeTruthy();
		expect(screen.getByRole('radio', { name: /open for comment/i })).toBeTruthy();
		expect(screen.getByText(/in review — only admins can see it/i)).toBeTruthy();
	});

	it('freezes without confirmation', async () => {
		const { onChange } = renderControl();
		fireEvent.click(screen.getByRole('radio', { name: /freeze/i }));
		await waitFor(() => expect(onChange).toHaveBeenCalledWith('frozen'));
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('asks before closing and focuses "Keep open" by default', () => {
		const { onChange } = renderControl();
		fireEvent.click(screen.getByRole('radio', { name: /close/i }));

		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain(
			'Close this question? Participants will no longer be able to answer.',
		);
		expect(onChange).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep open' }));
	});

	it('closes when the confirm button is pressed', async () => {
		const { onChange } = renderControl();
		fireEvent.click(screen.getByRole('radio', { name: /close/i }));
		fireEvent.click(screen.getByRole('button', { name: 'Close question' }));

		await waitFor(() => expect(onChange).toHaveBeenCalledWith('closed'));
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('cancels with "Keep open" and with Escape', () => {
		const { onChange } = renderControl();

		fireEvent.click(screen.getByRole('radio', { name: /close/i }));
		fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));
		expect(screen.queryByRole('alertdialog')).toBeNull();

		fireEvent.click(screen.getByRole('radio', { name: /close/i }));
		fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
		expect(screen.queryByRole('alertdialog')).toBeNull();

		expect(onChange).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByRole('radio', { name: /open/i }));
	});

	it('confirms reopening from closed with the reopen copy', async () => {
		const { onChange } = renderControl({ value: 'closed' });
		fireEvent.click(screen.getByRole('radio', { name: /open/i }));

		expect(screen.getByRole('alertdialog').textContent).toContain(
			'Participants will be able to act again.',
		);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep closed' }));

		fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
		await waitFor(() => expect(onChange).toHaveBeenCalledWith('open'));
	});

	it('skips confirmation when confirmClose is false', async () => {
		const { onChange } = renderControl({ confirmClose: false });
		fireEvent.click(screen.getByRole('radio', { name: /close/i }));
		await waitFor(() => expect(onChange).toHaveBeenCalledWith('closed'));
	});

	it('moves focus with arrow keys and selects with Enter', async () => {
		const { onChange } = renderControl();
		const open = screen.getByRole('radio', { name: /open/i });
		open.focus();
		fireEvent.keyDown(open, { key: 'ArrowRight' });
		const freeze = screen.getByRole('radio', { name: /freeze/i });
		expect(document.activeElement).toBe(freeze);
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.keyDown(freeze, { key: 'Enter' });
		await waitFor(() => expect(onChange).toHaveBeenCalledWith('frozen'));
	});

	it('renders a static pill when disabled', () => {
		renderControl({ disabled: true, value: 'frozen' });
		expect(screen.queryAllByRole('radio')).toHaveLength(0);
		expect(screen.getByText('Frozen')).toBeTruthy();
		expect(screen.getByText('Visible, but nobody can act.')).toBeTruthy();
	});
});
