import type { ReactNode } from 'react';
import { OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import type { AppShellNavItem } from '@/components/atomic/organisms/AppShell';
import type { StudioScope } from './useStudioScope';

/**
 * The console's side navigation: the sections of the workspace you are in.
 *
 * Because the workspace is now named in the trail directly above the sidebar,
 * these items need no org label of their own — adjacency says whose they are.
 * The system-admin items are the exception: they are not inside the workspace,
 * so they are grouped and captioned separately.
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

const EventsIcon: ReactNode = (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
		<rect x="3" y="5" width="18" height="16" rx="2" />
		<path d="M3 10h18M8 3v4M16 3v4" />
	</svg>
);

const AgoraIcon: ReactNode = (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
		<path d="M4 10l8-6 8 6" />
		<path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" />
		<path d="M3 19h18" />
	</svg>
);

export function useStudioNav(scope: StudioScope): AppShellNavItem[] {
	const { t } = useTranslation();
	const { currentRole, isSystemAdmin } = useOrg();

	const isViewer = currentRole === OrganizationRole.viewer && !isSystemAdmin;
	const items: AppShellNavItem[] = [];

	const adminItems: AppShellNavItem[] = [
		{
			id: 'organizations',
			label: t('Organizations'),
			to: '/admin/orgs',
			icon: OrganizationsIcon,
			end: false,
		},
		{
			id: 'agora',
			label: t('Agora classrooms'),
			to: '/admin/agora',
			icon: AgoraIcon,
			end: false,
		},
	];

	if (scope.kind === 'org' && scope.organizationId) {
		const base = `/orgs/${scope.organizationId}`;
		items.push({
			id: 'questions',
			label: t('Questions'),
			to: base,
			icon: QuestionsIcon,
			end: true,
		});
		if (!isViewer) {
			items.push({ id: 'people', label: t('People'), to: `${base}/people`, icon: PeopleIcon });
		}
	}

	if (scope.kind === 'personal') {
		items.push({ id: 'events', label: t('Events'), to: '/personal', icon: EventsIcon, end: true });
	}

	// In the admin workspace those screens ARE the sections; anywhere else they
	// are a separate, captioned group, because they sit outside the workspace.
	if (scope.kind === 'admin') return adminItems;
	if (isSystemAdmin && scope.kind !== 'none') {
		items.push(...adminItems.map((item) => ({ ...item, group: 'system' as const })));
	}

	return items;
}
