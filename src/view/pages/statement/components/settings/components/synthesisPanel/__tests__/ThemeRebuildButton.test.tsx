import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThemeRebuildButton from '../ThemeRebuildButton';
import {
	applyThemeRebuild,
	previewThemeRebuild,
} from '@/controllers/db/synthesis/synthesisOperations';
import type { ThemeRebuildPreviewResponse } from '@freedi/shared-types';

jest.mock('@/controllers/db/synthesis/synthesisOperations', () => ({
	previewThemeRebuild: jest.fn(),
	applyThemeRebuild: jest.fn(),
}));

const mockPreview = previewThemeRebuild as jest.Mock;
const mockApply = applyThemeRebuild as jest.Mock;

const PREVIEW: ThemeRebuildPreviewResponse = {
	runId: 'run-1',
	atomCount: 12,
	otherCount: 2,
	themes: [
		{
			key: 'parking',
			name: 'Parking near the school',
			rule: 'Ideas about where cars stop',
			memberCount: 10,
			sampleTitles: ['More spots'],
		},
	],
};

const APPLIED = {
	runId: 'run-1',
	themesWritten: 1,
	themesHidden: 0,
	atomsPlaced: 10,
	atomsToOther: 2,
	lateArrivalsToOther: 0,
};

function renderButton(overrides: Partial<React.ComponentProps<typeof ThemeRebuildButton>> = {}): {
	onNotice: jest.Mock;
	onBusyChange: jest.Mock;
} {
	const onNotice = jest.fn();
	const onBusyChange = jest.fn();
	render(
		<ThemeRebuildButton
			questionId="q-1"
			onNotice={onNotice}
			onBusyChange={onBusyChange}
			{...overrides}
		/>,
	);

	return { onNotice, onBusyChange };
}

describe('ThemeRebuildButton', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = '';
	});

	it('fetches a preview on click and opens the review dialog', async () => {
		mockPreview.mockResolvedValue(PREVIEW);
		const { onBusyChange } = renderButton();

		fireEvent.click(screen.getByRole('button', { name: 'Re-theme with AI' }));

		expect(mockPreview).toHaveBeenCalledWith('q-1');
		expect(onBusyChange).toHaveBeenCalledWith(true);
		await screen.findByText('Parking near the school');
		expect(onBusyChange).toHaveBeenLastCalledWith(false);
	});

	it('reports the applied summary as a success notice', async () => {
		mockPreview.mockResolvedValue(PREVIEW);
		mockApply.mockResolvedValue(APPLIED);
		const { onNotice } = renderButton();

		fireEvent.click(screen.getByRole('button', { name: 'Re-theme with AI' }));
		await screen.findByText('Parking near the school');
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		await waitFor(() =>
			expect(onNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					tone: 'success',
					message: expect.stringContaining('Themes rebuilt'),
				}),
			),
		);
		expect(mockApply).toHaveBeenCalledWith('q-1', 'run-1');
		expect(screen.queryByText('Parking near the school')).toBeNull();
	});

	it('reports a known refusal as an error notice and stays usable', async () => {
		mockPreview.mockRejectedValue({ code: 'functions/already-exists' });
		const { onNotice, onBusyChange } = renderButton();

		fireEvent.click(screen.getByRole('button', { name: 'Re-theme with AI' }));

		await waitFor(() =>
			expect(onNotice).toHaveBeenCalledWith({
				tone: 'error',
				message: 'Another clustering run is in progress. Try again when it finishes.',
			}),
		);
		expect(onBusyChange).toHaveBeenLastCalledWith(false);
		expect(screen.getByRole('button', { name: 'Re-theme with AI' })).not.toBeDisabled();
	});

	it('falls back to the error message for an unknown failure', async () => {
		mockPreview.mockRejectedValue(new Error('internal'));
		const { onNotice } = renderButton();

		fireEvent.click(screen.getByRole('button', { name: 'Re-theme with AI' }));

		await waitFor(() =>
			expect(onNotice).toHaveBeenCalledWith({ tone: 'error', message: 'internal' }),
		);
	});

	it('does nothing while disabled by its host', () => {
		renderButton({ disabled: true });

		const button = screen.getByRole('button', { name: 'Re-theme with AI' });
		expect(button).toBeDisabled();
		fireEvent.click(button);
		expect(mockPreview).not.toHaveBeenCalled();
	});
});
