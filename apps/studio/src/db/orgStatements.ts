import { useMemo } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import {
	Collections,
	OrganizationInvitationStatus,
	type Organization,
	type OrganizationInvitation,
	type OrganizationMember,
	type Statement,
} from '@freedi/shared-types';
import { db } from '@/firebase';
import { useCollection, useDoc, type SnapshotState } from './hooks';

/**
 * Live readers for the organization console. Every query here uses a single
 * equality filter so it runs on Firestore's automatic single-field indexes;
 * ordering and secondary filters are applied client-side (the result sets are
 * small — one org's questions / members / invitations).
 */

function byCreatedAtDesc(a: Statement, b: Statement): number {
	return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

function byOrderThenCreatedAt(a: Statement, b: Statement): number {
	const orderDiff = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
	if (orderDiff !== 0) return orderDiff;

	return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/** Top questions owned by an organization, newest first (archived ones excluded). */
export function useOrgTopQuestions(
	organizationId: string | null | undefined,
): SnapshotState<Statement[]> {
	const q = organizationId
		? query(collection(db, Collections.statements), where('organizationId', '==', organizationId))
		: null;
	const { data, loading, error } = useCollection<Statement>(
		q,
		`orgTopQuestions:${organizationId ?? 'none'}`,
	);
	const sorted = useMemo(
		() => data.filter((s) => s.parentId === 'top' && !s.hide).sort(byCreatedAtDesc),
		[data],
	);

	return { data: sorted, loading, error };
}

export function useStatement(
	statementId: string | null | undefined,
): SnapshotState<Statement | null> {
	const ref = statementId ? doc(db, Collections.statements, statementId) : null;

	return useDoc<Statement>(ref, `statement:${statementId ?? 'none'}`);
}

/** Direct children of a statement, by `order` then `createdAt` (archived excluded). */
export function useChildren(parentId: string | null | undefined): SnapshotState<Statement[]> {
	const q = parentId
		? query(collection(db, Collections.statements), where('parentId', '==', parentId))
		: null;
	const { data, loading, error } = useCollection<Statement>(q, `children:${parentId ?? 'none'}`);
	const sorted = useMemo(() => data.filter((s) => !s.hide).sort(byOrderThenCreatedAt), [data]);

	return { data: sorted, loading, error };
}

export function useOrgMembers(
	organizationId: string | null | undefined,
): SnapshotState<OrganizationMember[]> {
	const q = organizationId
		? query(
				collection(db, Collections.organizationMembers),
				where('organizationId', '==', organizationId),
			)
		: null;
	const { data, loading, error } = useCollection<OrganizationMember>(
		q,
		`orgMembers:${organizationId ?? 'none'}`,
	);
	const sorted = useMemo(
		() => [...data].sort((a, b) => a.displayName.localeCompare(b.displayName)),
		[data],
	);

	return { data: sorted, loading, error };
}

/** Pending invitations of an organization, newest first. */
export function useOrgInvitations(
	organizationId: string | null | undefined,
): SnapshotState<OrganizationInvitation[]> {
	const q = organizationId
		? query(
				collection(db, Collections.organizationInvitations),
				where('organizationId', '==', organizationId),
			)
		: null;
	const { data, loading, error } = useCollection<OrganizationInvitation>(
		q,
		`orgInvitations:${organizationId ?? 'none'}`,
	);
	const pending = useMemo(
		() =>
			data
				.filter((inv) => inv.status === OrganizationInvitationStatus.pending)
				.sort((a, b) => b.createdAt - a.createdAt),
		[data],
	);

	return { data: pending, loading, error };
}

/** Every organization — system admins only (rules reject the list otherwise). */
export function useAllOrganizations(enabled: boolean): SnapshotState<Organization[]> {
	const q = enabled ? query(collection(db, Collections.organizations)) : null;
	const { data, loading, error } = useCollection<Organization>(
		q,
		`allOrganizations:${enabled ? 'on' : 'off'}`,
	);
	const sorted = useMemo(() => [...data].sort((a, b) => a.name.localeCompare(b.name)), [data]);

	return { data: sorted, loading, error };
}
