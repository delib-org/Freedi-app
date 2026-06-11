'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './QuestionHeader.module.css';

interface ParticipationFunnelProps {
  statementId: string;
}

interface ParticipationStats {
  enteredCount: number;
  creatorCount: number;
  evaluatorCount: number;
}

function formatCompact(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Quiet participation funnel line: "18 entered · 13 suggested · 9 evaluated".
 * People counts only — never agreement/consensus values (MC product rule).
 * Renders nothing while loading, on error, or when all counts are zero.
 */
export default function ParticipationFunnel({ statementId }: ParticipationFunnelProps) {
  const { t, tWithParams, currentLanguage } = useTranslation();
  const [stats, setStats] = useState<ParticipationStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/statements/${statementId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ParticipationStats | null) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => {
        // Tertiary info: never show an error state
      });

    return () => {
      cancelled = true;
    };
  }, [statementId]);

  if (!stats) return null;

  const locale = currentLanguage || 'en';
  const segments: string[] = [];

  if (stats.enteredCount > 0) {
    segments.push(
      tWithParams('{{count}} entered', { count: formatCompact(stats.enteredCount, locale) })
    );
  }
  if (stats.creatorCount > 0) {
    segments.push(
      tWithParams('{{count}} suggested', { count: formatCompact(stats.creatorCount, locale) })
    );
  }
  if (stats.evaluatorCount > 0) {
    segments.push(
      tWithParams('{{count}} evaluated', { count: formatCompact(stats.evaluatorCount, locale) })
    );
  }

  if (segments.length === 0) return null;

  const ariaLabel = `${t('Participation')}: ${segments.join(', ')}`;

  return (
    <p className={styles.participation} aria-label={ariaLabel}>
      {segments.map((segment) => (
        <span key={segment} className={styles.participationSegment} aria-hidden="true">
          {segment}
        </span>
      ))}
    </p>
  );
}
