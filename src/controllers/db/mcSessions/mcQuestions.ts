import { 
  MCQuestion,
  MCQuestionCreate,
  MCQuestionType,
  validateMCQuestion,
  getDefaultStepsForQuestionType
} from 'delib-npm';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection,
  getDocs,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { DB } from '../config';
import { store } from '@/redux/store';
import { 
  addQuestion, 
  updateQuestion, 
  deleteQuestion,
  reorderQuestions,
  setError, 
  setLoading 
} from '@/redux/mcSessions/mcSessionsSlice';

/**
 * Adds a new question to a session
 */
export async function addMCQuestion(
  sessionId: string,
  questionData: MCQuestionCreate
): Promise<MCQuestion | null> {
  try {
    store.dispatch(setLoading(true));
    
    // Generate question ID
    const questionId = `q_${sessionId}_${Date.now()}`;
    
    // Get current questions to determine order
    const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
    const questionsSnap = await getDocs(query(questionsRef, orderBy('order', 'desc')));
    
    let maxOrder = -1;
    questionsSnap.forEach(doc => {
      const order = doc.data().order || 0;
      if (order > maxOrder) maxOrder = order;
    });
    
    // Create full question object
    const question: MCQuestion = {
      ...questionData,
      questionId,
      sessionId,
      order: maxOrder + 1
    };
    
    // Validate question
    const validatedQuestion = validateMCQuestion(question);
    
    // Save to Firestore
    const questionRef = doc(
      collection(DB, 'mcSessions', sessionId, 'questions'),
      questionId
    );
    await setDoc(questionRef, validatedQuestion);
    
    // Update Redux store
    store.dispatch(addQuestion({ sessionId, question: validatedQuestion }));
    
    console.info('Question added successfully:', questionId);
    return validatedQuestion;
    
  } catch (error) {
    console.error('Error adding question:', error);
    store.dispatch(setError('Failed to add question'));
    return null;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Updates an existing question
 */
export async function updateMCQuestion(
  sessionId: string,
  questionId: string,
  updates: Partial<MCQuestion>
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    // Don't allow updating certain fields
    const { questionId: _, sessionId: __, ...allowedUpdates } = updates;
    
    const questionRef = doc(
      collection(DB, 'mcSessions', sessionId, 'questions'),
      questionId
    );
    
    await updateDoc(questionRef, {
      ...allowedUpdates,
      updatedAt: Date.now()
    });
    
    // Update Redux store
    store.dispatch(updateQuestion({ 
      sessionId, 
      questionId, 
      updates: allowedUpdates 
    }));
    
    console.info('Question updated successfully:', questionId);
    return true;
    
  } catch (error) {
    console.error('Error updating question:', error);
    store.dispatch(setError('Failed to update question'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Deletes a question from a session
 */
export async function deleteMCQuestion(
  sessionId: string,
  questionId: string
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const questionRef = doc(
      collection(DB, 'mcSessions', sessionId, 'questions'),
      questionId
    );
    
    await deleteDoc(questionRef);
    
    // Update Redux store
    store.dispatch(deleteQuestion({ sessionId, questionId }));
    
    // Reorder remaining questions
    await reorderMCQuestionsAfterDelete(sessionId);
    
    console.info('Question deleted successfully:', questionId);
    return true;
    
  } catch (error) {
    console.error('Error deleting question:', error);
    store.dispatch(setError('Failed to delete question'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Reorders questions in a session
 */
export async function reorderMCQuestions(
  sessionId: string,
  questions: MCQuestion[]
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const batch = writeBatch(DB);
    
    // Update order for each question
    questions.forEach((question, index) => {
      const questionRef = doc(
        collection(DB, 'mcSessions', sessionId, 'questions'),
        question.questionId
      );
      batch.update(questionRef, { 
        order: index,
        updatedAt: Date.now()
      });
    });
    
    await batch.commit();
    
    // Update Redux store with new order
    store.dispatch(reorderQuestions({ sessionId, questions }));
    
    console.info('Questions reordered successfully');
    return true;
    
  } catch (error) {
    console.error('Error reordering questions:', error);
    store.dispatch(setError('Failed to reorder questions'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Reorders questions after one is deleted to maintain sequential order
 */
async function reorderMCQuestionsAfterDelete(sessionId: string): Promise<void> {
  try {
    const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
    const questionsSnap = await getDocs(query(questionsRef, orderBy('order', 'asc')));
    
    const batch = writeBatch(DB);
    let newOrder = 0;
    
    questionsSnap.forEach(doc => {
      batch.update(doc.ref, { order: newOrder++ });
    });
    
    await batch.commit();
    
  } catch (error) {
    console.error('Error reordering questions after delete:', error);
  }
}

/**
 * Changes the question type and updates steps accordingly
 */
export async function changeMCQuestionType(
  sessionId: string,
  questionId: string,
  newType: MCQuestionType,
  statementId: string
): Promise<boolean> {
  try {
    const newSteps = getDefaultStepsForQuestionType(newType, statementId);
    
    return await updateMCQuestion(sessionId, questionId, {
      questionType: newType,
      steps: newSteps
    });
    
  } catch (error) {
    console.error('Error changing question type:', error);
    return false;
  }
}

/**
 * Duplicates a question within the same session
 */
export async function duplicateMCQuestion(
  sessionId: string,
  questionId: string
): Promise<MCQuestion | null> {
  try {
    // Get the original question
    const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
    const originalRef = doc(questionsRef, questionId);
    const originalSnap = await getDoc(originalRef);
    
    if (!originalSnap.exists()) {
      throw new Error('Original question not found');
    }
    
    const originalData = originalSnap.data() as MCQuestion;
    
    // Create duplicate with new ID
    const duplicateData: MCQuestionCreate = {
      ...originalData,
      content: {
        ...originalData.content,
        question: `${originalData.content.question} (Copy)`
      }
    };
    
    return await addMCQuestion(sessionId, duplicateData);
    
  } catch (error) {
    console.error('Error duplicating question:', error);
    return null;
  }
}

/**
 * Batch add multiple questions
 */
export async function batchAddMCQuestions(
  sessionId: string,
  questions: MCQuestionCreate[]
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const batch = writeBatch(DB);
    
    questions.forEach((questionData, index) => {
      const questionId = `q_${sessionId}_${Date.now()}_${index}`;
      const question: MCQuestion = {
        ...questionData,
        questionId,
        sessionId,
        order: index
      };
      
      const validatedQuestion = validateMCQuestion(question);
      const questionRef = doc(
        collection(DB, 'mcSessions', sessionId, 'questions'),
        questionId
      );
      batch.set(questionRef, validatedQuestion);
    });
    
    await batch.commit();
    
    console.info(`Added ${questions.length} questions successfully`);
    return true;
    
  } catch (error) {
    console.error('Error batch adding questions:', error);
    store.dispatch(setError('Failed to add questions'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

// Re-export for missing import
import { getDoc } from 'firebase/firestore';
export { getDoc };