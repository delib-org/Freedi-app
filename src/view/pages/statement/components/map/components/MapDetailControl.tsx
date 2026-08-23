import { FC } from 'react';
import type { MapDetailLevel } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { MAP_DETAIL_LEVELS } from '../mapHelpers/detailLevel';
import styles from './MapDetailControl.module.scss';

const LEVEL_LABEL: Record<MapDetailLevel, string> = {
	themes: 'Themes',
	ideas: 'Ideas',
	everything: 'Everything',
};

interface Props {
	level: MapDetailLevel;
	onChange: (level: MapDetailLevel) => void;
	/** The admin pinned participants to the default depth. */
	disabled?: boolean;
	/** How many of the viewer's own statements are on the map (0 hides the button). */
	mineCount: number;
	onLocateMine: () => void;
	/** Theme › Merged idea › Your idea — shown after locating; empty hides it. */
	breadcrumb: string[];
	onDismissBreadcrumb: () => void;
}

/**
 * The shared "Detail" altitude control for both maps: Themes | Ideas |
 * Everything as a radio group, a "My ideas" locator, and the breadcrumb that
 * tells the viewer where their idea ended up.
 */
const MapDetailControl: FC<Props> = ({
	level,
	onChange,
	disabled = false,
	mineCount,
	onLocateMine,
	breadcrumb,
	onDismissBreadcrumb,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles.control}>
			<div className={styles.row}>
				<div
					className={styles.segmented}
					role="radiogroup"
					aria-label={t('Detail')}
					title={disabled ? t('The organizer set the detail level for this map') : undefined}
				>
					{MAP_DETAIL_LEVELS.map((value) => {
						const active = value === level;

						return (
							<button
								key={value}
								type="button"
								role="radio"
								aria-checked={active}
								disabled={disabled}
								className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
								onClick={() => onChange(value)}
							>
								{t(LEVEL_LABEL[value])}
							</button>
						);
					})}
				</div>
				{mineCount > 0 && (
					<button
						type="button"
						className={styles.mine}
						onClick={onLocateMine}
						title={t('Show where my ideas ended up')}
					>
						<span className={styles.mineDot} aria-hidden />
						{t('My ideas')}
					</button>
				)}
			</div>
			{breadcrumb.length > 0 && (
				<div className={styles.breadcrumb} role="status">
					{breadcrumb.map((title, index) => (
						<span key={`${index}-${title}`} className={styles.crumb}>
							{index > 0 && (
								<span className={styles.crumbSep} aria-hidden>
									›
								</span>
							)}
							<span
								className={index === breadcrumb.length - 1 ? styles.crumbMine : undefined}
								dir="auto"
							>
								{index === breadcrumb.length - 1 ? t('Your idea') : title}
							</span>
						</span>
					))}
					<button
						type="button"
						className={styles.crumbClose}
						aria-label={t('Close')}
						onClick={onDismissBreadcrumb}
					>
						×
					</button>
				</div>
			)}
		</div>
	);
};

export default MapDetailControl;
