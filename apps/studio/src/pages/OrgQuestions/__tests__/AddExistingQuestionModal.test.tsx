import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { LinkableQuestion } from '@/db/orgActivities';

const linkOrgStatement = vi.fn();
const recomputeQuestionProgress = vi.fn();
const useLinkableQuestions = vi.fn();
const lookupQuestion = vi.fn();

vi.mock('@/db/orgFunctions', () => ({
	linkOrgStatement: (...args: unknown[]) => linkOrgStatement(...args),
	recomputeQuestionProgress: (...args: unknown[]) => recomputeQuestionProgress(...args),
}));
vi.mock('@/db/orgActivities', () => ({
	useLinkableQuestions: (...args: unknown[]) => useLinkableQuestions(...args),
	lookupQuestion: (...args: unknown[]) => lookupQuestion(...args),
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
		lookupQuestion.mockReset();
		lookupQuestion.mockResolvedValue(null);
		recomputeQuestionProgress.mockReset();
		recomputeQuestionProgress.mockResolvedValue(undefined);
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
		linkOrgStatement.mockResolvedValue({ activityId: 'org-1--q-budget', statementId: 'q-budget' });
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
		linkOrgStatement.mockResolvedValue({ activityId: 'org-1--q-budget', statementId: 'q-budget' });
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

	describe('adding by id or link', () => {
		const OUTSIDE = {
			statementId: 'Xk29ZmQ4pLv7RtN1sWbC',
			statement: 'A colleague’s question',
			statementType: 'question',
		};

		it('looks up a pasted statement id and offers it', async () => {
			lookupQuestion.mockResolvedValue(OUTSIDE);
			renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: OUTSIDE.statementId },
			});

			await waitFor(() => expect(screen.getByText(/a colleague’s question/i)).toBeTruthy());
			expect(lookupQuestion).toHaveBeenCalledWith(OUTSIDE.statementId);
		});

		it('links what a pasted link resolved to', async () => {
			lookupQuestion.mockResolvedValue(OUTSIDE);
			linkOrgStatement.mockResolvedValue({
				activityId: `org-1--${OUTSIDE.statementId}`,
				statementId: OUTSIDE.statementId,
				questionIds: [OUTSIDE.statementId],
			});
			const { onLinked } = renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: `https://mc.wizcol.com/q/${OUTSIDE.statementId}` },
			});
			await waitFor(() => expect(screen.getByText(/a colleague’s question/i)).toBeTruthy());
			fireEvent.click(screen.getByText(/a colleague’s question/i));
			fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

			await waitFor(() => expect(onLinked).toHaveBeenCalledWith(OUTSIDE.statementId));
			expect(linkOrgStatement).toHaveBeenCalledWith({
				organizationId: 'org-1',
				statementId: OUTSIDE.statementId,
				label: undefined,
			});
		});

		it('sends a pasted survey link as a surveyId, not a statementId', async () => {
			linkOrgStatement.mockResolvedValue({
				activityId: 'org-1--q-wrapped',
				statementId: 'q-wrapped',
			});
			const { onLinked } = renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: 'https://mc.wizcol.com/s/survey_1712345678901_a1b2c3d' },
			});
			fireEvent.click(screen.getByText(/crowd survey/i));
			fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

			await waitFor(() => expect(onLinked).toHaveBeenCalledWith('q-wrapped'));
			expect(linkOrgStatement).toHaveBeenCalledWith({
				organizationId: 'org-1',
				surveyId: 'survey_1712345678901_a1b2c3d',
				label: undefined,
			});
			expect(lookupQuestion).not.toHaveBeenCalled();
		});

		it('says so when the id matches nothing', async () => {
			lookupQuestion.mockResolvedValue(null);
			renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: 'Xk29ZmQ4pLv7RtN1sWbC' },
			});

			await waitFor(() => expect(screen.getByText(/no question with that id/i)).toBeTruthy());
		});

		it('says so when the pasted question is already on the board', async () => {
			renderModal([BUDGET, HOUSING], ['Xk29ZmQ4pLv7RtN1sWbC']);

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: 'Xk29ZmQ4pLv7RtN1sWbC' },
			});

			await waitFor(() => expect(screen.getByText(/already on this board/i)).toBeTruthy());
		});

		it('rebuilds the counters for every question the link covers', async () => {
			linkOrgStatement.mockResolvedValue({
				activityId: 'org-1--q-wrapped',
				statementId: 'q-wrapped',
				questionIds: ['q-wrapped', 'q-second'],
			});
			renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: 'https://mc.wizcol.com/s/survey_1712345678901_a1b2c3d' },
			});
			fireEvent.click(screen.getByText(/crowd survey/i));
			fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

			await waitFor(() => expect(recomputeQuestionProgress).toHaveBeenCalledTimes(2));
			expect(recomputeQuestionProgress).toHaveBeenCalledWith({ statementId: 'q-wrapped' });
			expect(recomputeQuestionProgress).toHaveBeenCalledWith({ statementId: 'q-second' });
		});

		it('still links when an older callable answers without questionIds', async () => {
			lookupQuestion.mockResolvedValue(OUTSIDE);
			linkOrgStatement.mockResolvedValue({
				activityId: `org-1--${OUTSIDE.statementId}`,
				statementId: OUTSIDE.statementId,
			});
			const { onLinked } = renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: OUTSIDE.statementId },
			});
			await waitFor(() => expect(screen.getByText(/a colleague’s question/i)).toBeTruthy());
			fireEvent.click(screen.getByText(/a colleague’s question/i));
			fireEvent.click(screen.getByRole('button', { name: /add to organization/i }));

			await waitFor(() => expect(onLinked).toHaveBeenCalledWith(OUTSIDE.statementId));
			expect(recomputeQuestionProgress).toHaveBeenCalledWith({
				statementId: OUTSIDE.statementId,
			});
		});

		it('does not look up an id that is already in the list', async () => {
			renderModal();

			fireEvent.change(screen.getByRole('textbox', { name: /find a question/i }), {
				target: { value: 'q-budget' },
			});

			await waitFor(() => expect(lookupQuestion).not.toHaveBeenCalled());
		});
	});
});
