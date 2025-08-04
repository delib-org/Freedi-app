import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { QuestionType, EvaluationUI, Questionnaire } from 'delib-npm';

// Import CutoffBy enum - will need to be imported from delib-npm when available
enum CutoffBy {
    topOptions = 'topOptions',
    aboveThreshold = 'aboveThreshold'
}



interface QuestionnaireResponse {
    questionnaireId: string;
    userId: string;
    responses: {
        statementId: string;
        response: any; // Response type depends on question type
        timestamp: number;
    }[];
    startedAt: number;
    completedAt?: number;
    currentQuestionIndex: number;
}

interface QuestionnaireState {
    // All questionnaires
    questionnaires: Record<string, Questionnaire>;
    
    // Loading states
    isLoading: boolean;
    isSaving: boolean;
    
    // Error handling
    error: string | null;
}

const initialState: QuestionnaireState = {
    questionnaires: {},
    isLoading: false,
    isSaving: false,
    error: null,
};

const questionnaireSlice = createSlice({
    name: 'questionnaire',
    initialState,
    reducers: {
        // Questionnaire CRUD operations
        setQuestionnaires: (state, action: PayloadAction<Questionnaire[]>) => {
            state.questionnaires = {};
            action.payload.forEach(q => {
                state.questionnaires[q.questionnaireId] = q;
            });
            state.isLoading = false;
            state.error = null;
        },
        
        addQuestionnaire: (state, action: PayloadAction<Questionnaire>) => {
            state.questionnaires[action.payload.questionnaireId] = action.payload;
        },
        
        updateQuestionnaire: (state, action: PayloadAction<Questionnaire>) => {
            if (state.questionnaires[action.payload.questionnaireId]) {
                state.questionnaires[action.payload.questionnaireId] = action.payload;
            }
        },
        
        deleteQuestionnaire: (state, action: PayloadAction<string>) => {
            delete state.questionnaires[action.payload];
        },
        
        // Current questionnaire for editing
        setCurrentQuestionnaire: (state, action: PayloadAction<Questionnaire | null>) => {
            state.currentQuestionnaire = action.payload;
        },
        
        // Active questionnaire for answering
        startQuestionnaire: (state, action: PayloadAction<string>) => {
            const questionnaire = state.questionnaires[action.payload];
            if (questionnaire) {
                state.activeQuestionnaire = {
                    questionnaire,
                    currentQuestionIndex: 0,
                    responses: {},
                    startedAt: Date.now(),
                };
            }
        },
        
        answerCurrentQuestion: (state, action: PayloadAction<{ statementId: string; response: any }>) => {
            if (state.activeQuestionnaire.questionnaire) {
                state.activeQuestionnaire.responses[action.payload.statementId] = action.payload.response;
            }
        },
        
        nextQuestion: (state) => {
            if (state.activeQuestionnaire.questionnaire) {
                const totalQuestions = state.activeQuestionnaire.questionnaire.questions.length;
                if (state.activeQuestionnaire.currentQuestionIndex < totalQuestions - 1) {
                    state.activeQuestionnaire.currentQuestionIndex++;
                }
            }
        },
        
        previousQuestion: (state) => {
            if (state.activeQuestionnaire.currentQuestionIndex > 0) {
                state.activeQuestionnaire.currentQuestionIndex--;
            }
        },
        
        submitQuestionnaire: (state) => {
            if (state.activeQuestionnaire.questionnaire) {
                const response: QuestionnaireResponse = {
                    questionnaireId: state.activeQuestionnaire.questionnaire.questionnaireId,
                    userId: '', // Will be set by the component
                    responses: Object.entries(state.activeQuestionnaire.responses).map(([statementId, response]) => ({
                        statementId,
                        response,
                        timestamp: Date.now(),
                    })),
                    startedAt: state.activeQuestionnaire.startedAt || Date.now(),
                    completedAt: Date.now(),
                    currentQuestionIndex: state.activeQuestionnaire.currentQuestionIndex,
                };
                
                state.userResponses[response.questionnaireId] = response;
                
                // Reset active questionnaire
                state.activeQuestionnaire = {
                    questionnaire: null,
                    currentQuestionIndex: 0,
                    responses: {},
                    startedAt: null,
                };
            }
        },
        
        // User responses
        setUserResponses: (state, action: PayloadAction<QuestionnaireResponse[]>) => {
            state.userResponses = {};
            action.payload.forEach(r => {
                state.userResponses[r.questionnaireId] = r;
            });
        },
        
        // Loading states
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        
        setSaving: (state, action: PayloadAction<boolean>) => {
            state.isSaving = action.payload;
        },
        
        // Error handling
        setError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload;
        },
        
        // Reset slice
        resetQuestionnaireState: () => initialState,
    },
});

export const {
    setQuestionnaires,
    addQuestionnaire,
    updateQuestionnaire,
    deleteQuestionnaire,
    setCurrentQuestionnaire,
    startQuestionnaire,
    answerCurrentQuestion,
    nextQuestion,
    previousQuestion,
    submitQuestionnaire,
    setUserResponses,
    setLoading,
    setSaving,
    setError,
    resetQuestionnaireState,
} = questionnaireSlice.actions;

export default questionnaireSlice.reducer;