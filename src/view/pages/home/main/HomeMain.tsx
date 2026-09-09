import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { StatementType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	statementsSubscriptionsSelector,
	statementsSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	selectNewStatementShowModal,
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { useHomeStatementOverlay } from '@/controllers/hooks/useHomeStatementOverlay';
import { useLazyLoadHomeSubscriptions } from '../hooks/useLazyLoadHomeSubscriptions';
import ConversationHome, {
	ConversationSummary,
} from '@/view/components/atomic/organisms/ThinkingSpace/ConversationHome';
import NewStatement from '../../statement/components/newStatement/NewStatement';
import styles from './HomeMain.module.scss';

export default function HomeMain() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const user = useAppSelector(creatorSelector);
	const subscriptions = useAppSelector(statementsSubscriptionsSelector);
	const statements = useAppSelector(statementsSelector);
	const showModal = useAppSelector(selectNewStatementShowModal);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<'all' | 'groups'>('all');
	useHomeStatementOverlay(subscriptions);
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadHomeSubscriptions(
		filter === 'groups' ? 'topics' : 'discussions',
	);
	useEffect(() => {
		const timeout = window.setTimeout(() => setLoading(false), 1500);

		return () => window.clearTimeout(timeout);
	}, []);
	useEffect(() => {
		if (subscriptions.length) setLoading(false);
	}, [subscriptions.length]);
	const conversations = useMemo<ConversationSummary[]>(() => {
		const byId = new Map(statements.map((statement) => [statement.statementId, statement]));

		return subscriptions
			.filter(
				(sub) =>
					sub.userId === user?.uid &&
					!sub.isDocument &&
					![StatementType.document, StatementType.paragraph].includes(
						sub.statementType || sub.statement.statementType,
					),
			)
			.map((sub) => {
				const statement = byId.get(sub.statementId) || sub.statement;
				const latest = (statement.lastSubStatements || sub.lastSubStatements || [])
					.filter(
						(child) =>
							![StatementType.document, StatementType.paragraph].includes(child.statementType),
					)
					.slice()
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];

				return {
					id: sub.statementId,
					title: statement.statement,
					description: statement.brief || statement.description,
					isGroup: statement.statementType === StatementType.group,
					recentText: latest?.statement,
					recentAuthor: latest?.creator?.displayName,
				};
			});
	}, [subscriptions, statements, user?.uid]);
	const create = (): void => {
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
	};

	const createGroup = (): void => {
		dispatch(
			setNewStatementModal({
				parentStatement: 'top',
				newStatement: { statementType: StatementType.group },
				showModal: true,
				isLoading: false,
				error: null,
			}),
		);
	};

	return (
		<>
			{showModal && (
				<div className={styles.addStatementModal}>
					<NewStatement />
				</div>
			)}
			<ConversationHome
				conversations={conversations}
				userName={user?.displayName || ''}
				onOpen={(id) => navigate(`/statement/${id}`)}
				onCreate={create}
				onCreateGroup={createGroup}
				onFilterChange={setFilter}
				loading={loading}
				t={t}
				more={
					<>
						{hasMore && (
							<div ref={sentinelRef} className={styles.lazyLoadSentinel} aria-hidden="true" />
						)}
						{isLoadingMore && (
							<div className={styles.lazyLoadStatus} role="status">
								{t('Loading more…')}
							</div>
						)}
					</>
				}
			/>
		</>
	);
}
