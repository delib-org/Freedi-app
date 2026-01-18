/**
 * Server-side export queries for Sign app
 * Provides comprehensive JSON export with anonymized user data
 */

import { getFirestoreAdmin } from './admin';
import { Collections, Statement, StatementType, Suggestion, UserDemographicQuestion, DEMOGRAPHIC_CONSTANTS } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { logError } from '@/lib/utils/errorHandling';
import { Signature, Approval } from './queries';

// ==================== Types ====================

export interface AnonymizedSignature {
  anonymousId: string;
  signed: 'signed' | 'rejected' | 'viewed';
  date: number;
  levelOfSignature?: number;
}

export interface AnonymizedApproval {
  anonymousId: string;
  paragraphId: string;
  approval: boolean;
  createdAt: number;
}

export interface AnonymizedComment {
  anonymousId: string;
  paragraphId: string;
  content: string;
  createdAt: number;
  rating: number | null;
}

export interface AnonymizedSuggestion {
  anonymousId: string;
  paragraphId: string;
  originalContent: string;
  suggestedContent: string;
  reasoning: string | null;
  createdAt: number;
}

export interface AnonymizedDemographicAnswer {
  anonymousId: string;
  questionId: string;
  answer: string | null;
  answerOptions: string[] | null;
}

export interface DemographicQuestionExport {
  questionId: string;
  text: string;
  type: string;
  options: string[];
  required: boolean;
}

export interface ParagraphExport {
  paragraphId: string;
  content: string;
  type: string;
  order: number;
  isNonInteractive: boolean;
}

export interface SegmentStats {
  users: number;
  approvals: number;
  rejections: number;
  approvalRate: number;
  comments: number;
  avgRating: number | null;
  suggestions: number;
}

export interface ParagraphCrossAnalysis {
  total: SegmentStats;
  byDemographic: Record<string, Record<string, SegmentStats | { redacted: true; reason: string }>>;
}

export interface CrossAnalysis {
  byParagraph: Record<string, ParagraphCrossAnalysis>;
  kAnonymityApplied: boolean;
  minSegmentSize: number;
}

export interface JsonExportData {
  exportedAt: string;
  document: {
    id: string;
    title: string;
    createdAt: number;
    settings: Record<string, unknown>;
  };
  paragraphs: ParagraphExport[];
  demographics: {
    questions: DemographicQuestionExport[];
    userAnswers: AnonymizedDemographicAnswer[];
  };
  interactions: {
    signatures: AnonymizedSignature[];
    approvals: AnonymizedApproval[];
    comments: AnonymizedComment[];
    suggestions: AnonymizedSuggestion[];
  };
  crossAnalysis: CrossAnalysis;
}

// ==================== Helper Functions ====================

/**
 * Create a consistent mapping of user IDs to anonymous IDs
 * Users are sorted by their first interaction time to ensure consistency
 */
export function createAnonymousIdMap(userIds: string[]): Map<string, string> {
  const uniqueUserIds = [...new Set(userIds)];
  const userIdMap = new Map<string, string>();

  uniqueUserIds.forEach((userId, index) => {
    userIdMap.set(userId, `user_${index + 1}`);
  });

  return userIdMap;
}

/**
 * Get all user IDs that have interacted with a document
 */
export async function getAllDocumentUserIds(documentId: string): Promise<string[]> {
  const db = getFirestoreAdmin();
  const userIds: string[] = [];

  try {
    // Get users from signatures
    const signaturesSnap = await db
      .collection(Collections.signatures)
      .where('documentId', '==', documentId)
      .get();

    signaturesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.userId) userIds.push(data.userId);
    });

    // Get users from approvals
    const approvalsSnap = await db
      .collection(Collections.approval)
      .where('documentId', '==', documentId)
      .get();

    approvalsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.userId || data.odlUserId || data.odluserId;
      if (userId) userIds.push(userId);
    });

    // Get users from comments
    const commentsSnap = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.statement)
      .get();

    commentsSnap.docs.forEach((doc) => {
      const data = doc.data() as Statement;
      if (data.creatorId && !data.hide) userIds.push(data.creatorId);
    });

    // Get users from suggestions
    const suggestionsSnap = await db
      .collection(Collections.suggestions)
      .where('documentId', '==', documentId)
      .where('hide', '==', false)
      .get();

    suggestionsSnap.docs.forEach((doc) => {
      const data = doc.data() as Suggestion;
      if (data.creatorId) userIds.push(data.creatorId);
    });

    return userIds;
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAllDocumentUserIds', documentId });
    throw error;
  }
}

/**
 * Get all signatures for a document (anonymized)
 */
export async function getAnonymizedSignatures(
  documentId: string,
  userIdMap: Map<string, string>
): Promise<AnonymizedSignature[]> {
  const db = getFirestoreAdmin();

  try {
    const snapshot = await db
      .collection(Collections.signatures)
      .where('documentId', '==', documentId)
      .get();

    const results: AnonymizedSignature[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as Signature;
      const anonymousId = userIdMap.get(data.userId);
      if (!anonymousId) return;

      const signature: AnonymizedSignature = {
        anonymousId,
        signed: data.signed,
        date: data.date,
      };

      if (data.levelOfSignature !== undefined) {
        signature.levelOfSignature = data.levelOfSignature;
      }

      results.push(signature);
    });

    return results;
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAnonymizedSignatures', documentId });
    throw error;
  }
}

/**
 * Get all approvals for a document (anonymized)
 */
export async function getAnonymizedApprovals(
  documentId: string,
  userIdMap: Map<string, string>
): Promise<AnonymizedApproval[]> {
  const db = getFirestoreAdmin();

  try {
    const snapshot = await db
      .collection(Collections.approval)
      .where('documentId', '==', documentId)
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as Approval;
        const userId = data.userId;
        const anonymousId = userIdMap.get(userId);
        if (!anonymousId) return null;

        const paragraphId = data.paragraphId || data.statementId;

        return {
          anonymousId,
          paragraphId,
          approval: data.approval,
          createdAt: data.createdAt,
        };
      })
      .filter((a): a is AnonymizedApproval => a !== null);
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAnonymizedApprovals', documentId });
    throw error;
  }
}

/**
 * Get all comments for a document with their ratings (anonymized)
 */
export async function getAnonymizedComments(
  documentId: string,
  userIdMap: Map<string, string>,
  paragraphIds: string[]
): Promise<AnonymizedComment[]> {
  const db = getFirestoreAdmin();

  try {
    // Get comments
    const commentsSnap = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.statement)
      .get();

    // Get evaluations for rating calculation
    const evaluationsSnap = await db
      .collection(Collections.evaluations)
      .where('documentId', '==', documentId)
      .get();

    // Build map of comment ratings
    const commentRatings: Record<string, number[]> = {};
    evaluationsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!commentRatings[data.statementId]) {
        commentRatings[data.statementId] = [];
      }
      commentRatings[data.statementId].push(data.evaluation);
    });

    return commentsSnap.docs
      .map((doc) => {
        const data = doc.data() as Statement;
        if (data.hide || !paragraphIds.includes(data.parentId)) return null;

        const anonymousId = userIdMap.get(data.creatorId);
        if (!anonymousId) return null;

        // Calculate average rating (convert from -1 to 1 scale to 0-5 scale)
        const ratings = commentRatings[data.statementId] || [];
        let avgRating: number | null = null;
        if (ratings.length > 0) {
          const avgRaw = ratings.reduce((a, b) => a + b, 0) / ratings.length;
          avgRating = Math.round(((avgRaw + 1) / 2) * 5 * 10) / 10;
        }

        return {
          anonymousId,
          paragraphId: data.parentId,
          content: data.statement,
          createdAt: data.createdAt,
          rating: avgRating,
        };
      })
      .filter((c): c is AnonymizedComment => c !== null);
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAnonymizedComments', documentId });
    throw error;
  }
}

/**
 * Get all suggestions for a document (anonymized)
 */
export async function getAnonymizedSuggestions(
  documentId: string,
  userIdMap: Map<string, string>
): Promise<AnonymizedSuggestion[]> {
  const db = getFirestoreAdmin();

  try {
    const snapshot = await db
      .collection(Collections.suggestions)
      .where('documentId', '==', documentId)
      .where('hide', '==', false)
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as Suggestion;
        const anonymousId = userIdMap.get(data.creatorId);
        if (!anonymousId) return null;

        return {
          anonymousId,
          paragraphId: data.paragraphId,
          originalContent: data.originalContent || '',
          suggestedContent: data.suggestedContent,
          reasoning: data.reasoning || null,
          createdAt: data.createdAt,
        };
      })
      .filter((s): s is AnonymizedSuggestion => s !== null);
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAnonymizedSuggestions', documentId });
    throw error;
  }
}

/**
 * Get demographic questions for a document
 */
export async function getDemographicQuestionsForExport(
  documentId: string,
  topParentId: string
): Promise<DemographicQuestionExport[]> {
  const db = getFirestoreAdmin();

  try {
    const questionsRef = db.collection(Collections.userDemographicQuestions);

    const [groupSnap, statementSnap, signSnap] = await Promise.all([
      questionsRef.where('topParentId', '==', topParentId).where('scope', '==', 'group').get(),
      questionsRef.where('statementId', '==', documentId).where('scope', '==', 'statement').get(),
      questionsRef.where('statementId', '==', documentId).where('scope', '==', 'sign').get(),
    ]);

    const allQuestions = [
      ...groupSnap.docs.map((doc) => doc.data() as UserDemographicQuestion),
      ...statementSnap.docs.map((doc) => doc.data() as UserDemographicQuestion),
      ...signSnap.docs.map((doc) => doc.data() as UserDemographicQuestion),
    ];

    return allQuestions
      .filter((q) => q.userQuestionId !== undefined)
      .map((q) => ({
        questionId: q.userQuestionId as string,
        text: q.question,
        type: q.type?.toString() || 'text',
        options: q.options?.map((opt) => opt.option) || [],
        required: q.required || false,
      }));
  } catch (error) {
    logError(error, { operation: 'exportQueries.getDemographicQuestionsForExport', documentId });
    throw error;
  }
}

/**
 * Get anonymized demographic answers
 */
export async function getAnonymizedDemographicAnswers(
  questions: DemographicQuestionExport[],
  userIdMap: Map<string, string>
): Promise<AnonymizedDemographicAnswer[]> {
  const db = getFirestoreAdmin();
  const answers: AnonymizedDemographicAnswer[] = [];

  try {
    for (const question of questions) {
      const snapshot = await db
        .collection(Collections.usersData)
        .where('userQuestionId', '==', question.questionId)
        .get();

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const userId = data.odlUserId;
        const anonymousId = userIdMap.get(userId);

        if (anonymousId) {
          answers.push({
            anonymousId,
            questionId: question.questionId,
            answer: data.answer || null,
            answerOptions: data.answerOptions || null,
          });
        }
      });
    }

    return answers;
  } catch (error) {
    logError(error, { operation: 'exportQueries.getAnonymizedDemographicAnswers' });
    throw error;
  }
}

/**
 * Build cross-analysis data with k-anonymity protection
 */
export function buildCrossAnalysis(
  paragraphs: Paragraph[],
  approvals: AnonymizedApproval[],
  comments: AnonymizedComment[],
  suggestions: AnonymizedSuggestion[],
  demographicQuestions: DemographicQuestionExport[],
  demographicAnswers: AnonymizedDemographicAnswer[],
  minSegmentSize: number
): CrossAnalysis {
  const result: CrossAnalysis = {
    byParagraph: {},
    kAnonymityApplied: minSegmentSize > 0,
    minSegmentSize,
  };

  // Build user-to-segment mapping
  // Map: questionId -> segmentValue -> Set<anonymousId>
  const segmentUsers: Record<string, Record<string, Set<string>>> = {};

  demographicQuestions.forEach((question) => {
    segmentUsers[question.questionId] = {};
    question.options.forEach((opt) => {
      segmentUsers[question.questionId][opt] = new Set();
    });
  });

  demographicAnswers.forEach((answer) => {
    const questionSegments = segmentUsers[answer.questionId];
    if (!questionSegments) return;

    if (answer.answer && questionSegments[answer.answer]) {
      questionSegments[answer.answer].add(answer.anonymousId);
    }

    if (answer.answerOptions) {
      answer.answerOptions.forEach((opt) => {
        if (questionSegments[opt]) {
          questionSegments[opt].add(answer.anonymousId);
        }
      });
    }
  });

  // Index interactions by paragraph
  const approvalsByParagraph: Record<string, AnonymizedApproval[]> = {};
  const commentsByParagraph: Record<string, AnonymizedComment[]> = {};
  const suggestionsByParagraph: Record<string, AnonymizedSuggestion[]> = {};

  approvals.forEach((a) => {
    if (!approvalsByParagraph[a.paragraphId]) approvalsByParagraph[a.paragraphId] = [];
    approvalsByParagraph[a.paragraphId].push(a);
  });

  comments.forEach((c) => {
    if (!commentsByParagraph[c.paragraphId]) commentsByParagraph[c.paragraphId] = [];
    commentsByParagraph[c.paragraphId].push(c);
  });

  suggestions.forEach((s) => {
    if (!suggestionsByParagraph[s.paragraphId]) suggestionsByParagraph[s.paragraphId] = [];
    suggestionsByParagraph[s.paragraphId].push(s);
  });

  // Calculate stats for each paragraph
  paragraphs.forEach((paragraph) => {
    if (paragraph.isNonInteractive) return;

    const paragraphId = paragraph.paragraphId;
    const paragraphApprovals = approvalsByParagraph[paragraphId] || [];
    const paragraphComments = commentsByParagraph[paragraphId] || [];
    const paragraphSuggestions = suggestionsByParagraph[paragraphId] || [];

    // Calculate total stats
    const totalStats = calculateSegmentStats(
      paragraphApprovals,
      paragraphComments,
      paragraphSuggestions,
      null // No filter - all users
    );

    // Calculate stats by demographic segment
    const byDemographic: Record<string, Record<string, SegmentStats | { redacted: true; reason: string }>> = {};

    demographicQuestions.forEach((question) => {
      byDemographic[question.questionId] = {};

      question.options.forEach((segmentValue) => {
        const usersInSegment = segmentUsers[question.questionId][segmentValue];
        const userCount = usersInSegment.size;

        // Apply k-anonymity
        if (userCount < minSegmentSize && minSegmentSize > 0) {
          byDemographic[question.questionId][segmentValue] = {
            redacted: true,
            reason: 'k-anonymity',
          };
          return;
        }

        const segmentStats = calculateSegmentStats(
          paragraphApprovals,
          paragraphComments,
          paragraphSuggestions,
          usersInSegment
        );

        byDemographic[question.questionId][segmentValue] = segmentStats;
      });
    });

    result.byParagraph[paragraphId] = {
      total: totalStats,
      byDemographic,
    };
  });

  return result;
}

/**
 * Calculate segment statistics
 */
function calculateSegmentStats(
  approvals: AnonymizedApproval[],
  comments: AnonymizedComment[],
  suggestions: AnonymizedSuggestion[],
  userFilter: Set<string> | null
): SegmentStats {
  const filterApprovals = userFilter
    ? approvals.filter((a) => userFilter.has(a.anonymousId))
    : approvals;

  const filterComments = userFilter
    ? comments.filter((c) => userFilter.has(c.anonymousId))
    : comments;

  const filterSuggestions = userFilter
    ? suggestions.filter((s) => userFilter.has(s.anonymousId))
    : suggestions;

  const approvalsCount = filterApprovals.filter((a) => a.approval).length;
  const rejectionsCount = filterApprovals.filter((a) => !a.approval).length;
  const totalVotes = approvalsCount + rejectionsCount;

  // Get unique users who interacted
  const uniqueUsers = new Set([
    ...filterApprovals.map((a) => a.anonymousId),
    ...filterComments.map((c) => c.anonymousId),
    ...filterSuggestions.map((s) => s.anonymousId),
  ]);

  // Calculate average rating
  const ratings = filterComments
    .map((c) => c.rating)
    .filter((r): r is number => r !== null);

  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  return {
    users: uniqueUsers.size,
    approvals: approvalsCount,
    rejections: rejectionsCount,
    approvalRate: totalVotes > 0 ? Math.round((approvalsCount / totalVotes) * 100) / 100 : 0,
    comments: filterComments.length,
    avgRating,
    suggestions: filterSuggestions.length,
  };
}

/**
 * Export paragraphs in a clean format
 */
export function exportParagraphs(paragraphs: Paragraph[]): ParagraphExport[] {
  return paragraphs.map((p) => ({
    paragraphId: p.paragraphId,
    content: p.content,
    type: p.type?.toString() || 'paragraph',
    order: p.order,
    isNonInteractive: p.isNonInteractive || false,
  }));
}

/**
 * Build complete JSON export data
 */
export async function buildJsonExport(
  document: StatementWithParagraphs,
  paragraphs: Paragraph[]
): Promise<JsonExportData> {
  const documentId = document.statementId;
  const topParentId = document.topParentId || documentId;

  // Get all user IDs and create anonymous mapping
  const userIds = await getAllDocumentUserIds(documentId);
  const userIdMap = createAnonymousIdMap(userIds);

  // Get paragraph IDs
  const paragraphIds = paragraphs.map((p) => p.paragraphId);

  // Determine k-anonymity threshold
  const isDev = process.env.NODE_ENV === 'development';
  const minSegmentSize = isDev ? 0 : DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;

  // Fetch all data in parallel
  const [
    signatures,
    approvals,
    comments,
    suggestions,
    demographicQuestions,
  ] = await Promise.all([
    getAnonymizedSignatures(documentId, userIdMap),
    getAnonymizedApprovals(documentId, userIdMap),
    getAnonymizedComments(documentId, userIdMap, paragraphIds),
    getAnonymizedSuggestions(documentId, userIdMap),
    getDemographicQuestionsForExport(documentId, topParentId),
  ]);

  // Get demographic answers
  const demographicAnswers = await getAnonymizedDemographicAnswers(
    demographicQuestions,
    userIdMap
  );

  // Build cross-analysis
  const crossAnalysis = buildCrossAnalysis(
    paragraphs,
    approvals,
    comments,
    suggestions,
    demographicQuestions,
    demographicAnswers,
    minSegmentSize
  );

  // Get signSettings with type assertion (field exists on Sign app documents but not in base Statement type)
  const signSettings = (document as unknown as { signSettings?: Record<string, unknown> }).signSettings || {};

  return {
    exportedAt: new Date().toISOString(),
    document: {
      id: documentId,
      title: document.statement,
      createdAt: document.createdAt,
      settings: signSettings,
    },
    paragraphs: exportParagraphs(paragraphs),
    demographics: {
      questions: demographicQuestions,
      userAnswers: demographicAnswers,
    },
    interactions: {
      signatures,
      approvals,
      comments,
      suggestions,
    },
    crossAnalysis,
  };
}
