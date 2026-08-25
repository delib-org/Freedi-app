import type { ReactNode } from 'react';
import { OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import type { AppShellNavItem } from '@/components/atomic/organisms/AppShell';

/**
 * The console's side navigation, derived from the current org scope:
 * Questions → People (hidden for viewers) → Organizations (system admins).
 * Without an org (personal-only accounts) "Questions" points at the picker.
 */

const QuestionsIcon: ReactNode = (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
		<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
		<circle cx="12" cy="12" r="9" />
		<circle cx="12" cy="17.5" r="0.6" fill="currentColor" />
	</svg>
);

const PeopleIcon: ReactNode = (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
		<circle cx="9" cy="8" r="3.5" />
		<path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
		<circle cx="17" cy="9.5" r="2.5" />
		<path d="M15.5 14.5a5 5 0 0 1 6 5" />
	</svg>
);

const OrganizationsIcon: ReactNode = (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
		<rect x="3" y="4" width="18" height="16" rx="2" />
		<path d="M3 10h18M9 4v16" />
	</svg>
);

export function useStudioNav(): AppShellNavItem[] {
	const { t } = useTranslation();
	const { currentOrgId, currentRole, isSystemAdmin } = useOrg();

	const isViewer = currentRole === OrganizationRole.viewer && !isSystemAdmin;
	const base = currentOrgId ? `/orgs/${currentOrgId}` : '/orgs';

	const items: AppShellNavItem[] = [
		{ id: 'questions', label: t('Questions'), to: base, icon: QuestionsIcon, end: true },
	];

	if (currentOrgId && !isViewer) {
		items.push({ id: 'people', label: t('People'), to: `${base}/people`, icon: PeopleIcon });
	}

	if (isSystemAdmin) {
		items.push({
			id: 'organizations',
			label: t('Organizations'),
			to: '/admin/orgs',
			icon: OrganizationsIcon,
			end: false,
		});
	}

	return items;
}
