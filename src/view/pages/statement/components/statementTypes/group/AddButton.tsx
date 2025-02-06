import React, { useContext } from 'react'
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from "@/assets/icons/plusIcon.svg?react";
import AddDocumentIcon from "@/assets/icons/document.svg?react";
import AddClusterIcon from "@/assets/icons/net-clusters.svg?react";
import AddSubQuestionIcon from "@/assets/icons/questionIcon.svg?react";

import AddSubGroupIcon from "@/assets/icons/team-group.svg?react";
import { StatementContext } from '../../../StatementCont';
import { StatementType } from '@/types/enums';
import { QuestionType } from '@/types/question';

export default function AddButton() {
	const [actionsOpen, setActionsOpen] = React.useState(false)

	const { handleSetNewStatement, setNewStatementType, setNewQuestionType } =
		useContext(StatementContext);

	function handleAddStatement(newStatementType: StatementType, questionType?: QuestionType) {

		setNewStatementType(newStatementType);
		if (questionType) {
			setNewQuestionType(questionType);

		}
		handleSetNewStatement(true);
	}
	const onclick = () => {
		setActionsOpen(!actionsOpen)
	}

	const addDocumentAction = () => {
		handleAddStatement(StatementType.question, QuestionType.multiStage)
	}

	const addClusterAction = () => {
		handleAddStatement(StatementType.question, QuestionType.massConsensus)
	}

	const addSubGroupAction = () => {
		handleAddStatement(StatementType.group)
	}
	const addSubQuestionAction = () => {
		handleAddStatement(StatementType.question, QuestionType.singleStep)
	}

	return (
		<div className='actions'>
			{actionsOpen && <>
				<IconButton onClick={addDocumentAction} className="action-btn">
					<AddDocumentIcon />
				</IconButton>
				<IconButton onClick={addClusterAction} className="action-btn">
					<AddClusterIcon />
				</IconButton>
				<IconButton onClick={addSubGroupAction} className="action-btn">
					<AddSubGroupIcon />
				</IconButton>
				<IconButton onClick={addSubQuestionAction} className="action-btn">
					<AddSubQuestionIcon />
				</IconButton>
				<button className='invisibleBackground' onClick={() => setActionsOpen(false)}></button>
			</>}

			<IconButton onClick={onclick} className="plus-button">
				<PlusIcon />
			</IconButton>
		</div>
	)
}
