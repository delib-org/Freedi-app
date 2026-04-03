import React, { FC, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import { Role, StatementType, QuestionType, Statement } from '@freedi/shared-types';

import StatementTopNav from '../nav/top/StatementTopNav';
import InvitePanel from './invitePanel/InvitePanel';
import ShareModal from '@/view/components/shareModal/ShareModal';
import { logOut } from '@/controllers/db/authenticationUtils';
import { setFollowMeDB } from '@/controllers/db/statements/setStatements';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import { updateStatementText } from '@/controllers/db/statements/updateStatementFields';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import StatementDescription from '@/view/components/atomic/molecules/StatementDescription/StatementDescription';
import DeadlineBanner from '../deadlineBanner/DeadlineBanner';
import TreeFilterChips from '../treeView/components/TreeFilterChips/TreeFilterChips';
import { useTreeFilterOptional } from '../treeView/TreeFilterContext';
import { StatementContext } from '../../StatementCont';
import {
	statementSubsSelector,
	statementOptionsSelector,
	questionsSelector,
} from '@/redux/statements/statementsSlice';
import styles from '../switch/Switch.module.scss';

const MAIN_SCREENS = new Set(['main', undefined, 'chat', 'options', 'questions']);

interface Props {
	topParentStatement: Statement | undefined;
	onActiveViewChange: (view: string) => void;
}

const StatementHeader: FC<Props> = ({ topParentStatement, onActiveViewChange }) => {
	const { pathname, search } = useLocation();
	const navigate = useNavigate();
	const { screen } = useParams();
	const { t, dir } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);
	const isAdmin = role === Role.admin || role === Role.creator;
	const treeFilter = useTreeFilterOptional();

	// Nav state
	const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
	const [showInvitationPanel, setShowInvitationPanel] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);

	// Sub-header state
	const [searchParams, setSearchParams] = useSearchParams();
	const tabFromUrl = searchParams.get('tab');
	const defaultView = statement?.statementSettings?.defaultView ?? 'chat';
	const [activeView, setActiveView] = useState<string>(tabFromUrl ?? defaultView);
	const [edit, setEdit] = useState(false);
	const [headerCollapsed, setHeaderCollapsed] = useState(true);

	useEffect(() => {
		if (tabFromUrl && tabFromUrl !== activeView) {
			setActiveView(tabFromUrl);
		}
	}, [tabFromUrl]);

	useEffect(() => {
		onActiveViewChange(activeView);
	}, [activeView, onActiveViewChange]);

	const isCompound =
		statement?.statementType === StatementType.question &&
		statement?.questionSettings?.questionType === QuestionType.compound;

	const handleTabChange = useCallback(
		(tabId: string) => {
			setActiveView(tabId);
			setSearchParams({ tab: tabId }, { replace: true });
		},
		[setSearchParams],
	);

	// Redux selectors for counts
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

	const segments = useMemo(() => {
		const allSegments = [
			{ id: 'chat', label: t('Discussion'), count: allSubs.length },
			...(statement && isStatementTypeAllowedAsChildren(statement, StatementType.option)
				? [{ id: 'options', label: t('Solutions'), count: options.length }]
				: []),
			...(statement && isStatementTypeAllowedAsChildren(statement, StatementType.question)
				? [{ id: 'questions', label: t('Questions'), count: questions.length }]
				: []),
		];

		return allSegments;
	}, [t, allSubs.length, options.length, questions.length, statement]);

	const showSegmentedControl = MAIN_SCREENS.has(screen);

	// Nav handlers
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
			navigate('/');
			await logOut();
		} catch (error) {
			logError(error, { operation: 'header.StatementHeader.handleLogout' });
		}
	}

	// Sub-header handlers
	function handleUpdateStatement(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			const title = (e.target as HTMLInputElement).value;
			updateStatementText(statement, title);
			setEdit(false);
		}
	}

	function handleStartEdit() {
		if (isAdmin) {
			setEdit(true);
		}
	}

	return (
		<>
			<div className={`page__header ${dir}`}>
				{/* Full header: nav bar + sub-header */}
				<div className="page__header__full">
					<StatementTopNav
						statement={statement}
						parentStatement={undefined}
						handleShare={handleShare}
						handleFollowMe={handleFollowMe}
						handleInvitePanel={handleInvitePanel}
						handleLogout={handleLogout}
						setIsHeaderMenuOpen={setIsHeaderMenuOpen}
						isHeaderMenuOpen={isHeaderMenuOpen}
					/>

					{/* Sub-header: title, tabs, filters */}
					<div className={styles.subHeader}>
						{isAdmin ? (
							<button className={styles.header} onClick={handleStartEdit}>
								{!edit ? (
									<h1>{renderInlineMarkdown(statement?.statement)}</h1>
								) : (
									<h1>
										<input
											type="text"
											defaultValue={statement?.statement}
											onBlur={() => setEdit(false)}
											onKeyUp={handleUpdateStatement}
										/>
									</h1>
								)}
							</button>
						) : (
							<div className={styles.header}>
								<h1>{renderInlineMarkdown(statement?.statement)}</h1>
							</div>
						)}

						{isCompound ? (
							<>
								<button
									className={styles.headerToggle}
									onClick={() => setHeaderCollapsed((prev) => !prev)}
									aria-expanded={!headerCollapsed}
								>
									<span className={styles.headerToggleText}>{t('Details')}</span>
									<span
										className={`${styles.headerToggleChevron} ${!headerCollapsed ? styles.headerToggleChevronOpen : ''}`}
									>
										&#9662;
									</span>
								</button>
								{!headerCollapsed && (
									<div className={styles.headerCollapsible}>
										<DeadlineBanner statement={statement} role={role} />
										{showSegmentedControl && (
											<div className={styles.segmentedControlWrapper}>
												<SegmentedControl
													segments={segments}
													activeId={activeView}
													onChange={handleTabChange}
												/>
											</div>
										)}
									</div>
								)}
							</>
						) : (
							<>
								{statement?.brief && (
									<StatementDescription
										brief={statement.brief}
										callToAction={t('Share your thoughts below')}
									/>
								)}
								<DeadlineBanner statement={statement} role={role} />
								{showSegmentedControl && (
									<div className={styles.segmentedControlWrapper}>
										<SegmentedControl
											segments={segments}
											activeId={activeView}
											onChange={handleTabChange}
										/>
									</div>
								)}
							</>
						)}

						{treeFilter && showSegmentedControl && (
							<TreeFilterChips
								activeFilter={treeFilter.filterMode}
								onFilterChange={treeFilter.setFilterMode}
								onToggleCollapse={treeFilter.toggleCollapseExpand}
								isCollapsed={treeFilter.isCollapsed}
							/>
						)}
					</div>
				</div>

				{/* Mini header: just the title */}
				{statement?.statement && (
					<div className="page__header__mini">
						<span className="page__header__mini__title">{statement.statement}</span>
					</div>
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
		</>
	);
};

export default StatementHeader;
