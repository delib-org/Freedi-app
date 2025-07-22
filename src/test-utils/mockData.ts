import { User } from '../types/user';
import { Friend } from '../types/friend';
import { IMessage } from '../types/message';

export const mockUser: User = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com',
  imageUrl: 'https://example.com/avatar.jpg',
  createdAt: new Date('2024-01-01').toISOString(),
};

export const mockFriend: Friend = {
  id: 'friend-123',
  name: 'Test Friend',
  email: 'friend@example.com',
  imageUrl: 'https://example.com/friend-avatar.jpg',
  lastActive: new Date().toISOString(),
  status: 'online',
};

export const mockMessage: IMessage = {
  id: 'msg-123',
  text: 'Test message',
  senderId: mockUser.id,
  recipientId: mockFriend.id,
  timestamp: new Date().toISOString(),
  read: false,
};

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  ...mockUser,
  ...overrides,
});

export const createMockFriend = (overrides: Partial<Friend> = {}): Friend => ({
  ...mockFriend,
  ...overrides,
});

export const createMockMessage = (overrides: Partial<IMessage> = {}): IMessage => ({
  ...mockMessage,
  ...overrides,
});