import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { StudioPlan } from '@freedi/shared-types';
import BuildBar, { type BuildBarProps } from '../components/BuildBar';

const plan: StudioPlan = {
	mainQuestion: { title: 'Q' },
	activities: [
		{ tempId: 'a1', type: 'crowdSurvey', title: 'A', order: 0, openNow: true, change: 'add' },
		{ tempId: 'a2', type: 'liveSession', title: 'B', order: 1, openNow: false, change: 'add' },
		{ tempId: 'a3', type: 'discussion', title: 'C', order: 2, openNow: false, change: 'update' },
		{ tempId: 'a4', type: 'discussion', title: 'D', order: 3, openNow: false, change: 'keep' },
	],
	scheduledActions: [
		{ tempId: 's1', activityTempId: 'a1', action: 'close', at: 1 },
		{ tempId: 's2', activityTempId: 'a2', action: 'open', at: 2 },
		{ tempId: 's3', activityTempId: 'a2', action: 'nudge', at: 3, nudgeMessage: 'Hi' },
	],
	summary: '',
};

function renderBar(props: Partial<BuildBarProps> = {}) {
	const onBuild = vi.fn();
	const onOpenQuestion = vi.fn();
	render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<BuildBar
				phase="chatting"
				plan={plan}
				readyToBuild
				problems={[]}
				existingMode={false}
				buildError={null}
				onBuild={onBuild}
				onOpenQuestion={onOpenQuestion}
				{...props}
			/>
		</TranslationProvider>,
	);

	return { onBuild, onOpenQuestion };
}

describe('BuildBar', () => {
	afterEach(cleanup);

	it('builds only when ready, with activities, while chatting', () => {
		const { onBuild } = renderBar();
		const button = screen.getByRole('button', { name: /build it/i });
		expect(button.hasAttribute('disabled')).toBe(false);
		expect(button.getAttribute('aria-describedby')).toBeTruthy();
		fireEvent.click(button);
		expect(onBuild).toHaveBeenCalledTimes(1);
	});

	it('is disabled and explains why when the consultant is not done', () => {
		renderBar({ readyToBuild: false, problems: ['No deadline yet'] });
		expect(screen.getByRole('button', { name: /build it/i }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('No deadline yet')).toBeTruthy();
	});

	it('is disabled without activities and while waiting or building', () => {
		renderBar({ plan: { ...plan, activities: [] } });
		expect(screen.getByRole('button', { name: /build it/i }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText(/at least one activity/i)).toBeTruthy();
		cleanup();
		renderBar({ phase: 'waiting' });
		expect(screen.getByRole('button', { name: /build it/i }).hasAttribute('disabled')).toBe(true);
		cleanup();
		renderBar({ phase: 'building' });
		const building = screen.getByRole('button', { name: /building/i });
		expect(building.hasAttribute('disabled')).toBe(true);
		expect(building.getAttribute('aria-busy')).toBe('true');
	});

	it('in existing mode confirms with counts before applying', () => {
		const { onBuild } = renderBar({ existingMode: true });
		fireEvent.click(screen.getByRole('button', { name: /apply plan/i }));
		expect(onBuild).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(
			screen.getByText(
				'2 new activities, 1 changes, 3 scheduled actions. Nothing will be removed.',
			),
		).toBeTruthy();
		const confirm = screen
			.getAllByRole('button', { name: /apply plan/i })
			.find((b) => b.closest('.modal__footer'));
		fireEvent.click(confirm as HTMLElement);
		expect(onBuild).toHaveBeenCalledTimes(1);
	});

	it('shows the build error with Retry and the partial-build link', () => {
		const { onBuild, onOpenQuestion } = renderBar({
			buildError: 'Could not build',
			partialTopQuestionId: 'q-partial',
		});
		expect(screen.getByRole('alert').textContent).toContain('Could not build');
		fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(onBuild).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole('button', { name: /open the question/i }));
		expect(onOpenQuestion).toHaveBeenCalledWith('q-partial');
	});
});
