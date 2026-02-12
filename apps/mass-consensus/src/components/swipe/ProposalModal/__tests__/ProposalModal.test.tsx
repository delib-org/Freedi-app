/**
 * ProposalModal Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProposalModal from '../ProposalModal';
import { VALIDATION } from '@/constants/common';

// Mock i18n
jest.mock('@freedi/shared-i18n/react', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ProposalModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(
      <ProposalModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share Your Idea')).toBeInTheDocument();
  });

  it('should display description text', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(
      screen.getByText('Have a suggestion to improve this topic? Share your idea with the community!')
    ).toBeInTheDocument();
  });

  it('should have textarea for input', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    expect(textarea).toBeInTheDocument();
  });

  it('should update character count when typing', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    fireEvent.change(textarea, { target: { value: 'Test proposal' } });

    expect(screen.getByText(/13 \/ /)).toBeInTheDocument();
  });

  it('should disable submit button when text is too short', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    fireEvent.change(textarea, { target: { value: 'Hi' } });

    const submitButton = screen.getByText('Submit Proposal');
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when text is valid length', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    const validText = 'A'.repeat(VALIDATION.MIN_STATEMENT_LENGTH);
    fireEvent.change(textarea, { target: { value: validText } });

    const submitButton = screen.getByText('Submit Proposal');
    expect(submitButton).not.toBeDisabled();
  });

  it('should disable submit button when text is too long', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    const tooLongText = 'A'.repeat(VALIDATION.MAX_STATEMENT_LENGTH + 1);
    fireEvent.change(textarea, { target: { value: tooLongText } });

    const submitButton = screen.getByText('Submit Proposal');
    expect(submitButton).toBeDisabled();
  });

  it('should call onSubmit when submit button clicked with valid text', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    const validText = 'This is a valid proposal text';
    fireEvent.change(textarea, { target: { value: validText } });

    const submitButton = screen.getByText('Submit Proposal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(validText);
    });
  });

  it('should call onClose after successful submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    fireEvent.change(textarea, { target: { value: 'Valid proposal text' } });

    const submitButton = screen.getByText('Submit Proposal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should clear text after successful submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    const { rerender } = render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Valid proposal text' } });

    const submitButton = screen.getByText('Submit Proposal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    // Reopen modal
    rerender(
      <ProposalModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    rerender(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(textarea.value).toBe('');
  });

  it('should call onClose when close button clicked', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call onClose when cancel button clicked', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call onClose when backdrop clicked', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not close when clicking modal content', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const content = screen.getByText('Share Your Idea').closest('div');
    if (content) {
      fireEvent.click(content);
    }

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should show submitting state during submission', async () => {
    let resolveSubmit: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    mockOnSubmit.mockReturnValue(submitPromise);

    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    fireEvent.change(textarea, { target: { value: 'Valid proposal text' } });

    const submitButton = screen.getByText('Submit Proposal');
    fireEvent.click(submitButton);

    expect(screen.getByText('Submitting...')).toBeInTheDocument();

    resolveSubmit!();
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should disable all buttons during submission', async () => {
    let resolveSubmit: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    mockOnSubmit.mockReturnValue(submitPromise);

    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const textarea = screen.getByPlaceholderText('Type your proposal here...');
    fireEvent.change(textarea, { target: { value: 'Valid proposal text' } });

    const submitButton = screen.getByText('Submit Proposal');
    fireEvent.click(submitButton);

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByLabelText('Close')).toBeDisabled();

    resolveSubmit!();
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        className="custom-class"
      />
    );

    expect(container.querySelector('.proposal-modal')).toHaveClass('custom-class');
  });

  it('should have proper ARIA attributes', () => {
    render(
      <ProposalModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'proposal-modal-title');
  });
});
