/**
 * Jest setup file - runs before each test file
 * Provides default Firebase Admin SDK mocks for tests that don't define their own
 *
 * Note: Tests that define their own jest.mock() calls before imports will override these defaults.
 */

// Mock firebase-admin/app
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => [{ name: 'default' }]),
  getApp: jest.fn(() => ({ name: 'default' })),
}));

// Mock firebase-admin/firestore with configurable mock functions
// Tests can override these by importing and reconfiguring the mocks
const createMockDoc = () => ({
  get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  ref: 'mock-ref',
});

const createMockQuery = () => ({
  get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
  where: jest.fn(function() { return this; }),
  orderBy: jest.fn(function() { return this; }),
  limit: jest.fn(function() { return this; }),
  startAfter: jest.fn(function() { return this; }),
});

const mockCollection = jest.fn(() => ({
  doc: jest.fn(() => createMockDoc()),
  get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
  where: jest.fn(() => createMockQuery()),
}));

const mockFirestore = {
  collection: mockCollection,
  doc: jest.fn(() => createMockDoc()),
  batch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
  runTransaction: jest.fn((fn) => fn({
    get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
};

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  Timestamp: {
    now: jest.fn(() => ({ toMillis: () => Date.now() })),
    fromMillis: jest.fn((ms: number) => ({ toMillis: () => ms })),
  },
  FieldValue: {
    increment: jest.fn((n: number) => ({ _increment: n })),
    delete: jest.fn(() => ({ _delete: true })),
    serverTimestamp: jest.fn(() => ({ _serverTimestamp: true })),
    arrayUnion: jest.fn((...elements: unknown[]) => ({ _arrayUnion: elements })),
    arrayRemove: jest.fn((...elements: unknown[]) => ({ _arrayRemove: elements })),
  },
  Query: jest.fn(),
  CollectionReference: jest.fn(),
  DocumentData: {},
}));

// Mock firebase-functions logger
jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

// Mock firebase-functions/v1
jest.mock('firebase-functions/v1', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
  onInit: jest.fn((cb) => cb && cb()),
}));

// Mock firebase-functions/v2/firestore triggers
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: jest.fn((path, handler) => handler),
  onDocumentUpdated: jest.fn((path, handler) => handler),
  onDocumentDeleted: jest.fn((path, handler) => handler),
  onDocumentWritten: jest.fn((path, handler) => handler),
}));

// Mock firebase-functions/v2 core
jest.mock('firebase-functions/v2', () => ({
  onInit: jest.fn((cb) => cb && cb()),
}));
