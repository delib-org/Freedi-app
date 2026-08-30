import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { StudioPlan } from '@freedi/shared-types';
import PlanCard, { type PlanCardProps } from '../components/PlanCard';

const plan: StudioPlan = {
	mainQuestion: { title: 'How should we spend the budget?', description: 'Next year.' },
	activities: [
		{
			tempId: 'a1',
			type: 'crowdSurvey',
			title: 'Collect ideas',
			order: 0,
			openNow: true,
			change: 'add',
			survey: {
				intro: 'Welcome!',
				allowParticipantsToAddSuggestions: false,
				minEvaluationsPerQuestion: 5,
				extraQuestions: [{ tempId: 'x1', title: 'Extra' }],
				seedOptions: ['Plant more trees', 'Fix the roads', 'שיפוץ בתי הספר'],
			},
		},
		{
			tempId: 'a2',
			type: 'liveSession',
			title: 'Town hall',
			order: 1,
			openNow: false,
			change: 'update',
			existingStatementId: 'st-2',
		},
		{
			tempId: 'a3',
			type: 'discussion',
			title: 'Deep dive',
			order: 2,
			openNow: false,
			change: 'keep',
		},
		{
			tempId: 'd1',
			type: 'document',
			title: 'The proposal',
			order: 3,
			openNow: false,
			change: 'add',
			draftFrom: ['a1', 'st-2'],
			draftCutoff: { mode: 'topN', n: 20, minEvaluators: 3 },
			draftIntent: 'A one-page proposal for the council.',
		},
	],
	scheduledActions: [
		{ tempId: 's1', activityTempId: 'a2', action: 'open', at: Date.now() + 86_400_000 },
		{
			tempId: 's2',
			activityTempId: 'a1',
			action: 'nudge',
			at: Date.now() + 172_800_000,
			nudgeMessage: 'Last day!',
		},
		{ tempId: 's3', activityTempId: 'd1', action: 'draft', at: Date.now() + 259_200_000 },
	],
	summary: 'Widen first, then decide together.',
};

function renderCard(props: Partial<PlanCardProps> = {}) {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<PlanCard
				plan={plan}
				planVersion={1}
				existingMode={false}
				changedTempIds={[]}
				updating={false}
				{...props}
			/>
		</TranslationProvider>,
	);
}

describe('PlanCard', () => {
	afterEach(cleanup);

	it('shows the empty state before a plan exists', () => {
		renderCard({ plan: undefined });
		expect(screen.getByText(/your plan will appear here/i)).toBeTruthy();
	});

	it('renders the main question, type chips, statuses and survey lines', () => {
		renderCard();
		expect(screen.getByText('How should we spend the budget?')).toBeTruthy();
		expect(screen.getByText('Crowd survey')).toBeTruthy();
		expect(screen.getByText('Live session')).toBeTruthy();
		expect(screen.getByText('Discussion')).toBeTruthy();
		expect(screen.getAllByText('Open')).toHaveLength(1);
		expect(screen.getAllByText('Not yet open')).toHaveLength(2);
		expect(screen.getByText('In review')).toBeTruthy();
		expect(screen.getByText('Intro: Welcome!')).toBeTruthy();
		expect(screen.getByText('Participants cannot add suggestions')).toBeTruthy();
		expect(screen.getByText('Min evaluations: 5')).toBeTruthy();
		expect(screen.getByText('1 extra questions')).toBeTruthy();
		expect(screen.getByText('Widen first, then decide together.')).toBeTruthy();
	});

	it('lists a crowd survey\'s starting suggestions collapsed, each with dir="auto"', () => {
		const { container } = renderCard();
		const details = container.querySelector<HTMLDetailsElement>('details.plan-card__seeds');
		expect(details).toBeTruthy();
		expect(details?.open).toBe(false);
		expect(screen.getByText('Starting suggestions (3)').tagName).toBe('SUMMARY');
		const items = container.querySelectorAll('.plan-card__seeds-list li');
		expect(items).toHaveLength(3);
		expect(items[2].textContent).toBe('שיפוץ בתי הספר');
		items.forEach((item) => expect(item.getAttribute('dir')).toBe('auto'));
		expect(screen.queryByText(/no starting suggestions/i)).toBeNull();
	});

	it('says when a crowd survey has no starting suggestions — and only for crowd surveys', () => {
		const emptySurvey: StudioPlan = {
			...plan,
			scheduledActions: [],
			activities: [
				{ ...plan.activities[0], survey: { intro: 'Hi' } },
				plan.activities[1],
				plan.activities[2],
			],
		};
		renderCard({ plan: emptySurvey });
		expect(screen.getAllByText('No starting suggestions — the survey opens empty')).toHaveLength(1);
		expect(screen.queryByText(/starting suggestions \(/i)).toBeNull();
	});

	it('renders the schedule with glyph + word, the target title and the nudge text', () => {
		const { container } = renderCard();
		expect(screen.getByText('Opens')).toBeTruthy();
		expect(screen.getByText('Reminder')).toBeTruthy();
		expect(screen.getByText('Last day!')).toBeTruthy();
		const times = container.querySelectorAll('time[datetime]');
		expect(times.length).toBe(3);
		expect(times[0].getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('shows a document with its sources, cutoff and intent, and the draft step in the schedule', () => {
		const { container } = renderCard();
		expect(screen.getByText('Document')).toBeTruthy();
		expect(screen.getByText(/Drafted from: Collect ideas · Town hall/)).toBeTruthy();
		expect(screen.getByText('top 20 suggestions, at least 3 raters')).toBeTruthy();
		expect(screen.getByText('Intent: A one-page proposal for the council.')).toBeTruthy();
		expect(screen.getByText('Draft')).toBeTruthy();
		expect(container.querySelector('.plan-card__action--draft')).toBeTruthy();
		expect(screen.getByText('From: Collect ideas · Town hall')).toBeTruthy();
	});

	it('flags changed rows and marks the card busy while updating', () => {
		const { container } = renderCard({ changedTempIds: ['a2', 's1'], updating: true });
		expect(container.querySelectorAll('.plan-card__activity--changed')).toHaveLength(1);
		expect(container.querySelectorAll('.plan-card__action--changed')).toHaveLength(1);
		expect(container.querySelector('.plan-card')?.getAttribute('aria-busy')).toBe('true');
		expect(container.querySelector('.plan-card--updating')).toBeTruthy();
	});

	it('shows New / Updated / Unchanged tags only in existing mode', () => {
		renderCard({ existingMode: true });
		expect(screen.getAllByText('New')).toHaveLength(2);
		expect(screen.getByText('Updated')).toBeTruthy();
		expect(screen.getByText('Unchanged')).toBeTruthy();
		cleanup();
		renderCard({ existingMode: false });
		expect(screen.queryByText('Unchanged')).toBeNull();
	});

	it('"Ask to change" hands the activity back', () => {
		const onAskToChange = vi.fn();
		renderCard({ onAskToChange });
		fireEvent.click(screen.getByRole('button', { name: 'Ask to change "Town hall"' }));
		expect(onAskToChange).toHaveBeenCalledWith(expect.objectContaining({ tempId: 'a2' }));
	});
});
