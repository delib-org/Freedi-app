import { FC, useEffect, useMemo, useState } from 'react';
import { Statement, StatementSubscription, WaitingMember } from '@freedi/shared-types';
import { Users } from 'lucide-react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { translateCount } from '@/helpers/translateCount';
import { isAdminRole } from '@/helpers/roleHelpers';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import Button from '@/view/components/atomic/atoms/Button';
import { Chip } from '@/view/components/atomic/atoms/Chip';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import EmptyState from '@/view/components/atomic/molecules/EmptyState';
import PeopleSubsection from '@/view/components/atomic/molecules/PeopleSubsection';
import SearchBox from '@/view/components/atomic/molecules/SearchBox';
import InviteLinkToLive from '../InviteLinkToLive';
import BlockMemberDialog from './BlockMemberDialog';
import MemberActionsSheet from './MemberActionsSheet';
import MemberRow from './MemberRow';
import {
	actionsFor,
	isRoleAction,
	MEMBER_FILTERS,
	MemberAction,
	MemberEntry,
	MemberFilter,
	toMemberEntries,
} from './membersLogic';
import { useMemberRoleActions } from './useMemberRoleActions';
import { useMembersList } from './useMembersList';
import { PeopleToaster } from './usePeopleToast';
import { MembersPaging } from './useMembersPaging';
import { WaitingDecisions } from './useWaitingDecisions';
import styles from './MembersSubsection.module.scss';

interface MembersSubsectionProps {
	statement: Statement;
	members: ReadonlyArray<StatementSubscription>;
	decisions: WaitingDecisions;
	toaster: PeopleToaster;
	/** Firestore total + older pages beyond the live listener's first page. */
	paging: MembersPaging;
	/** Speaks through People's one polite live region (UX §7). */
	onAnnounce: (message: string) => void;
	isOpen: boolean;
	onToggle: (anchor: string) => void;
	toggleRef: (element: HTMLButtonElement | null) => void;
}

const FILTER_LABEL: Record<MemberFilter, string> = {
	all: 'people.filter.all',
	hosts: 'people.hosts',
	members: 'people.members',
	waiting: 'people.role.waiting',
	blocked: 'people.role.banned',
};

const FILTER_EMPTY: Record<MemberFilter, string> = {
	all: 'people.members.empty',
	hosts: 'people.hosts.empty',
	members: 'people.members.empty',
	waiting: 'people.waiting.empty',
	blocked: 'people.blocked.empty',
};

/**
 * Members (#members): one list of everyone in this space — hosts first, then
 * members, waiting and blocked — with one chip per role, search, and the
 * role actions (Make host, Remove host, Block, Unblock, Let in, Decline).
 * Replaces MembersSettings, AdminsManagement and the old MembersManagement.
 */
const MembersSubsection: FC<MembersSubsectionProps> = ({
	statement,
	members,
	decisions,
	toaster,
	paging,
	onAnnounce,
	isOpen,
	onToggle,
	toggleRef,
}) => {
	const { t } = useTranslation();
	const { statementId } = statement;
	const self = useAppSelector(creatorSelector);
	const selfSubscription = useAppSelector(statementSubscriptionSelector(statementId));
	const creatorUid = statement.creator?.uid;
	// Only the creator or a host manages people (the Firestore rules agree).
	const canManage = (!!self?.uid && self.uid === creatorUid) || isAdminRole(selfSubscription?.role);

	const roleActions = useMemberRoleActions({ statementId, members, toaster });
	const entries = useMemo(
		() =>
			toMemberEntries(members, {
				creatorUid,
				selfUid: self?.uid,
				roleOverrides: roleActions.roleOverrides,
				unnamedLabel: t('people.unnamed'),
			}),
		[members, creatorUid, self?.uid, roleActions.roleOverrides, t],
	);
	const list = useMembersList(entries, paging);
	const waitingById = useMemo(
		() => new Map(decisions.visible.map((m) => [m.statementsSubscribeId, m] as const)),
		[decisions.visible],
	);

	const matchCount = list.matching.length;
	const hasSearch = list.search !== '';
	useEffect(() => {
		if (hasSearch) onAnnounce(translateCount(t, 'people.matchCount', matchCount));
	}, [hasSearch, matchCount, onAnnounce, t]);

	const [menuFor, setMenuFor] = useState<MemberEntry | null>(null);
	const [blockFor, setBlockFor] = useState<MemberEntry | null>(null);
	const now = Date.now();

	function rowActions(entry: MemberEntry): ReadonlyArray<MemberAction> {
		const actions = actionsFor(entry, canManage);

		// Let in / Decline need the waiting-list entry the Waiting subsection decides on.
		return entry.kind === 'waiting' && !waitingById.has(entry.id) ? [] : actions;
	}

	function handleAction(entry: MemberEntry, action: MemberAction): void {
		if (action === 'block') {
			setBlockFor(entry);

			return;
		}
		if (isRoleAction(action)) {
			roleActions.run(entry, action);

			return;
		}
		const waitingMember: WaitingMember | undefined = waitingById.get(entry.id);
		if (waitingMember) decisions.decide([waitingMember], action);
	}

	function handleConfirmBlock(): void {
		if (blockFor) roleActions.run(blockFor, 'block');
		setBlockFor(null);
	}

	const { counts } = list;
	const hasNobodyJoined = counts.members + counts.waiting + counts.blocked === 0;
	const memberCount = memberTotal(counts.all, paging);

	return (
		<PeopleSubsection
			id="members"
			title={t('people.members')}
			summary={translateCount(t, 'people.summary.members', memberCount)}
			isOpen={isOpen}
			onToggle={onToggle}
			toggleRef={toggleRef}
		>
			<div className={styles.toolbar}>
				<SearchBox
					value={list.search}
					onChange={list.setSearch}
					label={t('people.searchMembers')}
					className={styles.search}
				/>
				<div className="filter-chips" role="group" aria-label={t('people.filterMembers')}>
					{MEMBER_FILTERS.map((filter) => (
						<Chip
							key={filter}
							label={t(FILTER_LABEL[filter])}
							count={counts[filter]}
							selected={list.filter === filter}
							onClick={() => list.setFilter(filter)}
						/>
					))}
				</div>
			</div>

			{list.shown.length > 0 && (
				<ul className={styles.list}>
					{list.shown.map((entry) => (
						<MemberRow
							key={entry.id}
							entry={entry}
							actions={rowActions(entry)}
							onAction={handleAction}
							onOpenMenu={setMenuFor}
							hasError={roleActions.rowErrors.has(entry.id)}
							now={now}
						/>
					))}
				</ul>
			)}

			{hasNobodyJoined ? (
				<EmptyState
					compact
					icon={<Users />}
					text={t('people.members.empty')}
					hint={canManage ? t('people.noOneToPromote') : undefined}
					action={<InviteLinkToLive statementId={statementId} />}
				/>
			) : (
				<>
					{list.matching.length === 0 && (
						<p className={styles.caption}>
							{list.search ? t('No members match your search') : t(FILTER_EMPTY[list.filter])}
						</p>
					)}
					{canManage && counts.members === 0 && (
						<InlineNote variant="info">{t('people.noOneToPromote')}</InlineNote>
					)}
					{list.nextPageSize > 0 && (
						<div className={styles.more}>
							<Button
								text={fillPlaceholders(t('people.showMore'), { count: list.nextPageSize })}
								variant="secondary"
								fullWidth
								loading={paging.isLoadingMore}
								onClick={list.showMore}
							/>
							<InlineNote variant="info">
								{fillPlaceholders(t('people.nOfM'), {
									shown: list.shown.length,
									total: list.total,
								})}
							</InlineNote>
						</div>
					)}
					{paging.loadFailed && (
						<InlineNote
							variant="error"
							action={
								<Button
									text={t('people.retry')}
									variant="secondary"
									size="small"
									onClick={() => void paging.loadMore()}
								/>
							}
						>
							{t('people.error.load')}
						</InlineNote>
					)}
					<InviteLinkToLive statementId={statementId} />
				</>
			)}

			<MemberActionsSheet
				entry={menuFor}
				actions={menuFor ? rowActions(menuFor) : []}
				onAction={handleAction}
				onClose={() => setMenuFor(null)}
			/>
			<BlockMemberDialog
				name={blockFor?.name ?? null}
				onCancel={() => setBlockFor(null)}
				onConfirm={handleConfirmBlock}
			/>
		</PeopleSubsection>
	);
};

/** Everyone in the space: Firestore's count while older pages are still unloaded. */
function memberTotal(loadedCount: number, paging: MembersPaging): number {
	return paging.hasMoreOnServer && paging.total !== null ? paging.total : loadedCount;
}

export default MembersSubsection;
