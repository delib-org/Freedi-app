import { User as FirebaseUser } from 'firebase/auth';

export const mockFirebaseUser: FirebaseUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  emailVerified: true,
  isAnonymous: false,
  metadata: {
    creationTime: '2024-01-01T00:00:00Z',
    lastSignInTime: '2024-01-01T00:00:00Z',
  },
  providerData: [],
  refreshToken: 'mock-refresh-token',
  tenantId: null,
  delete: jest.fn(),
  getIdToken: jest.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: jest.fn(),
  reload: jest.fn(),
  toJSON: jest.fn(),
  phoneNumber: null,
  providerId: 'firebase',
};

export const mockAuth = {
  currentUser: mockFirebaseUser,
  onAuthStateChanged: jest.fn((callback) => {
    callback(mockFirebaseUser);
    return jest.fn(); // unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn().mockResolvedValue({
    user: mockFirebaseUser,
  }),
  createUserWithEmailAndPassword: jest.fn().mockResolvedValue({
    user: mockFirebaseUser,
  }),
  signOut: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
};

export const mockFirestore = {
  collection: jest.fn().mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({}),
        id: 'doc-123',
      }),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      onSnapshot: jest.fn((callback) => {
        callback({
          exists: () => true,
          data: () => ({}),
          id: 'doc-123',
        });
        return jest.fn(); // unsubscribe function
      }),
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-doc-123' }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      docs: [],
      size: 0,
      empty: true,
    }),
    onSnapshot: jest.fn((callback) => {
      callback({
        docs: [],
        size: 0,
        empty: true,
      });
      return jest.fn(); // unsubscribe function
    }),
  }),
  doc: jest.fn(),
  batch: jest.fn().mockReturnValue({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  }),
  runTransaction: jest.fn((updateFunction) => {
    const mockTransaction = {
      get: jest.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      }),
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    return Promise.resolve(updateFunction(mockTransaction));
  }),
};

export const setupFirebaseMocks = () => {
  jest.mock('firebase/auth', () => ({
    getAuth: () => mockAuth,
    onAuthStateChanged: mockAuth.onAuthStateChanged,
    signInWithEmailAndPassword: mockAuth.signInWithEmailAndPassword,
    createUserWithEmailAndPassword: mockAuth.createUserWithEmailAndPassword,
    signOut: mockAuth.signOut,
    sendPasswordResetEmail: mockAuth.sendPasswordResetEmail,
  }));

  jest.mock('firebase/firestore', () => ({
    getFirestore: () => mockFirestore,
    collection: mockFirestore.collection,
    doc: mockFirestore.doc,
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    addDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn(),
    serverTimestamp: jest.fn(() => new Date()),
  }));
};