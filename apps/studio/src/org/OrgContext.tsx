import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import {
	Collections,
	ORG_ADMIN_ROLES,
	OrganizationRole,
	type Organization,
	type OrganizationMember,
} from '@freedi/shared-types';
import { db } from '@/firebase';
import { useAuth } from '@/auth/AuthContext';
import { useSystemAdmin } from '@/auth/useSystemAdmin';
import { useCollection } from '@/db/hooks';
import { logError } from '@/utils/logError';

/**
 * Organization scope for the whole console.
 *
 * The current org comes from the `/orgs/:orgId/*` URL segment and falls back
 * to the first org the user belongs to. Membership is live (`onSnapshot`);
 * the org documents themselves are fetched once per membership set.
 */
export interface OrgState {
	/** The caller's membership records, one per organization. */
	memberships: OrganizationMember[];
	/** Organizations the caller belongs to, in membership order. */
	orgs: Organization[];
	currentOrgId: string | null;
	currentOrg: Organization | null;
	/** Role in the current org; undefined for a system admin browsing an org they are not a member of. */
	currentRole: OrganizationRole | undefined;
	isSystemAdmin: boolean;
	/** Owner / admin (or system admin): may create questions, nudge, change status. */
	canManage: boolean;
	/** Owner (or system admin): may invite and remove members. */
	canManageMembers: boolean;
	loading: boolean;
}

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const uid = user?.uid ?? null;
	const isSystemAdmin = useSystemAdmin(uid);

	const membershipQuery = uid
		? query(collection(db, Collections.organizationMembers), where('userId', '==', uid))
		: null;
	const { data: memberships, loading: membershipsLoading } = useCollection<OrganizationMember>(
		membershipQuery,
		`memberships:${uid ?? 'none'}`,
	);

	// Re-fetch org docs only when the SET of org ids changes, not on every
	// membership snapshot (e.g. a lastUpdate bump).
	const orgIdsKey = useMemo(
		() => [...new Set(memberships.map((m) => m.organizationId))].sort().join(','),
		[memberships],
	);
	const [orgs, setOrgs] = useState<Organization[]>([]);
	const [orgsLoading, setOrgsLoading] = useState(false);

	useEffect(() => {
		const ids = orgIdsKey ? orgIdsKey.split(',') : [];
		if (ids.length === 0) {
			setOrgs([]);
			setOrgsLoading(false);

			return;
		}

		let active = true;
		setOrgsLoading(true);
		Promise.all(ids.map((id) => getDoc(doc(db, Collections.organizations, id))))
			.then((snaps) => {
				if (!active) return;
				setOrgs(snaps.filter((s) => s.exists()).map((s) => s.data() as Organization));
			})
			.catch((error) => {
				logError(error, {
					operation: 'org.OrgProvider.loadOrgs',
					userId: uid ?? undefined,
					metadata: { ids },
				});
				if (active) setOrgs([]);
			})
			.finally(() => {
				if (active) setOrgsLoading(false);
			});

		return () => {
			active = false;
		};
	}, [orgIdsKey, uid]);

	const nestedMatch = useMatch('/orgs/:orgId/*');
	const exactMatch = useMatch('/orgs/:orgId');
	const urlOrgId = nestedMatch?.params.orgId ?? exactMatch?.params.orgId ?? null;
	const currentOrgId = urlOrgId ?? orgs[0]?.organizationId ?? null;

	const value = useMemo<OrgState>(() => {
		const currentOrg = orgs.find((o) => o.organizationId === currentOrgId) ?? null;
		const currentRole = memberships.find((m) => m.organizationId === currentOrgId)?.role;
		const canManage = isSystemAdmin || (!!currentRole && ORG_ADMIN_ROLES.includes(currentRole));
		const canManageMembers = isSystemAdmin || currentRole === OrganizationRole.owner;

		return {
			memberships,
			orgs,
			currentOrgId,
			currentOrg,
			currentRole,
			isSystemAdmin,
			canManage,
			canManageMembers,
			loading: membershipsLoading || orgsLoading,
		};
	}, [memberships, orgs, currentOrgId, isSystemAdmin, membershipsLoading, orgsLoading]);

	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
	const ctx = useContext(OrgContext);
	if (!ctx) throw new Error('useOrg must be used within OrgProvider');

	return ctx;
}
