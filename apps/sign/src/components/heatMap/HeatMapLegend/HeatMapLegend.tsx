'use client';

import clsx from 'clsx';
import { useHeatMapStore, selectHeatMapConfig, selectIsHeatMapLoading } from '@/store/heatMapStore';
import { HeatMapType, HeatLevel } from '@/types/heatMap';
import styles from './HeatMapLegend.module.scss';

interface HeatMapLegendProps {
  className?: string;
}

interface LegendConfig {
  title: string;
  lowLabel: string;
  highLabel: string;
  levels: Array<{
    level: HeatLevel;
    label: string;
  }>;
}

const LEGEND_CONFIGS: Record<Exclude<HeatMapType, 'none'>, LegendConfig> = {
  approval: {
    title: 'Approval Score',
    lowLabel: 'Rejected',
    highLabel: 'Approved',
    levels: [
      { level: 1, label: '-1 to -0.5' },
      { level: 2, label: '-0.5 to -0.1' },
      { level: 3, label: '-0.1 to +0.1' },
      { level: 4, label: '+0.1 to +0.5' },
      { level: 5, label: '+0.5 to +1' },
    ],
  },
  comments: {
    title: 'Comments',
    lowLabel: 'Few',
    highLabel: 'Many',
    levels: [
      { level: 1, label: '1' },
      { level: 2, label: '2-4' },
      { level: 3, label: '5-9' },
      { level: 4, label: '10-19' },
      { level: 5, label: '20+' },
    ],
  },
  rating: {
    title: 'Average Rating',
    lowLabel: 'Low',
    highLabel: 'High',
    levels: [
      { level: 1, label: '0-1.4' },
      { level: 2, label: '1.5-2.4' },
      { level: 3, label: '2.5-3.4' },
      { level: 4, label: '3.5-4.4' },
      { level: 5, label: '4.5-5.0' },
    ],
  },
  viewership: {
    title: 'Viewers',
    lowLabel: 'Few',
    highLabel: 'Many',
    levels: [
      { level: 1, label: '<20%' },
      { level: 2, label: '20-39%' },
      { level: 3, label: '40-59%' },
      { level: 4, label: '60-79%' },
      { level: 5, label: '80%+' },
    ],
  },
  suggestions: {
    title: 'Suggestions',
    lowLabel: 'Few',
    highLabel: 'Many',
    levels: [
      { level: 1, label: '1' },
      { level: 2, label: '2-3' },
      { level: 3, label: '4-6' },
      { level: 4, label: '7-10' },
      { level: 5, label: '11+' },
    ],
  },
};

export default function HeatMapLegend({ className }: HeatMapLegendProps) {
  const config = useHeatMapStore(selectHeatMapConfig);
  const isLoading = useHeatMapStore(selectIsHeatMapLoading);

  // Don't render if heat map is disabled or type is 'none'
  if (!config.isEnabled || config.type === 'none' || !config.showLegend) {
    return null;
  }

  const legendConfig = LEGEND_CONFIGS[config.type];

  return (
    <div
      className={clsx(styles.legend, styles[config.type], className)}
      role="region"
      aria-label={`${legendConfig.title} heat map legend`}
    >
      <div className={styles.header}>
        <h4 className={styles.title}>{legendConfig.title}</h4>
        {isLoading && (
          <span className={styles.loadingIndicator} aria-label="Loading heat map data">
            Loading...
          </span>
        )}
      </div>

      <div className={styles.scale} role="list" aria-label="Heat intensity levels">
        {legendConfig.levels.map(({ level, label }) => (
          <div
            key={level}
            className={clsx(styles.level, styles[`level-${level}`])}
            role="listitem"
          >
            <div
              className={styles.colorSwatch}
              aria-hidden="true"
            />
            <span className={styles.label}>{label}</span>
          </div>
        ))}
      </div>

      <div className={styles.scaleLabels}>
        <span>{legendConfig.lowLabel}</span>
        <span>{legendConfig.highLabel}</span>
      </div>
    </div>
  );
}
