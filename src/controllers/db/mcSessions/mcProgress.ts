import { 
  MCSessionProgress,
  MCQuestionResponse,
  validateMCSessionProgress,
  validateMCQuestionResponse
} from 'delib-npm';
import { 
  doc, 
  setDoc, 
  updateDoc, 
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
  setProgress, 
  updateProgress, 
  addResponse,
  setError, 
  setLoading 
} from '@/redux/mcSessions/mcSessionsSlice';

/**
 * Creates or updates participant progress for a session
 */
export async function setMCProgress(
  sessionId: string,
  participantId: string,
  progressData: Partial<MCSessionProgress>
): Promise<MCSessionProgress | null> {
  try {
    const progressId = `${sessionId}_${participantId}`;
    const progressRef = doc(DB, 'mcProgress', progressId);
    
    // Check if progress exists
    const existingDoc = await getDoc(progressRef);
    
    let progress: MCSessionProgress;
    
    if (existingDoc.exists()) {
      // Update existing progress
      const updates = {
        ...progressData,
        lastUpdated: Date.now()
      };
      
      await updateDoc(progressRef, updates);
      
      progress = {
        ...existingDoc.data(),
        ...updates
      } as MCSessionProgress;
      
    } else {
      // Create new progress
      progress = {
        sessionId,
        participantId,
        currentQuestionIndex: 0,
        completedQuestions: [],
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        completed: false,
        ...progressData
      } as MCSessionProgress;
      
      const validatedProgress = validateMCSessionProgress(progress);
      await setDoc(progressRef, validatedProgress);
      progress = validatedProgress;
    }
    
    // Update Redux store
    store.dispatch(setProgress(progress));
    
    return progress;
    
  } catch (error) {
    console.error('Error setting MC progress:', error);
    store.dispatch(setError('Failed to save progress'));
    return null;
  }
}

/**
 * Gets participant progress for a session
 */
export async function getMCProgress(
  sessionId: string,
  participantId: string
): Promise<MCSessionProgress | null> {
  try {
    const progressId = `${sessionId}_${participantId}`;
    const progressRef = doc(DB, 'mcProgress', progressId);
    const progressSnap = await getDoc(progressRef);
    
    if (!progressSnap.exists()) {
      return null;
    }
    
    const progress = validateMCSessionProgress(progressSnap.data());
    store.dispatch(setProgress(progress));
    
    return progress;
    
  } catch (error) {
    console.error('Error getting MC progress:', error);
    return null;
  }
}

/**
 * Marks a question as completed
 */
export async function markQuestionCompleted(
  sessionId: string,
  participantId: string,
  questionId: string
): Promise<boolean> {
  try {
    const progressId = `${sessionId}_${participantId}`;
    const progressRef = doc(DB, 'mcProgress', progressId);
    
    // Get current progress
    const progressSnap = await getDoc(progressRef);
    if (!progressSnap.exists()) {
      // Create initial progress
      await setMCProgress(sessionId, participantId, {
        completedQuestions: [questionId],
        currentQuestionIndex: 1
      });
      return true;
    }
    
    const currentProgress = progressSnap.data() as MCSessionProgress;
    const completedQuestions = currentProgress.completedQuestions || [];
    
    // Add question if not already completed
    if (!completedQuestions.includes(questionId)) {
      completedQuestions.push(questionId);
    }
    
    // Update progress
    const updates = {
      completedQuestions,
      currentQuestionIndex: currentProgress.currentQuestionIndex + 1,
      lastUpdated: Date.now()
    };
    
    await updateDoc(progressRef, updates);
    
    store.dispatch(updateProgress({ sessionId, updates }));
    
    return true;
    
  } catch (error) {
    console.error('Error marking question completed:', error);
    return false;
  }
}

/**
 * Marks session as completed
 */
export async function completeSession(
  sessionId: string,
  participantId: string
): Promise<boolean> {
  try {
    const progressId = `${sessionId}_${participantId}`;
    const progressRef = doc(DB, 'mcProgress', progressId);
    
    const updates = {
      completed: true,
      completedAt: Date.now(),
      lastUpdated: Date.now()
    };
    
    await updateDoc(progressRef, updates);
    
    store.dispatch(updateProgress({ sessionId, updates }));
    
    console.info('Session completed:', sessionId);
    return true;
    
  } catch (error) {
    console.error('Error completing session:', error);
    return false;
  }
}

/**
 * Saves a participant's response to a question
 */
export async function saveMCResponse(
  response: MCQuestionResponse
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const responseId = `${response.sessionId}_${response.questionId}_${response.participantId}`;
    const responseRef = doc(DB, 'mcResponses', responseId);
    
    // Validate response
    const validatedResponse = validateMCQuestionResponse({
      ...response,
      completedAt: response.completedAt || Date.now()
    });
    
    // Save response (immutable - no updates allowed)
    await setDoc(responseRef, validatedResponse, { merge: false });
    
    // Update Redux store
    store.dispatch(addResponse(validatedResponse));
    
    // Mark question as completed in progress
    await markQuestionCompleted(
      response.sessionId,
      response.participantId,
      response.questionId
    );
    
    console.info('Response saved successfully:', responseId);
    return true;
    
  } catch (error) {
    console.error('Error saving MC response:', error);
    store.dispatch(setError('Failed to save response'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Gets all responses for a session
 */
export async function getMCSessionResponses(
  sessionId: string
): Promise<MCQuestionResponse[]> {
  try {
    const responsesRef = collection(DB, 'mcResponses');
    const q = query(
      responsesRef,
      where('sessionId', '==', sessionId),
      orderBy('completedAt', 'desc')
    );
    
    const querySnap = await getDocs(q);
    const responses: MCQuestionResponse[] = [];
    
    querySnap.forEach(doc => {
      try {
        const response = validateMCQuestionResponse(doc.data());
        responses.push(response);
      } catch (error) {
        console.error('Invalid response data:', doc.id);
      }
    });
    
    return responses;
    
  } catch (error) {
    console.error('Error getting session responses:', error);
    return [];
  }
}

/**
 * Gets participant's responses for a session
 */
export async function getParticipantResponses(
  sessionId: string,
  participantId: string
): Promise<MCQuestionResponse[]> {
  try {
    const responsesRef = collection(DB, 'mcResponses');
    const q = query(
      responsesRef,
      where('sessionId', '==', sessionId),
      where('participantId', '==', participantId),
      orderBy('completedAt', 'asc')
    );
    
    const querySnap = await getDocs(q);
    const responses: MCQuestionResponse[] = [];
    
    querySnap.forEach(doc => {
      try {
        const response = validateMCQuestionResponse(doc.data());
        responses.push(response);
      } catch (error) {
        console.error('Invalid response data:', doc.id);
      }
    });
    
    return responses;
    
  } catch (error) {
    console.error('Error getting participant responses:', error);
    return [];
  }
}

/**
 * Gets all progress records for a session
 */
export async function getSessionProgress(
  sessionId: string
): Promise<MCSessionProgress[]> {
  try {
    const progressRef = collection(DB, 'mcProgress');
    const q = query(
      progressRef,
      where('sessionId', '==', sessionId),
      orderBy('lastUpdated', 'desc')
    );
    
    const querySnap = await getDocs(q);
    const progressRecords: MCSessionProgress[] = [];
    
    querySnap.forEach(doc => {
      try {
        const progress = validateMCSessionProgress(doc.data());
        progressRecords.push(progress);
      } catch (error) {
        console.error('Invalid progress data:', doc.id);
      }
    });
    
    return progressRecords;
    
  } catch (error) {
    console.error('Error getting session progress:', error);
    return [];
  }
}

/**
 * Listen to real-time progress updates
 */
export function listenToProgress(
  sessionId: string,
  participantId: string,
  callback: (progress: MCSessionProgress | null) => void
): Unsubscribe {
  const progressId = `${sessionId}_${participantId}`;
  const progressRef = doc(DB, 'mcProgress', progressId);
  
  return onSnapshot(progressRef, (docSnap) => {
    if (!docSnap.exists()) {
      callback(null);
      return;
    }
    
    try {
      const progress = validateMCSessionProgress(docSnap.data());
      store.dispatch(setProgress(progress));
      callback(progress);
    } catch (error) {
      console.error('Invalid progress data:', error);
      callback(null);
    }
  });
}

/**
 * Gets session completion statistics
 */
export async function getSessionStats(sessionId: string): Promise<{
  totalParticipants: number;
  completedCount: number;
  averageProgress: number;
  averageTimeMinutes: number;
}> {
  try {
    const progressRecords = await getSessionProgress(sessionId);
    
    if (progressRecords.length === 0) {
      return {
        totalParticipants: 0,
        completedCount: 0,
        averageProgress: 0,
        averageTimeMinutes: 0
      };
    }
    
    const completedCount = progressRecords.filter(p => p.completed).length;
    
    // Get session to know total questions
    const { getMCSession } = await import('./getMCSession');
    const session = await getMCSession(sessionId);
    const totalQuestions = session?.questions.length || 1;
    
    // Calculate average progress
    const totalProgress = progressRecords.reduce((sum, p) => 
      sum + (p.completedQuestions.length / totalQuestions), 0
    );
    const averageProgress = (totalProgress / progressRecords.length) * 100;
    
    // Calculate average time for completed sessions
    const completedSessions = progressRecords.filter(p => p.completed);
    let averageTimeMinutes = 0;
    
    if (completedSessions.length > 0) {
      const totalTime = completedSessions.reduce((sum, p) => {
        const duration = (p as any).completedAt - p.startedAt;
        return sum + duration;
      }, 0);
      averageTimeMinutes = Math.round(totalTime / completedSessions.length / 60000);
    }
    
    return {
      totalParticipants: progressRecords.length,
      completedCount,
      averageProgress: Math.round(averageProgress),
      averageTimeMinutes
    };
    
  } catch (error) {
    console.error('Error getting session stats:', error);
    return {
      totalParticipants: 0,
      completedCount: 0,
      averageProgress: 0,
      averageTimeMinutes: 0
    };
  }
}