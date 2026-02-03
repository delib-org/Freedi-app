/**
 * SocialFeed Component Tests
 */

import { render, screen } from '@testing-library/react';
import SocialFeed, { SocialActivity } from '../SocialFeed';

// Mock i18n
jest.mock('@freedi/shared-i18n/react', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'just now') return 'just now';
      if (key === '{{count}} minutes ago') return `${options?.count} minutes ago`;
      if (key === '{{count}} hours ago') return `${options?.count} hours ago`;
      if (key === '{{count}} days ago') return `${options?.count} days ago`;
      return key;
    },
  }),
}));

describe('SocialFeed', () => {
  const mockActivities: SocialActivity[] = [
    {
      id: '1',
      userId: 'user1',
      userName: 'John Doe',
      userAvatar: 'https://example.com/avatar1.jpg',
      action: 'voted',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    },
    {
      id: '2',
      userId: 'user2',
      userName: 'Jane Smith',
      action: 'suggested',
      timestamp: Date.now() - 1000 * 60 * 15, // 15 minutes ago
    },
    {
      id: '3',
      userId: 'user3',
      userName: 'Bob Johnson',
      action: 'proposed',
      timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    },
  ];

  it('should render activity list', () => {
    render(<SocialFeed activities={mockActivities} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('should render correct action text', () => {
    render(<SocialFeed activities={mockActivities} />);

    expect(screen.getByText('voted')).toBeInTheDocument();
    expect(screen.getByText('suggested improvement')).toBeInTheDocument();
    expect(screen.getByText('proposed new idea')).toBeInTheDocument();
  });

  it('should render avatar when provided', () => {
    render(<SocialFeed activities={mockActivities} />);

    const avatar = screen.getByAltText('');
    expect(avatar).toHaveClass('social-feed__avatar');
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar1.jpg');
  });

  it('should render avatar placeholder when no avatar', () => {
    render(<SocialFeed activities={mockActivities} />);

    // Jane Smith has no avatar, should show initials
    expect(screen.getByText('JS')).toBeInTheDocument();
    expect(screen.getByText('BJ')).toBeInTheDocument();
  });

  it('should show empty state when no activities', () => {
    render(<SocialFeed activities={[]} />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('should limit activities to maxItems', () => {
    const manyActivities: SocialActivity[] = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      userId: `user${i}`,
      userName: `User ${i}`,
      action: 'voted' as const,
      timestamp: Date.now(),
    }));

    render(<SocialFeed activities={manyActivities} maxItems={10} />);

    const items = document.querySelectorAll('.social-feed__item');
    expect(items).toHaveLength(10);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <SocialFeed activities={mockActivities} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass('social-feed');
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should format time correctly for recent activity', () => {
    const recentActivity: SocialActivity[] = [
      {
        id: '1',
        userId: 'user1',
        userName: 'Test User',
        action: 'voted',
        timestamp: Date.now() - 1000 * 30, // 30 seconds ago
      },
    ];

    render(<SocialFeed activities={recentActivity} />);

    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('should format time correctly for minutes ago', () => {
    const activity: SocialActivity[] = [
      {
        id: '1',
        userId: 'user1',
        userName: 'Test User',
        action: 'voted',
        timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
      },
    ];

    render(<SocialFeed activities={activity} />);

    expect(screen.getByText('10 minutes ago')).toBeInTheDocument();
  });

  it('should format time correctly for hours ago', () => {
    const activity: SocialActivity[] = [
      {
        id: '1',
        userId: 'user1',
        userName: 'Test User',
        action: 'voted',
        timestamp: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
      },
    ];

    render(<SocialFeed activities={activity} />);

    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
  });

  it('should render title', () => {
    render(<SocialFeed activities={mockActivities} />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('should handle single-word names for initials', () => {
    const activity: SocialActivity[] = [
      {
        id: '1',
        userId: 'user1',
        userName: 'Madonna',
        action: 'voted',
        timestamp: Date.now(),
      },
    ];

    render(<SocialFeed activities={activity} />);

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('should limit initials to 2 characters', () => {
    const activity: SocialActivity[] = [
      {
        id: '1',
        userId: 'user1',
        userName: 'John Jacob Jingleheimer Schmidt',
        action: 'voted',
        timestamp: Date.now(),
      },
    ];

    render(<SocialFeed activities={activity} />);

    // Should only show first 2 initials
    expect(screen.getByText('JJ')).toBeInTheDocument();
  });
});
