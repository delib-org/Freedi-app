import { FC, useState } from 'react';
import type { MapDetailLevel } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { MAP_DETAIL_LEVELS } from '../mapHelpers/detailLevel';
import type { FoldControls } from '../mapHelpers/useFoldControls';
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
	/** Collapse / expand all and per level; omitted or maxLevel 0 hides the row. */
	fold?: FoldControls;
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
	fold,
}) => {
	const { t } = useTranslation();
	const [pickedLevel, setPickedLevel] = useState(1);
	const levelCount = fold?.maxLevel ?? 0;
	const foldLevel = Math.min(pickedLevel, Math.max(levelCount, 1));

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
			{fold && levelCount > 0 && (
				<div className={styles.foldRow}>
					<button
						type="button"
						className={styles.foldButton}
						disabled={disabled}
						onClick={fold.onCollapseAll}
					>
						{t('Collapse all')}
					</button>
					<button
						type="button"
						className={styles.foldButton}
						disabled={disabled}
						onClick={fold.onExpandAll}
					>
						{t('Expand all')}
					</button>
					{levelCount > 1 && (
						<>
							<select
								className={styles.foldSelect}
								aria-label={t('Level')}
								value={foldLevel}
								disabled={disabled}
								onChange={(ev) => setPickedLevel(Number(ev.target.value))}
							>
								{Array.from({ length: levelCount }, (_, index) => index + 1).map((value) => (
									<option key={value} value={value}>
										{`${t('Level')} ${value}`}
									</option>
								))}
							</select>
							<button
								type="button"
								className={styles.foldButton}
								disabled={disabled}
								onClick={() => fold.onCollapseLevel(foldLevel)}
							>
								{t('Collapse level')}
							</button>
							<button
								type="button"
								className={styles.foldButton}
								disabled={disabled}
								onClick={() => fold.onExpandLevel(foldLevel)}
							>
								{t('Expand level')}
							</button>
						</>
					)}
				</div>
			)}
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
