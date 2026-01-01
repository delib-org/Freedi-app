/**
 * Tests for SurveyCard component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyCard from '../SurveyCard';
import { Survey, SurveyStatus } from '@/types/survey';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock AuthProvider
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshToken: jest.fn().mockResolvedValue('mock-token'),
    user: { uid: 'user-123' },
  }),
}));

describe('SurveyCard', () => {
  const createMockSurvey = (overrides: Partial<Survey> = {}): Survey => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1', 'q2', 'q3'],
    settings: {
      allowAnonymous: true,
      shuffleQuestions: false,
      showProgress: true,
    },
    questionSettings: {},
    status: SurveyStatus.draft,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    ...overrides,
  });

  const mockOnDelete = jest.fn();
  const mockOnStatusChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        responseCount: 10,
        completionCount: 5,
        completionRate: 50,
      }),
    });
  });

  describe('rendering', () => {
    it('should render survey title', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ title: 'My Test Survey' })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('My Test Survey')).toBeInTheDocument();
    });

    it('should render description when provided', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ description: 'Survey description' })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Survey description')).toBeInTheDocument();
    });

    it('should render question count', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/questions/)).toBeInTheDocument();
    });

    it('should render status badge', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should show draft status correctly', () => {
      const { container } = render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('draft')).toBeInTheDocument();
    });

    it('should show active status correctly', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('should show closed status correctly', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.closed })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('closed')).toBeInTheDocument();
    });
  });

  describe('stats display', () => {
    it('should fetch and display stats', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/surveys/survey-123/stats',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer mock-token',
            }),
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching stats', () => {
      (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // Never resolves

      const { container } = render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      expect(container.querySelector('.miniSpinner')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should render edit link', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      const editLink = screen.getByText('edit');
      expect(editLink).toBeInTheDocument();
      expect(editLink.closest('a')).toHaveAttribute('href', '/admin/surveys/survey-123');
    });

    it('should render delete button', async () => {
      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('delete')).toBeInTheDocument();
    });

    it('should call onDelete with confirmation', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn().mockReturnValue(true);

      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      await user.click(screen.getByText('delete'));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnDelete).toHaveBeenCalledWith('survey-123');
    });

    it('should not delete when confirmation cancelled', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn().mockReturnValue(false);

      render(
        <SurveyCard
          survey={createMockSurvey()}
          onDelete={mockOnDelete}
        />
      );

      await user.click(screen.getByText('delete'));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('should show preview link for active surveys', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onDelete={mockOnDelete}
        />
      );

      const previewLink = screen.getByText('preview');
      expect(previewLink).toBeInTheDocument();
      expect(previewLink.closest('a')).toHaveAttribute('href', '/s/survey-123');
    });

    it('should not show preview link for draft surveys', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByText('preview')).not.toBeInTheDocument();
    });
  });

  describe('activate action', () => {
    it('should show activate button for draft surveys', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onDelete={mockOnDelete}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('activate')).toBeInTheDocument();
    });

    it('should not show activate button for active surveys', () => {
      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onDelete={mockOnDelete}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.queryByText('activate')).not.toBeInTheDocument();
    });

    it('should call onStatusChange when activate clicked', async () => {
      const user = userEvent.setup();
      mockOnStatusChange.mockResolvedValue(undefined);

      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onDelete={mockOnDelete}
          onStatusChange={mockOnStatusChange}
        />
      );

      await user.click(screen.getByText('activate'));

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalledWith('survey-123', SurveyStatus.active);
      });
    });

    it('should show loading state while activating', async () => {
      const user = userEvent.setup();
      let resolvePromise: () => void;
      mockOnStatusChange.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = () => resolve(undefined);
        })
      );

      render(
        <SurveyCard
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onDelete={mockOnDelete}
          onStatusChange={mockOnStatusChange}
        />
      );

      await user.click(screen.getByText('activate'));

      expect(screen.getByText('activating')).toBeInTheDocument();

      resolvePromise!();
    });
  });
});
