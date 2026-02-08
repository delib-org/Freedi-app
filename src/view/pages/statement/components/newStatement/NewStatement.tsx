import { useMemo, useState } from 'react';

import styles from './newStatement.module.scss';

import GetInitialStatementData from './components/01-form/GetInitialStatementData';

import { NewStatementContext, SimilaritySteps } from './NewStatementCont';
import { Statement } from '@freedi/shared-types';
import SimilarStatements from './components/SimilarStatements';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';

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

	const { statementId } = useParams<{ statementId: string }>();

	const statement = useSelector(statementSelectorById(statementId || ''));
	const defaultLookForSimilarities = statement?.statementSettings?.defaultLookForSimilarities || false;

	const [title, setTitle] = useState<string>('');
	const [description, setDescription] = useState<string>('');
	const [lookingForSimilarStatements, setLookingForSimilarStatements] = useState<boolean>(defaultLookForSimilarities);
	const [currentStep, setCurrentStep] = useState<SimilaritySteps>(SimilaritySteps.FORM);
	const [similarStatements, setSimilarStatements] = useState<Statement[]>([]);

	const contextValue = useMemo(
		() => ({ title, setTitle, description, setDescription, setCurrentStep, lookingForSimilarStatements, setLookingForSimilarStatements, similarStatements, setSimilarStatements }),
		[title, description, lookingForSimilarStatements, similarStatements]
	);

	return (
		<NewStatementContext.Provider value={contextValue}>
			<div className={styles.newStatement}>{CurrentScreen(currentStep)}</div>
		</NewStatementContext.Provider>
	);

}
