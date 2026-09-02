import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { ActivityType } from '@freedi/shared-types';

const createOrgStatement = vi.fn();
vi.mock('@/db/orgFunctions', () => ({
	createOrgStatement: (...args: unknown[]) => createOrgStatement(...args),
}));

import AddActivityModal from '../components/AddActivityModal';

function renderModal(isOpen: boolean, onCreated = vi.fn()) {
	const onClose = vi.fn();
	const utils = render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<AddActivityModal
				isOpen={isOpen}
				orgId="org-1"
				qId="q-1"
				initialType={ActivityType.question}
				onClose={onClose}
				onCreated={onCreated}
			/>
		</TranslationProvider>,
	);

	return { onClose, onCreated, ...utils };
}

describe('AddActivityModal', () => {
	beforeEach(() => {
		createOrgStatement.mockReset();
	});
	afterEach(cleanup);

	it('creates the activity and reports the new id', async () => {
		createOrgStatement.mockResolvedValue({ statementId: 'new-1' });
		const { onCreated } = renderModal(true);

		fireEvent.change(screen.getByLabelText(/question for participants/i), {
			target: { value: 'Rent control ideas' },
		});
		fireEvent.click(screen.getByRole('button', { name: /create activity/i }));

		await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1', ActivityType.question));
		expect(createOrgStatement).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: 'org-1', parentId: 'q-1', kind: 'question' }),
		);
	});

	it('is usable again after a successful create (regression: stale submitting state)', async () => {
		createOrgStatement.mockResolvedValue({ statementId: 'new-1' });
		const onCreated = vi.fn();
		const { rerender } = renderModal(true, onCreated);

		fireEvent.change(screen.getByLabelText(/question for participants/i), {
			target: { value: 'First activity' },
		});
		fireEvent.click(screen.getByRole('button', { name: /create activity/i }));
		await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

		// Parent closes the modal, then opens it again for a second activity —
		// the same component instance stays mounted.
		const reopen = (open: boolean) =>
			rerender(
				<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
					<AddActivityModal
						isOpen={open}
						orgId="org-1"
						qId="q-1"
						initialType={ActivityType.question}
						onClose={vi.fn()}
						onCreated={onCreated}
					/>
				</TranslationProvider>,
			);
		reopen(false);
		reopen(true);

		const cancel = screen.getByRole('button', { name: /cancel/i });
		expect(cancel.hasAttribute('disabled')).toBe(false);

		fireEvent.change(screen.getByLabelText(/question for participants/i), {
			target: { value: 'Second activity' },
		});
		const create = screen.getByRole('button', { name: /create activity/i });
		expect(create.hasAttribute('disabled')).toBe(false);
		fireEvent.click(create);
		await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
	});

	it('for a document, creates a hidden Sign document and explains the hand-off to Sign', async () => {
		createOrgStatement.mockResolvedValue({ statementId: 'doc-1' });
		const onCreated = vi.fn();
		render(
			<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
				<AddActivityModal
					isOpen
					orgId="org-1"
					qId="q-1"
					initialType={ActivityType.signDocument}
					onClose={vi.fn()}
					onCreated={onCreated}
				/>
			</TranslationProvider>,
		);
		expect(
			screen.getByText(/write or paste the text in sign, then come back to open it for comment/i),
		).toBeTruthy();
		expect(screen.queryByLabelText(/open it now/i)).toBeNull();
		fireEvent.change(screen.getByLabelText(/document title/i), {
			target: { value: 'The proposal' },
		});
		fireEvent.click(screen.getByRole('button', { name: /continue in sign/i }));
		await waitFor(() => expect(onCreated).toHaveBeenCalledWith('doc-1', ActivityType.signDocument));
		expect(createOrgStatement).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'document', title: 'The proposal' }),
		);
		expect(createOrgStatement.mock.calls[0][0]).not.toHaveProperty('initialStatus', 'live');
	});

	it('for a crowd survey, explains the hand-off to Crowd survey instead of "Open it now"', () => {
		render(
			<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
				<AddActivityModal
					isOpen
					orgId="org-1"
					qId="q-1"
					initialType={ActivityType.massConsensus}
					onClose={vi.fn()}
					onCreated={vi.fn()}
				/>
			</TranslationProvider>,
		);
		expect(screen.getByRole('button', { name: /continue in crowd survey/i })).toBeTruthy();
		expect(screen.queryByLabelText(/open it now/i)).toBeNull();
	});
});
