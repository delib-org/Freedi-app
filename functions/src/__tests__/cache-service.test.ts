// Mock Firestore first before any imports
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn();
const mockWhere = jest.fn();
const mockCollection = jest.fn(() => ({
  doc: mockDoc,
  get: mockGet,
  where: mockWhere,
}));

const mockBatch = jest.fn(() => ({
  delete: jest.fn(),
  commit: jest.fn(),
}));

jest.mock("..", () => ({
  db: {
    collection: mockCollection,
    batch: mockBatch,
  },
}));

// Import after mocks are set up
import { cache } from "../services/cache-service";

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("FirestoreCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      delete: mockDelete,
      update: mockUpdate,
    });
  });

  describe("get", () => {
    it("should return null if document does not exist", async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await cache.get("test-key");

      expect(result).toBeNull();
      expect(mockDoc).toHaveBeenCalledWith("test-key");
    });

    it("should return null if cache is expired", async () => {
      const expiredData = {
        value: "test-value",
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        createdAt: Date.now() - 60000,
        hitCount: 5,
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => expiredData,
      });

      const result = await cache.get("test-key");

      expect(result).toBeNull();
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should return cached value if not expired", async () => {
      const validData = {
        value: { test: "data" },
        expiresAt: Date.now() + 60000, // Expires in 1 minute
        createdAt: Date.now() - 30000,
        hitCount: 3,
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => validData,
      });

      const result = await cache.get("test-key");

      expect(result).toEqual({ test: "data" });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          hitCount: 4,
        })
      );
    });

    it("should handle errors gracefully", async () => {
      mockGet.mockRejectedValue(new Error("Firestore error"));

      const result = await cache.get("test-key");

      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should store value with default TTL", async () => {
      const testValue = { test: "value" };
      await cache.set("test-key", testValue);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          value: testValue,
          hitCount: 0,
        })
      );

      const callArg = mockSet.mock.calls[0][0];
      expect(callArg.expiresAt).toBeGreaterThan(Date.now());
      expect(callArg.expiresAt).toBeLessThanOrEqual(
        Date.now() + 5 * 60 * 1000
      );
    });

    it("should store value with custom TTL", async () => {
      const testValue = "cached-data";
      await cache.set("test-key", testValue, 10);

      const callArg = mockSet.mock.calls[0][0];
      expect(callArg.value).toBe(testValue);
      expect(callArg.expiresAt).toBeLessThanOrEqual(
        Date.now() + 10 * 60 * 1000
      );
    });

    it("should handle errors silently", async () => {
      mockSet.mockRejectedValue(new Error("Firestore error"));

      // Should not throw
      await expect(
        cache.set("test-key", "value")
      ).resolves.not.toThrow();
    });
  });

  describe("generateKey", () => {
    it("should generate deterministic keys", () => {
      const key1 = cache.generateKey("part1", "part2", "part3");
      const key2 = cache.generateKey("part1", "part2", "part3");

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^cache_[a-z0-9]+$/);
    });

    it("should generate different keys for different inputs", () => {
      const key1 = cache.generateKey("part1", "part2");
      const key2 = cache.generateKey("part1", "part3");

      expect(key1).not.toBe(key2);
    });
  });

  describe("delete", () => {
    it("should delete a cache entry", async () => {
      await cache.delete("test-key");

      expect(mockDoc).toHaveBeenCalledWith("test-key");
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should handle delete errors", async () => {
      mockDelete.mockRejectedValue(new Error("Delete error"));

      // Should not throw
      await expect(cache.delete("test-key")).resolves.not.toThrow();
    });
  });

  describe("cleanupExpired", () => {
    it("should delete expired cache entries", async () => {
      const mockBatchDelete = jest.fn();
      const mockBatchCommit = jest.fn();

      mockBatch.mockReturnValue({
        delete: mockBatchDelete,
        commit: mockBatchCommit,
      });

      const expiredDocs = [
        { ref: "ref1" },
        { ref: "ref2" },
      ];

      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: expiredDocs,
        }),
      });

      await cache.cleanupExpired();

      expect(mockWhere).toHaveBeenCalledWith(
        "expiresAt",
        "<",
        expect.any(Number)
      );
      expect(mockBatchDelete).toHaveBeenCalledTimes(2);
      expect(mockBatchCommit).toHaveBeenCalled();
    });

    it("should handle no expired entries", async () => {
      mockWhere.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          empty: true,
          docs: [],
        }),
      });

      await cache.cleanupExpired();

      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("should return cache statistics", async () => {
      const now = Date.now();
      const mockDocs = [
        {
          data: () => ({
            expiresAt: now - 1000, // Expired
          }),
        },
        {
          data: () => ({
            expiresAt: now + 1000, // Active
          }),
        },
        {
          data: () => ({
            expiresAt: now + 2000, // Active
          }),
        },
      ];

      mockGet.mockResolvedValue({
        size: 3,
        docs: mockDocs,
      });

      const stats = await cache.getStats();

      expect(stats).toEqual({
        totalEntries: 3,
        expiredEntries: 1,
        activeEntries: 2,
      });
    });

    it("should handle errors in getStats", async () => {
      mockGet.mockRejectedValue(new Error("Stats error"));

      const stats = await cache.getStats();

      expect(stats).toEqual({
        totalEntries: 0,
        expiredEntries: 0,
        activeEntries: 0,
      });
    });
  });
});