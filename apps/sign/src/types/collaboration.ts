// Collaboration Index Types

export interface SegmentData {
  segmentId: string;
  segmentName: string;
  segmentValue: string;
  userCount: number;
  approvalCount: number;
  rejectionCount: number;
  approvalRate: number;
  meanApproval: number;
  mad: number;
  internalAgreement: 'high' | 'medium' | 'low';
  commentCount: number;
}

export interface ParagraphCollaborationData {
  paragraphId: string;
  paragraphText: string;
  paragraphIndex: number;
  overallApproval: number;
  divergenceScore: number;
  collaborationStatus: 'polarized' | 'mixed' | 'collaborative';
  segments: SegmentData[];
  totalComments: number;
  totalApprovals: number;
  totalRejections: number;
}

export interface DemographicQuestionInfo {
  questionId: string;
  question: string;
  options: Array<{ option: string; color?: string }>;
}

export interface CollaborationIndexData {
  documentTitle: string;
  documentId: string;
  totalParagraphs: number;
  polarizedCount: number;
  collaborativeCount: number;
  mixedCount: number;
  demographicQuestion: DemographicQuestionInfo | null;
  paragraphs: ParagraphCollaborationData[];
  message?: string;
}

export type CollaborationFilter = 'all' | 'polarized' | 'mixed' | 'collaborative';
export type CollaborationSort = 'divergence' | 'approval' | 'comments' | 'order';

// Thresholds (matching API)
export const COLLABORATION_THRESHOLDS = {
  POLARIZED: 0.6,
  COLLABORATIVE: 0.25,
} as const;

export const INTERNAL_AGREEMENT_THRESHOLDS = {
  HIGH: 0.2,
  LOW: 0.5,
} as const;
