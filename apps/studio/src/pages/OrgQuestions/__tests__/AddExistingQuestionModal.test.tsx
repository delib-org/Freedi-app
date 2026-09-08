import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { LinkableQuestion } from '@/db/orgActivities';

const linkOrgStatement = vi.fn();
const useLinkableQuestions = vi.fn();

vi.mock('@/db/orgFunctions', () => ({
	linkOrgStatement: (...args: unknown[]) => linkOrgStatement(...args),
}));
vi.mock('@/db/orgActivities', () => ({
	useLinkableQuestions: (...args: unknown[]) => useLinkableQuestions(...args),
}));

import AddExistingQuestionModal from '../AddExistingQuestionModal';

const BUDGET: LinkableQuestion = {
	statementId: 'q-budget',
	title: 'How should we spend the budget?',
	isTopLevel: true,
	createdAt: 200,
};
const HOUSING: LinkableQuestion = {
	statementId: 'q-housing',
	title: 'Housing survey',
	isTopLevel: false,
	createdAt: 100,
};

function renderModal(
	candidates: LinkableQuestion[] = [BUDGET, HOUSING],
	alreadyOnBoard: string[] = [],
) {
	useLinkableQuestions.mockReturnValue({ data: candidates, loading: false, error: null });
	const onClose = vi.fn();
	const onLinked = vi.fn();
	const utils = render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<AddExistingQuestionModal
				organizationId="org-1"
				userId="alice"
				alreadyOnBoard={new Set(alreadyOnBoard)}
				onClose={onClose}
				onLinked={onLinked}
			/>
		</TranslationProvider>,
	);

	return { onClose, onLinked, ...utils };
}

describe('AddExistingQuestionModal', () => {
	beforeEach(() => {
		linkOrgStatement.mockReset();
		useLinkableQuestions.mockReset();
	});
	afterEach(cleanup);

	it('lists the questions the user administers', () => {
		renderModal();

		expect(screen.getByRole('option', { name: /spend the budget/i })).toBeTruthy();
		expect(screen.getByRole('option', { name: /housing survey/i })).toBeTruthy();
	});

	it('hides questions already on the board', () => {
		renderModal([BUDGET, HOUSING], ['q-budget']);

		expect(screen.queryByRole('option', { name: /spend the budget/i })).toBeNull();
		expect(screen.getByRole('option', { name: /housing survey/i })).toBeTruthy();
	});

	it('filters by the search box', () => {
		renderModal();

		fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
			target: { value: 'housing' },
		});

		expect(screen.queryByRole('option', { name: /spend the budget/i })).toBeNull();
		expect(screen.getByRole('option', { name: /housing survey/i })).toBeTruthy();
	});

	it('links with the board name the user typed', async () => {
		linkOrgStatement.mockResolvedValue({ activityId: 'org-1--q-budget' });
		const { onLinked } = renderModal();

		fireEvent.click(screen.getByRole('option', { name: /spend the budget/i }));
		fireEvent.change(screen.getByRole('textbox', { name: /name it on this board/i }), {
			target: { value: 'Budget 2027' },
		});
		fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

		await waitFor(() => expect(onLinked).toHaveBeenCalledWith('q-budget'));
		expect(linkOrgStatement).toHaveBeenCalledWith({
			organizationId: 'org-1',
			statementId: 'q-budget',
			label: 'Budget 2027',
		});
	});

	it('stores no board name when it is left as the question’s own title', async () => {
		linkOrgStatement.mockResolvedValue({ activityId: 'org-1--q-budget' });
		renderModal();

		fireEvent.click(screen.getByRole('option', { name: /spend the budget/i }));
		fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

		await waitFor(() => expect(linkOrgStatement).toHaveBeenCalled());
		expect(linkOrgStatement).toHaveBeenCalledWith({
			organizationId: 'org-1',
			statementId: 'q-budget',
			label: undefined,
		});
	});

	it('shows the server’s explanation when the question is already on the board', async () => {
		linkOrgStatement.mockRejectedValue(
			Object.assign(new Error('That question is already on this board'), {
				code: 'functions/already-exists',
			}),
		);
		const { onLinked } = renderModal();

		fireEvent.click(screen.getByRole('option', { name: /spend the budget/i }));
		fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toMatch(/already on this board/i),
		);
		expect(onLinked).not.toHaveBeenCalled();
	});

	it('invites the user to create one when they administer nothing', () => {
		renderModal([]);

		expect(screen.getByText(/nothing to add/i)).toBeTruthy();
		expect(screen.getByRole('button', { name: /add to organization/i })).toHaveProperty(
			'disabled',
			true,
		);
	});
});
