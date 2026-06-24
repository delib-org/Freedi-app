import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import MinusIcon from '@/assets/icons/minusIcon.svg?react';
import TargetIcon from '@/assets/icons/target.svg?react';
import styles from './PanZoomControls.module.scss';

interface Props {
	/** Current scale (1 = 100%). */
	scale: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	/** Fit the whole map within the view. */
	onFit: () => void;
	/** Anchor to the viewport (position: fixed) instead of the nearest container. */
	fixed?: boolean;
	/** Which bottom corner to dock in. Defaults to the trailing (end) edge. */
	align?: 'start' | 'end';
}

/** Floating zoom controls (in / out / fit) for the map canvas. */
const PanZoomControls: FC<Props> = ({
	scale,
	onZoomIn,
	onZoomOut,
	onFit,
	fixed,
	align = 'end',
}) => {
	const { t } = useTranslation();
	const classes = [
		styles.controls,
		fixed ? styles.fixed : '',
		align === 'start' ? styles.alignStart : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={classes} data-no-pan>
			<button type="button" className={styles.button} onClick={onZoomIn} aria-label={t('Zoom in')}>
				<PlusIcon />
			</button>
			<span className={styles.level} aria-hidden>
				{Math.round(scale * 100)}%
			</span>
			<button
				type="button"
				className={styles.button}
				onClick={onZoomOut}
				aria-label={t('Zoom out')}
			>
				<MinusIcon />
			</button>
			<button
				type="button"
				className={styles.button}
				onClick={onFit}
				aria-label={t('Fit to screen')}
				title={t('Fit to screen')}
			>
				<TargetIcon />
			</button>
		</div>
	);
};

export default PanZoomControls;
