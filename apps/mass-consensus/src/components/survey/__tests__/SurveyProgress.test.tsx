/**
 * Tests for SurveyProgress component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import SurveyProgressBar from '../SurveyProgress';

describe('SurveyProgressBar', () => {
  describe('rendering', () => {
    it('should render correct number of steps', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={5}
          completedIndices={[]}
        />
      );

      const dots = container.querySelectorAll('.progressDot');
      expect(dots).toHaveLength(5);
    });

    it('should render step numbers', () => {
      render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render progress lines between steps', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
        />
      );

      // 3 questions = 2 lines between them
      const lines = container.querySelectorAll('.progressLine');
      expect(lines).toHaveLength(2);
    });

    it('should not render line after last step', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={2}
          totalQuestions={3}
          completedIndices={[0, 1]}
        />
      );

      const steps = container.querySelectorAll('.progressStep');
      const lastStep = steps[steps.length - 1];
      expect(lastStep.querySelector('.progressLine')).not.toBeInTheDocument();
    });
  });

  describe('step status', () => {
    it('should mark current step as active', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={1}
          totalQuestions={3}
          completedIndices={[0]}
        />
      );

      const dots = container.querySelectorAll('.progressDot');
      expect(dots[1]).toHaveClass('active');
    });

    it('should mark completed steps with check icon', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={2}
          totalQuestions={3}
          completedIndices={[0, 1]}
        />
      );

      // Completed steps should have SVG checkmarks
      const completedDots = container.querySelectorAll('.progressDot.completed');
      expect(completedDots).toHaveLength(2);

      completedDots.forEach((dot) => {
        expect(dot.querySelector('svg')).toBeInTheDocument();
      });
    });

    it('should mark pending steps correctly', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
        />
      );

      const dots = container.querySelectorAll('.progressDot');
      expect(dots[0]).toHaveClass('active');
      expect(dots[1]).toHaveClass('pending');
      expect(dots[2]).toHaveClass('pending');
    });

    it('should mark completed lines correctly', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={2}
          totalQuestions={3}
          completedIndices={[0, 1]}
        />
      );

      const completedLines = container.querySelectorAll('.progressLine.completed');
      expect(completedLines).toHaveLength(2);
    });
  });

  describe('progress label', () => {
    it('should show question progress by default', () => {
      render(
        <SurveyProgressBar
          currentIndex={1}
          totalQuestions={5}
          completedIndices={[0]}
        />
      );

      // tWithParams returns the key with template replaced
      expect(screen.getByText('questionProgress')).toBeInTheDocument();
    });

    it('should show "aboutYou" label when isDemographic is true', () => {
      render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
          isDemographic={true}
        />
      );

      expect(screen.getByText('aboutYou')).toBeInTheDocument();
    });

    it('should show "information" label when isExplanation is true', () => {
      render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
          isExplanation={true}
        />
      );

      expect(screen.getByText('information')).toBeInTheDocument();
    });

    it('should prioritize isDemographic over isExplanation', () => {
      render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={3}
          completedIndices={[]}
          isDemographic={true}
          isExplanation={true}
        />
      );

      expect(screen.getByText('aboutYou')).toBeInTheDocument();
      expect(screen.queryByText('information')).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle single question', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={0}
          totalQuestions={1}
          completedIndices={[]}
        />
      );

      const dots = container.querySelectorAll('.progressDot');
      expect(dots).toHaveLength(1);

      // No lines for single question
      const lines = container.querySelectorAll('.progressLine');
      expect(lines).toHaveLength(0);
    });

    it('should handle all completed', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={2}
          totalQuestions={3}
          completedIndices={[0, 1, 2]}
        />
      );

      const completedDots = container.querySelectorAll('.progressDot.completed');
      expect(completedDots).toHaveLength(3);
    });

    it('should handle currentIndex at end', () => {
      const { container } = render(
        <SurveyProgressBar
          currentIndex={4}
          totalQuestions={5}
          completedIndices={[0, 1, 2, 3]}
        />
      );

      const dots = container.querySelectorAll('.progressDot');
      expect(dots[4]).toHaveClass('active');
    });
  });
});
