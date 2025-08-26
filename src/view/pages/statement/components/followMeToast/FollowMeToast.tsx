import { FC, useContext, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import FollowMeIcon from '../../../../components/icons/FollowMeIcon';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { Role } from 'delib-npm';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import styles from './FollowMeToast.module.scss';
import { StatementContext } from '../../StatementCont';
import { useSelector } from 'react-redux';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';

const FollowMeToast: FC = () => {
	const { statement } = useContext(StatementContext);
	const { dir, t } = useUserConfig();
	const { pathname } = useLocation();
	const role = useSelector(statementSubscriptionSelector(statement?.topParentId))?.role;
	const _isAdmin = role === Role.admin;

	const topParentStatement = useAppSelector(
		statementSelector(statement?.topParentId)
	);

	// Listen to topParentStatement for followMe updates
	useEffect(() => {
		if (!statement?.topParentId) return;
		
		// Only set up listener if topParentStatement doesn't exist yet
		if (!topParentStatement) {
			console.info('Setting up listener for topParentStatement:', statement.topParentId);
			const unsubscribe = listenToStatement(statement.topParentId);

			return () => unsubscribe();
		}
	}, [statement?.topParentId, topParentStatement]);

	// Debug logging
	console.info('FollowMeToast Debug:', {
		statement: statement?.statement,
		statementId: statement?.statementId,
		topParentId: statement?.topParentId,
		topParentStatement: topParentStatement?.statement,
		followMePath: topParentStatement?.followMe,
		currentPath: pathname,
		pathComparison: pathname === topParentStatement?.followMe,
		shouldHideForUser: pathname === topParentStatement?.followMe && !_isAdmin,
		role,
		isAdmin: _isAdmin
	});

	function handleRemoveToast() {

		if (!_isAdmin) return;
		if (!topParentStatement) return;

		setFollowMeDB(topParentStatement, '');
	}

	//in case the followers are in the page, turn off the follow me toast
	// Check if the current pathname contains the followMe statementId
	const followMeStatementId = topParentStatement?.followMe?.split('/').pop();
	const currentStatementId = pathname.split('/')[2]; // Extract statementId from /statement/ID/...
	
	if (followMeStatementId && currentStatementId === followMeStatementId && !_isAdmin) return null;

	//if the follow me is empty, turn off the follow me toast
	if (
		topParentStatement?.followMe === '' ||
		topParentStatement?.followMe === undefined
	)
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
				<span>
					{t(_isAdmin ? 'Follow Mode Active' : 'Follow Instructor')}
				</span>
				<div
					style={{
						transform: `rotate(${dir === 'rtl' ? '180deg' : '0deg'})`,
					}}
				>
					<FollowMeIcon color='white' />
				</div>
			</button>
		);
	}
};

export default FollowMeToast;
