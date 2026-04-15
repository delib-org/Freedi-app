'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import ShareButtons from './ShareButtons';
import styles from './WizColAttribution.module.scss';

const WIZCOL_URL = 'https://wizcol.com/experience';

export default function WizColAttribution() {
  const { t } = useTranslation();

  return (
    <div className={styles.attribution}>
      <a
        href={WIZCOL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.brandLink}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/wizcol-icon.svg"
          alt="WizCol"
          className={styles.logoIcon}
          width={16}
          height={16}
        />
        {t('poweredByWizCol')}
      </a>
      <span className={styles.tagline}>{t('discoverWizCol')}</span>
      <ShareButtons />
    </div>
  );
}
