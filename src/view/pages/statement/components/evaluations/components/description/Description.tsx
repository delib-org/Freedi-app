import { FC, useContext } from 'react';
import { ParagraphsDisplay } from '@/view/components/richTextEditor';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { hasParagraphsContent } from '@/utils/paragraphUtils';

const Description: FC = () => {
	const { statement } = useContext(StatementContext);
	if (!statement || !hasParagraphsContent(statement.paragraphs)) {
		return null;
	}

	return (
		<div className="description">
			<ParagraphsDisplay statement={statement} />
		</div>
	);
};

export default Description;
