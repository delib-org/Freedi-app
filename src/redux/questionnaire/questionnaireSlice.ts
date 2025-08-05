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
       
    },
});

export const {
    setQuestionnaires,
    addQuestionnaire,
    updateQuestionnaire,
    deleteQuestionnaire,
} = questionnaireSlice.actions;

export default questionnaireSlice.reducer;