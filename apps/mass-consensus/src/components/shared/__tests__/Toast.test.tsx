/**
 * Tests for Toast component and ToastProvider
 * @jest-environment jsdom
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast, ToastType } from '../Toast';

// Test component that uses the toast hook
function TestComponent({ toastConfig }: { toastConfig?: { type: ToastType; message: string; title?: string; duration?: number } }) {
  const { showToast, removeToast, toasts } = useToast();

  return (
    <div>
      <button onClick={() => showToast(toastConfig || { type: 'success', message: 'Test message' })}>
        Show Toast
      </button>
      <button onClick={() => toasts[0] && removeToast(toasts[0].id)}>Remove Toast</button>
      <span data-testid="toast-count">{toasts.length}</span>
    </div>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('ToastProvider', () => {
    it('should render children', () => {
      render(
        <ToastProvider>
          <div>Child content</div>
        </ToastProvider>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should provide toast context to children', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByRole('button', { name: 'Show Toast' })).toBeInTheDocument();
    });
  });

  describe('useToast hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useToast must be used within ToastProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('showToast', () => {
    it('should display toast message', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should display toast title when provided', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'success', message: 'Message', title: 'Title' }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Message')).toBeInTheDocument();
    });

    it('should increment toast count', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });

    it('should support multiple toasts', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));
      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
    });
  });

  describe('toast types', () => {
    const toastTypes: ToastType[] = ['success', 'error', 'warning', 'info'];

    toastTypes.forEach((type) => {
      it(`should render ${type} toast with correct icon`, async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(
          <ToastProvider>
            <TestComponent toastConfig={{ type, message: 'Test' }} />
          </ToastProvider>
        );

        await user.click(screen.getByRole('button', { name: 'Show Toast' }));

        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('toast icons', () => {
    it('should show checkmark for success', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'success', message: 'Success!' }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('should show X for error', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'error', message: 'Error!' }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('should show warning icon for warning', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'warning', message: 'Warning!' }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('⚠')).toBeInTheDocument();
    });

    it('should show info icon for info', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'info', message: 'Info!' }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByText('ℹ')).toBeInTheDocument();
    });
  });

  describe('removeToast', () => {
    it('should remove toast when close button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const closeButton = screen.getByRole('button', { name: 'Close notification' });
      await user.click(closeButton);

      // Wait for animation delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should remove toast programmatically', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));
      await user.click(screen.getByRole('button', { name: 'Remove Toast' }));

      // Wait for animation
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });
  });

  describe('auto-dismiss', () => {
    it('should auto-dismiss after default duration', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Default duration is 5000ms
      act(() => {
        jest.advanceTimersByTime(5500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should use custom duration when provided', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent toastConfig={{ type: 'info', message: 'Quick!', duration: 1000 }} />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Custom duration of 1000ms
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });
  });

  describe('accessibility', () => {
    it('should have role="alert"', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-live="polite"', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    });

    it('should have accessible close button', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Show Toast' }));

      expect(screen.getByRole('button', { name: 'Close notification' })).toBeInTheDocument();
    });
  });

  describe('empty container', () => {
    it('should not render container when no toasts', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
