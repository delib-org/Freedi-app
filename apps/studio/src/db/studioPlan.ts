import { doc } from 'firebase/firestore';
import { Collections, type StudioPlanSession } from '@freedi/shared-types';
import { db } from '@/firebase';
import { useDoc, type SnapshotState } from './hooks';

/**
 * Live view of one "Start a question with AI" session
 * (`studioPlanSessions/{sessionId}`). Written only by Cloud Functions; the
 * rules let the session's creator read it. The snapshot is the source of
 * truth for the conversation — see `usePlanSession`.
 */
export function useStudioPlanSession(
	sessionId: string | null | undefined,
): SnapshotState<StudioPlanSession | null> {
	const ref = sessionId ? doc(db, Collections.studioPlanSessions, sessionId) : null;

	return useDoc<StudioPlanSession>(ref, `studioPlanSession:${sessionId ?? 'none'}`);
}
