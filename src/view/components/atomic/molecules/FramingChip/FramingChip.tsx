import React from 'react';
import clsx from 'clsx';
import { Layers, Sparkles, Tags, Loader2 } from 'lucide-react';

export type FramingChipPipeline = 'flat' | 'synthesis' | 'topic' | 'semantic' | 'custom';

export interface FramingChipProps {
	label: string;
	count?: number;
	pipeline?: FramingChipPipeline;
	active?: boolean;
	disabled?: boolean;
	loading?: boolean;
	stale?: boolean;
	title?: string;
	onClick?: () => void;
	className?: string;
	/** When true the count badge is hidden even if `count` is supplied. */
	hideCount?: boolean;
}

function pipelineIcon(pipeline: FramingChipPipeline): React.ReactNode {
	switch (pipeline) {
		case 'synthesis':
			return <Sparkles size={14} aria-hidden />;
		case 'topic':
			return <Tags size={14} aria-hidden />;
		case 'semantic':
		case 'custom':
			return <Layers size={14} aria-hidden />;
		default:
			return null;
	}
}

const FramingChip: React.FC<FramingChipProps> = ({
	label,
	count,
	pipeline = 'flat',
	active = false,
	disabled = false,
	loading = false,
	stale = false,
	title,
	onClick,
	className,
	hideCount = false,
}) => {
	const classes = clsx(
		'framing-chip',
		active && 'framing-chip--active',
		disabled && 'framing-chip--disabled',
		pipeline !== 'flat' && `framing-chip--${pipeline}`,
		className,
	);

	const showCount = !hideCount && typeof count === 'number';

	return (
		<button
			type="button"
			className={classes}
			onClick={disabled ? undefined : onClick}
			disabled={disabled}
			aria-pressed={active}
			title={title}
		>
			{pipelineIcon(pipeline) && (
				<span className="framing-chip__icon">{pipelineIcon(pipeline)}</span>
			)}
			<span className="framing-chip__label">{label}</span>
			{loading ? (
				<span className="framing-chip__spinner" aria-hidden>
					<Loader2 size={14} />
				</span>
			) : (
				showCount && <span className="framing-chip__count">{count}</span>
			)}
			{stale && !loading && (
				<span
					className="framing-chip__dot framing-chip__dot--stale"
					title={title}
					aria-label={title}
				/>
			)}
		</button>
	);
};

export default FramingChip;
