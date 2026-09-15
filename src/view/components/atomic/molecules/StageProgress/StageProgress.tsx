import { FC } from 'react';
import clsx from 'clsx';
import styles from './StageProgress.module.scss';

export interface StageProgressProps {
	/** Stage labels in order (e.g. אוספים · מדרגים · מצביעים · הוחלט). */
	stages: readonly string[];
	/** Index of the current stage. Earlier stages read as done, later as future. */
	activeIndex: number;
	/** Accessible name, e.g. "Question stage". */
	ariaLabel: string;
	className?: string;
}

/**
 * StageProgress molecule — four equal segments with a label under each, on the
 * lilac question header. Done = violet, active = header ink, future = track.
 * An ordered list with aria-current="step" on the active stage.
 */
const StageProgress: FC<StageProgressProps> = ({ stages, activeIndex, ariaLabel, className }) => (
	<ol
		className={clsx(styles.stages, className)}
		aria-label={ariaLabel}
		data-testid="stage-progress"
	>
		{stages.map((label, index) => {
			const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'future';

			return (
				<li
					key={label}
					className={clsx(styles.stages__stage, styles[`stages__stage--${state}`])}
					aria-current={state === 'active' ? 'step' : undefined}
					data-state={state}
				>
					<span className={styles.stages__bar} aria-hidden="true" />
					<span className={styles.stages__label}>{label}</span>
				</li>
			);
		})}
	</ol>
);

export default StageProgress;
