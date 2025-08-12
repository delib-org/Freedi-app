import { 
  MCSession, 
  MCQuestion,
  MCSessionStatus
} from 'delib-npm';
import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  Unsubscribe 
} from 'firebase/firestore';
import { DB } from '../config';
import { store } from '@/redux/store';
import { 
  setSession, 
  setSessions, 
  setQuestions,
  setError, 
  setLoading 
} from '@/redux/mcSessions/mcSessionsSlice';

/**
 * Gets a single MC session by ID
 */
export async function getMCSession(sessionId: string): Promise<MCSession | null> {
  try {
    store.dispatch(setLoading(true));
    
    // Get main session document
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) {
      console.error('Session not found:', sessionId);
      return null;
    }
    
    const sessionData = sessionSnap.data();
    
    // Get questions subcollection
    const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
    const questionsQuery = query(questionsRef, orderBy('order', 'asc'));
    const questionsSnap = await getDocs(questionsQuery);
    
    const questions: MCQuestion[] = [];
    questionsSnap.forEach(doc => {
      const questionData = doc.data() as MCQuestion;
      questions.push(questionData);
    });
    
    // Combine session and questions
    const fullSession: MCSession = {
      ...sessionData,
      questions
    } as MCSession;
    
    // Store in Redux
    store.dispatch(setSession(fullSession));
    
    return fullSession;
    
  } catch (error) {
    console.error('Error getting MC session:', error);
    store.dispatch(setError('Failed to load session'));
    return null;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Gets all active sessions for a statement
 */
export async function getMCSessionsByStatement(
  statementId: string,
  status: MCSessionStatus = MCSessionStatus.ACTIVE
): Promise<MCSession[]> {
  try {
    store.dispatch(setLoading(true));
    
    const sessionsRef = collection(DB, 'mcSessions');
    const q = query(
      sessionsRef,
      where('statementId', '==', statementId),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
    
    const querySnap = await getDocs(q);
    const sessions: MCSession[] = [];
    
    // Get each session with its questions
    for (const docSnap of querySnap.docs) {
      const sessionData = docSnap.data();
      
      // Get questions for this session
      const questionsRef = collection(DB, 'mcSessions', docSnap.id, 'questions');
      const questionsQuery = query(questionsRef, orderBy('order', 'asc'));
      const questionsSnap = await getDocs(questionsQuery);
      
      const questions: MCQuestion[] = [];
      questionsSnap.forEach(qDoc => {
        questions.push(qDoc.data() as MCQuestion);
      });
      
      const session: MCSession = {
        ...sessionData,
        questions
      } as MCSession;
      sessions.push(session);
    }
    
    store.dispatch(setSessions(sessions));
    return sessions;
    
  } catch (error) {
    console.error('Error getting MC sessions:', error);
    store.dispatch(setError('Failed to load sessions'));
    return [];
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Gets all sessions created by a specific user
 */
export async function getMCSessionsByCreator(
  creatorId: string,
  includeArchived: boolean = false
): Promise<MCSession[]> {
  try {
    const sessionsRef = collection(DB, 'mcSessions');
    let q;
    
    if (includeArchived) {
      q = query(
        sessionsRef,
        where('createdBy', '==', creatorId),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        sessionsRef,
        where('createdBy', '==', creatorId),
        where('status', '!=', MCSessionStatus.ARCHIVED),
        orderBy('status'),
        orderBy('createdAt', 'desc')
      );
    }
    
    const querySnap = await getDocs(q);
    const sessions: MCSession[] = [];
    
    for (const docSnap of querySnap.docs) {
      const session = await getMCSession(docSnap.id);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions;
    
  } catch (error) {
    console.error('Error getting sessions by creator:', error);
    return [];
  }
}

/**
 * Listen to real-time updates for a session
 */
export function listenToMCSession(
  sessionId: string,
  callback?: (session: MCSession | null) => void
): Unsubscribe {
  const sessionRef = doc(DB, 'mcSessions', sessionId);
  
  // Listen to main session document
  const unsubscribeSession = onSnapshot(sessionRef, async (docSnap) => {
    if (!docSnap.exists()) {
      store.dispatch(setSession(null as any));
      callback?.(null);
      return;
    }
    
    // Get the updated session with questions
    const session = await getMCSession(sessionId);
    callback?.(session);
  });
  
  // Listen to questions subcollection
  const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
  const unsubscribeQuestions = onSnapshot(questionsRef, async () => {
    // Refetch the entire session when questions change
    const session = await getMCSession(sessionId);
    callback?.(session);
  });
  
  // Return combined unsubscribe function
  return () => {
    unsubscribeSession();
    unsubscribeQuestions();
  };
}

/**
 * Listen to all active sessions for a statement
 */
export function listenToStatementMCSessions(
  statementId: string,
  callback?: (sessions: MCSession[]) => void
): Unsubscribe {
  const sessionsRef = collection(DB, 'mcSessions');
  const q = query(
    sessionsRef,
    where('statementId', '==', statementId),
    where('status', '==', MCSessionStatus.ACTIVE),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, async () => {
    const sessions = await getMCSessionsByStatement(statementId);
    callback?.(sessions);
  });
}