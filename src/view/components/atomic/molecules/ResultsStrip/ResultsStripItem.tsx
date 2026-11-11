import React from 'react';
import clsx from 'clsx';
import Tooltip from '@/view/components/atomic/atoms/Tooltip';

export interface ResultsStripItemProps {
	value: string;
	label: string;
	/** What the number means. Opens on tap, hover and keyboard focus. */
	tip?: string;
	isPrimary?: boolean;
	isNegative?: boolean;
}

/** One number of a results strip, with its label and, when given, its explanation. */
const ResultsStripItem: React.FC<ResultsStripItemProps> = ({
	value,
	label,
	tip,
	isPrimary = false,
	isNegative = false,
}) => {
	const itemClasses = clsx(
		'results-strip__item',
		isPrimary && 'results-strip__item--primary',
		isNegative && 'results-strip__item--negative',
	);
	const body = (
		<>
			{/* dir="ltr" isolates the number: without it bidi reorders "50 / 500"
			    to "500 / 50" inside a Hebrew card and moves the sign of "−15". */}
			<span className="results-strip__value" dir="ltr">
				{value}
			</span>
			<span className="results-strip__label">{label}</span>
		</>
	);

	if (!tip) return <div className={itemClasses}>{body}</div>;

	return (
		<Tooltip content={tip} focusable className="results-strip__tip" triggerClassName={itemClasses}>
			{body}
		</Tooltip>
	);
};

export default ResultsStripItem;
