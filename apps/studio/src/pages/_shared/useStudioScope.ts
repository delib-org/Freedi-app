import { useMatch } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useOrganization } from './useOrganization';

/**
 * Which workspace the URL puts you in.
 *
 * The console holds three of them — an organization, your own events, and the
 * system-admin screens — and every trail begins by naming the one you are in.
 * It is read from the route rather than from state, so a page can never claim
 * you are somewhere you have navigated away from.
 */
export type StudioScopeKind = 'org' | 'personal' | 'admin' | 'none';

export interface StudioScope {
	kind: StudioScopeKind;
	/** What the first crumb says. Empty for `none`, which renders no trail. */
	label: string;
	/** The organization id, when the scope is an organization. */
	organizationId: string | null;
}

export function useStudioScope(): StudioScope {
	const { t } = useTranslation();
	const { currentOrg, currentOrgId } = useOrg();

	const orgNested = useMatch('/orgs/:orgId/*');
	const orgExact = useMatch('/orgs/:orgId');
	// Both matchers are called unconditionally: `??` short-circuits, and a hook
	// behind it would run on some renders and not others.
	const personalNested = useMatch('/personal/*');
	const personalExact = useMatch('/personal');
	const personal = personalNested ?? personalExact;
	const event = useMatch('/events/:eventId');
	const admin = useMatch('/admin/*');

	const organizationId = orgNested?.params.orgId ?? orgExact?.params.orgId ?? null;
	// A system admin browses organizations they are not a member of, so the name
	// may not be in `orgs` — fetch it rather than showing the id.
	const { data: fetched } = useOrganization(organizationId && !currentOrg ? organizationId : null);

	if (organizationId) {
		return {
			kind: 'org',
			label:
				(currentOrgId === organizationId ? currentOrg?.name : null) ??
				fetched?.name ??
				t('Organization'),
			organizationId,
		};
	}
	if (personal || event) {
		return { kind: 'personal', label: t('Personal'), organizationId: null };
	}
	if (admin) {
		return { kind: 'admin', label: t('System admin'), organizationId: null };
	}

	return { kind: 'none', label: '', organizationId: null };
}
