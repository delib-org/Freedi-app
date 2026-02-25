import { FC, useContext, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { logError } from '@/utils/errorHandling';

// Icons
import AgreementIcon from '@/assets/icons/agreementIcon.svg?react';
import NewestIcon from '@/assets/icons/newIcon.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import RandomIcon from '@/assets/icons/randomIcon.svg?react';
import SortIcon from '@/assets/icons/sort.svg?react';
import UpdateIcon from '@/assets/icons/updateIcon.svg?react';
import XmenuIcon from '@/assets/icons/x-icon.svg?react';
import EyeIcon from '@/assets/icons/eye.svg?react';
import EyeCrossIcon from '@/assets/icons/eyeCross.svg?react';
import { Users } from 'lucide-react';

import useStatementColor from '@/controllers/hooks/useStatementColor';
import styles from './StatementBottomNav.module.scss';
import { StatementContext } from '../../../StatementCont';
import { sortItems } from './StatementBottomNavModal';
import { EvaluationUI, Role, SortType, StatementType, ParagraphType } from '@freedi/shared-types';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { useDispatch, useSelector } from 'react-redux';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import {
	statementSubscriptionSelector,
	statementOptionsSelector,
} from '@/redux/statements/statementsSlice';
import IdeaRefineryModal from '../../popperHebbian/refinery/IdeaRefineryModal';
import InitialIdeaModal from '../../popperHebbian/refinery/InitialIdeaModal';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { QuestionType } from '@freedi/shared-types';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';

interface Props {
	showNav?: boolean;
}

const StatementBottomNav: FC<Props> = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { user } = useAuthentication();

	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statementId));
	const options = useSelector(statementOptionsSelector(statementId));
	const role = subscription?.role;
	const isAdmin = role === 'admin' || role === Role.creator;

	// Only show sort buttons when there are at least 2 answers
	const hasEnoughOptionsToSort = options.length >= 2;

	const { dir, learning, t, currentLanguage } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	// Popper-Hebbian refinery modal state
	const isPopperHebbianEnabled = statement?.statementSettings?.popperianDiscussionEnabled ?? false;
	const isPopperPreCheckEnabled = statement?.statementSettings?.popperianPreCheckEnabled ?? false;
	const [showInitialIdeaModal, setShowInitialIdeaModal] = useState(false);
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

	// Admin toggle for showing/hiding hidden cards
	const { showHiddenCards, toggleShowHiddenCards } = useShowHiddenCards();

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

	// Filter out sort options based on settings
	const showEvaluation = statement?.statementSettings?.showEvaluation ?? true;
	const joiningEnabled = statement?.statementSettings?.joiningEnabled ?? false;
	const filteredSortItems = sortItems.filter((item) => {
		// Filter out Agreement if evaluation is disabled
		if (item.id === SortType.accepted && !showEvaluation) return false;
		// When joining is enabled, show Joined instead of Update
		if (item.id === SortType.mostJoined && !joiningEnabled) return false;
		if (item.id === SortType.mostUpdated && joiningEnabled) return false;

		return true;
	});

	function handleCreateNewOption() {
		if (!statement) return;

		// Default to question if parent is an option (options can't be created under options)
		const defaultType =
			statement.statementType === StatementType.option
				? StatementType.question
				: StatementType.option;

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: { statementType: defaultType },
				showModal: true,
				isLoading: false,
				error: null,
			}),
		);
	}

	const handleAddOption = () => {
		// If Popper-Hebbian mode is enabled AND pre-check is enabled, show initial idea modal first
		if (isPopperHebbianEnabled && isPopperPreCheckEnabled) {
			setShowInitialIdeaModal(true);
			decreaseLearning({ addOption: true });
		} else {
			// Normal flow - directly create option
			handleCreateNewOption();
			decreaseLearning({ addOption: true });
		}
	};

	function handleInitialIdeaSubmit(idea: string) {
		setInitialIdea(idea);
		setShowInitialIdeaModal(false);
		setShowRefineryModal(true);
	}

	async function handlePublishRefinedIdea(refinedText: string) {
		if (!statement || !user) return;

		try {
			// Close the refinery modal
			setShowRefineryModal(false);

			// Reset initial idea
			setInitialIdea('');

			// Automatically create the statement with the refined idea
			const defaultType =
				statement.statementType === StatementType.option
					? StatementType.question
					: StatementType.option;

			// Extract title (first line or first 100 chars) and convert rest to paragraphs
			const lines = refinedText.split('\n');
			const title = lines[0].substring(0, 100);
			const bodyLines = lines.slice(1).filter((line) => line.trim());
			const paragraphs = bodyLines.map((line, index) => ({
				paragraphId: generateParagraphId(),
				type: ParagraphType.paragraph,
				content: line,
				order: index,
			}));

			await createStatementWithSubscription({
				newStatementParent: statement,
				title,
				paragraphs,
				newStatement: { statementType: defaultType },
				newStatementQuestionType: statement.questionSettings?.questionType || QuestionType.simple,
				currentLanguage,
				user,
				dispatch,
			});
		} catch (error) {
			logError(error, {
				operation: 'bottom.StatementBottomNav.paragraphs',
				metadata: { message: 'Failed to publish refined idea:' },
			});
		}
	}

	function handleSortingClick() {
		setShowSorting((v) => !v);
	}

	function getBaseRoute() {
		const path = window.location.pathname;

		return path.includes('/stage/') ? 'stage' : 'statement';
	}

	function handleSortClick(navItem: (typeof filteredSortItems)[0]) {
		setShowSorting(false);
		if (navItem.link === SortType.random) {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}?t=${Date.now()}`);
		} else {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}`);
		}
	}

	// Add mobile-only class that hides the Add button when menu is open
	const navRootClass = [
		showSorting
			? `${styles.statementBottomNav} ${styles.statementBottomNavShow}`
			: styles.statementBottomNav,
		showSorting ? styles.sortExpandedMobile : '',
	].join(' ');

	return (
		<>
			<div className={navRootClass}>
				<div
					className={`${styles.addOptionButtonWrapper} ${dir === 'ltr' ? styles.addOptionButtonWrapperLtr : ''}`}
				>
					{(canAddOption || isAdmin) && (
						<button
							className={`${styles.addOptionButton} ${isLearningFace ? styles.addOptionButtonPill : ''} ${
								showIntro
									? isRTL
										? styles.addOptionButtonIntroRTL
										: styles.addOptionButtonIntroLTR
									: ''
							} ${justFinishedLearning ? styles.addOptionButtonShrinking : ''}`}
							aria-label={isLearningFace ? t('addSolution_aria') : t('addOption_aria')}
							style={statementColor}
							onClick={handleAddOption}
							data-cy="bottom-nav-mid-icon"
						>
							{!isLearningFace && <PlusIcon style={{ color: statementColor.color }} />}
							{isLearningFace && (
								<span className={styles.addOptionButtonLabel} dir={dir}>
									{t('Add an answer')}
								</span>
							)}
						</button>
					)}

					{/* Sort menu (absolute fan-out like main branch) - only show when there are at least 2 answers */}
					{hasEnoughOptionsToSort && (
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
							{/* Admin-only toggle for showing/hiding hidden cards */}
							{isAdmin && (
								<div
									className={`${styles.sortMenu__item} ${styles.sortMenu__item_visibility} ${showSorting ? styles.active : ''}`}
								>
									<button
										className={`${styles.openNavIcon} ${styles.visibilityToggle} ${showSorting ? styles.active : ''} ${showHiddenCards ? styles.visibilityToggle_active : ''}`}
										aria-label={t('Toggle visibility of hidden suggestion cards')}
										title={showHiddenCards ? t('Hide hidden cards') : t('Show hidden cards')}
										onClick={toggleShowHiddenCards}
									>
										{showHiddenCards ? (
											<EyeIcon style={{ color: statementColor.backgroundColor }} />
										) : (
											<EyeCrossIcon style={{ color: statementColor.backgroundColor }} />
										)}
									</button>
									<span className={styles.buttonName}>
										{showHiddenCards ? t('Hide hidden cards') : t('Show hidden cards')}
									</span>
								</div>
							)}
							<button
								className={styles.sortButton}
								onClick={handleSortingClick}
								aria-label={showSorting ? 'Close sorting' : 'Open sorting'}
							>
								{showSorting ? <XmenuIcon className={styles.whiteIcon} /> : <SortIcon />}
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Initial Idea Input Modal */}
			{showInitialIdeaModal && (
				<InitialIdeaModal
					onSubmit={handleInitialIdeaSubmit}
					onClose={() => setShowInitialIdeaModal(false)}
				/>
			)}

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

interface NavIconProps {
	name: string;
	color: string;
}

const NavIcon: FC<NavIconProps> = ({ name, color }) => {
	const props = { style: { color } };
	switch (name) {
		case SortType.newest:
			return <NewestIcon {...props} />;
		case SortType.mostUpdated:
			return <UpdateIcon {...props} />;
		case SortType.random:
			return <RandomIcon {...props} />;
		case SortType.accepted:
			return <AgreementIcon {...props} />;
		case SortType.mostJoined:
			return <Users size={24} color={color} />;
		default:
			return null;
	}
};
