/**
 * Tests for SurveyStatusManager component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyStatusManager from '../SurveyStatusManager';
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

// Mock AuthProvider
const mockRefreshToken = jest.fn().mockResolvedValue('mock-token');
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshToken: mockRefreshToken,
    user: { uid: 'user-123' },
  }),
}));

describe('SurveyStatusManager', () => {
  const createMockSurvey = (overrides: Partial<Survey> = {}): Survey => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1', 'q2'],
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
    it('should render status heading', async () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('surveyStatus')).toBeInTheDocument();
    });

    it('should render all status options', () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('draft')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('closed')).toBeInTheDocument();
    });

    it('should show current status as selected', () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const activeRadio = screen.getByRole('radio', { name: /active/i });
      expect(activeRadio).toBeChecked();
    });
  });

  describe('stats display', () => {
    it('should fetch and display stats', async () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
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
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should show statistics section when stats loaded', async () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('statistics')).toBeInTheDocument();
      });
    });
  });

  describe('status changes', () => {
    it('should change to active status', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ responseCount: 0, completionCount: 0, completionRate: 0 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...createMockSurvey(),
            status: SurveyStatus.active,
          }),
        });
      });

      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const activeRadio = screen.getByRole('radio', { name: /active/i });
      await user.click(activeRadio);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/surveys/survey-123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ status: SurveyStatus.active }),
          })
        );
      });
    });

    it('should call onStatusChange with updated survey', async () => {
      const user = userEvent.setup();
      const updatedSurvey = {
        ...createMockSurvey(),
        status: SurveyStatus.active,
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ responseCount: 0, completionCount: 0, completionRate: 0 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(updatedSurvey),
        });
      });

      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const activeRadio = screen.getByRole('radio', { name: /active/i });
      await user.click(activeRadio);

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalledWith(updatedSurvey);
      });
    });
  });

  describe('close confirmation', () => {
    it('should show confirmation modal when trying to close', async () => {
      const user = userEvent.setup();
      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const closedRadio = screen.getByRole('radio', { name: /closed/i });
      await user.click(closedRadio);

      expect(screen.getByText('confirmClose')).toBeInTheDocument();
      expect(screen.getByText('closeWarning')).toBeInTheDocument();
    });

    it('should close confirmation modal on cancel', async () => {
      const user = userEvent.setup();
      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const closedRadio = screen.getByRole('radio', { name: /closed/i });
      await user.click(closedRadio);

      const cancelButton = screen.getByText('cancel');
      await user.click(cancelButton);

      expect(screen.queryByText('confirmClose')).not.toBeInTheDocument();
    });

    it('should proceed to close when confirmed', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ responseCount: 0, completionCount: 0, completionRate: 0 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...createMockSurvey(),
            status: SurveyStatus.closed,
          }),
        });
      });

      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.active })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const closedRadio = screen.getByRole('radio', { name: /closed/i });
      await user.click(closedRadio);

      const confirmButton = screen.getByText('closeSurvey');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/surveys/survey-123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ status: SurveyStatus.closed }),
          })
        );
      });
    });
  });

  describe('error handling', () => {
    it('should display error on failed status change', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ responseCount: 0, completionCount: 0, completionRate: 0 }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
        });
      });

      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const activeRadio = screen.getByRole('radio', { name: /active/i });
      await user.click(activeRadio);

      await waitFor(() => {
        expect(screen.getByText('Failed to update status')).toBeInTheDocument();
      });
    });

    it('should redirect to login when token is null', async () => {
      const user = userEvent.setup();
      mockRefreshToken.mockResolvedValueOnce('mock-token'); // For stats
      mockRefreshToken.mockResolvedValueOnce(null); // For status change

      render(
        <SurveyStatusManager
          survey={createMockSurvey({ status: SurveyStatus.draft })}
          onStatusChange={mockOnStatusChange}
        />
      );

      const activeRadio = screen.getByRole('radio', { name: /active/i });
      await user.click(activeRadio);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login'));
      });
    });
  });

  describe('status descriptions', () => {
    it('should show draft description', () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('draftDescription')).toBeInTheDocument();
    });

    it('should show active description', () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('activeDescription')).toBeInTheDocument();
    });

    it('should show closed description', () => {
      render(
        <SurveyStatusManager
          survey={createMockSurvey()}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('closedDescription')).toBeInTheDocument();
    });
  });
});
