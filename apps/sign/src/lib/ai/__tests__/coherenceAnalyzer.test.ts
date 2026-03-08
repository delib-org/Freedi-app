import {
	ParagraphType,
	ChangeType,
	ChangeDecision,
	ParagraphAction,
} from '@freedi/shared-types';

// Mock the versionGenerator module
jest.mock('../versionGenerator', () => ({
	callAI: jest.fn(),
	extractJSON: jest.fn(),
	getDefaultAIConfig: jest.fn(() => ({
		provider: 'gemini',
		apiKey: 'test-key',
	})),
}));

// Mock error handling
jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

import { analyzeDocumentCoherence } from '../coherenceAnalyzer';
import { callAI, extractJSON } from '../versionGenerator';

const mockCallAI = callAI as jest.MockedFunction<typeof callAI>;
const mockExtractJSON = extractJSON as jest.MockedFunction<typeof extractJSON>;

describe('coherenceAnalyzer', () => {
	const mockParagraphs = [
		{
			paragraphId: 'p1',
			type: ParagraphType.paragraph,
			content: 'The policy supports free trade.',
			order: 0,
		},
		{
			paragraphId: 'p2',
			type: ParagraphType.paragraph,
			content: 'All imports must be banned.',
			order: 1,
		},
	];

	const mockChanges = [
		{
			changeId: 'v1--p2',
			versionId: 'v1',
			paragraphId: 'p2',
			originalContent: 'Imports are regulated.',
			proposedContent: 'All imports must be banned.',
			changeType: ChangeType.modified,
			sources: [],
			aiReasoning: 'Based on community feedback',
			combinedImpact: 0.8,
			adminDecision: ChangeDecision.pending,
		},
	];

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should detect contradictions and return incoherence records', async () => {
		const aiResponse = {
			incoherences: [
				{
					type: 'contradiction',
					severity: 'high',
					affectedParagraphIds: ['p1', 'p2'],
					primaryParagraphId: 'p2',
					description: 'P1 supports free trade while P2 bans all imports',
					suggestedFix: 'Import regulations will be gradually adjusted.',
					aiReasoning: 'Both paragraphs need to be consistent',
				},
			],
			coherenceScore: 0.4,
			summary: 'Major contradiction detected',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			mockChanges,
			'v1',
			'doc1',
		);

		expect(result.incoherences).toHaveLength(1);
		expect(result.incoherences[0].type).toBe('contradiction');
		expect(result.incoherences[0].severity).toBe('high');
		expect(result.incoherences[0].recordId).toBe('v1--coh--0');
		expect(result.incoherences[0].adminDecision).toBe(ChangeDecision.pending);
		expect(result.documentCoherenceScore).toBe(0.4);
	});

	it('should return empty incoherences when document is coherent', async () => {
		const aiResponse = {
			incoherences: [],
			coherenceScore: 0.95,
			summary: 'Document is coherent',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			[],
			'v1',
			'doc1',
		);

		expect(result.incoherences).toHaveLength(0);
		expect(result.documentCoherenceScore).toBe(0.95);
	});

	it('should gracefully degrade on AI failure', async () => {
		mockCallAI.mockRejectedValue(new Error('AI service unavailable'));

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			mockChanges,
			'v1',
			'doc1',
		);

		expect(result.incoherences).toHaveLength(0);
		expect(result.documentCoherenceScore).toBe(-1);
		expect(result.summary).toContain('unavailable');
	});

	it('should build reasoning paths for all paragraphs', async () => {
		const aiResponse = {
			incoherences: [],
			coherenceScore: 0.9,
			summary: 'OK',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			mockChanges,
			'v1',
			'doc1',
		);

		expect(result.reasoningPaths).toHaveLength(2);
		expect(result.reasoningPaths[0].paragraphId).toBe('p1');
		expect(result.reasoningPaths[0].action).toBe(ParagraphAction.kept);
		expect(result.reasoningPaths[1].paragraphId).toBe('p2');
		expect(result.reasoningPaths[1].action).toBe(ParagraphAction.modified);
	});

	it('should clamp coherence score between 0 and 1', async () => {
		const aiResponse = {
			incoherences: [],
			coherenceScore: 1.5,
			summary: 'OK',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			[],
			'v1',
			'doc1',
		);

		expect(result.documentCoherenceScore).toBe(1.0);
	});

	it('should filter out incomplete incoherence entries from AI', async () => {
		const aiResponse = {
			incoherences: [
				{
					type: 'contradiction',
					severity: 'high',
					affectedParagraphIds: ['p1', 'p2'],
					primaryParagraphId: 'p2',
					description: 'Valid issue',
					suggestedFix: 'Fix text',
					aiReasoning: 'Reason',
				},
				{
					// Missing required fields - no affectedParagraphIds, no primaryParagraphId
					type: 'gap',
					description: 'Incomplete entry',
				},
			],
			coherenceScore: 0.7,
			summary: 'Issues found',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		const result = await analyzeDocumentCoherence(
			mockParagraphs,
			mockChanges,
			'v1',
			'doc1',
		);

		// Should only include the valid entry
		expect(result.incoherences).toHaveLength(1);
	});

	it('should call AI with correct prompts', async () => {
		const aiResponse = {
			incoherences: [],
			coherenceScore: 1.0,
			summary: 'Perfect',
		};

		mockCallAI.mockResolvedValue(JSON.stringify(aiResponse));
		mockExtractJSON.mockReturnValue(aiResponse);

		await analyzeDocumentCoherence(
			mockParagraphs,
			mockChanges,
			'v1',
			'doc1',
		);

		expect(mockCallAI).toHaveBeenCalledTimes(1);
		const callArgs = mockCallAI.mock.calls[0];
		// System prompt should mention coherence
		expect(callArgs[0]).toContain('coherence');
		// User prompt should contain paragraph content
		expect(callArgs[1]).toContain('free trade');
		expect(callArgs[1]).toContain('imports must be banned');
	});

	it('should throw if no API key is configured', async () => {
		// Override getDefaultAIConfig to return no key
		const versionGenerator = require('../versionGenerator');
		versionGenerator.getDefaultAIConfig.mockReturnValueOnce({
			provider: 'gemini',
			apiKey: '',
		});

		await expect(
			analyzeDocumentCoherence(mockParagraphs, mockChanges, 'v1', 'doc1'),
		).rejects.toThrow('AI API key not configured');
	});
});
