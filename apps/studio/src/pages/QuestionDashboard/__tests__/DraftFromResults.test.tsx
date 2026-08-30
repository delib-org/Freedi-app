import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { ActivityType, StatementType, type Statement } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';

const studioDraftFromResults = vi.fn();
let children: Statement[] = [];
vi.mock('@/db/orgFunctions', () => ({
	studioDraftFromResults: (...args: unknown[]) => studioDraftFromResults(...args),
}));
vi.mock('@/db/orgStatements', () => ({
	useChildren: () => ({ data: children, loading: false, error: null }),
}));
vi.mock('@/firebase', () => ({ db: {}, functions: {}, auth: {} }));

import DraftFromResults, { type DraftFromResultsProps } from '../components/DraftFromResults';

function activity(overrides: Partial<DerivedActivity>): DerivedActivity {
	return {
		statementId: 'a',
		title: 'A',
		order: 0,
		type: ActivityType.massConsensus,
		runState: 'closed',
		participant: null,
		admin: null,
		...overrides,
	} as DerivedActivity;
}

const document = activity({
	statementId: 'doc-1',
	title: 'The proposal',
	type: ActivityType.signDocument,
	runState: 'queued',
	admin: { href: 'https://sign.test/doc/doc-1/admin/editor', external: true },
});
const activities: DerivedActivity[] = [
	activity({ statementId: 'mc-1', title: 'Collect ideas', runState: 'closed' }),
	activity({
		statementId: 'join-1',
		title: 'Town hall',
		type: ActivityType.join,
		runState: 'open',
	}),
	activity({ statementId: 'q-1', title: 'Deep dive', type: ActivityType.question }),
	document,
];

function renderSection(props: Partial<DraftFromResultsProps> = {}) {
	const onDrafted = vi.fn();
	render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<DraftFromResults
				document={document}
				activities={activities}
				editorHref={document.admin?.href}
				onDrafted={onDrafted}
				{...props}
			/>
		</TranslationProvider>,
	);

	return { onDrafted };
}

describe('DraftFromResults', () => {
	beforeEach(() => {
		studioDraftFromResults.mockReset();
		children = [];
	});
	afterEach(cleanup);

	it('offers crowd surveys and live sessions as sources, closed ones pre-selected', () => {
		renderSection();
		expect(
			screen.getByRole('checkbox', { name: 'Collect ideas' }).getAttribute('aria-checked'),
		).toBe('true');
		expect(screen.getByRole('checkbox', { name: 'Town hall' }).getAttribute('aria-checked')).toBe(
			'false',
		);
		expect(screen.queryByRole('checkbox', { name: 'Deep dive' })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: 'The proposal' })).toBeNull();
		expect(screen.getByRole('radio', { name: /best suggestions by consensus/i })).toBeTruthy();
	});

	it('writes the draft with the chosen sources, cutoff and intent, then links to Sign', async () => {
		studioDraftFromResults.mockResolvedValue({
			documentId: 'doc-1',
			paragraphCount: 7,
			openGaps: 2,
			signAdminUrl: 'https://sign.test/doc/doc-1/admin/editor',
		});
		const { onDrafted } = renderSection();
		fireEvent.click(screen.getByRole('checkbox', { name: 'Town hall' }));
		fireEvent.change(screen.getByLabelText(/what should the text be/i), {
			target: { value: 'A one-page proposal.' },
		});
		fireEvent.click(screen.getByRole('button', { name: /write the draft/i }));

		await waitFor(() =>
			expect(studioDraftFromResults).toHaveBeenCalledWith({
				documentId: 'doc-1',
				sourceStatementIds: ['mc-1', 'join-1'],
				cutoff: { mode: 'topN', n: 20, minEvaluators: 3 },
				intent: 'A one-page proposal.',
			}),
		);
		await waitFor(() =>
			expect(screen.getByText(/7 paragraphs written · 2 open gaps/)).toBeTruthy(),
		);
		expect(screen.getByRole('link', { name: /review it in sign/i }).getAttribute('href')).toBe(
			'https://sign.test/doc/doc-1/admin/editor',
		);
		expect(onDrafted).toHaveBeenCalledWith(expect.objectContaining({ paragraphCount: 7 }));
	});

	it('shows the progress state while writing', async () => {
		let resolve: (value: unknown) => void = () => undefined;
		studioDraftFromResults.mockReturnValue(new Promise((r) => (resolve = r)));
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: /write the draft/i }));
		await waitFor(() =>
			expect(screen.getByText(/writing… this takes up to a minute/i)).toBeTruthy(),
		);
		resolve({ documentId: 'doc-1', paragraphCount: 1, openGaps: 0, signAdminUrl: '' });
		await waitFor(() => expect(screen.getByText(/1 paragraphs written/)).toBeTruthy());
	});

	it('explains a failed-precondition (nothing passes the cutoff)', async () => {
		studioDraftFromResults.mockRejectedValue(
			Object.assign(new Error('nothing passes'), { code: 'functions/failed-precondition' }),
		);
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: /write the draft/i }));
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toMatch(/no suggestions pass this cutoff yet/i),
		);
	});

	it('asks before replacing a document that already has paragraphs', async () => {
		children = [
			{ statementId: 'p1', statementType: StatementType.paragraph } as unknown as Statement,
		];
		studioDraftFromResults.mockResolvedValue({
			documentId: 'doc-1',
			paragraphCount: 3,
			openGaps: 0,
			signAdminUrl: '',
		});
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: /rewrite the draft/i }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByText(/replace the current text\?/i)).toBeTruthy();
		expect(studioDraftFromResults).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: /^replace$/i }));
		await waitFor(() => expect(studioDraftFromResults).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByText(/3 paragraphs written/)).toBeTruthy());
	});

	it('disables the button when no source is selected', () => {
		renderSection();
		fireEvent.click(screen.getByRole('checkbox', { name: 'Collect ideas' }));
		expect(screen.getByRole('button', { name: /write the draft/i }).hasAttribute('disabled')).toBe(
			true,
		);
	});
});
