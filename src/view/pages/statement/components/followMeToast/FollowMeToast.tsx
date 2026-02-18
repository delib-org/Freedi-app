import { FC, useContext, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import FollowMeIcon from '../../../../components/icons/FollowMeIcon';
import { setFollowMeDB, setPowerFollowMeDB } from '@/controllers/db/statements/setStatements';
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
	const navigate = useNavigate();

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

	// Determine active mode: power takes precedence
	const powerFollowMePath = topParentStatement?.powerFollowMe;
	const followMePath = topParentStatement?.followMe;
	const isPowerMode = !!powerFollowMePath && powerFollowMePath !== '';
	const activePath = isPowerMode ? powerFollowMePath : followMePath;

	// Auto-redirect for non-admin users in power mode
	useEffect(() => {
		if (!isPowerMode || _isAdmin || !powerFollowMePath) return;

		// Don't redirect if already on the target page
		if (pathname.startsWith(powerFollowMePath)) return;

		const timer = setTimeout(() => {
			navigate(powerFollowMePath);
		}, 300);

		return () => clearTimeout(timer);
	}, [isPowerMode, _isAdmin, powerFollowMePath, pathname, navigate]);

	function handleRemoveToast() {
		if (!_isAdmin) return;
		if (!topParentStatement) return;

		if (isPowerMode) {
			setPowerFollowMeDB(topParentStatement, '');
		} else {
			setFollowMeDB(topParentStatement, '');
		}
	}

	// If the user is already on the followed page and not admin, hide toast
	if (activePath && pathname.startsWith(activePath) && !_isAdmin) return null;

	// If no active follow mode, hide toast
	if (!activePath || activePath === '') return null;

	// Admin sees toast they can click to deactivate; non-admin in regular mode gets a link
	if (_isAdmin) {
		return <ToastInner />;
	}

	// In power mode, non-admin is auto-redirected so just show informational toast
	if (isPowerMode) {
		return <ToastInner />;
	}

	// Regular follow mode: non-admin gets a clickable link
	return (
		<Link to={activePath || '/home'}>
			<ToastInner />
		</Link>
	);

	function ToastInner() {
		let label: string;
		if (_isAdmin) {
			label = isPowerMode ? t('Power Follow Mode Active') : t('Follow Mode Active');
		} else {
			label = isPowerMode ? t('Following Instructor (Auto)') : t('Follow Instructor');
		}

		const toastClass = isPowerMode
			? `${styles.followMeToast} ${styles['followMeToast--power']}`
			: styles.followMeToast;

		return (
			<button className={toastClass} onClick={handleRemoveToast}>
				<span>{label}</span>
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
