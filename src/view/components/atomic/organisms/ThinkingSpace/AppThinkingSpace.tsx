import React, { ReactNode, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { topSubscriptionsSelector } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	setNewStatementType,
	setParentStatement,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import ThinkingSpace from './ThinkingSpace';
import EngagementGuide from '../../molecules/EngagementGuide/EngagementGuide';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';

export default function AppThinkingSpace({
	children,
	activeId,
	aside,
	asideLabel,
	tools,
	guideStatement,
	guideEnabled = true,
}: {
	children: ReactNode;
	activeId?: string;
	aside?: ReactNode;
	asideLabel?: string;
	tools?: ReactNode;
	guideStatement?: Statement;
	guideEnabled?: boolean;
}) {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const notifications = useAppSelector(inAppNotificationsSelector);
	const allStatements = useAppSelector((state) => state.statements.statements);
	const dispatch = useDispatch();
	const user = useAppSelector(creatorSelector);
	const subscriptions = useAppSelector(topSubscriptionsSelector);
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
					unreadCount: relevantNotifications(notifications, user?.uid).filter(
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
		[subscriptions, user?.uid, notifications, allStatements],
	);
	const create = (): void => {
		// New top-level creation is hosted on Home; navigating mounts its modal host.
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
		navigate('/home');
	};

	return (
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
			t={t}
			dir={dir}
		>
			{user && guideEnabled && (guideStatement || location.pathname === '/home') && (
				<EngagementGuide
					key={user.uid}
					userId={user.uid}
					statement={guideStatement}
					firstSpaceId={spaces[0]?.id}
					onCreate={create}
				/>
			)}
			{children}
		</ThinkingSpace>
	);
}
