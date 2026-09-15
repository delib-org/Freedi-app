import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
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
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { useHomeStatementOverlay } from '@/controllers/hooks/useHomeStatementOverlay';
import {
	HOME_VIEW_PARAM,
	INBOX_VIEW,
} from '@/view/components/atomic/organisms/BottomNav/bottomNavModel';
import { useLazyLoadHomeSubscriptions } from '../hooks/useLazyLoadHomeSubscriptions';
import { buildHomeModel } from '../homeModel';
import HomeOverview, { HomeView } from './HomeOverview';
import HomeInbox from '../inbox/HomeInbox';
import PinJoinSheet from '../pin/PinJoinSheet';
import styles from './HomeMain.module.scss';

/** How long the first paint waits for subscriptions before showing the lists. */
const INITIAL_LOADING_MS = 1500;

export default function HomeMain() {
	const { t, currentLanguage } = useTranslation();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const [searchParams] = useSearchParams();
	const user = useAppSelector(creatorSelector);
	const subscriptions = useAppSelector(statementsSubscriptionsSelector);
	const statements = useAppSelector(statementsSelector);
	const [loading, setLoading] = useState(true);
	const [visibleView, setVisibleView] = useState<HomeView>('questions');
	const [pinOpen, setPinOpen] = useState(false);
	const isInbox = searchParams.get(HOME_VIEW_PARAM) === INBOX_VIEW;

	const topLevelSubscriptions = useMemo(
		() => subscriptions.filter((sub) => (sub.parentId || sub.statement?.parentId) === 'top'),
		[subscriptions],
	);
	useHomeStatementOverlay(topLevelSubscriptions);
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadHomeSubscriptions(
		visibleView === 'spaces' ? 'topics' : 'discussions',
	);

	useEffect(() => {
		const timeout = window.setTimeout(() => setLoading(false), INITIAL_LOADING_MS);

		return () => window.clearTimeout(timeout);
	}, []);
	useEffect(() => {
		if (subscriptions.length) setLoading(false);
	}, [subscriptions.length]);

	const model = useMemo(
		() => buildHomeModel({ subscriptions, statements, userId: user?.uid }),
		[subscriptions, statements, user?.uid],
	);

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

	const handleVisibleView = useCallback((view: HomeView) => setVisibleView(view), []);

	if (isInbox) {
		return (
			<div className={styles.inboxPage}>
				<HomeInbox />
			</div>
		);
	}

	return (
		<>
			<HomeOverview
				firstName={(user?.displayName || '').trim().split(' ')[0]}
				spaces={model.spaces}
				questions={model.questions}
				loading={loading}
				locale={currentLanguage}
				onOpenQuestion={(id) => navigate(`/statement/${id}`)}
				onCreateQuestion={create}
				onCreateGroup={createGroup}
				onOpenPin={() => setPinOpen(true)}
				onVisibleViewChange={handleVisibleView}
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
			<PinJoinSheet isOpen={pinOpen} onClose={() => setPinOpen(false)} />
		</>
	);
}
