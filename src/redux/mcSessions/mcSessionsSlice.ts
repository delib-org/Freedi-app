import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { 
  MCSession, 
  MCQuestion, 
  MCSessionProgress,
  MCQuestionResponse,
  MCSessionStatus 
} from 'delib-npm';
import { RootState } from '../store';

interface MCSessionsState {
  // Sessions data
  sessions: Record<string, MCSession>;
  currentSessionId: string | null;
  
  // Questions data
  questions: Record<string, MCQuestion[]>; // sessionId -> questions
  
  // Progress tracking
  progress: Record<string, MCSessionProgress>; // sessionId -> progress
  
  // Responses
  responses: Record<string, MCQuestionResponse[]>; // sessionId -> responses
  
  // UI state
  loading: boolean;
  error: string | null;
  
  // Admin state
  editingSession: MCSession | null;
  editingQuestion: MCQuestion | null;
}

const initialState: MCSessionsState = {
  sessions: {},
  currentSessionId: null,
  questions: {},
  progress: {},
  responses: {},
  loading: false,
  error: null,
  editingSession: null,
  editingQuestion: null,
};

const mcSessionsSlice = createSlice({
  name: 'mcSessions',
  initialState,
  reducers: {
    // Session CRUD
    setSession: (state, action: PayloadAction<MCSession>) => {
      const session = action.payload;
      state.sessions[session.sessionId] = session;
      state.questions[session.sessionId] = session.questions;
    },
    
    setSessions: (state, action: PayloadAction<MCSession[]>) => {
      action.payload.forEach(session => {
        state.sessions[session.sessionId] = session;
        state.questions[session.sessionId] = session.questions;
      });
    },
    
    updateSession: (state, action: PayloadAction<{ sessionId: string; updates: Partial<MCSession> }>) => {
      const { sessionId, updates } = action.payload;
      if (state.sessions[sessionId]) {
        state.sessions[sessionId] = {
          ...state.sessions[sessionId],
          ...updates,
        };
      }
    },
    
    deleteSession: (state, action: PayloadAction<string>) => {
      const sessionId = action.payload;
      delete state.sessions[sessionId];
      delete state.questions[sessionId];
      delete state.progress[sessionId];
      delete state.responses[sessionId];
    },
    
    // Question management
    setQuestions: (state, action: PayloadAction<{ sessionId: string; questions: MCQuestion[] }>) => {
      const { sessionId, questions } = action.payload;
      state.questions[sessionId] = questions;
      if (state.sessions[sessionId]) {
        state.sessions[sessionId].questions = questions;
      }
    },
    
    addQuestion: (state, action: PayloadAction<{ sessionId: string; question: MCQuestion }>) => {
      const { sessionId, question } = action.payload;
      if (!state.questions[sessionId]) {
        state.questions[sessionId] = [];
      }
      state.questions[sessionId].push(question);
      if (state.sessions[sessionId]) {
        state.sessions[sessionId].questions.push(question);
      }
    },
    
    updateQuestion: (state, action: PayloadAction<{ sessionId: string; questionId: string; updates: Partial<MCQuestion> }>) => {
      const { sessionId, questionId, updates } = action.payload;
      const questions = state.questions[sessionId];
      if (questions) {
        const index = questions.findIndex(q => q.questionId === questionId);
        if (index !== -1) {
          questions[index] = { ...questions[index], ...updates };
          if (state.sessions[sessionId]) {
            state.sessions[sessionId].questions = questions;
          }
        }
      }
    },
    
    deleteQuestion: (state, action: PayloadAction<{ sessionId: string; questionId: string }>) => {
      const { sessionId, questionId } = action.payload;
      const questions = state.questions[sessionId];
      if (questions) {
        state.questions[sessionId] = questions.filter(q => q.questionId !== questionId);
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].questions = state.questions[sessionId];
        }
      }
    },
    
    reorderQuestions: (state, action: PayloadAction<{ sessionId: string; questions: MCQuestion[] }>) => {
      const { sessionId, questions } = action.payload;
      // Update order property for each question
      const reorderedQuestions = questions.map((q, index) => ({
        ...q,
        order: index
      }));
      state.questions[sessionId] = reorderedQuestions;
      if (state.sessions[sessionId]) {
        state.sessions[sessionId].questions = reorderedQuestions;
      }
    },
    
    // Progress tracking
    setProgress: (state, action: PayloadAction<MCSessionProgress>) => {
      const progress = action.payload;
      state.progress[progress.sessionId] = progress;
    },
    
    updateProgress: (state, action: PayloadAction<{ sessionId: string; updates: Partial<MCSessionProgress> }>) => {
      const { sessionId, updates } = action.payload;
      if (state.progress[sessionId]) {
        state.progress[sessionId] = {
          ...state.progress[sessionId],
          ...updates,
          lastUpdated: Date.now()
        };
      }
    },
    
    // Response handling
    addResponse: (state, action: PayloadAction<MCQuestionResponse>) => {
      const response = action.payload;
      if (!state.responses[response.sessionId]) {
        state.responses[response.sessionId] = [];
      }
      state.responses[response.sessionId].push(response);
    },
    
    // UI state
    setCurrentSession: (state, action: PayloadAction<string | null>) => {
      state.currentSessionId = action.payload;
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    // Admin editing state
    setEditingSession: (state, action: PayloadAction<MCSession | null>) => {
      state.editingSession = action.payload;
    },
    
    setEditingQuestion: (state, action: PayloadAction<MCQuestion | null>) => {
      state.editingQuestion = action.payload;
    },
    
    // Clear state
    clearMCSessionsState: () => initialState,
  },
});

// Actions
export const {
  setSession,
  setSessions,
  updateSession,
  deleteSession,
  setQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  setProgress,
  updateProgress,
  addResponse,
  setCurrentSession,
  setLoading,
  setError,
  setEditingSession,
  setEditingQuestion,
  clearMCSessionsState,
} = mcSessionsSlice.actions;

// Base selectors
const selectMCSessionsState = (state: RootState) => state.mcSessions;
const selectSessions = (state: RootState) => state.mcSessions.sessions;
const selectQuestions = (state: RootState) => state.mcSessions.questions;
const selectProgress = (state: RootState) => state.mcSessions.progress;
const selectResponses = (state: RootState) => state.mcSessions.responses;

// Memoized selectors
export const selectMCSession = (sessionId: string) => (state: RootState) => 
  state.mcSessions.sessions[sessionId];

export const selectAllMCSessions = createSelector(
  [selectSessions],
  (sessions) => Object.values(sessions)
);

// Properly memoized selector for active sessions by statement
export const selectActiveSessionsByStatement = (statementId: string) => 
  createSelector(
    [selectSessions],
    (sessions) => {
      return Object.values(sessions).filter(
        session => session.statementId === statementId && session.status === MCSessionStatus.ACTIVE
      );
    }
  );

// Alternative: Create a factory function for the memoized selector
export const makeSelectActiveSessionsByStatement = () =>
  createSelector(
    [selectSessions, (state: RootState, statementId: string) => statementId],
    (sessions, statementId) => {
      return Object.values(sessions).filter(
        session => session.statementId === statementId && session.status === MCSessionStatus.ACTIVE
      );
    }
  );

export const selectMCQuestions = (sessionId: string) => 
  createSelector(
    [selectQuestions],
    (questions) => questions[sessionId] || []
  );

export const selectMCQuestion = (sessionId: string, questionId: string) => (state: RootState) => {
  const questions = state.mcSessions.questions[sessionId];
  return questions?.find(q => q.questionId === questionId);
};

export const selectMCProgress = (sessionId: string) => (state: RootState) =>
  state.mcSessions.progress[sessionId];

export const selectMCResponses = (sessionId: string) => 
  createSelector(
    [selectResponses],
    (responses) => responses[sessionId] || []
  );

export const selectCurrentMCSession = createSelector(
  [selectMCSessionsState],
  (mcSessions) => {
    const sessionId = mcSessions.currentSessionId;
    return sessionId ? mcSessions.sessions[sessionId] : null;
  }
);

export const selectMCSessionsLoading = (state: RootState) => state.mcSessions.loading;
export const selectMCSessionsError = (state: RootState) => state.mcSessions.error;
export const selectEditingSession = (state: RootState) => state.mcSessions.editingSession;
export const selectEditingQuestion = (state: RootState) => state.mcSessions.editingQuestion;

// Export reducer
export default mcSessionsSlice.reducer;