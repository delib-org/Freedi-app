import React, { FC } from 'react';
import { useContext } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import EditableDescription from '@/view/components/edit/EditableDescription';
import styles from '../MultiStageQuestion.module.scss';

interface EmptyStateSectionProps {
  description?: string;
  imageUrl?: string;
}

export const EmptyStateSection: FC<EmptyStateSectionProps> = ({
  imageUrl,
}) => {
  const { statement } = useContext(StatementContext);

  return (
    <div className={`${styles.description} description`}>
      <EditableDescription
        statement={statement}
        placeholder="Add a description..."
      />
      {imageUrl && (
        <img src={imageUrl} alt="Statement visual representation" />
      )}
    </div>
  );
};