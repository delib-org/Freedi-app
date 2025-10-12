import { FC } from 'react';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';
import styles from '../MultiStageQuestion.module.scss';

interface IntroductionSectionProps {
  statement: Statement;
}

export const IntroductionSection: FC<IntroductionSectionProps> = ({ statement }) => {
  const { t } = useUserConfig();

  return (
    <div className={styles.stageCard} id="introduction">
      <div className={styles.topicDescription}>
        <div className={styles.icon}>
          <InfoIcon />
        </div>
        <h2>{t("Topic description")}</h2>
      </div>
      <div className={styles.subDescription}>
        <h5>{statement.description}</h5>
      </div>
    </div>
  );
};