import { FC, useContext, useState, useEffect } from 'react';
import { Link, useParams } from 'react-router';

// Icons
import AgreementIcon from '@/assets/icons/agreementIcon.svg?react';
import NewestIcon from '@/assets/icons/newIcon.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import RandomIcon from '@/assets/icons/randomIcon.svg?react';
import SortIcon from '@/assets/icons/sort.svg?react';
import UpdateIcon from '@/assets/icons/updateIcon.svg?react';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import './StatementBottomNav.scss';
import StartHere from '@/view/components/startHere/StartHere';
import { StatementContext } from '../../../StatementCont';
import { sortItems } from './StatementBottomNavModal';
import { Role, SortType, StatementType } from 'delib-npm';
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

	const { statement } =
		useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statementId));

	const role = subscription?.role;
	const isAdmin = role === 'admin' || role === Role.creator;
	const { dir, learning } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	const timesRemainToLearnAddOption = learning.addOptions;
	const canAddOption = statement.statementSettings?.enableAddEvaluationOption ?? false;

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

	return (
		<>
			{showStartHere && <StartHere setShow={setShowStartHere} />}
			<div
				className={
					showSorting
						? 'statement-bottom-nav statement-bottom-nav--show'
						: 'statement-bottom-nav'
				}
			>
				<div
					className={`add-option-button-wrapper ${dir === 'ltr' ? 'add-option-button-wrapper--ltr' : ''}`}
				>
					{(canAddOption || isAdmin) && <button
						className='add-option-button'
						aria-label='Add option'
						style={statementColor}
						onClick={handleAddOption}
						data-cy='bottom-nav-mid-icon'
					>
						<PlusIcon style={{ color: statementColor.color }} />
					</button>
					}
					<div className='sort-menu'>
						{sortItems.map((navItem, i) => (
							<div
								key={`item-id-${i}`}
								className={`sort-menu__item  ${showSorting ? 'active' : ''}`}
							>
								<Link
									className={`open-nav-icon ${showSorting ? 'active' : ''}`}
									to={`/${getBaseRoute()}/${statement?.statementId}/${navItem.link}`}
									aria-label='Sorting options'
									key={navItem.id}
									onClick={() => setShowSorting(false)}
								>
									<NavIcon
										name={navItem.id}
										color={statementColor.backgroundColor}
									/>
								</Link>
								<span className='button-name'>
									{navItem.name}
								</span>
							</div>
						))}
						<button
							className='sort-button'
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
