'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import ShareButtons from './ShareButtons';
import styles from './WizColAttribution.module.scss';

const WIZCOL_URL = 'https://wizcol.com/experience';

export default function WizColAttribution() {
  const { t, dir } = useTranslation();
  const logoSrc = dir === 'rtl' ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';

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
          src={logoSrc}
          alt="WizCol"
          className={styles.logoIcon}
          width={32}
          height={32}
        />
        <span className={styles.brandName}>{t('poweredByWizCol')}</span>
      </a>
      <span className={styles.tagline}>{t('discoverWizCol')}</span>
      <ShareButtons />
    </div>
  );
}
