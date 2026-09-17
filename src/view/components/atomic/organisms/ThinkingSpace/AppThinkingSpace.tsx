import React, { ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { StatementType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useLevelTransition } from '@/controllers/hooks/useSlideAndSubStatement';
import { topSubscriptionsSelector } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	setNewStatementType,
	setParentStatement,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import ThinkingSpace from './ThinkingSpace';
import BottomNav from '../BottomNav/BottomNav';
import {
	BOTTOM_NAV_PATHS,
	resolveBottomNavItem,
	shouldShowBottomNav,
} from '../BottomNav/bottomNavModel';
import AskQuestionSheet, { AskSpace } from '@/view/pages/home/askQuestion/AskQuestionSheet';
import { AnswerComposeContext, useAnswerComposeState } from '@/controllers/hooks/useAnswerCompose';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';

/** Statement screens animate their own `.page` (StatementContent), not the shell. */
const STATEMENT_SCREEN = /^\/(statement|stage|statement-screen)\//;

export default function AppThinkingSpace({
	children,
	activeId,
	aside,
	asideLabel,
	tools,
}: {
	children: ReactNode;
	activeId?: string;
	aside?: ReactNode;
	asideLabel?: string;
	tools?: ReactNode;
}) {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { className: levelClassName } = useLevelTransition();
	const notifications = useAppSelector(inAppNotificationsSelector);
	const allStatements = useAppSelector((state) => state.statements.statements);
	const dispatch = useDispatch();
	const user = useAppSelector(creatorSelector);
	const subscriptions = useAppSelector(topSubscriptionsSelector);
	const [askOpen, setAskOpen] = useState(false);
	// One bottom control on phones: the nav's "+" adds an answer when a question
	// screen registered that action, and otherwise asks a new question.
	const answerCompose = useAnswerComposeState();
	const mine = useMemo(
		() => relevantNotifications(notifications, user?.uid),
		[notifications, user?.uid],
	);
	const spaces = useMemo(
		() =>
			subscriptions
				.filter(
					(sub) =>
						sub.userId === user?.uid &&
						[StatementType.group, StatementType.question].includes(
							sub.statementType || sub.statement.statementType,
						),
				)
				.map((sub) => ({
					id: sub.statementId,
					title: sub.statement.statement,
					unreadCount: mine.filter(
						(n) =>
							!n.read &&
							(n.parentId === sub.statementId ||
								allStatements.some(
									(s) =>
										s.statementId === n.parentId &&
										(s.topParentId === sub.statementId || s.parents?.includes(sub.statementId)),
								)),
					).length,
				})),
		[subscriptions, user?.uid, mine, allStatements],
	);
	// Spaces a new question can live in: the person's top-level groups.
	const askSpaces = useMemo<AskSpace[]>(
		() =>
			subscriptions
				.filter(
					(sub) =>
						sub.userId === user?.uid &&
						(sub.statementType || sub.statement.statementType) === StatementType.group,
				)
				.map((sub) => {
					const statement =
						allStatements.find((s) => s.statementId === sub.statementId) || sub.statement;

					return { id: sub.statementId, title: statement.statement, statement };
				}),
		[subscriptions, user?.uid, allStatements],
	);
	const unreadCount = mine.filter((n) => !n.read).length;

	const create = (): void => {
		// New top-level creation is hosted on Home; navigating mounts its modal host.
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
		navigate('/home');
	};

	const showNav = !!user && shouldShowBottomNav(location.pathname);

	return (
		<AnswerComposeContext.Provider value={answerCompose}>
			<ThinkingSpace
				spaces={spaces}
				activeId={activeId}
				userName={user?.displayName || t('Your profile')}
				onHome={() => navigate('/home')}
				onProfile={() => navigate('/my')}
				onOpen={(id) => navigate(`/statement/${id}`)}
				onCreate={create}
				aside={aside}
				asideLabel={asideLabel}
				tools={tools}
				transitionClassName={STATEMENT_SCREEN.test(location.pathname) ? '' : levelClassName}
				bottomNav={
					showNav ? (
						<BottomNav
							active={resolveBottomNavItem(location.pathname, location.search)}
							unreadCount={unreadCount}
							onNavigate={(item) => navigate(BOTTOM_NAV_PATHS[item])}
							onAsk={() => {
								if (!answerCompose.compose()) setAskOpen(true);
							}}
							t={t}
						/>
					) : undefined
				}
				t={t}
				dir={dir}
			>
				{children}
				{showNav && (
					<AskQuestionSheet
						isOpen={askOpen}
						onClose={() => setAskOpen(false)}
						spaces={askSpaces}
						currentSpaceId={activeId}
					/>
				)}
			</ThinkingSpace>
		</AnswerComposeContext.Provider>
	);
}
