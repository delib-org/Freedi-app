import React, { ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { StatementType } from '@freedi/shared-types';
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

export default function AppThinkingSpace({
	children,
	activeId,
	aside,
	tools,
}: {
	children: ReactNode;
	activeId?: string;
	aside?: ReactNode;
	tools?: ReactNode;
}) {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
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
				.map((sub) => ({ id: sub.statementId, title: sub.statement.statement })),
		[subscriptions, user?.uid],
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
			tools={tools}
			t={t}
			dir={dir}
		>
			{children}
		</ThinkingSpace>
	);
}
