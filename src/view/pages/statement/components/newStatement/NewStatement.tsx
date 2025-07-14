import { useMemo, useState } from 'react';

import './newStatement.scss';

import GetInitialStatementData from './components/01-form/GetInitialStatementData';

import { NewStatementContext, SimilaritySteps } from './NewStatementCont';
import { Statement } from 'delib-npm/dist/models/statement/StatementTypes';
import SimilarStatements from './components/SimilarStatements';

export interface DisplayStatement {
	title: string;
	description: string;
	statementId: string;
}

function CurrentScreen(currentStep: SimilaritySteps) {
	switch (currentStep) {
		case SimilaritySteps.FORM:
			return <GetInitialStatementData />;
		case SimilaritySteps.SIMILARITIES:
			return <SimilarStatements />;
		default:
			return <>Error: Couldn't find the step</>;
	}
}

export default function NewStatement() {
	const [title, setTitle] = useState<string>('');
	const [description, setDescription] = useState<string>('');
	const [lookingForSimilarStatements, setLookingForSimilarStatements] = useState<boolean>(false);
	const [currentStep, setCurrentStep] = useState<SimilaritySteps>(SimilaritySteps.FORM);
	const [similarStatements, setSimilarStatements] = useState<Statement[]>([]);

	const contextValue = useMemo(
		() => ({ title, setTitle, description, setDescription, setCurrentStep, lookingForSimilarStatements, setLookingForSimilarStatements, similarStatements, setSimilarStatements }),
		[title, description, lookingForSimilarStatements, setSimilarStatements, setTitle, setDescription, setCurrentStep]
	);

	return (
		<NewStatementContext.Provider value={contextValue}>
			<div className='newStatement'>{CurrentScreen(currentStep)}</div>
		</NewStatementContext.Provider>
	);

}
