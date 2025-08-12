/**
 * Multi-Question Mass Consensus Database Controllers
 * Central export file for all MC session operations
 */

// Session CRUD operations
export {
  createMCSession,
  createDraftMCSession,
  duplicateMCSession
} from './createMCSession';

export {
  getMCSession,
  getMCSessionsByStatement,
  getMCSessionsByCreator,
  listenToMCSession,
  listenToStatementMCSessions
} from './getMCSession';

export {
  updateMCSession,
  updateMCSessionStatus,
  publishMCSession,
  archiveMCSession,
  updateMCSessionSettings,
  batchUpdateMCSessions
} from './updateMCSession';

export {
  softDeleteMCSession,
  hardDeleteMCSession,
  batchDeleteMCSessions,
  cleanupArchivedSessions
} from './deleteMCSession';

// Question management
export {
  addMCQuestion,
  updateMCQuestion,
  deleteMCQuestion,
  reorderMCQuestions,
  changeMCQuestionType,
  duplicateMCQuestion,
  batchAddMCQuestions
} from './mcQuestions';

// Progress and responses
export {
  setMCProgress,
  getMCProgress,
  markQuestionCompleted,
  completeSession,
  saveMCResponse,
  getMCSessionResponses,
  getParticipantResponses,
  getSessionProgress,
  listenToProgress,
  getSessionStats
} from './mcProgress';

// Re-export types from delib-npm for convenience
export type {
  MCSession,
  MCQuestion,
  MCSessionProgress,
  MCQuestionResponse,
  MCSessionSettings,
  MCQuestionContent
} from 'delib-npm';

export {
  MCSessionStatus,
  MCQuestionType
} from 'delib-npm';

// Export local types and utilities
export type {
  MCSessionCreate,
  MCSessionUpdate,
  MCQuestionCreate,
  MCQuestionOrder
} from './mcTypes';

export {
  createDefaultMCSessionSettings,
  createDefaultMCQuestion,
  getDefaultStepsForQuestionType
} from './mcTypes';