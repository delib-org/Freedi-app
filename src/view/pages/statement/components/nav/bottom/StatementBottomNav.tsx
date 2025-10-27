import { FC, useContext, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';

// Icons
import AgreementIcon from '@/assets/icons/agreementIcon.svg?react';
import NewestIcon from '@/assets/icons/newIcon.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import RandomIcon from '@/assets/icons/randomIcon.svg?react';
import SortIcon from '@/assets/icons/sort.svg?react';
import UpdateIcon from '@/assets/icons/updateIcon.svg?react';
import XmenuIcon from '@/assets/icons/x-icon.svg?react';

import useStatementColor from '@/controllers/hooks/useStatementColor';
import styles from './StatementBottomNav.module.scss';
import { StatementContext } from '../../../StatementCont';
import { sortItems } from './StatementBottomNavModal';
import { EvaluationUI, Role, SortType, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { useDispatch, useSelector } from 'react-redux';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import IdeaRefineryModal from '../../popperHebbian/refinery/IdeaRefineryModal';

interface Props { showNav?: boolean; }

const StatementBottomNav: FC<Props> = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const navigate = useNavigate();

	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statementId));
	const role = subscription?.role;
	const isAdmin = role === 'admin' || role === Role.creator;

	const { dir, learning, t } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	// Popper-Hebbian refinery modal state
	const isPopperHebbianEnabled = statement?.statementSettings?.popperianDiscussionEnabled ?? false;
	const [showRefineryModal, setShowRefineryModal] = useState(false);
	const [initialIdea, setInitialIdea] = useState('');

	// Learning counter → pill text while > 0
	const timesRemainToLearnAddOption = Number(learning?.addOptions ?? 0);

	// Permissions / UI mode
	const canAddOptionSuggestions = statement?.statementSettings?.enableAddEvaluationOption ?? false;
	const canAddOptionVoting = statement?.statementSettings?.enableAddVotingOption ?? false;
	const evaluatingSettings: EvaluationUI | undefined = statement?.evaluationSettings?.evaluationUI;
	const canAddOption =
		(canAddOptionSuggestions && evaluatingSettings === EvaluationUI.suggestions) ||
		(canAddOptionVoting && evaluatingSettings === EvaluationUI.voting);

	const [showSorting, setShowSorting] = useState(false);

	const isLearningFace = timesRemainToLearnAddOption > 0;
	const isRTL = dir === 'rtl';

	// Animations
	const introPlayedRef = useRef(false);
	const showIntro = isLearningFace && !introPlayedRef.current;
	const prevIsLearningFace = useRef(isLearningFace);
	const justFinishedLearning = prevIsLearningFace.current && !isLearningFace;

	useEffect(() => {
		if (isLearningFace) introPlayedRef.current = true;
		prevIsLearningFace.current = isLearningFace;
	}, [isLearningFace]);

	const statementColor = useStatementColor({ statement });

	// Filter out the Agreement sort option if showEvaluation is false
	const showEvaluation = statement?.statementSettings?.showEvaluation ?? true;
	const filteredSortItems = showEvaluation
		? sortItems
		: sortItems.filter(item => item.id !== SortType.accepted);

	function handleCreateNewOption() {
		if (!statement) return;

		// Default to question if parent is an option (options can't be created under options)
		const defaultType = statement.statementType === StatementType.option
			? StatementType.question
			: StatementType.option;

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: { statementType: defaultType },
				showModal: true,
				isLoading: false,
				error: null,
			})
		);
	}

	const handleAddOption = () => {
		// If Popper-Hebbian mode is enabled, show refinery modal first
		if (isPopperHebbianEnabled) {
			// Prompt user for their initial idea
			const idea = window.prompt(t('What is your initial idea or solution?'));
			if (idea && idea.trim()) {
				setInitialIdea(idea.trim());
				setShowRefineryModal(true);
			}
			decreaseLearning({ addOption: true });
		} else {
			// Normal flow - directly create option
			handleCreateNewOption();
			decreaseLearning({ addOption: true });
		}
	};

	function handlePublishRefinedIdea(refinedText: string, sessionId: string) {
		if (!statement) return;

		// Close the refinery modal
		setShowRefineryModal(false);

		// Reset initial idea
		setInitialIdea('');

		// Open the new statement modal with the refined text pre-filled
		const defaultType = statement.statementType === StatementType.option
			? StatementType.question
			: StatementType.option;

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: {
					statementType: defaultType,
					statement: refinedText
				},
				showModal: true,
				isLoading: false,
				error: null,
			})
		);
	}

	function handleSortingClick() {
		setShowSorting(v => !v);
	}

	function getBaseRoute() {
		const path = window.location.pathname;

		return path.includes('/stage/') ? 'stage' : 'statement';
	}

	function handleSortClick(navItem: typeof filteredSortItems[0]) {
		setShowSorting(false);
		if (navItem.link === SortType.random) {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}?t=${Date.now()}`);
		} else {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}`);
		}
	}

	// Add mobile-only class that hides the Add button when menu is open
	const navRootClass = [
		showSorting ? `${styles.statementBottomNav} ${styles.statementBottomNavShow}` : styles.statementBottomNav,
		showSorting ? styles.sortExpandedMobile : '',
	].join(' ');

	return (
		<>
			<div className={navRootClass}>
				<div className={`${styles.addOptionButtonWrapper} ${dir === 'ltr' ? styles.addOptionButtonWrapperLtr : ''}`}>
					{(canAddOption || isAdmin) && (
						<button
							className={`${styles.addOptionButton} ${isLearningFace ? styles.addOptionButtonPill : ''} ${showIntro ? (isRTL ? styles.addOptionButtonIntroRTL : styles.addOptionButtonIntroLTR) : ''
								} ${justFinishedLearning ? styles.addOptionButtonShrinking : ''}`}
							aria-label={isLearningFace ? t('addSolution_aria') : t('addOption_aria')}
							style={statementColor}
							onClick={handleAddOption}
							data-cy="bottom-nav-mid-icon"
						>
							{!isLearningFace && <PlusIcon style={{ color: statementColor.color }} />}
							{isLearningFace && (
								<span className={styles.addOptionButtonLabel} dir={dir}>
									{t('Add Solution')}
								</span>
							)}
						</button>
					)}

					{/* Sort menu (absolute fan-out like main branch) */}
					<div className={styles.sortMenu}>
						{filteredSortItems.map((navItem, i) => (
							<div
								key={`item-id-${i}`}
								className={`${styles.sortMenu__item} ${showSorting ? styles.active : ''}`}
							>
								<button
									className={`${styles.openNavIcon} ${showSorting ? styles.active : ''}`}
									aria-label="Sorting options"
									onClick={() => handleSortClick(navItem)}
								>
									<NavIcon name={navItem.id} color={statementColor.backgroundColor} />
								</button>
								<span className={styles.buttonName}>{navItem.name}</span>
							</div>
						))}
						<button
							className={styles.sortButton}
							onClick={handleSortingClick}
							aria-label={showSorting ? 'Close sorting' : 'Open sorting'}
						>
							{showSorting ? <XmenuIcon className={styles.whiteIcon} /> : <SortIcon />}
						</button>
					</div>
				</div>
			</div>

			{/* Popper-Hebbian Idea Refinery Modal */}
			{showRefineryModal && statement && initialIdea && (
				<IdeaRefineryModal
					parentStatementId={statement.statementId}
					originalIdea={initialIdea}
					onClose={() => {
						setShowRefineryModal(false);
						setInitialIdea('');
					}}
					onPublish={handlePublishRefinedIdea}
				/>
			)}
		</>
	);
};

export default StatementBottomNav;

interface NavIconProps { name: string; color: string; }

const NavIcon: FC<NavIconProps> = ({ name, color }) => {
	const props = { style: { color } };
	switch (name) {
		case SortType.newest: return <NewestIcon {...props} />;
		case SortType.mostUpdated: return <UpdateIcon {...props} />;
		case SortType.random: return <RandomIcon {...props} />;
		case SortType.accepted: return <AgreementIcon {...props} />;
		default: return null;
	}
};
