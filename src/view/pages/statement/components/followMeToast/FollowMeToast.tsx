import { FC, useContext } from 'react';
import { Link, useLocation } from 'react-router';
import FollowMeIcon from '../../../../components/icons/FollowMeIcon';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { isAdmin } from '@/controllers/general/helpers';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelector } from '@/redux/statements/statementsSlice';
import './FollowMeToast.scss';
import { StatementContext } from '../../StatementCont';

const FollowMeToast: FC = () => {
	const { statement, role } = useContext(StatementContext);
	const { dir, t } = useUserConfig();
	const _isAdmin = isAdmin(role);
	const { pathname } = useLocation();

	const topParentStatement = useAppSelector(
		statementSelector(statement?.topParentId)
	);

	function handleRemoveToast() {

		if (!_isAdmin) return;
		if (!topParentStatement) return;

		setFollowMeDB(topParentStatement, '');
	}

	//in case the followers are in the page, turn off the follow me toast

	if (pathname === topParentStatement?.followMe && !_isAdmin) return null;

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
			<button className='follow-me-toast' onClick={handleRemoveToast}>
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
