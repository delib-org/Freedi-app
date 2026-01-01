/**
 * Tests for admin verification utilities
 */
import { Role, Collections } from '@freedi/shared-types';
import {
  extractBearerToken,
  verifyAdmin,
  verifyToken,
  isAdminOfStatement,
  AdminVerificationResult,
} from '../verifyAdmin';

// Mock Firebase Admin modules
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));

jest.mock('../../firebase/admin', () => ({
  initializeFirebaseAdmin: jest.fn(),
  getFirestoreAdmin: jest.fn(),
}));

import { getAuth } from 'firebase-admin/auth';
import { getFirestoreAdmin, initializeFirebaseAdmin } from '../../firebase/admin';

describe('verifyAdmin', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('extractBearerToken', () => {
    it('should return null for null header', () => {
      expect(extractBearerToken(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractBearerToken('')).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('should return null for incomplete Bearer prefix', () => {
      expect(extractBearerToken('Bear abc123')).toBeNull();
    });

    it('should return null for Bearer without space', () => {
      expect(extractBearerToken('Bearerabc123')).toBeNull();
    });

    it('should extract token from valid Bearer header', () => {
      const token = 'abc123xyz';
      expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    });

    it('should handle empty token after Bearer', () => {
      expect(extractBearerToken('Bearer ')).toBe('');
    });

    it('should handle token with special characters', () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmaXJlYmFzZS1hZG1pbiJ9.sig';
      expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    });

    it('should handle token with spaces (take everything after Bearer )', () => {
      const token = 'token with spaces';
      expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    });

    it('should be case-sensitive for Bearer', () => {
      expect(extractBearerToken('bearer abc123')).toBeNull();
      expect(extractBearerToken('BEARER abc123')).toBeNull();
    });
  });

  describe('verifyAdmin', () => {
    const mockVerifyIdToken = jest.fn();
    const mockCollection = jest.fn();
    const mockWhere = jest.fn();
    const mockLimit = jest.fn();
    const mockGet = jest.fn();

    beforeEach(() => {
      (getAuth as jest.Mock).mockReturnValue({
        verifyIdToken: mockVerifyIdToken,
      });

      mockGet.mockResolvedValue({ empty: true });
      mockLimit.mockReturnValue({ get: mockGet });
      mockWhere.mockReturnValue({ where: mockWhere, limit: mockLimit });
      mockCollection.mockReturnValue({ where: mockWhere });

      (getFirestoreAdmin as jest.Mock).mockReturnValue({
        collection: mockCollection,
      });
    });

    it('should initialize Firebase Admin', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });

      await verifyAdmin('valid-token');

      expect(initializeFirebaseAdmin).toHaveBeenCalled();
    });

    it('should verify the token with Firebase Auth', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });

      await verifyAdmin('valid-token');

      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should check for admin subscriptions', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });

      await verifyAdmin('valid-token');

      expect(mockCollection).toHaveBeenCalledWith(Collections.statementsSubscribe);
      expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user-123');
      expect(mockWhere).toHaveBeenCalledWith('role', '==', Role.admin);
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('should return isAdmin: true when user has admin subscription', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'admin-user' });
      mockGet.mockResolvedValue({ empty: false });

      const result: AdminVerificationResult = await verifyAdmin('valid-token');

      expect(result.isAdmin).toBe(true);
      expect(result.userId).toBe('admin-user');
      expect(result.error).toBeUndefined();
    });

    it('should return isAdmin: false when user has no admin subscription', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'regular-user' });
      mockGet.mockResolvedValue({ empty: true });

      const result: AdminVerificationResult = await verifyAdmin('valid-token');

      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBe('regular-user');
      expect(result.error).toBeUndefined();
    });

    it('should log user and admin status', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });
      mockGet.mockResolvedValue({ empty: false });

      await verifyAdmin('valid-token');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[verifyAdmin] User:',
        'user-123',
        'isAdmin:',
        true
      );
    });

    it('should return error result when token verification fails', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const result: AdminVerificationResult = await verifyAdmin('invalid-token');

      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBe('');
      expect(result.error).toBe('Invalid token');
    });

    it('should handle non-Error exceptions', async () => {
      mockVerifyIdToken.mockRejectedValue('String error');

      const result: AdminVerificationResult = await verifyAdmin('invalid-token');

      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBe('');
      expect(result.error).toBe('Token verification failed');
    });

    it('should log error when verification fails', async () => {
      const error = new Error('Token expired');
      mockVerifyIdToken.mockRejectedValue(error);

      await verifyAdmin('invalid-token');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[verifyAdmin] Token verification failed:',
        error
      );
    });
  });

  describe('verifyToken', () => {
    const mockVerifyIdToken = jest.fn();

    beforeEach(() => {
      (getAuth as jest.Mock).mockReturnValue({
        verifyIdToken: mockVerifyIdToken,
      });
    });

    it('should initialize Firebase Admin', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });

      await verifyToken('valid-token');

      expect(initializeFirebaseAdmin).toHaveBeenCalled();
    });

    it('should return user ID for valid token', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });

      const result = await verifyToken('valid-token');

      expect(result).toBe('user-123');
    });

    it('should return null for invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const result = await verifyToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should log error when verification fails', async () => {
      const error = new Error('Token expired');
      mockVerifyIdToken.mockRejectedValue(error);

      await verifyToken('invalid-token');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[verifyToken] Token verification failed:',
        error
      );
    });
  });

  describe('isAdminOfStatement', () => {
    const mockCollection = jest.fn();
    const mockDoc = jest.fn();
    const mockGet = jest.fn();

    beforeEach(() => {
      mockDoc.mockReturnValue({ get: mockGet });
      mockCollection.mockReturnValue({ doc: mockDoc });

      (getFirestoreAdmin as jest.Mock).mockReturnValue({
        collection: mockCollection,
      });
    });

    it('should return true if user is statement creator', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ creatorId: 'user-123' }),
      });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(true);
    });

    it('should check statements collection first', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ creatorId: 'user-123' }),
      });

      await isAdminOfStatement('user-123', 'stmt-456');

      expect(mockCollection).toHaveBeenCalledWith(Collections.statements);
      expect(mockDoc).toHaveBeenCalledWith('stmt-456');
    });

    it('should check subscription if not creator', async () => {
      // First call for statement - not creator
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ creatorId: 'other-user' }),
      });
      // Second call for subscription - has admin role
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ role: Role.admin }),
      });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(true);
      expect(mockCollection).toHaveBeenCalledWith(Collections.statementsSubscribe);
      expect(mockDoc).toHaveBeenCalledWith('user-123--stmt-456');
    });

    it('should return false if statement does not exist and no subscription', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(false);
    });

    it('should return false if subscription exists but role is not admin', async () => {
      // Statement - not creator
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ creatorId: 'other-user' }),
      });
      // Subscription - member role
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ role: Role.member }),
      });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(false);
    });

    it('should return false on error and log', async () => {
      const error = new Error('Database error');
      mockGet.mockRejectedValue(error);

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[isAdminOfStatement] Error checking admin access:',
        error
      );
    });

    it('should handle missing creatorId in statement data', async () => {
      // Statement exists but no creatorId
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({}),
      });
      // No subscription
      mockGet.mockResolvedValueOnce({ exists: false });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(false);
    });

    it('should handle null statement data', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => null,
      });
      mockGet.mockResolvedValueOnce({ exists: false });

      const result = await isAdminOfStatement('user-123', 'stmt-456');

      expect(result).toBe(false);
    });
  });
});
