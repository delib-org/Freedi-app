import { Access } from '@freedi/shared-types';

export interface AccessCopyKeys {
	label: string;
	hint: string;
}

/**
 * One label and one hint per access level (IA main-people-settings §3).
 * The deprecated `open` reads as Open to all, the value it falls back to.
 */
export const ACCESS_COPY_KEYS: Readonly<Record<Access, AccessCopyKeys>> = {
	[Access.public]: { label: 'people.access.public', hint: 'people.access.public.hint' },
	[Access.open]: { label: 'people.access.openToAll', hint: 'people.access.openToAll.hint' },
	[Access.openToAll]: { label: 'people.access.openToAll', hint: 'people.access.openToAll.hint' },
	[Access.openForRegistered]: {
		label: 'people.access.signedIn',
		hint: 'people.access.signedIn.hint',
	},
	[Access.moderated]: { label: 'people.access.byApproval', hint: 'people.access.byApproval.hint' },
	[Access.secret]: { label: 'people.access.inviteOnly', hint: 'people.access.inviteOnly.hint' },
};

/** Access levels a host can pick, in the order the picker lists them. */
export const SELECTABLE_ACCESS_LEVELS: ReadonlyArray<Access> = [
	Access.public,
	Access.openToAll,
	Access.openForRegistered,
	Access.moderated,
	Access.secret,
];

export function accessCopyKeys(access: Access | undefined): AccessCopyKeys {
	return ACCESS_COPY_KEYS[access ?? Access.openToAll] ?? ACCESS_COPY_KEYS[Access.openToAll];
}
