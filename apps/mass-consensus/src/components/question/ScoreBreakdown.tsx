'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { ClusterEvaluationLink } from '@freedi/shared-types';
import { Collections } from '@freedi/shared-types';
import { db } from '@/lib/firebase/client';
import { useTranslation } from '@freedi/shared-i18n/next';

/**
 * Counts-only score breakdown for MC cluster cards. Subscribes directly to
 * Firestore — MC is a Next.js client app without the main-app Redux store.
 *
 * Privacy: never displays user identities. Only aggregates per-original
 * vote counts + averages.
 */
export default function ScoreBreakdown({ clusterId }: { clusterId: string }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ClusterEvaluationLink[]>([]);

  useEffect(() => {
    if (!clusterId) return;
    const q = query(
      collection(db, Collections.clusterEvaluationLinks),
      where('clusterId', '==', clusterId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: ClusterEvaluationLink[] = [];
      snap.forEach((d) => next.push(d.data() as ClusterEvaluationLink));
      setLinks(next);
    });

    return () => unsub();
  }, [clusterId]);

  const stats = useMemo(() => {
    let direct = 0;
    let inherited = 0;
    const originals = new Set<string>();
    for (const link of links) {
      if (link.direct) direct++;
      for (const ih of link.inheritedFrom) {
        inherited++;
        originals.add(ih.sourceStatementId);
      }
    }

    return {
      evaluators: links.length,
      direct,
      inherited,
      originals: originals.size,
    };
  }, [links]);

  if (stats.evaluators === 0) return null;

  const summary = t(
    '{count} evaluators · {direct} direct + {inherited} inherited from {originals} originals',
  )
    .replace('{count}', String(stats.evaluators))
    .replace('{direct}', String(stats.direct))
    .replace('{inherited}', String(stats.inherited))
    .replace('{originals}', String(stats.originals));

  return (
    <div
      style={{
        marginTop: 'var(--spacing-xs, 0.4rem)',
        fontSize: '0.72rem',
        color: 'var(--text-secondary, #666)',
        opacity: 0.85,
      }}
    >
      {summary}
    </div>
  );
}
