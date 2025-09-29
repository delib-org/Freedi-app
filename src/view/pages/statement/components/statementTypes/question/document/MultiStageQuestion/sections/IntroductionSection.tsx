import React, { FC } from 'react';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import newOptionGraphic from '@/assets/images/newOptionGraphic.png';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';
import styles from '../MultiStageQuestion.module.scss';

interface IntroductionSectionProps {
  statement: Statement;
}

export const IntroductionSection: FC<IntroductionSectionProps> = ({ statement }) => {
  const { t } = useUserConfig();

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
        <h5>{statement.description}</h5>
      </div>
    </div>
  );
};