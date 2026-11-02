import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { formatRelativeTime } from '@/helpers/relativeTime';
import Button from '@/view/components/atomic/atoms/Button';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import PersonRow, { RoleBadge, RoleBadgeKind } from '@/view/components/atomic/molecules/PersonRow';
import { MemberAction, MemberEntry, MemberKind } from './membersLogic';
import { MEMBER_ACTION_LABEL, MEMBER_ACTION_VARIANT } from './memberActionLabels';
import styles from './MembersSubsection.module.scss';

/** Block carries the AA danger ink on top of the reject variant. */
export function memberActionClassName(action: MemberAction, base?: string): string | undefined {
	const danger = action === 'block' ? styles.dangerAction : undefined;

	return [base, danger].filter(Boolean).join(' ') || undefined;
}

interface MemberRowProps {
	entry: MemberEntry;
	actions: ReadonlyArray<MemberAction>;
	onAction: (entry: MemberEntry, action: MemberAction) => void;
	onOpenMenu: (entry: MemberEntry) => void;
	hasError: boolean;
	now: number;
}

const BADGE_BY_KIND: Partial<Record<MemberKind, { kind: RoleBadgeKind; key: string }>> = {
	creator: { kind: 'creator', key: 'Creator' },
	host: { kind: 'host', key: 'people.role.host' },
	waiting: { kind: 'waiting', key: 'people.role.waiting' },
	blocked: { kind: 'blocked', key: 'people.role.banned' },
};

/** The role badge (+ You) a Members row carries; Members themselves get none. */
export const MemberBadges: FC<{ entry: MemberEntry }> = ({ entry }) => {
	const { t } = useTranslation();
	const badge = BADGE_BY_KIND[entry.kind];

	return (
		<>
			{badge && <RoleBadge kind={badge.kind} label={t(badge.key)} />}
			{entry.isSelf && <RoleBadge kind="you" label={t('people.role.you')} />}
		</>
	);
};

/**
 * One person in Members: badges, when they joined, and the actions their role
 * allows — labelled inline buttons from 601 px, a ⋯ Sheet below (UX 3.3–3.5).
 */
const MemberRow: FC<MemberRowProps> = ({ entry, actions, onAction, onOpenMenu, hasError, now }) => {
	const { t, currentLanguage } = useTranslation();
	const { createdAt } = entry.subscription;

	return (
		<PersonRow
			name={entry.name}
			photoURL={entry.subscription.user?.photoURL}
			badges={<MemberBadges entry={entry} />}
			meta={
				createdAt
					? fillPlaceholders(t('people.joined'), {
							time: formatRelativeTime(createdAt, now, currentLanguage),
						})
					: undefined
			}
			isBlocked={entry.kind === 'blocked'}
			testId={`member-row-${entry.id}`}
			onOpenMenu={() => onOpenMenu(entry)}
			menuLabel={fillPlaceholders(t('people.actionsFor'), { name: entry.name })}
			actions={
				actions.length > 0 && (
					<>
						{actions.map((action) => (
							<Button
								key={action}
								text={t(MEMBER_ACTION_LABEL[action])}
								ariaLabel={`${t(MEMBER_ACTION_LABEL[action])}: ${entry.name}`}
								variant={MEMBER_ACTION_VARIANT[action]}
								size="small"
								className={memberActionClassName(action)}
								onClick={() => onAction(entry, action)}
							/>
						))}
					</>
				)
			}
			note={hasError && <InlineNote variant="error">{t('Failed to update role')}</InlineNote>}
		/>
	);
};

export default MemberRow;
