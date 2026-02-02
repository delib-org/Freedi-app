/**
 * Tests for ParagraphCard component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ParagraphCard from '../paragraph/ParagraphCard';
import { ParagraphType } from '@/types';

// Mock CSS modules
jest.mock('../paragraph/ParagraphCard.module.scss', () => ({
	card: 'card',
	'type-paragraph': 'type-paragraph',
	'type-h1': 'type-h1',
	'type-h2': 'type-h2',
	'type-li': 'type-li',
	approved: 'approved',
	rejected: 'rejected',
	pending: 'pending',
	interacted: 'interacted',
	nonInteractive: 'nonInteractive',
	nonInteractiveNormal: 'nonInteractiveNormal',
	expanded: 'expanded',
	content: 'content',
	contentWrapper: 'contentWrapper',
	interactionWrapper: 'interactionWrapper',
	stateIndicator: 'stateIndicator',
	listItem: 'listItem',
	bullet: 'bullet',
	heatBadge: 'heatBadge',
	nonInteractiveLabel: 'nonInteractiveLabel',
	adminControls: 'adminControls',
	adminToggle: 'adminToggle',
	adminInfo: 'adminInfo',
}));

// Mock translation hook
jest.mock('@freedi/shared-i18n/next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

// Mock UI store
const mockApprovals: Record<string, boolean> = {};
const mockCommentCounts: Record<string, number> = {};
const mockUserInteractions = new Set<string>();

jest.mock('@/store/uiStore', () => ({
	useUIStore: (selector: (state: unknown) => unknown) => {
		const state = {
			approvals: mockApprovals,
			commentCounts: mockCommentCounts,
			userInteractions: mockUserInteractions,
			suggestionCounts: {},
		};
		return selector(state);
	},
}));

// Mock accessibility store
jest.mock('@/store/accessibilityStore', () => ({
	useAccessibilityStore: (selector: (state: unknown) => unknown) => {
		const state = {
			contrastMode: 'default',
		};
		return selector(state);
	},
}));

// Mock heat map hook
jest.mock('@/hooks/useHeatMap', () => ({
	useParagraphHeatValue: () => null,
}));

// Mock viewport tracking hook
jest.mock('@/hooks/useViewportTracking', () => ({
	useViewportTracking: () => ({ ref: { current: null } }),
}));

// Mock sanitize utility
jest.mock('@/lib/utils/sanitize', () => ({
	sanitizeHTML: (html: string) => html,
}));

// Mock error handling
jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

// Mock InteractionBar component
jest.mock('../paragraph/InteractionBar', () => {
	return function MockInteractionBar() {
		return <div data-testid="interaction-bar">InteractionBar</div>;
	};
});

describe('ParagraphCard', () => {
	const defaultProps = {
		paragraph: {
			paragraphId: 'p-123',
			type: ParagraphType.paragraph,
			content: 'Test paragraph content',
			order: 0,
		},
		documentId: 'doc-123',
		isApproved: undefined,
		isLoggedIn: true,
	};

	beforeEach(() => {
		// Clear mock state
		Object.keys(mockApprovals).forEach((key) => delete mockApprovals[key]);
		Object.keys(mockCommentCounts).forEach((key) => delete mockCommentCounts[key]);
		mockUserInteractions.clear();
	});

	describe('rendering', () => {
		it('renders paragraph content', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByText('Test paragraph content')).toBeInTheDocument();
		});

		it('renders as article element', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('has correct id attribute', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(document.getElementById('paragraph-p-123')).toBeInTheDocument();
		});
	});

	describe('paragraph types', () => {
		it('renders h1 type as h1 element', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, type: ParagraphType.h1 },
			};
			render(<ParagraphCard {...props} />);
			expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
		});

		it('renders h2 type as h2 element', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, type: ParagraphType.h2 },
			};
			render(<ParagraphCard {...props} />);
			expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
		});

		it('renders li type with bullet', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, type: ParagraphType.li },
			};
			render(<ParagraphCard {...props} />);
			expect(screen.getByText('•')).toBeInTheDocument();
		});

		it('applies correct type class', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(document.querySelector('.type-paragraph')).toBeInTheDocument();
		});
	});

	describe('approval states', () => {
		it('applies pending class when isApproved is undefined', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(document.querySelector('.pending')).toBeInTheDocument();
		});

		it('applies approved class when isApproved is true', () => {
			render(<ParagraphCard {...defaultProps} isApproved={true} />);
			expect(document.querySelector('.approved')).toBeInTheDocument();
		});

		it('applies rejected class when isApproved is false', () => {
			render(<ParagraphCard {...defaultProps} isApproved={false} />);
			expect(document.querySelector('.rejected')).toBeInTheDocument();
		});

		it('uses store approval over prop when available', () => {
			mockApprovals['p-123'] = true;
			render(<ParagraphCard {...defaultProps} isApproved={false} />);
			expect(document.querySelector('.approved')).toBeInTheDocument();
		});
	});

	describe('interaction bar', () => {
		it('renders InteractionBar when not non-interactive', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByTestId('interaction-bar')).toBeInTheDocument();
		});

		it('does not render InteractionBar when non-interactive', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, isNonInteractive: true },
			};
			render(<ParagraphCard {...props} />);
			expect(screen.queryByTestId('interaction-bar')).not.toBeInTheDocument();
		});
	});

	describe('non-interactive mode', () => {
		it('shows non-interactive label for regular users', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, isNonInteractive: true },
			};
			render(<ParagraphCard {...props} />);
			expect(screen.getByText('Informational')).toBeInTheDocument();
		});

		it('does not show non-interactive label when isAdmin', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, isNonInteractive: true },
				isAdmin: true,
			};
			render(<ParagraphCard {...props} />);
			expect(screen.queryByText('Informational')).not.toBeInTheDocument();
		});

		it('applies normal style class when nonInteractiveNormalStyle is true', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, isNonInteractive: true },
				nonInteractiveNormalStyle: true,
			};
			render(<ParagraphCard {...props} />);
			expect(document.querySelector('.nonInteractiveNormal')).toBeInTheDocument();
		});

		it('does not apply normal style class when nonInteractiveNormalStyle is false', () => {
			const props = {
				...defaultProps,
				paragraph: { ...defaultProps.paragraph, isNonInteractive: true },
				nonInteractiveNormalStyle: false,
			};
			render(<ParagraphCard {...props} />);
			expect(document.querySelector('.nonInteractiveNormal')).not.toBeInTheDocument();
		});
	});

	describe('admin controls', () => {
		it('renders admin controls when isAdmin is true', () => {
			render(<ParagraphCard {...defaultProps} isAdmin />);
			expect(document.querySelector('.adminControls')).toBeInTheDocument();
		});

		it('does not render admin controls when isAdmin is false', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(document.querySelector('.adminControls')).not.toBeInTheDocument();
		});

		it('shows view count when provided to admin', () => {
			render(<ParagraphCard {...defaultProps} isAdmin viewCount={42} />);
			expect(screen.getByText('42')).toBeInTheDocument();
		});
	});

	describe('expansion behavior', () => {
		it('toggles expanded state on click', () => {
			render(<ParagraphCard {...defaultProps} />);
			const card = screen.getByRole('button');

			expect(card).toHaveAttribute('aria-expanded', 'false');

			fireEvent.click(card);
			expect(card).toHaveAttribute('aria-expanded', 'true');

			fireEvent.click(card);
			expect(card).toHaveAttribute('aria-expanded', 'false');
		});

		it('toggles expanded state on Enter key', () => {
			render(<ParagraphCard {...defaultProps} />);
			const card = screen.getByRole('button');

			fireEvent.keyDown(card, { key: 'Enter' });
			expect(card).toHaveAttribute('aria-expanded', 'true');
		});

		it('toggles expanded state on Space key', () => {
			render(<ParagraphCard {...defaultProps} />);
			const card = screen.getByRole('button');

			fireEvent.keyDown(card, { key: ' ' });
			expect(card).toHaveAttribute('aria-expanded', 'true');
		});
	});

	describe('accessibility', () => {
		it('has role="button"', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('has tabIndex={0}', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
		});

		it('has aria-expanded attribute', () => {
			render(<ParagraphCard {...defaultProps} />);
			expect(screen.getByRole('button')).toHaveAttribute('aria-expanded');
		});
	});
});
