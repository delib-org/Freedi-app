/**
 * Tests for AchievementBadge component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import AchievementBadge, { BadgeType } from '../AchievementBadge';

describe('AchievementBadge', () => {
  const badgeTypes: BadgeType[] = [
    'early-contributor',
    'thoughtful-evaluator',
    'solution-creator',
    'consensus-participant',
  ];

  describe('rendering', () => {
    it.each(badgeTypes)('should render %s badge', (type) => {
      render(<AchievementBadge type={type} />);

      // Each badge should have an icon and label
      const badge = document.querySelector('.badge');
      expect(badge).toBeInTheDocument();
    });

    it('should render early-contributor badge with correct content', () => {
      render(<AchievementBadge type="early-contributor" />);

      expect(screen.getByText('🌟')).toBeInTheDocument();
      expect(screen.getByText('Early Bird')).toBeInTheDocument();
    });

    it('should render thoughtful-evaluator badge with correct content', () => {
      render(<AchievementBadge type="thoughtful-evaluator" />);

      expect(screen.getByText('🧠')).toBeInTheDocument();
      expect(screen.getByText('Deep Thinker')).toBeInTheDocument();
    });

    it('should render solution-creator badge with correct content', () => {
      render(<AchievementBadge type="solution-creator" />);

      expect(screen.getByText('💡')).toBeInTheDocument();
      expect(screen.getByText('Innovator')).toBeInTheDocument();
    });

    it('should render consensus-participant badge with correct content', () => {
      render(<AchievementBadge type="consensus-participant" />);

      expect(screen.getByText('🤝')).toBeInTheDocument();
      expect(screen.getByText('Team Player')).toBeInTheDocument();
    });
  });

  describe('description visibility', () => {
    it('should not show description by default', () => {
      render(<AchievementBadge type="early-contributor" />);

      expect(screen.queryByText('Among the first 50 participants')).not.toBeInTheDocument();
    });

    it('should show description when showDescription is true', () => {
      render(<AchievementBadge type="early-contributor" showDescription={true} />);

      expect(screen.getByText('Among the first 50 participants')).toBeInTheDocument();
    });

    it.each([
      ['early-contributor', 'Among the first 50 participants'],
      ['thoughtful-evaluator', 'Evaluated 5+ solutions'],
      ['solution-creator', 'Submitted your own solution'],
      ['consensus-participant', 'Completed the full consensus flow'],
    ] as [BadgeType, string][])('should show correct description for %s', (type, description) => {
      render(<AchievementBadge type={type} showDescription={true} />);

      expect(screen.getByText(description)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have title attribute with description', () => {
      const { container } = render(<AchievementBadge type="early-contributor" />);

      const badge = container.querySelector('.badge');
      expect(badge).toHaveAttribute('title', 'Among the first 50 participants');
    });

    it.each(badgeTypes)('should have title for %s badge', (type) => {
      const { container } = render(<AchievementBadge type={type} />);

      const badge = container.querySelector('.badge');
      expect(badge).toHaveAttribute('title');
      expect(badge?.getAttribute('title')).not.toBe('');
    });
  });

  describe('styling', () => {
    it('should apply badge color as CSS variable', () => {
      const { container } = render(<AchievementBadge type="early-contributor" />);

      const badge = container.querySelector('.badge') as HTMLElement;
      expect(badge.style.getPropertyValue('--badge-color')).toBe('#FFD700');
    });

    it('should have correct color for thoughtful-evaluator', () => {
      const { container } = render(<AchievementBadge type="thoughtful-evaluator" />);

      const badge = container.querySelector('.badge') as HTMLElement;
      expect(badge.style.getPropertyValue('--badge-color')).toBe('#9C27B0');
    });

    it('should have correct color for solution-creator', () => {
      const { container } = render(<AchievementBadge type="solution-creator" />);

      const badge = container.querySelector('.badge') as HTMLElement;
      expect(badge.style.getPropertyValue('--badge-color')).toBe('#FF9800');
    });

    it('should have correct color for consensus-participant', () => {
      const { container } = render(<AchievementBadge type="consensus-participant" />);

      const badge = container.querySelector('.badge') as HTMLElement;
      expect(badge.style.getPropertyValue('--badge-color')).toBe('#4CAF50');
    });
  });

  describe('structure', () => {
    it('should have icon element', () => {
      const { container } = render(<AchievementBadge type="early-contributor" />);

      expect(container.querySelector('.icon')).toBeInTheDocument();
    });

    it('should have label element', () => {
      const { container } = render(<AchievementBadge type="early-contributor" />);

      expect(container.querySelector('.label')).toBeInTheDocument();
    });

    it('should have description element when showDescription is true', () => {
      const { container } = render(
        <AchievementBadge type="early-contributor" showDescription={true} />
      );

      expect(container.querySelector('.description')).toBeInTheDocument();
    });

    it('should not have description element when showDescription is false', () => {
      const { container } = render(
        <AchievementBadge type="early-contributor" showDescription={false} />
      );

      expect(container.querySelector('.description')).not.toBeInTheDocument();
    });
  });
});
