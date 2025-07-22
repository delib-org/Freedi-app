import { render, screen } from '@testing-library/react';
import Chip from './Chip';
import { User } from 'delib-npm';

const mockUser: User = {
  uid: 'test-123',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  email: 'test@example.com',
};

describe('Chip', () => {
  it('returns null when user is undefined', () => {
    const { container } = render(<Chip user={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders user with photo', () => {
    render(<Chip user={mockUser} />);
    
    const img = screen.getByRole('img', { name: 'Test User' });
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders smile icon when user has no photo', () => {
    const userWithoutPhoto = { ...mockUser, photoURL: null };
    render(<Chip user={userWithoutPhoto} />);
    
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('truncates long display names to 15 characters', () => {
    const userWithLongName = {
      ...mockUser,
      displayName: 'This is a very long display name that should be truncated',
    };
    render(<Chip user={userWithLongName} />);
    
    expect(screen.getByText('This is a very')).toBeInTheDocument();
    expect(screen.queryByText(userWithLongName.displayName)).not.toBeInTheDocument();
  });
});