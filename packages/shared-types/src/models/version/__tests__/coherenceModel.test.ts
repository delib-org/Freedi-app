import {
	IncoherenceType,
	IncoherenceSeverity,
	ParagraphAction,
	getCoherenceRecordId,
} from '../coherenceModel';
import { ChangeDecision, ChangeSourceType } from '../versionModel';

describe('coherenceModel', () => {
	describe('IncoherenceType enum', () => {
		it('should have all expected values', () => {
			expect(IncoherenceType.contradiction).toBe('contradiction');
			expect(IncoherenceType.redundancy).toBe('redundancy');
			expect(IncoherenceType.gap).toBe('gap');
			expect(IncoherenceType.scopeDrift).toBe('scopeDrift');
		});

		it('should have exactly 4 values', () => {
			expect(Object.values(IncoherenceType)).toHaveLength(4);
		});
	});

	describe('IncoherenceSeverity enum', () => {
		it('should have all expected values', () => {
			expect(IncoherenceSeverity.high).toBe('high');
			expect(IncoherenceSeverity.medium).toBe('medium');
			expect(IncoherenceSeverity.low).toBe('low');
		});

		it('should have exactly 3 values', () => {
			expect(Object.values(IncoherenceSeverity)).toHaveLength(3);
		});
	});

	describe('ParagraphAction enum', () => {
		it('should have all expected values', () => {
			expect(ParagraphAction.kept).toBe('kept');
			expect(ParagraphAction.modified).toBe('modified');
			expect(ParagraphAction.removed).toBe('removed');
			expect(ParagraphAction.added).toBe('added');
		});

		it('should have exactly 4 values', () => {
			expect(Object.values(ParagraphAction)).toHaveLength(4);
		});
	});

	describe('getCoherenceRecordId', () => {
		it('should generate correct record ID format', () => {
			expect(getCoherenceRecordId('doc1--v1', 0)).toBe('doc1--v1--coh--0');
			expect(getCoherenceRecordId('doc1--v1', 5)).toBe('doc1--v1--coh--5');
			expect(getCoherenceRecordId('abc123--v42', 99)).toBe('abc123--v42--coh--99');
		});

		it('should handle edge case with index 0', () => {
			const id = getCoherenceRecordId('test--v1', 0);
			expect(id).toContain('--coh--');
			expect(id.endsWith('0')).toBe(true);
		});
	});

	describe('Type compatibility with existing enums', () => {
		it('ChangeDecision enum should have pending value for incoherence records', () => {
			expect(ChangeDecision.pending).toBe('pending');
			expect(ChangeDecision.approved).toBe('approved');
			expect(ChangeDecision.rejected).toBe('rejected');
			expect(ChangeDecision.modified).toBe('modified');
		});

		it('ChangeSourceType should work with feedback addressed', () => {
			expect(ChangeSourceType.suggestion).toBe('suggestion');
			expect(ChangeSourceType.comment).toBe('comment');
		});
	});

	describe('IncoherenceRecord shape', () => {
		it('should be constructable with all required fields', () => {
			const record = {
				recordId: 'doc1--v1--coh--0',
				versionId: 'doc1--v1',
				documentId: 'doc1',
				affectedParagraphIds: ['p1', 'p2'],
				primaryParagraphId: 'p1',
				type: IncoherenceType.contradiction,
				severity: IncoherenceSeverity.high,
				description: 'Contradiction between paragraphs',
				suggestedFix: 'Revised content',
				aiReasoning: 'Because they conflict',
				adminDecision: ChangeDecision.pending,
				createdAt: Date.now(),
			};

			expect(record.recordId).toBeDefined();
			expect(record.type).toBe(IncoherenceType.contradiction);
			expect(record.severity).toBe(IncoherenceSeverity.high);
			expect(record.adminDecision).toBe(ChangeDecision.pending);
			expect(record.affectedParagraphIds).toHaveLength(2);
		});

		it('should support optional admin review fields', () => {
			const record = {
				recordId: 'doc1--v1--coh--0',
				versionId: 'doc1--v1',
				documentId: 'doc1',
				affectedParagraphIds: ['p1'],
				primaryParagraphId: 'p1',
				type: IncoherenceType.redundancy,
				severity: IncoherenceSeverity.low,
				description: 'Redundant',
				suggestedFix: 'Remove',
				aiReasoning: 'Duplicate',
				adminDecision: ChangeDecision.approved,
				adminNote: 'Agreed',
				adminReviewedAt: Date.now(),
				adminReviewedBy: 'admin1',
				createdAt: Date.now(),
			};

			expect(record.adminNote).toBe('Agreed');
			expect(record.adminReviewedBy).toBe('admin1');
			expect(typeof record.adminReviewedAt).toBe('number');
		});
	});

	describe('ParagraphReasoningPath shape', () => {
		it('should be constructable for a modified paragraph', () => {
			const path = {
				paragraphId: 'p1',
				action: ParagraphAction.modified,
				feedbackAddressed: [
					{
						sourceId: 's1',
						sourceType: ChangeSourceType.suggestion,
						summary: 'User suggested change',
						impact: 0.8,
					},
				],
				coherenceIssuesResolved: [],
				coherenceIssuesCreated: ['doc1--v1--coh--0'],
				aiDecisionSummary: 'Incorporated feedback',
				previousContent: 'Old text',
				newContent: 'New text',
			};

			expect(path.action).toBe(ParagraphAction.modified);
			expect(path.feedbackAddressed).toHaveLength(1);
			expect(path.coherenceIssuesCreated).toHaveLength(1);
		});

		it('should be constructable for a kept paragraph without optional fields', () => {
			const path: Record<string, unknown> = {
				paragraphId: 'p2',
				action: ParagraphAction.kept,
				feedbackAddressed: [],
				coherenceIssuesResolved: [],
				coherenceIssuesCreated: [],
				aiDecisionSummary: 'No changes needed.',
			};

			expect(path.action).toBe(ParagraphAction.kept);
			expect(path.feedbackAddressed).toHaveLength(0);
			expect(path.previousContent).toBeUndefined();
			expect(path.newContent).toBeUndefined();
		});
	});
});
