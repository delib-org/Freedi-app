import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { ActivityType, StatementType, type Statement } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';

const studioSeedOptions = vi.fn();
let children: Statement[] = [];
vi.mock('@/db/orgFunctions', () => ({
	studioSeedOptions: (...args: unknown[]) => studioSeedOptions(...args),
}));
vi.mock('@/db/orgStatements', () => ({
	useChildren: () => ({ data: children, loading: false, error: null }),
}));
vi.mock('@/firebase', () => ({ db: {}, functions: {}, auth: {} }));

import SeedSuggestions, { type SeedSuggestionsProps } from '../components/SeedSuggestions';

const survey = {
	statementId: 'mc-1',
	title: 'Collect ideas',
	order: 0,
	type: ActivityType.massConsensus,
	runState: 'open',
	participant: null,
	admin: null,
} as unknown as DerivedActivity;

function option(id: string, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statementType: StatementType.option,
		...overrides,
	} as unknown as Statement;
}

function renderSection(props: Partial<SeedSuggestionsProps> = {}) {
	const onSeeded = vi.fn();
	render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<SeedSuggestions survey={survey} onSeeded={onSeeded} {...props} />
		</TranslationProvider>,
	);

	return { onSeeded };
}

describe('SeedSuggestions', () => {
	beforeEach(() => {
		studioSeedOptions.mockReset();
		children = [];
	});
	afterEach(cleanup);

	it('counts only visible options and defaults to 6', () => {
		children = [
			option('o1'),
			option('o2', { hide: true }),
			{ statementId: 'q1', statementType: StatementType.question } as unknown as Statement,
		];
		renderSection();
		expect(screen.getByText('Suggestions now: 1')).toBeTruthy();
		expect((screen.getByLabelText('How many') as HTMLSelectElement).value).toBe('6');
		expect(screen.getByRole('button', { name: 'Seed 6 suggestions' })).toBeTruthy();
	});

	it('seeds with the chosen count, intent and UI language, then reports the outcome', async () => {
		studioSeedOptions.mockResolvedValue({ statementId: 'mc-1', created: 9, total: 9 });
		const { onSeeded } = renderSection();
		fireEvent.change(screen.getByLabelText('How many'), { target: { value: '9' } });
		fireEvent.change(screen.getByLabelText(/what kind of suggestions/i), {
			target: { value: '  Concrete ideas  ' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Seed 9 suggestions' }));

		await waitFor(() =>
			expect(studioSeedOptions).toHaveBeenCalledWith({
				statementId: 'mc-1',
				count: 9,
				intent: 'Concrete ideas',
				language: 'en',
			}),
		);
		await waitFor(() => expect(screen.getByText('9 suggestions added (9 in total)')).toBeTruthy());
		expect(onSeeded).toHaveBeenCalledWith({ statementId: 'mc-1', created: 9, total: 9 });
	});

	it('omits an empty intent and shows the progress state while writing', async () => {
		let resolve: (value: unknown) => void = () => undefined;
		studioSeedOptions.mockReturnValue(new Promise((r) => (resolve = r)));
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: 'Seed 6 suggestions' }));
		await waitFor(() => expect(screen.getByText('Writing suggestions…')).toBeTruthy());
		expect(studioSeedOptions).toHaveBeenCalledWith({
			statementId: 'mc-1',
			count: 6,
			intent: undefined,
			language: 'en',
		});
		resolve({ statementId: 'mc-1', created: 6, total: 6 });
		await waitFor(() => expect(screen.getByText('6 suggestions added (6 in total)')).toBeTruthy());
	});

	it('explains a failed-precondition (not a crowd survey)', async () => {
		studioSeedOptions.mockRejectedValue(
			Object.assign(new Error('not a survey'), { code: 'functions/failed-precondition' }),
		);
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: 'Seed 6 suggestions' }));
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('Only crowd surveys can be seeded'),
		);
	});

	it('shows a generic error for other failures', async () => {
		studioSeedOptions.mockRejectedValue(new Error('boom'));
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: 'Seed 6 suggestions' }));
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toMatch(/could not be written/i),
		);
	});

	it('disables the button with a hint when the survey already has the chosen count', () => {
		children = [option('o1'), option('o2'), option('o3'), option('o4')];
		renderSection();
		fireEvent.change(screen.getByLabelText('How many'), { target: { value: '3' } });
		expect(
			screen.getByRole('button', { name: 'Seed 3 suggestions' }).hasAttribute('disabled'),
		).toBe(true);
		expect(
			screen.getByText('The survey already has 4 suggestions — pick a higher number to add more.'),
		).toBeTruthy();
		fireEvent.change(screen.getByLabelText('How many'), { target: { value: '6' } });
		expect(
			screen.getByRole('button', { name: 'Seed 6 suggestions' }).hasAttribute('disabled'),
		).toBe(false);
		expect(screen.queryByText(/already has 4 suggestions/)).toBeNull();
	});
});
