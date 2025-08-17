import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router';
import { store as appStore } from '@/redux/store';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: any;
  store?: ReturnType<typeof configureStore>;
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState = {},
    store = appStore,
    route = '/',
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  if (route !== '/') {
    window.history.pushState({}, 'Test page', route);
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          {children}
        </MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

export const createMockStore = (preloadedState = {}) => {
  return configureStore({
    reducer: appStore.reducer,
    preloadedState
  });
};

export const mockFirebaseAuth = {
  currentUser: {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
    emailVerified: true
  },
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn()
};

export const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn()
};

export const mockStatement = {
  statementId: 'stmt-1',
  statement: 'Test statement',
  description: 'Test description',
  creatorId: 'user-1',
  createdAt: new Date(),
  lastUpdate: new Date(),
  parentId: 'parent-1',
  topParentId: 'top-1',
  hasChildren: false,
  consensus: 0.75
};

export const mockUser = {
  uid: 'user-1',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/photo.jpg',
  role: 'user',
  isAnonymous: false
};

export const mockEvaluation = {
  evaluationId: 'eval-1',
  statementId: 'stmt-1',
  userId: 'user-1',
  evaluation: 7,
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockVote = {
  voteId: 'vote-1',
  statementId: 'stmt-1',
  userId: 'user-1',
  parentId: 'parent-1',
  vote: 1,
  createdAt: new Date()
};

export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

export const createMockIntersectionObserver = () => {
  const mockIntersectionObserver = jest.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
  });
  window.IntersectionObserver = mockIntersectionObserver as any;
  
return mockIntersectionObserver;
};

export * from '@testing-library/react';