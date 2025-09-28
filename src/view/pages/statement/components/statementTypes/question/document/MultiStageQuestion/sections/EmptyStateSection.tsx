import React, { FC } from 'react';
import Text from '@/view/components/text/Text';
import styles from '../MultiStageQuestion.module.scss';

interface EmptyStateSectionProps {
  description?: string;
  imageUrl?: string;
}

export const EmptyStateSection: FC<EmptyStateSectionProps> = ({
  description,
  imageUrl,
}) => {
  return (
    <div className={`${styles.description} description`}>
      <Text description={description} fontSize="1.2rem" />
      {imageUrl && (
        <img src={imageUrl} alt="Statement visual representation" />
      )}
    </div>
  );
};