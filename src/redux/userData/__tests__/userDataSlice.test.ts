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
import { UserQuestionType } from 'delib-npm';

// Test-specific selectors that work with our test store
type TestState = { userData: ReturnType<typeof userDataReducer> };
const selectUserQuestions = (state: TestState) => state.userData.userQuestions;
const selectUserData = (state: TestState) => state.userData.userData;
const selectPolarizationIndexes = (state: TestState) => state.userData.polarizationIndexes;
const selectUserQuestionById = (state: TestState, id: string) => 
  state.userData.userQuestions.find(q => q.userQuestionId === id);

describe('userDataSlice', () => {
  let store: ReturnType<typeof configureStore>;

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
    const mockUserQuestion = {
      userQuestionId: 'uq1',
      userId: 'user1',
      question: 'Test question?',
      type: UserQuestionType.radio,
      options: [
        { option: 'Option 1', color: '#FF0000' },
        { option: 'Option 2', color: '#00FF00' }
      ],
      statementId: 'stmt1'
    };

    it('should handle setUserQuestion', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      const state = store.getState() as TestState;
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
      const state = store.getState() as TestState;
      expect(selectUserQuestions(state)).toHaveLength(1);
      expect(selectUserQuestions(state)[0].question).toBe('Updated question?');
    });

    it('should handle deleteUserQuestion', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(deleteUserQuestion('uq1'));
      
      const state = store.getState() as TestState;
      expect(selectUserQuestions(state)).toHaveLength(0);
    });

    it('should handle setUserQuestions', () => {
      const questions = [
        mockUserQuestion,
        { ...mockUserQuestion, userQuestionId: 'uq2', question: 'Another question?' }
      ];
      
      store.dispatch(setUserQuestions(questions));
      const state = store.getState() as TestState;
      expect(selectUserQuestions(state)).toHaveLength(2);
    });

    it('should handle updateUserQuestionOptionColor', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(updateUserQuestionOptionColor({
        userQuestionId: 'uq1',
        option: 'Option 1',
        color: '#0000FF'
      }));
      
      const state = store.getState() as TestState;
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
      
      const state = store.getState() as TestState;
      const question = selectUserQuestionById(state, 'uq1');
      expect(question?.options[0].color).toBe('#FF0000');
    });
  });

  describe('userData actions', () => {
    const mockUserData = {
      userQuestionId: 'ud1',
      userId: 'user1',
      question: 'User data question?',
      type: UserQuestionType.text,
      options: [],
      statementId: 'stmt1'
    };

    it('should handle setUserData', () => {
      store.dispatch(setUserData(mockUserData));
      const state = store.getState() as TestState;
      expect(selectUserData(state)).toHaveLength(1);
      expect(selectUserData(state)[0]).toEqual(mockUserData);
    });

    it('should handle deleteUserData', () => {
      store.dispatch(setUserData(mockUserData));
      store.dispatch(deleteUserData('ud1'));
      
      const state = store.getState() as TestState;
      expect(selectUserData(state)).toHaveLength(0);
    });
  });

  describe('polarizationIndexes actions', () => {
    const mockPolarizationIndex = {
      statementId: 'stmt1',
      averageAgreement: 3.5,
      lastUpdated: Date.now(),
      overallMAD: 0.45,
      overallMean: 3.5,
      overallN: 100,
      parentId: 'parent1',
      statement: 'Test statement',
      color: '#000000',
      axes: []
    };

    it('should handle setPolarizationIndexes', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      const state = store.getState() as TestState;
      expect(selectPolarizationIndexes(state)).toHaveLength(1);
      expect(selectPolarizationIndexes(state)[0]).toEqual(mockPolarizationIndex);
    });

    it('should update existing polarization index', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      
      const updatedIndex = {
        ...mockPolarizationIndex,
        averageAgreement: 4.0
      };
      
      store.dispatch(setPolarizationIndexes(updatedIndex));
      const state = store.getState() as TestState;
      expect(selectPolarizationIndexes(state)).toHaveLength(1);
      expect(selectPolarizationIndexes(state)[0].averageAgreement).toBe(4.0);
    });

    it('should handle deletePolarizationIndex', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      store.dispatch(deletePolarizationIndex('stmt1'));
      
      const state = store.getState() as TestState;
      expect(selectPolarizationIndexes(state)).toHaveLength(0);
    });
  });

  describe('selectors', () => {
    it('should select user questions', () => {
      const mockQuestion = {
        userQuestionId: 'uq1',
        userId: 'user1',
        question: 'Test?',
        type: UserQuestionType.text,
        options: [],
        statementId: 'stmt1'
      };
      
      store.dispatch(setUserQuestion(mockQuestion));
      const state = store.getState() as TestState;
      expect(selectUserQuestions(state)).toContainEqual(mockQuestion);
    });

    it('should select user question by ID', () => {
      const mockQuestion = {
        userQuestionId: 'uq1',
        userId: 'user1',
        question: 'Test?',
        type: UserQuestionType.text,
        options: [],
        statementId: 'stmt1'
      };
      
      store.dispatch(setUserQuestion(mockQuestion));
      const state = store.getState() as TestState;
      expect(selectUserQuestionById(state, 'uq1')).toEqual(mockQuestion);
      expect(selectUserQuestionById(state, 'non-existent')).toBeUndefined();
    });
  });
});