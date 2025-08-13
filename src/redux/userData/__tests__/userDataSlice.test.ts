import { configureStore } from '@reduxjs/toolkit';
import userDataReducer, {
  setUserQuestion,
  deleteUserQuestion,
  setUserQuestions,
  updateUserQuestionOptionColor,
  setUserData,
  deleteUserData,
  setPolarizationIndexes,
  deletePolarizationIndex
} from '../userDataSlice';
import { UserQuestion, PolarizationIndex } from 'delib-npm';
import { RootState } from '../../store';

// Selectors
const selectUserQuestions = (state: RootState) => state.userData.userQuestions;
const selectUserData = (state: RootState) => state.userData.userData;
const selectPolarizationIndexes = (state: RootState) => state.userData.polarizationIndexes;
const selectUserQuestionById = (state: RootState, id: string) => 
  state.userData.userQuestions.find(q => q.userQuestionId === id);

describe('userDataSlice', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        userData: userDataReducer
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false // Disable for tests since we're using Date objects
        })
    });
  });

  describe('userQuestions actions', () => {
    const mockUserQuestion: any = {
      userQuestionId: 'uq1',
      questionId: 'q1',
      userId: 'user1',
      question: 'Test question?',
      options: [
        { option: 'Option 1', color: '#FF0000' },
        { option: 'Option 2', color: '#00FF00' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statementId: 'stmt1'
    };

    it('should handle setUserQuestion', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      const state = store.getState();
      expect(selectUserQuestions(state)).toHaveLength(1);
      expect(selectUserQuestions(state)[0]).toEqual(mockUserQuestion);
    });

    it('should update existing userQuestion', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      
      const updatedQuestion = {
        ...mockUserQuestion,
        question: 'Updated question?'
      };
      
      store.dispatch(setUserQuestion(updatedQuestion));
      const state = store.getState();
      expect(selectUserQuestions(state)).toHaveLength(1);
      expect(selectUserQuestions(state)[0].question).toBe('Updated question?');
    });

    it('should handle deleteUserQuestion', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(deleteUserQuestion('uq1'));
      
      const state = store.getState();
      expect(selectUserQuestions(state)).toHaveLength(0);
    });

    it('should handle setUserQuestions', () => {
      const questions: any[] = [
        mockUserQuestion,
        { ...mockUserQuestion, userQuestionId: 'uq2', question: 'Another question?' }
      ];
      
      store.dispatch(setUserQuestions(questions));
      const state = store.getState();
      expect(selectUserQuestions(state)).toHaveLength(2);
    });

    it('should handle updateUserQuestionOptionColor', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(updateUserQuestionOptionColor({
        userQuestionId: 'uq1',
        option: 'Option 1',
        color: '#0000FF'
      }));
      
      const state = store.getState();
      const question = selectUserQuestionById(state, 'uq1');
      expect(question?.options[0].color).toBe('#0000FF');
    });

    it('should not update non-existent option color', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(updateUserQuestionOptionColor({
        userQuestionId: 'uq1',
        option: 'Non-existent',
        color: '#0000FF'
      }));
      
      const state = store.getState();
      const question = selectUserQuestionById(state, 'uq1');
      expect(question?.options[0].color).toBe('#FF0000');
    });
  });

  describe('userData actions', () => {
    const mockUserData: any = {
      userQuestionId: 'ud1',
      questionId: 'q1',
      userId: 'user1',
      question: 'User data question?',
      options: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statementId: 'stmt1'
    };

    it('should handle setUserData', () => {
      store.dispatch(setUserData(mockUserData));
      const state = store.getState();
      expect(selectUserData(state)).toHaveLength(1);
      expect(selectUserData(state)[0]).toEqual(mockUserData);
    });

    it('should handle deleteUserData', () => {
      store.dispatch(setUserData(mockUserData));
      store.dispatch(deleteUserData('ud1'));
      
      const state = store.getState();
      expect(selectUserData(state)).toHaveLength(0);
    });
  });

  describe('polarizationIndexes actions', () => {
    const mockPolarizationIndex: any = {
      statementId: 'stmt1',
      polarizationIndex: 0.75,
      variance: 0.25,
      mean: 0.5,
      standardDeviation: 0.1,
      sampleSize: 100,
      timestamp: new Date().toISOString(),
      parentId: 'parent1'
    };

    it('should handle setPolarizationIndexes', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      const state = store.getState();
      expect(selectPolarizationIndexes(state)).toHaveLength(1);
      expect(selectPolarizationIndexes(state)[0]).toEqual(mockPolarizationIndex);
    });

    it('should update existing polarization index', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      
      const updatedIndex = {
        ...mockPolarizationIndex,
        polarizationIndex: 0.9
      };
      
      store.dispatch(setPolarizationIndexes(updatedIndex));
      const state = store.getState();
      expect(selectPolarizationIndexes(state)).toHaveLength(1);
      expect(selectPolarizationIndexes(state)[0].polarizationIndex).toBe(0.9);
    });

    it('should handle deletePolarizationIndex', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      store.dispatch(deletePolarizationIndex('stmt1'));
      
      const state = store.getState();
      expect(selectPolarizationIndexes(state)).toHaveLength(0);
    });
  });

  describe('selectors', () => {
    it('should select user questions', () => {
      const mockQuestion: any = {
        userQuestionId: 'uq1',
        questionId: 'q1',
        userId: 'user1',
        question: 'Test?',
        options: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        statementId: 'stmt1'
      };
      
      store.dispatch(setUserQuestion(mockQuestion));
      const state = store.getState();
      expect(selectUserQuestions(state)).toContainEqual(mockQuestion);
    });

    it('should select user question by ID', () => {
      const mockQuestion: any = {
        userQuestionId: 'uq1',
        questionId: 'q1',
        userId: 'user1',
        question: 'Test?',
        options: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        statementId: 'stmt1'
      };
      
      store.dispatch(setUserQuestion(mockQuestion));
      const state = store.getState();
      expect(selectUserQuestionById(state, 'uq1')).toEqual(mockQuestion);
      expect(selectUserQuestionById(state, 'non-existent')).toBeUndefined();
    });
  });
});