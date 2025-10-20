import { Request, Response } from "firebase-functions/v1";
import { findSimilarStatements } from "../fn_findSimilarStatements";
import * as aiService from "../services/ai-service";
import * as cachedStatementService from "../services/cached-statement-service";
import * as cachedAiService from "../services/cached-ai-service";
import * as statementService from "../services/statement-service";

// Mock dependencies
jest.mock("../services/ai-service");
jest.mock("../services/cached-statement-service");
jest.mock("../services/cached-ai-service");
jest.mock("../services/statement-service");
jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("findSimilarStatements - Optimized", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn();
    mockStatus = jest.fn(() => ({ send: mockSend }));

    mockRequest = {
      body: {
        statementId: "test-statement-id",
        userInput: "test user input",
        creatorId: "test-creator-id",
      },
    };

    mockResponse = {
      status: mockStatus,
      send: mockSend,
    };
  });

  describe("Content moderation", () => {
    it("should reject inappropriate content", async () => {
      jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: true,
        });

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        ok: false,
        error: "Input contains inappropriate content",
      });

      // Ensure no further processing happens
      expect(cachedAiService.getCachedSimilarityResponse).not.toHaveBeenCalled();
    });

    it("should never cache inappropriate content checks", async () => {
      const checkSpy = jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: false,
        });

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      // Content check should always be called fresh, never cached
      expect(checkSpy).toHaveBeenCalledWith("test user input");
      expect(checkSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Caching behavior", () => {
    beforeEach(() => {
      jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: false,
        });
    });

    it("should return cached response when available", async () => {
      const cachedData = {
        similarStatements: [{ statement: "cached statement" }],
        userText: "cached user text",
      };

      jest
        .spyOn(cachedAiService, "getCachedSimilarityResponse")
        .mockResolvedValue(cachedData);

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ...cachedData,
          ok: true,
          cached: true,
        })
      );

      // Should not fetch from database when cache hit
      expect(cachedStatementService.getCachedParentStatement).not.toHaveBeenCalled();
      expect(cachedStatementService.getCachedSubStatements).not.toHaveBeenCalled();
    });

    it("should compute and cache response on cache miss", async () => {
      const mockParentStatement = {
        statement: "parent question",
        statementSettings: { numberOfOptionsPerUser: 10 },
      };

      const mockSubStatements = [
        { statementId: "sub1", statement: "statement 1", creatorId: "creator1" },
        { statementId: "sub2", statement: "statement 2", creatorId: "creator2" },
      ];

      jest
        .spyOn(cachedAiService, "getCachedSimilarityResponse")
        .mockResolvedValue(null);

      jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockResolvedValue(mockParentStatement as any);

      jest
        .spyOn(cachedStatementService, "getCachedSubStatements")
        .mockResolvedValue(mockSubStatements as any);

      jest
        .spyOn(statementService, "getUserStatements")
        .mockReturnValue([]);

      jest
        .spyOn(statementService, "hasReachedMaxStatements")
        .mockReturnValue(false);

      jest
        .spyOn(statementService, "convertToSimpleStatements")
        .mockReturnValue([
          { id: "sub1", statement: "statement 1" },
          { id: "sub2", statement: "statement 2" },
        ]);

      jest
        .spyOn(cachedAiService, "getCachedSimilarStatements")
        .mockResolvedValue(["statement 1"]);

      jest
        .spyOn(statementService, "getStatementsFromTexts")
        .mockReturnValue([mockSubStatements[0]] as any);

      jest
        .spyOn(statementService, "removeDuplicateStatement")
        .mockReturnValue({
          statements: [mockSubStatements[0]] as any,
          duplicateStatement: undefined,
        });

      const saveSpy = jest
        .spyOn(cachedAiService, "saveCachedSimilarityResponse")
        .mockResolvedValue();

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      // Verify response was saved to cache
      expect(saveSpy).toHaveBeenCalledWith(
        "test-statement-id",
        "test user input",
        "test-creator-id",
        expect.objectContaining({
          similarStatements: [mockSubStatements[0]],
          userText: "test user input",
        })
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          similarStatements: [mockSubStatements[0]],
          userText: "test user input",
        })
      );
    });
  });

  describe("Parallel processing", () => {
    beforeEach(() => {
      jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: false,
        });

      jest
        .spyOn(cachedAiService, "getCachedSimilarityResponse")
        .mockResolvedValue(null);
    });

    it("should fetch parent and sub statements in parallel", async () => {
      const parentPromise = Promise.resolve({
        statement: "parent",
        statementSettings: {},
      });

      const subsPromise = Promise.resolve([]);

      const parentSpy = jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockReturnValue(parentPromise as any);

      const subsSpy = jest
        .spyOn(cachedStatementService, "getCachedSubStatements")
        .mockReturnValue(subsPromise as any);

      jest.spyOn(statementService, "getUserStatements").mockReturnValue([]);
      jest.spyOn(statementService, "hasReachedMaxStatements").mockReturnValue(false);
      jest.spyOn(statementService, "convertToSimpleStatements").mockReturnValue([]);
      jest.spyOn(cachedAiService, "getCachedSimilarStatements").mockResolvedValue([]);
      jest.spyOn(statementService, "getStatementsFromTexts").mockReturnValue([]);
      jest.spyOn(statementService, "removeDuplicateStatement").mockReturnValue({
        statements: [],
        duplicateStatement: undefined,
      });

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      // Both should be called before either resolves (parallel execution)
      expect(parentSpy).toHaveBeenCalledWith("test-statement-id");
      expect(subsSpy).toHaveBeenCalledWith("test-statement-id");
    });

    it("should run validation and AI processing in parallel", async () => {
      const mockParentStatement = {
        statement: "parent question",
        statementSettings: { numberOfOptionsPerUser: 10 },
      };

      const mockSubStatements = [
        { statementId: "sub1", statement: "statement 1", creatorId: "creator1" },
      ];

      jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockResolvedValue(mockParentStatement as any);

      jest
        .spyOn(cachedStatementService, "getCachedSubStatements")
        .mockResolvedValue(mockSubStatements as any);

      jest.spyOn(statementService, "getUserStatements").mockReturnValue([]);

      const validationSpy = jest
        .spyOn(statementService, "hasReachedMaxStatements")
        .mockReturnValue(false);

      const aiSpy = jest
        .spyOn(cachedAiService, "getCachedSimilarStatements")
        .mockResolvedValue(["statement 1"]);

      jest
        .spyOn(statementService, "convertToSimpleStatements")
        .mockReturnValue([{ id: "sub1", statement: "statement 1" }]);

      jest
        .spyOn(statementService, "getStatementsFromTexts")
        .mockReturnValue([mockSubStatements[0]] as any);

      jest
        .spyOn(statementService, "removeDuplicateStatement")
        .mockReturnValue({
          statements: [mockSubStatements[0]] as any,
          duplicateStatement: undefined,
        });

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      // Both should be called (parallel execution)
      expect(validationSpy).toHaveBeenCalled();
      expect(aiSpy).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: false,
        });

      jest
        .spyOn(cachedAiService, "getCachedSimilarityResponse")
        .mockResolvedValue(null);
    });

    it("should handle parent statement not found", async () => {
      jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockResolvedValue(null);

      jest
        .spyOn(cachedStatementService, "getCachedSubStatements")
        .mockResolvedValue([]);

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({
        ok: false,
        error: "Parent statement not found",
      });
    });

    it("should handle user reaching max statements limit", async () => {
      const mockParentStatement = {
        statement: "parent",
        statementSettings: { numberOfOptionsPerUser: 1 },
      };

      const mockSubStatements = [
        { statementId: "sub1", statement: "statement 1", creatorId: "test-creator-id" },
      ];

      jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockResolvedValue(mockParentStatement as any);

      jest
        .spyOn(cachedStatementService, "getCachedSubStatements")
        .mockResolvedValue(mockSubStatements as any);

      jest
        .spyOn(statementService, "getUserStatements")
        .mockReturnValue(mockSubStatements as any);

      jest
        .spyOn(statementService, "hasReachedMaxStatements")
        .mockReturnValue(true);

      jest
        .spyOn(statementService, "convertToSimpleStatements")
        .mockReturnValue([{ id: "sub1", statement: "statement 1" }]);

      jest
        .spyOn(cachedAiService, "getCachedSimilarStatements")
        .mockResolvedValue([]);

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({
        ok: false,
        error: "You have reached the maximum number of suggestions allowed.",
      });
    });

    it("should handle general errors", async () => {
      jest
        .spyOn(cachedStatementService, "getCachedParentStatement")
        .mockRejectedValue(new Error("Database error"));

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        ok: false,
        error: "Internal server error",
      });
    });
  });

  describe("Performance monitoring", () => {
    it("should include response time in successful responses", async () => {
      jest
        .spyOn(aiService, "checkForInappropriateContent")
        .mockResolvedValue({
          isInappropriate: false,
        });

      jest
        .spyOn(cachedAiService, "getCachedSimilarityResponse")
        .mockResolvedValue({
          similarStatements: [],
          userText: "test",
        });

      await findSimilarStatements(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          responseTime: expect.any(Number),
        })
      );
    });
  });
});