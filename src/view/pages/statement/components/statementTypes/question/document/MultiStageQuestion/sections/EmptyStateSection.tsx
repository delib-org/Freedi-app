import React, { FC } from 'react';
import { useContext } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import EditableDescription from '@/view/components/edit/EditableDescription';
import { hasParagraphsContent } from '@/utils/paragraphUtils';
import styles from '../MultiStageQuestion.module.scss';

interface EmptyStateSectionProps {
	description?: string;
	imageUrl?: string;
}

export const EmptyStateSection: FC<EmptyStateSectionProps> = ({ imageUrl }) => {
	const { statement } = useContext(StatementContext);

	// Check if there's actual description content
	const hasDescription = hasParagraphsContent(statement?.paragraphs);

	// Use different class to hide entire wrapper on mobile when empty
	const wrapperClass =
		hasDescription || imageUrl
			? `${styles.description} description wrapper`
			: `${styles.description} ${styles.descriptionEmpty} description wrapper`;

	return (
		<div className={wrapperClass}>
			<EditableDescription statement={statement} placeholder="Add a description..." />
			{imageUrl && <img src={imageUrl} alt="Statement visual representation" />}
		</div>
	);
};
