import { configureStore } from '@reduxjs/toolkit';
import userDataReducer, {
  setUserQuestion,
  deleteUserQuestion,
  setUserQuestions,
  updateUserQuestionOptionColor,
  setUserData,
  deleteUserData,
  setPolarizationIndexes,
  deletePolarizationIndex,
} from './userDataSlice';
import { UserQuestion, PolarizationIndex } from 'delib-npm';

describe('userDataSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        userData: userDataReducer,
      },
    });
  });

  const mockUserQuestion: UserQuestion = {
    userQuestionId: 'uq-123',
    statementId: 'stmt-123',
    userId: 'user-123',
    question: 'Test question?',
    options: [
      { option: 'Option A', color: '#FF0000' },
      { option: 'Option B', color: '#00FF00' },
    ],
    createdAt: Date.now(),
  };

  const mockPolarizationIndex: PolarizationIndex = {
    statementId: 'stmt-123',
    index: 0.75,
    timestamp: Date.now(),
  };

  describe('userQuestions', () => {
    it('should set a user question', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      const state = store.getState().userData;
      expect(state.userQuestions).toHaveLength(1);
      expect(state.userQuestions[0]).toEqual(mockUserQuestion);
    });

    it('should update existing user question', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      const updatedQuestion = { ...mockUserQuestion, question: 'Updated question?' };
      store.dispatch(setUserQuestion(updatedQuestion));
      
      const state = store.getState().userData;
      expect(state.userQuestions).toHaveLength(1);
      expect(state.userQuestions[0].question).toBe('Updated question?');
    });

    it('should delete a user question', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(deleteUserQuestion('uq-123'));
      
      const state = store.getState().userData;
      expect(state.userQuestions).toHaveLength(0);
    });

    it('should set multiple user questions', () => {
      const questions = [
        mockUserQuestion,
        { ...mockUserQuestion, userQuestionId: 'uq-456', question: 'Another question?' },
      ];
      store.dispatch(setUserQuestions(questions));
      
      const state = store.getState().userData;
      expect(state.userQuestions).toHaveLength(2);
    });

    it('should update option color', () => {
      store.dispatch(setUserQuestion(mockUserQuestion));
      store.dispatch(updateUserQuestionOptionColor({
        userQuestionId: 'uq-123',
        option: 'Option A',
        color: '#0000FF',
      }));
      
      const state = store.getState().userData;
      const updatedOption = state.userQuestions[0].options.find(opt => opt.option === 'Option A');
      expect(updatedOption?.color).toBe('#0000FF');
    });
  });

  describe('userData', () => {
    it('should set user data', () => {
      store.dispatch(setUserData(mockUserQuestion));
      const state = store.getState().userData;
      expect(state.userData).toHaveLength(1);
      expect(state.userData[0]).toEqual(mockUserQuestion);
    });

    it('should delete user data', () => {
      store.dispatch(setUserData(mockUserQuestion));
      store.dispatch(deleteUserData('uq-123'));
      
      const state = store.getState().userData;
      expect(state.userData).toHaveLength(0);
    });
  });

  describe('polarizationIndexes', () => {
    it('should set polarization index', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      const state = store.getState().userData;
      expect(state.polarizationIndexes).toHaveLength(1);
      expect(state.polarizationIndexes[0]).toEqual(mockPolarizationIndex);
    });

    it('should update existing polarization index', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      const updatedIndex = { ...mockPolarizationIndex, index: 0.5 };
      store.dispatch(setPolarizationIndexes(updatedIndex));
      
      const state = store.getState().userData;
      expect(state.polarizationIndexes).toHaveLength(1);
      expect(state.polarizationIndexes[0].index).toBe(0.5);
    });

    it('should delete polarization index', () => {
      store.dispatch(setPolarizationIndexes(mockPolarizationIndex));
      store.dispatch(deletePolarizationIndex('stmt-123'));
      
      const state = store.getState().userData;
      expect(state.polarizationIndexes).toHaveLength(0);
    });
  });
});