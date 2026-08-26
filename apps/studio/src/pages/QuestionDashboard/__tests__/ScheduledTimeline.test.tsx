import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { ScheduledAction } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';

const scheduledActionCancel = vi.fn();
vi.mock('@/db/orgFunctions', () => ({
	scheduledActionCancel: (...args: unknown[]) => scheduledActionCancel(...args),
}));
vi.mock('@/firebase', () => ({ db: {}, functions: {}, auth: {} }));

import ScheduledTimeline, { type ScheduledTimelineProps } from '../components/ScheduledTimeline';

const DAY = 86_400_000;

function action(overrides: Partial<ScheduledAction>): ScheduledAction {
	return {
		scheduledActionId: 'sa-1',
		statementId: 'act-1',
		topParentId: 'q-1',
		organizationId: 'org-1',
		action: 'open',
		runAt: Date.now() + DAY,
		status: 'pending',
		createdBy: 'u1',
		source: 'plan',
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	};
}

const activities = [
	{ statementId: 'act-1', title: 'Collect ideas' },
	{ statementId: 'act-2', title: 'Town hall' },
] as unknown as DerivedActivity[];

const actions: ScheduledAction[] = [
	action({ scheduledActionId: 'sa-1', statementId: 'act-1', action: 'open' }),
	action({
		scheduledActionId: 'sa-2',
		statementId: 'act-2',
		action: 'nudge',
		runAt: Date.now() + 2 * DAY,
		nudge: { message: 'Last day!', audience: 'all', channels: ['inApp'] },
	}),
	action({
		scheduledActionId: 'sa-3',
		statementId: 'q-1',
		action: 'close',
		runAt: Date.now() - DAY,
		status: 'done',
	}),
];

function renderTimeline(props: Partial<ScheduledTimelineProps> = {}) {
	const onSelectActivity = vi.fn();
	const onEdit = vi.fn();
	const onPlanWithAI = vi.fn();
	render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<ScheduledTimeline
				actions={actions}
				activities={activities}
				questionId="q-1"
				questionTitle="Budget"
				canManage
				onSelectActivity={onSelectActivity}
				onEdit={onEdit}
				onPlanWithAI={onPlanWithAI}
				{...props}
			/>
		</TranslationProvider>,
	);

	return { onSelectActivity, onEdit, onPlanWithAI };
}

describe('ScheduledTimeline', () => {
	beforeEach(() => scheduledActionCancel.mockReset());
	afterEach(cleanup);

	it('lists upcoming actions with glyph + word and the target, and collapses the past', () => {
		const { onSelectActivity } = renderTimeline();
		expect(screen.getByText('Opens')).toBeTruthy();
		expect(screen.getByText('Reminder')).toBeTruthy();
		expect(screen.getByText('Last day!')).toBeTruthy();
		expect(screen.getByText('Past (1)')).toBeTruthy();
		expect(screen.getByText('Done')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Collect ideas' }));
		expect(onSelectActivity).toHaveBeenCalledWith('act-1');
	});

	it('cancels a pending action after confirmation', async () => {
		scheduledActionCancel.mockResolvedValue({ scheduledActionId: 'sa-1', status: 'cancelled' });
		renderTimeline();
		fireEvent.click(screen.getByRole('button', { name: /^cancel: opens/i }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /cancel action/i }));
		await waitFor(() =>
			expect(scheduledActionCancel).toHaveBeenCalledWith({ scheduledActionId: 'sa-1' }),
		);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('opens the editor for a pending action', () => {
		const { onEdit } = renderTimeline();
		fireEvent.click(screen.getByRole('button', { name: /^edit: reminder/i }));
		expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ scheduledActionId: 'sa-2' }));
	});

	it('hides Edit / Cancel from viewers', () => {
		renderTimeline({ canManage: false });
		expect(screen.queryByRole('button', { name: /^edit:/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /^cancel:/i })).toBeNull();
	});

	it('shows the empty state with a Plan with AI shortcut', () => {
		const { onPlanWithAI } = renderTimeline({ actions: [] });
		expect(screen.getByText(/no scheduled actions yet/i)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /plan with ai/i }));
		expect(onPlanWithAI).toHaveBeenCalledTimes(1);
	});
});
