import { 
  MCSession, 
  MCQuestion,
  MCSessionStatus
} from 'delib-npm';
import { doc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { DB } from '../config';
import { store } from '@/redux/store';
import { setSession, setError, setLoading } from '@/redux/mcSessions/mcSessionsSlice';
import { MCSessionCreate, createDefaultMCSessionSettings } from './mcTypes';

/**
 * Creates a new multi-question session in Firestore
 */
export async function createMCSession(
  sessionData: MCSessionCreate,
  questions: MCQuestion[]
): Promise<MCSession | null> {
  console.log('createMCSession called with:', { sessionData, questions });
  
  try {
    store.dispatch(setLoading(true));
    
    // Generate session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Generated sessionId:', sessionId);
    
    // Create full session object
    const session: MCSession = {
      ...sessionData,
      sessionId,
      createdAt: Date.now(),
      questions: questions.map((q, index) => ({
        ...q,
        sessionId,
        questionId: q.questionId || `q_${sessionId}_${index}`,
        order: index
      })),
      settings: sessionData.settings || createDefaultMCSessionSettings(),
      status: sessionData.status || MCSessionStatus.DRAFT
    };
    
    console.log('Created session object:', session);
    
    // Use batch write for atomic operation
    const batch = writeBatch(DB);
    
    // Write main session document
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    const sessionDocData = {
      sessionId: session.sessionId,
      statementId: session.statementId,
      title: session.title,
      description: session.description || null,
      createdAt: session.createdAt,
      createdBy: session.createdBy,
      settings: session.settings,
      status: session.status
    };
    
    console.log('Setting session document with data:', sessionDocData);
    batch.set(sessionRef, sessionDocData);
    
    // Write questions as subcollection
    console.log(`Writing ${session.questions.length} questions to subcollection`);
    session.questions.forEach((question, index) => {
      const questionRef = doc(
        collection(DB, 'mcSessions', sessionId, 'questions'),
        question.questionId
      );
      console.log(`Setting question ${index}:`, question.questionId);
      batch.set(questionRef, question);
    });
    
    // Commit the batch
    console.log('Committing batch write...');
    await batch.commit();
    console.log('Batch write committed successfully');
    
    // Update Redux store
    store.dispatch(setSession(session));
    
    console.info('MC Session created successfully:', sessionId);
    return session;
    
  } catch (error) {
    console.error('Error creating MC session:', error);
    store.dispatch(setError('Failed to create session'));
    return null;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Creates a draft session (not yet published)
 */
export async function createDraftMCSession(
  statementId: string,
  title: string,
  createdBy: string
): Promise<MCSession | null> {
  const sessionData: MCSessionCreate = {
    statementId,
    title,
    description: undefined,
    createdBy,
    questions: [],
    settings: createDefaultMCSessionSettings(),
    status: MCSessionStatus.DRAFT
  };
  
  return createMCSession(sessionData, []);
}

/**
 * Duplicates an existing session
 */
export async function duplicateMCSession(
  originalSessionId: string,
  newTitle: string,
  createdBy: string
): Promise<MCSession | null> {
  try {
    // First, get the original session
    const { getMCSession } = await import('./getMCSession');
    const original = await getMCSession(originalSessionId);
    
    if (!original) {
      throw new Error('Original session not found');
    }
    
    // Create new session data
    const sessionData: MCSessionCreate = {
      statementId: original.statementId,
      title: newTitle,
      description: original.description,
      createdBy,
      questions: [],
      settings: { ...original.settings },
      status: MCSessionStatus.DRAFT
    };
    
    // Duplicate questions with new IDs
    const newQuestions = original.questions.map((q, index) => ({
      ...q,
      questionId: '', // Will be generated
      sessionId: '', // Will be set in createMCSession
      order: index
    }));
    
    return createMCSession(sessionData, newQuestions);
    
  } catch (error) {
    console.error('Error duplicating MC session:', error);
    return null;
  }
}