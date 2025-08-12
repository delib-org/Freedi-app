import { 
  MCSession, 
  MCSessionUpdate,
  MCSessionStatus,
  validateMCSession 
} from 'delib-npm';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { DB } from '../config';
import { store } from '@/redux/store';
import { updateSession, setError, setLoading } from '@/redux/mcSessions/mcSessionsSlice';

/**
 * Updates an existing MC session
 */
export async function updateMCSession(
  sessionId: string,
  updates: MCSessionUpdate
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    
    // Don't allow updating certain fields
    const { questions, ...allowedUpdates } = updates as any;
    
    // Add update timestamp
    const updateData = {
      ...allowedUpdates,
      updatedAt: Date.now()
    };
    
    await updateDoc(sessionRef, updateData);
    
    // Update Redux store
    store.dispatch(updateSession({ sessionId, updates: updateData }));
    
    console.info('MC Session updated successfully:', sessionId);
    return true;
    
  } catch (error) {
    console.error('Error updating MC session:', error);
    store.dispatch(setError('Failed to update session'));
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}

/**
 * Updates session status (draft, active, completed, archived)
 */
export async function updateMCSessionStatus(
  sessionId: string,
  status: MCSessionStatus
): Promise<boolean> {
  try {
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    
    const updateData: any = {
      status,
      updatedAt: Date.now()
    };
    
    // Add activation timestamp when publishing
    if (status === MCSessionStatus.ACTIVE) {
      updateData.activatedAt = Date.now();
    }
    
    // Add completion timestamp when completing
    if (status === MCSessionStatus.COMPLETED) {
      updateData.completedAt = Date.now();
    }
    
    // Add archival timestamp when archiving
    if (status === MCSessionStatus.ARCHIVED) {
      updateData.archivedAt = Date.now();
    }
    
    await updateDoc(sessionRef, updateData);
    
    store.dispatch(updateSession({ sessionId, updates: updateData }));
    
    console.info(`MC Session status updated to ${status}:`, sessionId);
    return true;
    
  } catch (error) {
    console.error('Error updating MC session status:', error);
    store.dispatch(setError('Failed to update session status'));
    return false;
  }
}

/**
 * Publishes a draft session (makes it active)
 */
export async function publishMCSession(sessionId: string): Promise<boolean> {
  return updateMCSessionStatus(sessionId, MCSessionStatus.ACTIVE);
}

/**
 * Archives a session (soft delete)
 */
export async function archiveMCSession(sessionId: string): Promise<boolean> {
  return updateMCSessionStatus(sessionId, MCSessionStatus.ARCHIVED);
}

/**
 * Updates session settings
 */
export async function updateMCSessionSettings(
  sessionId: string,
  settings: Partial<MCSession['settings']>
): Promise<boolean> {
  try {
    const sessionRef = doc(DB, 'mcSessions', sessionId);
    
    // Get current session to merge settings
    const { getMCSession } = await import('./getMCSession');
    const currentSession = await getMCSession(sessionId);
    
    if (!currentSession) {
      throw new Error('Session not found');
    }
    
    const mergedSettings = {
      ...currentSession.settings,
      ...settings
    };
    
    await updateDoc(sessionRef, {
      settings: mergedSettings,
      updatedAt: Date.now()
    });
    
    store.dispatch(updateSession({ 
      sessionId, 
      updates: { settings: mergedSettings } 
    }));
    
    console.info('MC Session settings updated:', sessionId);
    return true;
    
  } catch (error) {
    console.error('Error updating MC session settings:', error);
    store.dispatch(setError('Failed to update session settings'));
    return false;
  }
}

/**
 * Batch update multiple sessions
 */
export async function batchUpdateMCSessions(
  updates: Array<{ sessionId: string; updates: MCSessionUpdate }>
): Promise<boolean> {
  try {
    store.dispatch(setLoading(true));
    
    const updatePromises = updates.map(({ sessionId, updates }) =>
      updateMCSession(sessionId, updates)
    );
    
    const results = await Promise.all(updatePromises);
    return results.every(result => result === true);
    
  } catch (error) {
    console.error('Error batch updating MC sessions:', error);
    return false;
  } finally {
    store.dispatch(setLoading(false));
  }
}