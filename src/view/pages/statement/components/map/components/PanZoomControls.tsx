import { FC, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import MinusIcon from '@/assets/icons/minusIcon.svg?react';
import TargetIcon from '@/assets/icons/target.svg?react';
import { findMapRoot, useMapFullScreen } from '../hooks/useMapFullScreen';
import styles from './PanZoomControls.module.scss';

interface Props {
	/** Current scale (1 = 100%). */
	scale: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	/** Fit the whole map within the view. */
	onFit: () => void;
	/** Keep the controls visible at the viewport edge while the map moves. */
	fixed?: boolean;
}

/**
 * Floating map controls: zoom in / out / fit, and full screen. The full-screen
 * button expands the nearest `[data-map-root]` ancestor, so every map that
 * renders these controls inside such a root gets it without wiring.
 */
const PanZoomControls: FC<Props> = ({ scale, onZoomIn, onZoomOut, onFit, fixed }) => {
	const { t } = useTranslation();
	const rootRef = useRef<HTMLDivElement>(null);
	const fullScreen = useMapFullScreen(rootRef);
	const [fixedLeft, setFixedLeft] = useState<number>();
	const className = fixed ? `${styles.controls} ${styles.fixed}` : styles.controls;

	useLayoutEffect(() => {
		if (!fixed) return;

		const root = findMapRoot(rootRef.current);
		if (!root) return;

		const updatePosition = () => setFixedLeft(Math.max(16, root.getBoundingClientRect().left + 16));
		updatePosition();
		window.addEventListener('resize', updatePosition);
		document.addEventListener('fullscreenchange', updatePosition);
		const resizeObserver =
			typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updatePosition);
		resizeObserver?.observe(root);

		return () => {
			window.removeEventListener('resize', updatePosition);
			document.removeEventListener('fullscreenchange', updatePosition);
			resizeObserver?.disconnect();
		};
	}, [fixed]);

	return (
		<div
			ref={rootRef}
			className={className}
			style={fixedLeft === undefined ? undefined : { left: fixedLeft }}
			data-no-pan
		>
			<button
				type="button"
				className={styles.button}
				onClick={onFit}
				aria-label={t('Fit to screen')}
				title={t('Fit to screen')}
			>
				<TargetIcon />
			</button>
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
			{fullScreen.available && (
				<button
					type="button"
					className={styles.button}
					onClick={fullScreen.toggle}
					aria-label={fullScreen.isFullScreen ? t('Exit full screen') : t('Full screen')}
					title={fullScreen.isFullScreen ? t('Exit full screen') : t('Full screen')}
					aria-pressed={fullScreen.isFullScreen}
				>
					{fullScreen.isFullScreen ? (
						<Minimize2 aria-hidden="true" />
					) : (
						<Maximize2 aria-hidden="true" />
					)}
				</button>
			)}
		</div>
	);
};

export default PanZoomControls;
