import { CSSProperties, FC, ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import styles from './EvaluationCircle.module.scss';

interface EvaluationCircleRowProps {
	/** Something is chosen: the other circles recede. */
	hasSelection: boolean;
	label: string;
	testId?: string;
	children: ReactNode;
}

/** The card's row of evaluation circles, centered with a fixed gap. */
export const EvaluationCircleRow: FC<EvaluationCircleRowProps> = ({
	hasSelection,
	label,
	testId,
	children,
}) => (
	<div
		className={clsx(styles.row, hasSelection && styles['row--has-selection'])}
		role="group"
		aria-label={label}
		data-testid={testId}
	>
		{children}
	</div>
);

interface EvaluationCircleProps {
	/** Any CSS colour or token; fills the circle. */
	color: string;
	isActive: boolean;
	disabled?: boolean;
	/** Accessible name; also the hover title. */
	label: string;
	/** Accessible name when the control is disabled (defaults to label). */
	disabledLabel?: string;
	onClick: () => void;
	testId?: string;
	/** Small tally shown under the circle. */
	count?: number;
	/** One-colour glyph that must read white on the fill (community voice ripples). */
	monoGlyph?: boolean;
	children: ReactNode;
}

/** One big filled circle: glyph inside, ring + check when chosen. */
export const EvaluationCircle: FC<EvaluationCircleProps> = ({
	color,
	isActive,
	disabled = false,
	label,
	disabledLabel,
	onClick,
	testId,
	count,
	monoGlyph = false,
	children,
}) => {
	const button = (
		<button
			type="button"
			className={clsx(
				styles.circle,
				isActive && styles['circle--active'],
				disabled && styles['circle--disabled'],
			)}
			style={{ '--face-color': color } as CSSProperties}
			onClick={disabled ? undefined : onClick}
			disabled={disabled}
			aria-disabled={disabled}
			aria-pressed={isActive}
			aria-label={disabled ? (disabledLabel ?? label) : label}
			title={label}
			data-testid={testId}
		>
			<span
				className={clsx(styles['circle__glyph'], monoGlyph && styles['circle__glyph--mono'])}
				aria-hidden="true"
			>
				{children}
			</span>
			{isActive && (
				<span className={styles['circle__check']} aria-hidden="true">
					<Check size={14} strokeWidth={3} />
				</span>
			)}
		</button>
	);

	if (count === undefined) return button;

	return (
		<span className={styles.item}>
			{button}
			<span className={styles.count} aria-hidden="true">
				{count}
			</span>
		</span>
	);
};
