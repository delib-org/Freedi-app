import React, { useContext } from 'react';
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import AddDocumentIcon from '@/assets/icons/document.svg?react';
import AddClusterIcon from '@/assets/icons/net-clusters.svg?react';
import AddSubGroupIcon from '@/assets/icons/team-group.svg?react';
import { StatementContext } from '../../../StatementCont';
import { QuestionType, StatementType } from '@/types/TypeEnums';

export default function AddButton() {
	const [actionsOpen, setActionsOpen] = React.useState(false);
	const { handleSetNewStatement, setNewStatementType, setNewQuestionType } =
		useContext(StatementContext);

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
			icon: <AddDocumentIcon />,
		},
		{
			key: 'mass-consensus',
			action: 'mass-consensus' as const,
			icon: <AddClusterIcon />,
		},
		{
			key: 'subgroup',
			action: 'subgroup' as const,
			icon: <AddSubGroupIcon />,
		}
	];

	return (
		<div className='actions'>
			{actionsOpen && (
				<>
					{actions.map(({ key, action, icon }, index) => {
						const angle = -90 + (index * -90) / (actions.length - 1);

						const x = Math.cos((angle * Math.PI) / 180) * 80;
						const y = Math.sin((angle * Math.PI) / 180) * 80;

						return (
							<IconButton
								key={key}
								onClick={() => handleAction(action)}
								className={`action-btn ${actionsOpen ? "visible" : ""}`}
								title={`add ${action}`}
								style={{
									position: "absolute",
									top: "-50%",
									left: "-50%",
									transform: actionsOpen
										? `translate(${x}px, ${y}px)`
										: `translate(-50%, -50%)`,
									transition: "transform 0.3s ease-in-out, opacity 0.3s ease-in-out",
									opacity: actionsOpen ? 1 : 0,
								}}
							>
								{icon}
							</IconButton>
						);
					})}
					<button
						className='invisibleBackground'
						onClick={() => setActionsOpen(false)}
					></button>
				</>
			)}
			<IconButton onClick={toggleActions} className={`plus-button ${actionsOpen ? "active" : ""}`}>
				<PlusIcon />
			</IconButton>
		</div>
	);
}
