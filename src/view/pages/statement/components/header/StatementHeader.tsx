import React, { FC, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import { Screen, Statement, StatementType } from '@freedi/shared-types';

import InvitePanel from './invitePanel/InvitePanel';
import QuestionHeaderBar from './QuestionHeaderBar';
import ShareModal from '@/view/components/shareModal/ShareModal';
import QuestionTabs from '@/view/components/atomic/molecules/QuestionTabs/QuestionTabs';
import StageProgress from '@/view/components/atomic/molecules/StageProgress/StageProgress';
import { logOut } from '@/controllers/db/authenticationUtils';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { updateStatementText } from '@/controllers/db/statements/updateStatementFields';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useParticipationStats } from '@/controllers/hooks/useParticipationStats';
import { logError } from '@/utils/errorHandling';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import { relevantNotifications } from '@/utils/engagementNavigation';
import { StatementContext } from '../../StatementCont';
import {
	statementSubsSelector,
	statementOptionsSelector,
	questionsSelector,
} from '@/redux/statements/statementsSlice';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import HostHubSheet from '../host/HostHubSheet';
import { isHostRole } from '../questionScreen/questionScreenLogic';
import { getQuestionStage, showsStageBar, STAGE_LABEL_KEYS } from '../questionScreen/questionStage';
import { buildQuestionTabs, resolveActiveView, tabOfView } from '../questionScreen/questionTabs';
import styles from './QuestionHeader.module.scss';

const MAIN_SCREENS = new Set(['main', undefined, 'chat', 'options', 'questions']);
export const QUESTION_TABPANEL_ID = 'question-tabpanel';

interface Props {
	topParentStatement: Statement | undefined;
	onActiveViewChange: (view: string) => void;
}

/**
 * The question header: lilac card with back · space · share · host, the stage
 * bar, the title (inline-editable by hosts), the host funnel and the tabs.
 * Share, follow-me, invite, logout and the menu from the old top nav stay
 * reachable through QuestionHeaderBar.
 */
const StatementHeader: FC<Props> = ({ topParentStatement, onActiveViewChange }) => {
	const { pathname, search } = useLocation();
	const navigate = useNavigate();
	const { screen } = useParams();
	const { t, dir } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);
	const isHost = isHostRole(role);

	const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
	const [showInvitationPanel, setShowInvitationPanel] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const [hubOpen, setHubOpen] = useState(false);
	const [edit, setEdit] = useState(false);
	const [titleExpanded, setTitleExpanded] = useState(false);

	const [searchParams, setSearchParams] = useSearchParams();
	const tabParam = searchParams.get('tab');

	const subsSelect = useMemo(
		() => statementSubsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const optionsSelect = useMemo(
		() => statementOptionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const questionsSelect = useMemo(
		() => questionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const allSubs = useSelector(subsSelect);
	const options = useSelector(optionsSelect);
	const questions = useSelector(questionsSelect);
	const notifications = useSelector(inAppNotificationsSelector);
	const creator = useSelector(creatorSelector);
	const unreadCount = relevantNotifications(notifications, creator?.uid).filter(
		(n) => !n.read && n.parentId === statement?.statementId,
	).length;

	const participation = useParticipationStats(statement, options);

	const tabs = useMemo(
		() =>
			buildQuestionTabs({
				statement,
				counts: { chat: allSubs.length, options: options.length, questions: questions.length },
				unreadChat: unreadCount,
			}),
		[statement, allSubs.length, options.length, questions.length, unreadCount],
	);
	const activeView = resolveActiveView(tabParam, statement, tabs);

	useEffect(() => {
		onActiveViewChange(activeView);
	}, [activeView, onActiveViewChange]);

	const handleTabChange = useCallback(
		(tabId: string) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					next.set('tab', tabId);

					return next;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);

	const isQuestion = statement?.statementType === StatementType.question;
	const showTabs = MAIN_SCREENS.has(screen);
	const isMapScreen = screen === Screen.mindMap;
	const stage = getQuestionStage({ statement, answerCount: options.length, now: Date.now() });

	function handleShare() {
		setShowShareModal(true);
		setIsHeaderMenuOpen(false);
	}

	async function handleFollowMe() {
		try {
			if (!topParentStatement) throw new Error('No top parent statement');
			const isActive = !!topParentStatement.followMe && topParentStatement.followMe !== '';
			setFollowMeDB(topParentStatement, isActive ? '' : `${pathname}${search}`);
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleFollowMe' });
		} finally {
			setIsHeaderMenuOpen(false);
		}
	}

	async function handleLogout() {
		try {
			setIsHeaderMenuOpen(false);
			navigate('/');
			await logOut();
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleLogout' });
		}
	}

	function handleUpdateStatement(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			updateStatementText(statement, (e.target as HTMLInputElement).value);
			setEdit(false);
		}
	}

	const spaceName =
		topParentStatement && topParentStatement.statementId !== statement?.statementId
			? topParentStatement.statement
			: undefined;

	return (
		<>
			<div className="page__header">
				<div className={`page__header__full ${styles.header}`} data-testid="question-header">
					{statement && (
						<QuestionHeaderBar
							statement={statement}
							spaceName={spaceName}
							isHost={isHost}
							onShare={handleShare}
							onOpenHub={() => setHubOpen(true)}
							onFollowMe={handleFollowMe}
							onInvitePanel={() => setShowInvitationPanel(true)}
							onLogout={handleLogout}
							isMenuOpen={isHeaderMenuOpen}
							setIsMenuOpen={setIsHeaderMenuOpen}
						/>
					)}

					{showsStageBar(statement) && !isMapScreen && (
						<StageProgress
							stages={STAGE_LABEL_KEYS.map((key) => t(key))}
							activeIndex={stage}
							ariaLabel={t('Question stage')}
						/>
					)}

					{isHost ? (
						<button
							type="button"
							className={styles.header__titleButton}
							onClick={() => setEdit(true)}
							aria-label={edit ? undefined : t('Edit title')}
						>
							{!edit ? (
								<h1 className={styles.header__title}>
									{renderInlineMarkdown(statement?.statement)}
								</h1>
							) : (
								<h1 className={styles.header__title}>
									<input
										type="text"
										className={styles.header__titleInput}
										defaultValue={statement?.statement}
										onBlur={() => setEdit(false)}
										onKeyUp={handleUpdateStatement}
										aria-label={t('Edit title')}
										autoFocus
									/>
								</h1>
							)}
						</button>
					) : (
						<button
							type="button"
							className={`${styles.header__titleButton} ${titleExpanded ? styles['header__titleButton--expanded'] : ''}`}
							onClick={() => setTitleExpanded((prev) => !prev)}
							aria-expanded={titleExpanded}
						>
							<h1 className={styles.header__title}>{renderInlineMarkdown(statement?.statement)}</h1>
						</button>
					)}

					{isQuestion && isHost && !isMapScreen && (
						<div className={styles.header__funnel} data-testid="host-funnel">
							<span className={styles.header__stat}>
								{t('Entered')} <b>{participation.entered}</b>
							</span>
							<span aria-hidden="true">·</span>
							<span className={styles.header__stat}>
								{t('Suggested')} <b>{participation.suggested}</b>
							</span>
							<span aria-hidden="true">·</span>
							<span className={styles.header__stat}>
								{t('Rated')} <b>{participation.evaluated}</b>
							</span>
						</div>
					)}

					{showTabs && tabs.length > 1 && (
						<QuestionTabs
							tabs={tabs.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
							activeId={tabOfView(activeView)}
							onChange={handleTabChange}
							ariaLabel={t('Question sections')}
							dir={dir}
							panelId={QUESTION_TABPANEL_ID}
							unreadLabel={(n) => `${n} ${t('unread')}`}
						/>
					)}
					{(!showTabs || tabs.length <= 1) && <div className={styles.header__end} />}
				</div>

				{/* Mini header: compact title bar shown while minimized; tapping it
				    restores the full header (click handled by useHeaderHideOnScroll) */}
				{statement?.statement && (
					<button type="button" className="page__header__mini" aria-label={t('Show header')}>
						<span className="page__header__mini__title">{statement.statement}</span>
					</button>
				)}
			</div>

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
				url={`${pathname}${search}`}
				title={t('Share this link')}
			/>
			{isHost && statement && (
				<HostHubSheet
					isOpen={hubOpen}
					onClose={() => setHubOpen(false)}
					statement={statement}
					stage={stage}
				/>
			)}
		</>
	);
};

export default StatementHeader;
