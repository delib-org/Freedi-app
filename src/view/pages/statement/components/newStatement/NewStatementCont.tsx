import { Statement } from '@freedi/shared-types';
import React, { createContext, useContext } from 'react';

export enum SimilaritySteps {
	FORM = 'form',
	SIMILARITIES = 'similarities',
}
interface NewStatementContextProps {
	title?: string;
	description?: string;
	setTitle: (statement: string) => void;
	setDescription: (description: string) => void;
	setCurrentStep: React.Dispatch<React.SetStateAction<SimilaritySteps>>;
	lookingForSimilarStatements?: boolean;
	setLookingForSimilarStatements: (lookingForSimilarStatements: boolean) => void;
	similarStatements: Statement[];
	setSimilarStatements: React.Dispatch<React.SetStateAction<Statement[]>>;
}

export const NewStatementContext = createContext<NewStatementContextProps>({
	title: '',
	description: '',
	setTitle: () => {
		return;
	},
	setDescription: () => {
		return;
	},
	setCurrentStep: () => {
		return;
	},
	lookingForSimilarStatements: false,
	setLookingForSimilarStatements: () => {
		return;
	},
	similarStatements: [],
	setSimilarStatements: () => {
		return;
	},
});

// export const NewStatementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
// 	const [statement, setStatement] = useState<string>('');

// 	return (
// 		<NewStatementContext.Provider value={{ statement, setStatement }}>
// 			{children}
// 		</NewStatementContext.Provider>
// 	);
// };

export const useNewStatement = (): NewStatementContextProps => {
	const context = useContext(NewStatementContext);
	if (!context) {
		throw new Error('useNewStatement must be used within a NewStatementProvider');
	}

	return context;
};
