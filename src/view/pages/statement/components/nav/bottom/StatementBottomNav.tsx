import { FC, useContext, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';

// Icons
import AgreementIcon from '@/assets/icons/agreementIcon.svg?react';
import NewestIcon from '@/assets/icons/newIcon.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import RandomIcon from '@/assets/icons/randomIcon.svg?react';
import SortIcon from '@/assets/icons/sort.svg?react';
import UpdateIcon from '@/assets/icons/updateIcon.svg?react';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import styles from './StatementBottomNav.module.scss';
import StartHere from '@/view/components/startHere/StartHere';
import { StatementContext } from '../../../StatementCont';
import { sortItems } from './StatementBottomNavModal';
import { EvaluationUI, Role, SortType, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';
import { useDispatch, useSelector } from 'react-redux';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';

interface Props {
	showNav?: boolean;
}

const StatementBottomNav: FC<Props> = () => {

	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const navigate = useNavigate();

	const { statement } =
		useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statementId));

	const role = subscription?.role;
	const isAdmin = role === 'admin' || role === Role.creator;
	const { dir, learning } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	const timesRemainToLearnAddOption = learning.addOptions;
	const canAddOptionSuggestions = statement.statementSettings?.enableAddEvaluationOption ?? false;
	const canAddOptionVoting = statement.statementSettings?.enableAddVotingOption ?? false;
	const evaluatingSettings: EvaluationUI = statement.evaluationSettings.evaluationUI;
	const canAddOption = (canAddOptionSuggestions && evaluatingSettings === EvaluationUI.suggestions) || (canAddOptionVoting && evaluatingSettings === EvaluationUI.voting);

	const [showSorting, setShowSorting] = useState(false);
	const [showStartHere, setShowStartHere] = useState(
		timesRemainToLearnAddOption > 0
	);

	// Update showStartHere when learning.addOptions changes
	useEffect(() => {
		setShowStartHere(timesRemainToLearnAddOption > 0);
	}, [timesRemainToLearnAddOption]);

	const statementColor = useStatementColor({ statement });

	function handleCreateNewOption() {
		dispatch(setNewStatementModal({
			parentStatement: statement,
			newStatement: {
				statementType: StatementType.option,
			},
			showModal: true,
			isLoading: false,
			error: null,
		}))
	}

	const handleAddOption = () => {
		handleCreateNewOption();
		setShowStartHere(false);
		decreaseLearning({
			addOption: true,
		});
	};

	function handleSortingClick() {
		setShowSorting(!showSorting);
	}

	function getBaseRoute() {
		const path = window.location.pathname;

		return path.includes('/stage/') ? 'stage' : 'statement';
	}

	function handleSortClick(navItem: typeof sortItems[0]) {
		setShowSorting(false);
		
		// For random sort, add a timestamp query parameter to force re-randomization
		if (navItem.link === SortType.random) {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}?t=${Date.now()}`);
		} else {
			navigate(`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}`);
		}
	}

	return (
		<>
			{showStartHere && canAddOption && <StartHere setShow={setShowStartHere} />}
			<div
				className={
					showSorting
						? `${styles.statementBottomNav} ${styles.statementBottomNavShow}`
						: styles.statementBottomNav
				}
			>
				<div
					className={`${styles.addOptionButtonWrapper} ${dir === 'ltr' ? styles.addOptionButtonWrapperLtr : ''}`}
				>
					{(canAddOption || isAdmin) && <button
						className={styles.addOptionButton}
						aria-label='Add option'
						style={statementColor}
						onClick={handleAddOption}
						data-cy='bottom-nav-mid-icon'
					>
						<PlusIcon style={{ color: statementColor.color }} />
					</button>
					}
					<div className={styles.sortMenu}>
						{sortItems.map((navItem, i) => (
							<div
								key={`item-id-${i}`}
								className={`${styles.sortMenu__item} ${showSorting ? styles.active : ''}`}
							>
								<button
									className={`${styles.openNavIcon} ${showSorting ? styles.active : ''}`}
									aria-label='Sorting options'
									onClick={() => handleSortClick(navItem)}
								>
									<NavIcon
										name={navItem.id}
										color={statementColor.backgroundColor}
									/>
								</button>
								<span className={styles.buttonName}>
									{navItem.name}
								</span>
							</div>
						))}
						<button
							className={styles.sortButton}
							onClick={handleSortingClick}
							aria-label='Sort items'
						>
							<SortIcon />
						</button>
					</div>
				</div>
			</div >
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
		default:
			return null;
	}
};
