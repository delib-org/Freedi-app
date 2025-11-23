import React, { FC } from 'react';
import { Statement } from 'delib-npm';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import newOptionGraphic from '@/assets/images/newOptionGraphic.png';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';
import EditableDescription from '@/view/components/edit/EditableDescription';
import styles from '../MultiStageQuestion.module.scss';

interface IntroductionSectionProps {
  statement: Statement;
}

export const IntroductionSection: FC<IntroductionSectionProps> = ({ statement }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.stageCard} id="introduction">
      <div className={styles.imgContainer}>
        <img
          draggable={false}
          src={newOptionGraphic}
          alt={t("New Option Graphic")}
          className={styles.graphic}
        />
      </div>
      <div className={styles.multiStageTitle}>
        <h3>{statement.statement}</h3>
      </div>
      <div className={styles.topicDescription}>
        <InfoIcon />
        <h4>{t("Topic description")}</h4>
      </div>
      <div className={styles.subDescription}>
        <EditableDescription
          statement={statement}
          placeholder={t("Add a description...")}
        />
      </div>
    </div>
  );
};