import { FC, useContext, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import FollowMeIcon from '../../../../components/icons/FollowMeIcon';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { Role } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import styles from './FollowMeToast.module.scss';
import { StatementContext } from '../../StatementCont';
import { useSelector } from 'react-redux';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';

const FollowMeToast: FC = () => {
	const { statement } = useContext(StatementContext);
	const { dir, t } = useTranslation();
	const { pathname } = useLocation();

	// Early return if no statement in context
	if (!statement) {
		return null;
	}

	const role = useSelector(statementSubscriptionSelector(statement?.topParentId))?.role;
	const _isAdmin = role === Role.admin;

	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));

	// Listen to topParentStatement for followMe updates
	useEffect(() => {
		if (!statement?.topParentId) return;

		// Only set up listener if topParentStatement doesn't exist yet
		if (!topParentStatement) {
			const unsubscribe = listenToStatement(statement.topParentId);

			return () => unsubscribe();
		}
	}, [statement?.topParentId, topParentStatement]);

	function handleRemoveToast() {
		if (!_isAdmin) return;
		if (!topParentStatement) return;

		setFollowMeDB(topParentStatement, '');
	}

	//in case the followers are in the page, turn off the follow me toast
	// Check if the current pathname matches the followMe path
	// Compare the base paths (without considering trailing segments like /chat, /main, etc.)
	const followMePath = topParentStatement?.followMe;

	if (followMePath && pathname.startsWith(followMePath) && !_isAdmin) return null;

	//if the follow me is empty, turn off the follow me toast
	if (topParentStatement?.followMe === '' || topParentStatement?.followMe === undefined)
		return null;

	//if admin render toast, but do not use link
	return _isAdmin ? (
		<ToastInner />
	) : (
		<Link to={topParentStatement?.followMe || '/home'}>
			<ToastInner />
		</Link>
	);

	function ToastInner() {
		return (
			<button className={styles.followMeToast} onClick={handleRemoveToast}>
				<span>{t(_isAdmin ? 'Follow Mode Active' : 'Follow Instructor')}</span>
				<div
					style={{
						transform: `rotate(${dir === 'rtl' ? '180deg' : '0deg'})`,
					}}
				>
					<FollowMeIcon color="white" />
				</div>
			</button>
		);
	}
};

export default FollowMeToast;
