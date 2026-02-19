import { FC, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import StatementTopNav from '../nav/top/StatementTopNav';
import InvitePanel from './invitePanel/InvitePanel';
import ShareModal from '@/view/components/shareModal/ShareModal';
import { logOut } from '@/controllers/db/authenticationUtils';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';

interface Props {
	statement: Statement | undefined;
	topParentStatement: Statement | undefined;
	parentStatement: Statement | undefined;
}

const StatementHeader: FC<Props> = ({ statement, topParentStatement, parentStatement }) => {
	// Hooks
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
	const [showInvitationPanel, setShowInvitationPanel] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);

	const { t, dir } = useTranslation();

	function handleShare() {
		setShowShareModal(true);
		setIsHeaderMenuOpen(false);
	}

	async function handleFollowMe() {
		try {
			if (!topParentStatement) throw new Error('No top parent statement');

			await setFollowMeDB(topParentStatement, pathname);
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleFollowMe' });
		} finally {
			setIsHeaderMenuOpen(false);
		}
	}

	function handleInvitePanel() {
		try {
			setShowInvitationPanel(true);
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleInvitePanel' });
		}
	}

	async function handleLogout() {
		try {
			setIsHeaderMenuOpen(false);
			// Navigate away immediately for better UX
			navigate('/');
			await logOut();
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleLogout' });
		}
	}

	return (
		<div className={`page__header ${dir}`}>
			<StatementTopNav
				statement={statement}
				parentStatement={parentStatement}
				handleShare={handleShare}
				handleFollowMe={handleFollowMe}
				handleInvitePanel={handleInvitePanel}
				handleLogout={handleLogout}
				setIsHeaderMenuOpen={setIsHeaderMenuOpen}
				isHeaderMenuOpen={isHeaderMenuOpen}
			/>
			{showInvitationPanel && (
				<InvitePanel
					setShowModal={setShowInvitationPanel}
					statementId={statement?.statementId}
					pathname={pathname}
				/>
			)}
			<ShareModal
				isOpen={showShareModal}
				onClose={() => setShowShareModal(false)}
				url={pathname}
				title={t('Share this link')}
			/>
		</div>
	);
};

export default StatementHeader;
