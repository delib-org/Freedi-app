/**
 * @jest-environment jsdom
 */

/**
 * SurveyProgress Component Tests
 */

import { render, screen } from '@testing-library/react';
import SurveyProgress from '../SurveyProgress';

// Mock i18n
jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SurveyProgress', () => {
  it('should render progress bar with correct percentage', () => {
    render(<SurveyProgress current={5} total={10} />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '5');
    expect(progressBar).toHaveAttribute('aria-valuemax', '10');
  });

  it('should display correct count text', () => {
    render(<SurveyProgress current={3} total={7} />);

    // The component renders "3 of 7" so match the full count span
    expect(screen.getByText(/3 of 7/)).toBeInTheDocument();
  });

  it('should display correct percentage', () => {
    render(<SurveyProgress current={5} total={10} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should handle 0 total gracefully', () => {
    render(<SurveyProgress current={0} total={0} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should cap percentage at 100%', () => {
    render(<SurveyProgress current={15} total={10} />);

    const progressBar = screen.getByRole('progressbar');
    const fillElement = progressBar as HTMLDivElement;
    expect(fillElement.style.width).toBe('100%');
  });

  it('should handle current > total', () => {
    render(<SurveyProgress current={12} total={10} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <SurveyProgress current={5} total={10} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass('survey-progress');
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should show 0% when current is 0', () => {
    render(<SurveyProgress current={0} total={10} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should show 100% when current equals total', () => {
    render(<SurveyProgress current={10} total={10} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should round percentage to nearest integer', () => {
    render(<SurveyProgress current={1} total={3} />);

    // 1/3 = 33.333... should round to 33%
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('should have proper ARIA attributes', () => {
    render(<SurveyProgress current={4} total={8} />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '4');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '8');
    expect(progressBar).toHaveAttribute('aria-label', 'Survey progress');
  });
});
