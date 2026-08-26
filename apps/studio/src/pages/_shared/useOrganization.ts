import { doc } from 'firebase/firestore';
import { Collections, type Organization } from '@freedi/shared-types';
import { db } from '@/firebase';
import { useDoc, type SnapshotState } from '@/db/hooks';

/**
 * Live organization document. `useOrg().currentOrg` only knows the orgs the
 * caller is a member of, so pages a system admin can browse (any org) read
 * the document directly and fall back to this.
 */
export function useOrganization(
	organizationId: string | null | undefined,
): SnapshotState<Organization | null> {
	const ref = organizationId ? doc(db, Collections.organizations, organizationId) : null;

	return useDoc<Organization>(ref, `organization:${organizationId ?? 'none'}`);
}
