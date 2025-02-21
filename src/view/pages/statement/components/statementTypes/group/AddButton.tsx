import React, { useContext } from 'react';
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import AddDocumentIcon from '@/assets/icons/document.svg?react';
import AddClusterIcon from '@/assets/icons/net-clusters.svg?react';
import AddSubQuestionIcon from '@/assets/icons/questionIcon.svg?react';
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
		action: 'document' | 'cluster' | 'subgroup' | 'subquestion'
	) => {
		switch (action) {
			case 'document':
				handleAddStatement(
					StatementType.question,
					QuestionType.multiStage
				);
				break;
			case 'cluster':
				handleAddStatement(
					StatementType.question,
					QuestionType.massConsensus
				);
				break;
			case 'subgroup':
				handleAddStatement(StatementType.group);
				break;
			case 'subquestion':
				handleAddStatement(
					StatementType.question,
					QuestionType.singleStep
				);
				break;
			default:
				break;
		}
	};

	const toggleActions = () => setActionsOpen(!actionsOpen);

	const actions = [
		{
			key: 'document',
			action: 'document' as const,
			icon: <AddDocumentIcon />,
		},
		{
			key: 'cluster',
			action: 'cluster' as const,
			icon: <AddClusterIcon />,
		},
		{
			key: 'subgroup',
			action: 'subgroup' as const,
			icon: <AddSubGroupIcon />,
		},
		{
			key: 'subquestion',
			action: 'subquestion' as const,
			icon: <AddSubQuestionIcon />,
		},
	];

	return (
		<div className='actions'>
			{actionsOpen && (
				<>
					{actions.map(({ key, action, icon }) => (
						<IconButton
							key={key}
							onClick={() => handleAction(action)}
						>
							{icon}
						</IconButton>
					))}
					<button
						className='invisibleBackground'
						onClick={() => setActionsOpen(false)}
					></button>
				</>
			)}
			<IconButton onClick={toggleActions} className='plus-button'>
				<PlusIcon />
			</IconButton>
		</div>
	);
}
