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
import { FOLLOW_ME } from '@/constants/common';

/** Extract a human-readable screen/tab name from a statement path (including search params) */
function getScreenName(path: string | undefined, t: (key: string) => string): string | null {
	if (!path) return null;

	const screenLabels: Record<string, string> = {
		chat: t('Chat'),
		options: t('Solutions'),
		questions: t('Questions'),
		vote: t('Vote'),
		settings: t('Settings'),
		'mind-map': t('Mind Map'),
		'agreement-map': t('Agreement Map'),
		'polarization-index': t('Polarization Index'),
		'sub-questions-map': t('Sub Questions Map'),
	};

	// Check search params first (?tab=options)
	const searchIndex = path.indexOf('?');
	if (searchIndex !== -1) {
		const params = new URLSearchParams(path.slice(searchIndex));
		const tab = params.get('tab');
		if (tab && screenLabels[tab]) return screenLabels[tab];
	}

	// Fall back to path segment: /statement/{id}/{screen}
	const pathname = searchIndex !== -1 ? path.slice(0, searchIndex) : path;
	const segments = pathname.split('/').filter(Boolean);
	const screenSegment = segments[2]; // 0=statement, 1=id, 2=screen
	if (screenSegment && screenLabels[screenSegment]) return screenLabels[screenSegment];

	return null;
}

const FollowMeToast: FC = () => {
	const { statement } = useContext(StatementContext);
	const { dir, t } = useTranslation();
	const { pathname, search } = useLocation();
	const navigate = useNavigate();
	const fullPath = pathname + search;

	const role = useSelector(statementSubscriptionSelector(statement?.topParentId))?.role;
	const _isAdmin = role === Role.admin;

	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));

	// Always hold a listener to topParentStatement for followMe updates
	useEffect(() => {
		if (!statement?.topParentId) return;
		const unsubscribe = listenToStatement(statement.topParentId);

		return () => unsubscribe();
	}, [statement?.topParentId]);

	// Determine active mode: power takes precedence
	const powerFollowMePath = topParentStatement?.powerFollowMe;
	const followMePath = topParentStatement?.followMe;
	const isPowerMode = !!powerFollowMePath && powerFollowMePath !== '';
	const activePath = isPowerMode ? powerFollowMePath : followMePath;

	// Admin: auto-update the follow path as they navigate (both modes)
	// Uses fullPath (pathname + search params) so tab changes (?tab=options) are captured
	useEffect(() => {
		if (!_isAdmin || !topParentStatement) return;

		const hasRegularFollow = !!followMePath && followMePath !== '';
		if (!isPowerMode && !hasRegularFollow) return;

		if (pathname.includes('/settings')) return;

		if (isPowerMode) {
			if (fullPath === powerFollowMePath) return;
			setPowerFollowMeDB(topParentStatement, fullPath);
		} else {
			if (fullPath === followMePath) return;
			setFollowMeDB(topParentStatement, fullPath);
		}
	}, [_isAdmin, isPowerMode, fullPath, pathname, topParentStatement, powerFollowMePath, followMePath]);

	// Auto-redirect for non-admin users in power mode
	useEffect(() => {
		if (!isPowerMode || _isAdmin || !powerFollowMePath) return;

		// Don't redirect if already on the target page (compare full path including search params)
		if (fullPath === powerFollowMePath) return;

		const timer = setTimeout(() => {
			navigate(powerFollowMePath);
		}, FOLLOW_ME.REDIRECT_DELAY_MS);

		return () => clearTimeout(timer);
	}, [isPowerMode, _isAdmin, powerFollowMePath, fullPath, navigate]);

	function handleRemoveToast() {
		if (!_isAdmin) return;
		if (!topParentStatement) return;

		if (isPowerMode) {
			setPowerFollowMeDB(topParentStatement, '');
		} else {
			setFollowMeDB(topParentStatement, '');
		}
	}

	if (!statement) return null;

	// If no active follow mode, hide toast
	if (!activePath || activePath === '') return null;

	// In power mode, always show toast for non-admins (so they know which tab they're on)
	// In regular mode, hide toast if non-admin is already on the followed page
	if (!isPowerMode && activePath && fullPath === activePath && !_isAdmin) return null;

	// Admin sees toast they can click to deactivate; non-admin in regular mode gets a link
	if (_isAdmin) {
		return <ToastInner />;
	}

	// In power mode, non-admin sees informational toast with current tab
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
		// Extract screen/tab name from the active path
		const screenName = getScreenName(activePath, t);

		let label: string;
		if (_isAdmin) {
			label = isPowerMode ? t('Power Follow Mode Active') : t('Follow Mode Active');
		} else if (isPowerMode) {
			label = screenName
				? `${t('Following Instructor')} - ${screenName}`
				: t('Following Instructor (Auto)');
		} else {
			label = t('Follow Instructor');
		}

		const userClass = !_isAdmin ? styles['followMeToast--user'] : '';
		const powerClass = isPowerMode ? styles['followMeToast--power'] : '';
		const toastClass = `${styles.followMeToast} ${powerClass} ${userClass}`.trim();

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
