import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThemeRebuildPreview from '../ThemeRebuildPreview';
import { applyThemeRebuild } from '@/controllers/db/synthesis/synthesisOperations';
import type { ThemeRebuildPreviewResponse } from '@freedi/shared-types';
import { themeRebuildAppliedMessage } from '../themeRebuildMessages';

jest.mock('@/controllers/db/synthesis/synthesisOperations', () => ({
	applyThemeRebuild: jest.fn(),
}));

const mockApply = applyThemeRebuild as jest.Mock;

const PREVIEW: ThemeRebuildPreviewResponse = {
	runId: 'run-7',
	atomCount: 57,
	otherCount: 4,
	themes: [
		{
			key: 'parking',
			name: 'Parking near the school',
			rule: 'Ideas about where cars stop',
			memberCount: 21,
			sampleTitles: ['More spots', 'Drop-off lane', 'Paid parking', 'Fourth sample'],
			reusesThemeId: 'old-theme-1',
		},
		{
			key: 'safety',
			name: 'Road safety',
			rule: 'Ideas about crossings and speed',
			memberCount: 32,
			sampleTitles: ['Speed bumps'],
		},
	],
};

const APPLIED = {
	runId: 'run-7',
	themesWritten: 2,
	themesHidden: 1,
	atomsPlaced: 53,
	atomsToOther: 3,
	lateArrivalsToOther: 1,
};

function renderPreview(overrides: Partial<React.ComponentProps<typeof ThemeRebuildPreview>> = {}): {
	onClose: jest.Mock;
	onApplied: jest.Mock;
} {
	const onClose = jest.fn();
	const onApplied = jest.fn();
	render(
		<ThemeRebuildPreview
			questionId="q-1"
			preview={PREVIEW}
			onClose={onClose}
			onApplied={onApplied}
			{...overrides}
		/>,
	);

	return { onClose, onApplied };
}

describe('ThemeRebuildPreview', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = '';
	});

	it('renders nothing without a preview', () => {
		renderPreview({ preview: null });

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('is a dialog named by its visible title', () => {
		renderPreview();

		const dialog = screen.getByRole('dialog', { name: 'Proposed themes' });
		expect(dialog).toHaveAttribute('aria-labelledby');
	});

	it('shows the counts, each theme and at most three sample titles', () => {
		renderPreview();

		expect(screen.getByText('57')).toBeInTheDocument();
		expect(screen.getByText('4')).toBeInTheDocument();
		expect(screen.getByText('Parking near the school')).toBeInTheDocument();
		expect(screen.getByText('Ideas about where cars stop')).toBeInTheDocument();
		expect(screen.getByText('Road safety')).toBeInTheDocument();
		expect(screen.getByText('Ideas: 21')).toBeInTheDocument();
		expect(screen.getByText('Paid parking')).toBeInTheDocument();
		expect(screen.queryByText('Fourth sample')).not.toBeInTheDocument();
		expect(screen.getAllByText('Keeps existing theme')).toHaveLength(1);
	});

	it('applies with the preview run id, reports the result and closes', async () => {
		mockApply.mockResolvedValue(APPLIED);
		const { onClose, onApplied } = renderPreview();

		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		await waitFor(() => expect(onApplied).toHaveBeenCalledWith(APPLIED));
		expect(mockApply).toHaveBeenCalledWith('q-1', 'run-7');
		expect(onClose).toHaveBeenCalled();
	});

	it('closes on Cancel without applying', () => {
		const { onClose } = renderPreview();

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalled();
		expect(mockApply).not.toHaveBeenCalled();
	});

	it('closes on Escape', () => {
		const { onClose } = renderPreview();

		fireEvent.keyDown(document, { key: 'Escape' });

		expect(onClose).toHaveBeenCalled();
	});

	it.each([
		[
			{ code: 'functions/already-exists' },
			'Another clustering run is in progress. Try again when it finishes.',
		],
		[
			{ code: 'functions/failed-precondition', details: { reason: 'proposal-expired' } },
			'This preview expired. Run the preview again.',
		],
		[
			{ code: 'functions/failed-precondition', details: { reason: 'proposal-not-found' } },
			'This preview expired. Run the preview again.',
		],
		[
			{ code: 'functions/failed-precondition', details: { reason: 'no-atoms' } },
			'There are no ideas to group yet.',
		],
		[new Error('boom'), 'Operation failed'],
	])('shows a friendly message and stays open when apply fails (%o)', async (failure, message) => {
		mockApply.mockRejectedValue(failure);
		const { onClose, onApplied } = renderPreview();

		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(message);
		expect(onApplied).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe('themeRebuildAppliedMessage', () => {
	it('counts late arrivals into Other ideas', () => {
		const identity = (text: string): string => text;

		expect(themeRebuildAppliedMessage(APPLIED, identity)).toBe(
			'Themes rebuilt · Themes: 2 · Ideas placed: 53 · Other ideas: 4',
		);
	});
});
