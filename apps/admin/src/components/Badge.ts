import m from 'mithril';
import { StatementType } from '@freedi/shared-types';

export type BadgeVariant =
	| 'blue'
	| 'teal'
	| 'violet'
	| 'rose'
	| 'amber'
	| 'emerald'
	| 'gray';

export interface BadgeAttrs {
	text: string;
	variant: BadgeVariant;
}

export const Badge: m.Component<BadgeAttrs> = {
	view(vnode) {
		const { text, variant } = vnode.attrs;
		return m(`.badge.badge--${variant}`, text);
	},
};

const typeColorMap: Record<string, BadgeVariant> = {
	[StatementType.statement]: 'blue',
	[StatementType.option]: 'teal',
	[StatementType.question]: 'violet',
	[StatementType.document]: 'rose',
	[StatementType.group]: 'amber',
	[StatementType.comment]: 'gray',
	[StatementType.paragraph]: 'emerald',
};

export function statementTypeBadge(type: string): m.Children {
	const variant = typeColorMap[type] || 'gray';
	return m(`.badge.badge--${variant}`, type);
}

const appColorMap: Record<string, BadgeVariant> = {
	main: 'blue',
	sign: 'violet',
	'mass-consensus': 'teal',
	flow: 'amber',
};

export function sourceAppBadge(sourceApp?: string): m.Children {
	if (!sourceApp) {
		return m('.badge.badge--gray', 'Unknown');
	}
	const variant = appColorMap[sourceApp] || 'gray';
	return m(`.badge.badge--${variant}`, sourceApp);
}
