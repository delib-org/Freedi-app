import { FC } from 'react';
import { useNavigate } from 'react-router';
import { Screen, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import ApproveMembers from '@/view/components/approveMembers/WaitingList';
import NotificationBtn from '@/view/components/notificationBtn/NotificationBtn';
import NotificationSettingsButton from '@/view/components/notifications/NotificationSettingsButton';
import HeaderMenu from '../nav/top/headerMenu/HeaderMenu';
import Back from './Back';
import styles from './QuestionHeader.module.scss';

/** Colours the menu reads as strings; resolved by the lilac header's tokens. */
const TINT_STYLE = { color: 'var(--tone-lilac-ink)', backgroundColor: 'var(--tone-lilac-ink)' };

interface QuestionHeaderBarProps {
	statement: Statement;
	spaceName?: string;
	isHost: boolean;
	onShare: () => void;
	onOpenHub: () => void;
	onFollowMe: () => void;
	onInvitePanel: () => void;
	onLogout: () => void;
	isMenuOpen: boolean;
	setIsMenuOpen: (open: boolean) => void;
}

/**
 * Top row of the question header: back · space name · שיתוף · ⚙ מארח/ת, then
 * the inbox and the menu (maps, follow me, invite, research, settings,
 * notification settings, language, disconnect — everything the old top nav had).
 */
const QuestionHeaderBar: FC<QuestionHeaderBarProps> = ({
	statement,
	spaceName,
	isHost,
	onShare,
	onOpenHub,
	onFollowMe,
	onInvitePanel,
	onLogout,
	isMenuOpen,
	setIsMenuOpen,
}) => {
	const { t, currentLanguage } = useTranslation();
	const navigate = useNavigate();
	const topParent = useAppSelector(statementSelector(statement.topParentId));
	const isFollowMeActive = !!topParent?.followMe && topParent.followMe !== '';

	function goToScreen(target: Screen | 'settings') {
		setIsMenuOpen(false);
		navigate(`/statement-screen/${statement.statementId}/${target}`);
	}

	return (
		<div className={styles.header__bar}>
			<Back
				statement={statement}
				className={styles.header__back}
				iconClassName={styles.header__backIcon}
			/>
			<span className={styles.header__space} title={spaceName}>
				{spaceName}
			</span>
			<ApproveMembers />
			<button
				type="button"
				className={`${styles.header__pill} ${styles['header__pill--glass']}`}
				onClick={onShare}
				data-testid="question-share"
			>
				{t('question.share')}
			</button>
			{isHost && (
				<button
					type="button"
					className={`${styles.header__pill} ${styles['header__pill--host']}`}
					onClick={onOpenHub}
					aria-haspopup="dialog"
					data-testid="question-host-hub"
				>
					<span aria-hidden="true">⚙</span> {t('Host')}
				</button>
			)}
			<span className={styles.header__icon}>
				<NotificationBtn />
			</span>
			<HeaderMenu
				statement={statement}
				isMenuOpen={isMenuOpen}
				setIsMenuOpen={setIsMenuOpen}
				headerStyle={TINT_STYLE}
				variant="tint"
				isAdmin={isHost}
				currentLanguage={currentLanguage}
				t={t}
				onShare={onShare}
				onLogout={onLogout}
				onFollowMe={onFollowMe}
				onInvitePanel={onInvitePanel}
				onNavigateToSettings={() => goToScreen('settings')}
				onNavigateToScreen={(target) => goToScreen(target)}
				onNavigateToClusterMap={() => {
					setIsMenuOpen(false);
					navigate(`/map/${statement.statementId}`);
				}}
				isFollowMeActive={isFollowMeActive}
				extraItems={
					<div className={styles.header__menuRow}>
						<NotificationSettingsButton statementId={statement.statementId} />
						<span>{t('Notification settings')}</span>
					</div>
				}
			/>
		</div>
	);
};

export default QuestionHeaderBar;
