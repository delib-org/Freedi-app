import { FC, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import StatementTopNav from '../nav/top/StatementTopNav';
import InvitePanel from './invitePanel/InvitePanel';
import { logOut } from '@/controllers/db/authenticationUtils';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	statement: Statement | undefined;
	topParentStatement: Statement | undefined;
	parentStatement: Statement | undefined;
}

const StatementHeader: FC<Props> = ({
	statement,
	topParentStatement,
	parentStatement,
}) => {
	// Hooks
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
	const [showInvitationPanel, setShowInvitationPanel] = useState(false);

	const { t, dir } = useUserConfig();

	function handleShare() {
		const baseUrl = window.location.origin;

		const shareData = {
			title: t('FreeDi: Empowering Agreements'),
			text: t('Invited:') + statement?.statement,
			url: `${baseUrl}${pathname}`,
		};
		navigator.share(shareData);
		setIsHeaderMenuOpen(false);
	}

	async function handleFollowMe() {
		try {
			if (!topParentStatement) throw new Error('No top parent statement');
			
			await setFollowMeDB(topParentStatement, pathname);
		} catch (error) {
			console.error(error);
		} finally {
			setIsHeaderMenuOpen(false);
		}
	}

	function handleInvitePanel() {
		try {
			setShowInvitationPanel(true);
		} catch (error) {
			console.error(error);
		}
	}

	async function handleLogout() {
		try {
			setIsHeaderMenuOpen(false);
			// Navigate away immediately for better UX
			navigate('/');
			await logOut();
		} catch (error) {
			console.error(error);
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

		</div>
	);
};

export default StatementHeader;
