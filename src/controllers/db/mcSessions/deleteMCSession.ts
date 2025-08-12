import { MCSessionStatus } from 'delib-npm';
import { doc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { DB } from '../config';
import { store } from '@/redux/store';
import { deleteSession, setError, setLoading } from '@/redux/mcSessions/mcSessionsSlice';

/**
 * Soft delete a session (archive it)
 * Preferred method to preserve data
 */
export async function softDeleteMCSession(sessionId: string): Promise<boolean> {
  try {
    const { updateMCSessionStatus } = await import('./updateMCSession');
    return await updateMCSessionStatus(sessionId, MCSessionStatus.ARCHIVED);
  } catch (error) {
    console.error('Error soft deleting MC session:', error);
    return false;
  }
}

/**
 * Hard delete a session and all its data
 * WARNING: This permanently removes all session data including questions and responses
 * Use with caution - prefer softDeleteMCSession for most cases
 */
export async function hardDeleteMCSession(
  sessionId: string,
  deleteResponses: boolean = false
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const batch = writeBatch(DB);
    
    // Delete all questions in subcollection
    const questionsRef = collection(DB, 'mcSessions', sessionId, 'questions');
    const questionsSnap = await getDocs(questionsRef);
    
    questionsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete main session document
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    batch.delete(sessionRef);
    
    // Optionally delete all related data
    if (deleteResponses) {
      // Delete progress documents
      const progressRef = collection(DB, 'mcProgress');
      const progressSnap = await getDocs(progressRef);
      progressSnap.forEach(doc => {
        if (doc.data().sessionId === sessionId) {
          batch.delete(doc.ref);
        }
      });
      
      // Delete response documents
      const responsesRef = collection(DB, 'mcResponses');
      const responsesSnap = await getDocs(responsesRef);
      responsesSnap.forEach(doc => {
        if (doc.data().sessionId === sessionId) {
          batch.delete(doc.ref);
        }
      });
      
      // Delete aggregation documents
      const aggregationsRef = collection(DB, 'mcAggregations');
      const aggregationsSnap = await getDocs(aggregationsRef);
      aggregationsSnap.forEach(doc => {
        if (doc.data().sessionId === sessionId) {
          batch.delete(doc.ref);
        }
      });
    }
    
    // Commit the batch
    await batch.commit();
    
    // Update Redux store
    store.dispatch(deleteSession(sessionId));
    
    console.info('MC Session hard deleted:', sessionId);
    return true;
    
  } catch (error) {
    console.error('Error hard deleting MC session:', error);
    store.dispatch(setError('Failed to delete session'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Delete multiple sessions at once
 */
export async function batchDeleteMCSessions(
  sessionIds: string[],
  hardDelete: boolean = false
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const deletePromises = sessionIds.map(sessionId =>
      hardDelete 
        ? hardDeleteMCSession(sessionId, true)
        : softDeleteMCSession(sessionId)
    );
    
    const results = await Promise.all(deletePromises);
    return results.every(result => result === true);
    
  } catch (error) {
    console.error('Error batch deleting MC sessions:', error);
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Clean up old archived sessions
 * Deletes archived sessions older than specified days
 */
export async function cleanupArchivedSessions(
  statementId: string,
  daysOld: number = 30
): Promise<number> {
  try {
    const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    // Get archived sessions older than cutoff
    const { getMCSessionsByStatement } = await import('./getMCSession');
    const archivedSessions = await getMCSessionsByStatement(
      statementId,
      MCSessionStatus.ARCHIVED
    );
    
    const sessionsToDelete = archivedSessions.filter(
      session => (session as any).archivedAt && (session as any).archivedAt < cutoffDate
    );
    
    if (sessionsToDelete.length === 0) {
      console.info('No old archived sessions to clean up');
      return 0;
    }
    
    // Hard delete old archived sessions
    const deletePromises = sessionsToDelete.map(session =>
      hardDeleteMCSession(session.sessionId, true)
    );
    
    await Promise.all(deletePromises);
    
    console.info(`Cleaned up ${sessionsToDelete.length} old archived sessions`);
    return sessionsToDelete.length;
    
  } catch (error) {
    console.error('Error cleaning up archived sessions:', error);
    return 0;
  }
}