import React, { useContext } from 'react';
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import AddQuestionIcon from '@/assets/icons/questionIcon.svg?react';
import AddMassConsensusIcon from '@/assets/icons/massConsensusIcon.svg?react';
import AddSubGroupIcon from '@/assets/icons/team-group.svg?react';
import styles from './AddButton.module.scss'
import { StatementContext } from '../../../StatementCont';
import { QuestionType, StatementType } from 'delib-npm';

export default function AddButton() {
	const [actionsOpen, setActionsOpen] = React.useState(false);
	const { handleSetNewStatement, setNewStatementType, setNewQuestionType } =
		useContext(StatementContext);
	const radius = 5;

	function handleAddStatement(
		newStatementType: StatementType,
		questionType?: QuestionType
	) {
		setNewStatementType(newStatementType);
		if (questionType) {
			setNewQuestionType(questionType);
		}
		handleSetNewStatement(true);
	}

	const handleAction = (
		action: 'question' | 'mass-consensus' | 'subgroup'
	) => {
		switch (action) {
			case 'question':
				handleAddStatement(
					StatementType.question,
					QuestionType.multiStage
				);
				break;
			case 'mass-consensus':
				handleAddStatement(
					StatementType.question,
					QuestionType.massConsensus
				);
				break;
			case 'subgroup':
				handleAddStatement(StatementType.group);
				break;
			default:
				break;
		}
	};

	const toggleActions = () => setActionsOpen(!actionsOpen);

	const actions = [
		{
			key: 'question',
			action: 'question' as const,
			icon: <AddQuestionIcon />,
		},
		{
			key: 'mass-consensus',
			action: 'mass-consensus' as const,
			icon: <AddMassConsensusIcon />,
		},
		{
			key: 'subgroup',
			action: 'subgroup' as const,
			icon: <AddSubGroupIcon />,
		}
	];

	return (
		<div className={`${styles.actions}`}>
			{actions.map(({ key, action, icon }, index) => {
				const angle = -90 + (index * -90) / (actions.length - 1);

				const x = Math.cos((angle * Math.PI) / 180) * radius;
				const y = Math.sin((angle * Math.PI) / 180) * radius;

				return (
					<IconButton
						key={key}
						onClick={() => handleAction(action)}
						className={`${styles.actionBtn} ${actionsOpen ? styles.visible : ""}`}
						title={`add ${action}`}
						style={{
							position: "absolute",
							top: "-50%",
							left: "-50%",
							"--x": `${x}rem`,
							"--y": `${y}rem`,
							transitionDelay: `${index * 0.1}s`,
							backgroundColor: `${action === 'subgroup' ? '#a879e0' : ''}`
						} as React.CSSProperties}
					>
						{icon}
					</IconButton>
				);
			})}
			{actionsOpen && (
				<button
					className={`${styles.invisibleBackground}`}
					onClick={() => setActionsOpen(false)}
				></button>
			)
			}
			<IconButton onClick={toggleActions} className={`${styles.plusButton} ${actionsOpen ? styles.active : ""}`}>
				<PlusIcon />
			</IconButton>
		</div >
	);
}
