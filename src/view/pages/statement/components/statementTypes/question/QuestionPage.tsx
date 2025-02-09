import { useContext } from 'react';
import { StatementContext } from '../../../StatementCont';
import Document from './document/Document';
import SimpleQuestion from './simpleQuestion/SimpleQuestion';
import { QuestionType } from '@/types/enums';

const QuestionPage = () => {
	const { statement } = useContext(StatementContext);
	const isDocument: boolean | undefined = statement?.questionSettings?.questionType === QuestionType.document;

	if (isDocument) return <Document />
	
return <SimpleQuestion />

	return <SimpleQuestion />;
};

export default QuestionPage;
