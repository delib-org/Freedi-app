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
		expect(screen.getByText('Intro: Welcome!')).toBeTruthy();
		expect(screen.getByText('Participants cannot add suggestions')).toBeTruthy();
		expect(screen.getByText('Min evaluations: 5')).toBeTruthy();
		expect(screen.getByText('1 extra questions')).toBeTruthy();
		expect(screen.getByText('Widen first, then decide together.')).toBeTruthy();
	});

	it('renders the schedule with glyph + word, the target title and the nudge text', () => {
		const { container } = renderCard();
		expect(screen.getByText('Opens')).toBeTruthy();
		expect(screen.getByText('Reminder')).toBeTruthy();
		expect(screen.getByText('Last day!')).toBeTruthy();
		const times = container.querySelectorAll('time[datetime]');
		expect(times.length).toBe(2);
		expect(times[0].getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
		expect(screen.getByText('New')).toBeTruthy();
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
