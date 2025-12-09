/**
 * Type definitions for Sign app
 */

import { Statement, ParagraphType } from 'delib-npm';

// Re-export from queries for convenience
export type { Signature, Approval, Comment } from '@/lib/firebase/queries';

// Re-export ParagraphType from delib-npm
export { ParagraphType };

/**
 * Paragraph type - matches main app's paragraph structure
 * TODO: Import from delib-npm once published with Paragraph types
 */
export interface Paragraph {
  paragraphId: string;
  type: ParagraphType;
  content: string;
  order: number;
  listType?: 'ul' | 'ol';
}

/**
 * Extended Statement type with paragraphs array
 */
export interface StatementWithParagraphs extends Statement {
  paragraphs?: Paragraph[];
}

// Legacy: Statement with paragraphType (for backwards compatibility)
export type SignParagraph = Statement;

// User approval state for a paragraph
export interface ParagraphApprovalState {
  paragraphId: string;
  isApproved: boolean | null; // null = not yet decided
  approvedAt?: number;
}

// Document signing state
export type SignatureStatus = 'signed' | 'rejected' | 'viewed' | 'pending';

export interface DocumentSigningState {
  documentId: string;
  status: SignatureStatus;
  signedAt?: number;
  paragraphApprovals: Record<string, boolean | null>;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SignatureResponse {
  signatureId: string;
  documentId: string;
  signed: SignatureStatus;
  date: number;
}

export interface ApprovalResponse {
  approvalId: string;
  statementId: string;
  approval: boolean;
  createdAt: number;
}

// Document stats for admin panel
export interface DocumentStats {
  totalSignatures: number;
  signedCount: number;
  rejectedCount: number;
  viewedCount: number;
  paragraphCount: number;
  commentCount: number;
}

// View mode for heat map visualization
export type HeatMapMode = 'none' | 'views' | 'support' | 'importance';

// Demographic survey mode
export type DemographicMode = 'disabled' | 'inherit' | 'custom';

// Admin settings for a document
export interface DocumentSettings {
  enableComments: boolean;
  enableApproval: boolean;
  enableImportance: boolean;
  enableLikes: boolean;
  showScores: boolean;
  requireLogin: boolean;
  isHidden: boolean;
  heatMapMode: HeatMapMode;
  // Demographic survey settings
  demographicMode: DemographicMode;
  demographicRequired: boolean;
}

// Default document settings
export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  enableComments: true,
  enableApproval: true,
  enableImportance: false,
  enableLikes: true,
  showScores: false,
  requireLogin: false,
  isHidden: false,
  heatMapMode: 'none',
  demographicMode: 'disabled',
  demographicRequired: false,
};
