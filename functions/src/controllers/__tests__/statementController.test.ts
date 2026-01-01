import { Request, Response } from 'firebase-functions/v1';
import { StatementController } from '../statementController';
import { StatementService } from '../../services/statements/statementService';

// Mock the service
jest.mock('../../services/statements/statementService');

describe('StatementController', () => {
	let controller: StatementController;
	let mockService: jest.Mocked<StatementService>;
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;

	beforeEach(() => {
		// Create mock service
		mockService = new StatementService() as jest.Mocked<StatementService>;
		controller = new StatementController(mockService);

		// Setup mock request
		mockRequest = {
			query: {},
		};

		// Setup mock response
		mockResponse = {
			send: jest.fn().mockReturnThis(),
			status: jest.fn().mockReturnThis(),
		};
	});

	describe('getUserOptions', () => {
		it('should return user options successfully', async () => {
			// Arrange
			mockRequest.query = { userId: 'user123', parentId: 'parent123' };
			const mockStatements = [{ statementId: '1' }, { statementId: '2' }];
			mockService.getUserOptions = jest.fn().mockResolvedValue(mockStatements);

			// Act
			await controller.getUserOptions(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getUserOptions).toHaveBeenCalledWith({
				userId: 'user123',
				parentId: 'parent123',
			});
			expect(mockResponse.send).toHaveBeenCalledWith({
				statements: mockStatements,
				ok: true,
			});
		});

		it('should return 400 when parentId is missing', async () => {
			// Arrange
			mockRequest.query = { userId: 'user123' };

			// Act
			await controller.getUserOptions(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.send).toHaveBeenCalledWith({
				error: expect.stringContaining('parentId'),
				ok: false,
			});
		});

		it('should return 400 when userId is missing', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123' };

			// Act
			await controller.getUserOptions(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.send).toHaveBeenCalledWith({
				error: expect.stringContaining('userId'),
				ok: false,
			});
		});

		it('should handle service errors', async () => {
			// Arrange
			mockRequest.query = { userId: 'user123', parentId: 'parent123' };
			mockService.getUserOptions = jest.fn().mockRejectedValue(new Error('Database error'));

			// Act
			await controller.getUserOptions(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(500);
			expect(mockResponse.send).toHaveBeenCalledWith({
				error: 'Database error',
				ok: false,
			});
		});
	});

	describe('getRandomStatements', () => {
		it('should return random statements successfully', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123', limit: '10' };
			const mockStatements = [{ statementId: '1' }, { statementId: '2' }];
			mockService.getRandomStatements = jest.fn().mockResolvedValue(mockStatements);
			mockService.updateStatementViewCounts = jest.fn().mockResolvedValue(undefined);

			// Act
			await controller.getRandomStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getRandomStatements).toHaveBeenCalledWith({
				parentId: 'parent123',
				limit: 10,
				excludeIds: [],
			});
			expect(mockService.updateStatementViewCounts).toHaveBeenCalledWith(mockStatements);
			expect(mockResponse.status).toHaveBeenCalledWith(200);
			expect(mockResponse.send).toHaveBeenCalledWith({
				statements: mockStatements,
				ok: true,
			});
		});

		it('should use default limit when not provided', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123' };
			mockService.getRandomStatements = jest.fn().mockResolvedValue([]);
			mockService.updateStatementViewCounts = jest.fn().mockResolvedValue(undefined);

			// Act
			await controller.getRandomStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getRandomStatements).toHaveBeenCalledWith({
				parentId: 'parent123',
				limit: 6,
				excludeIds: [],
			});
		});

		it('should cap limit at 50', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123', limit: '100' };
			mockService.getRandomStatements = jest.fn().mockResolvedValue([]);
			mockService.updateStatementViewCounts = jest.fn().mockResolvedValue(undefined);

			// Act
			await controller.getRandomStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getRandomStatements).toHaveBeenCalledWith({
				parentId: 'parent123',
				limit: 50,
				excludeIds: [],
			});
		});

		it('should return 400 when parentId is missing', async () => {
			// Arrange
			mockRequest.query = { limit: '10' };

			// Act
			await controller.getRandomStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockResponse.status).toHaveBeenCalledWith(400);
			expect(mockResponse.send).toHaveBeenCalledWith({
				error: expect.stringContaining('parentId'),
				ok: false,
			});
		});
	});

	describe('getTopStatements', () => {
		it('should return top statements successfully', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123', limit: '5' };
			const mockStatements = [
				{ statementId: '1', consensus: 0.9 },
				{ statementId: '2', consensus: 0.8 },
			];
			mockService.getTopStatements = jest.fn().mockResolvedValue(mockStatements);

			// Act
			await controller.getTopStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getTopStatements).toHaveBeenCalledWith({
				parentId: 'parent123',
				limit: 5,
			});
			expect(mockResponse.send).toHaveBeenCalledWith({
				statements: mockStatements,
				ok: true,
			});
		});

		it('should handle invalid limit gracefully', async () => {
			// Arrange
			mockRequest.query = { parentId: 'parent123', limit: 'invalid' };
			mockService.getTopStatements = jest.fn().mockResolvedValue([]);

			// Act
			await controller.getTopStatements(mockRequest as Request, mockResponse as Response);

			// Assert
			expect(mockService.getTopStatements).toHaveBeenCalledWith({
				parentId: 'parent123',
				limit: 6, // Should use default
			});
		});
	});
});