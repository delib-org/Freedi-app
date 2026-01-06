/**
 * Tests for SignButton component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import SignButton from '../document/SignButton';

// Mock CSS modules
jest.mock('../document/DocumentView.module.scss', () => ({
	signButton: 'signButton',
	signButtonSigning: 'signButtonSigning',
	signButtonSigned: 'signButtonSigned',
	spinnerIcon: 'spinnerIcon',
	checkmarkIconInline: 'checkmarkIconInline',
	buttonText: 'buttonText',
}));

// Mock translation hook
jest.mock('@freedi/shared-i18n/next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				success: 'Success',
				signed: 'Signed',
				documentSignedSuccessfully: 'Document signed successfully',
				signing: 'Signing',
				signingEllipsis: 'Signing...',
				signingDocument: 'Signing document...',
				documentIsSigned: 'Document is signed',
				signDocument: 'Sign Document',
			};
			return translations[key] || key;
		},
	}),
}));

// Mock UI store
const mockUIStore = {
	signingAnimationState: 'idle' as 'idle' | 'signing' | 'success',
	isSubmitting: false,
};

jest.mock('@/store/uiStore', () => ({
	useUIStore: () => mockUIStore,
}));

describe('SignButton', () => {
	beforeEach(() => {
		mockUIStore.signingAnimationState = 'idle';
		mockUIStore.isSubmitting = false;
	});

	describe('default (idle) state', () => {
		it('renders Sign Document text in idle state', () => {
			render(<SignButton />);
			expect(screen.getByText('Sign Document')).toBeInTheDocument();
		});

		it('is enabled by default', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).not.toBeDisabled();
		});

		it('has data-action="sign" attribute', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('data-action', 'sign');
		});

		it('has type="button"', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
		});

		it('does not have signing animation class', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).not.toHaveClass('signButtonSigning');
		});
	});

	describe('signing state', () => {
		beforeEach(() => {
			mockUIStore.signingAnimationState = 'signing';
		});

		it('renders Signing... text when signing', () => {
			render(<SignButton />);
			expect(screen.getByText('Signing...')).toBeInTheDocument();
		});

		it('shows spinner icon when signing', () => {
			render(<SignButton />);
			expect(screen.getByRole('button').querySelector('.spinnerIcon')).toBeInTheDocument();
		});

		it('applies signing class', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveClass('signButtonSigning');
		});

		it('has aria-busy="true" when signing', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
		});
	});

	describe('success state', () => {
		beforeEach(() => {
			mockUIStore.signingAnimationState = 'success';
		});

		it('renders Signed text on success', () => {
			render(<SignButton />);
			expect(screen.getByText('Signed')).toBeInTheDocument();
		});

		it('shows checkmark icon on success', () => {
			render(<SignButton />);
			expect(screen.getByRole('button').querySelector('.checkmarkIconInline')).toBeInTheDocument();
		});

		it('applies signed class', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveClass('signButtonSigned');
		});
	});

	describe('already signed state', () => {
		it('renders Signed text when isSigned=true', () => {
			render(<SignButton isSigned />);
			expect(screen.getByText('Signed')).toBeInTheDocument();
		});

		it('shows checkmark icon when isSigned=true', () => {
			render(<SignButton isSigned />);
			expect(screen.getByRole('button').querySelector('.checkmarkIconInline')).toBeInTheDocument();
		});

		it('is disabled when isSigned=true', () => {
			render(<SignButton isSigned />);
			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('applies signed class when isSigned=true', () => {
			render(<SignButton isSigned />);
			expect(screen.getByRole('button')).toHaveClass('signButtonSigned');
		});
	});

	describe('disabled state', () => {
		it('is disabled when disabled=true', () => {
			render(<SignButton disabled />);
			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('is disabled when isSubmitting=true', () => {
			mockUIStore.isSubmitting = true;
			render(<SignButton />);
			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('is disabled when isSigned=true', () => {
			render(<SignButton isSigned />);
			expect(screen.getByRole('button')).toBeDisabled();
		});
	});

	describe('aria-busy attribute', () => {
		it('is false by default', () => {
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false');
		});

		it('is true when signing', () => {
			mockUIStore.signingAnimationState = 'signing';
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
		});

		it('is false after success', () => {
			mockUIStore.signingAnimationState = 'success';
			render(<SignButton />);
			expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false');
		});
	});
});
