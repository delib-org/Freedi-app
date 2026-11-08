import { FC, useState, useRef } from 'react';
import styles from './Dot.module.scss';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import { MapScale, placeDot } from '../dotPlacement';

interface Props {
	subStatement: Statement;
	maxEvaluators: number;
	scale: MapScale;
}

const Dot: FC<Props> = ({ subStatement, maxEvaluators, scale }) => {
	const { t } = useTranslation();
	const randomX = useRef<number>(Math.random() * 0.04);
	const randomY = useRef<number>(Math.random() * 0.04);
	const [show, setShow] = useState(false);

	// Early return if evaluation data is missing
	if (!subStatement.evaluation) return null;

	const { sumCon, sumPro, numberOfEvaluators } = subStatement.evaluation;
	if (sumCon === undefined || sumPro === undefined || numberOfEvaluators === undefined) return null;

	const agreement = (sumPro - sumCon) / numberOfEvaluators;
	const { pro, con, fillOpacity } = placeDot(
		{ sumPro, sumCon, numberOfEvaluators },
		maxEvaluators,
		scale,
	);
	const bottom = con + randomX.current;
	const left = pro + randomY.current;
	const color = `var(${fromAgreementToColor(agreement, agreementColors)})`;
	// Only the fill fades with certainty; the stroke stays as is.
	const backgroundColor =
		fillOpacity < 1
			? `color-mix(in srgb, ${color} ${Math.round(fillOpacity * 100)}%, transparent)`
			: color;

	function handleShowTooltip(isShow: boolean) {
		setShow(isShow);
	}

	return (
		<button
			key={subStatement.statementId}
			className={styles.dot}
			style={{
				bottom: `${bottom * 90}%`,
				left: `${left * 90}%`,
				backgroundColor,
			}}
			onMouseEnter={() => handleShowTooltip(true)}
			onMouseLeave={() => handleShowTooltip(false)}
		>
			{show && (
				<div className={`${styles.tooltip} ${left > 0.5 && styles['tooltip--left']}`}>
					<div className={styles['tooltip__title']}>{subStatement.statement}</div>
					<div>
						{t('Support')}: {sumPro}
					</div>
					<div>
						{t('Against')}: {sumCon}
					</div>
					<div>
						{t('Voters')}: {numberOfEvaluators}
					</div>
				</div>
			)}
		</button>
	);
};

export default Dot;

const agreementColors = [
	'--range-objections-100',
	'--range-objections-60',
	'--range-objections-30',
	'--range-conflict-100',
	'--range-conflict-60',
	'--range-conflict-30',
	'--range-positive-30',
	'--range-positive-60',
	'--range-positive-100',
];

function fromAgreementToColor(agreement: number, agreementColors: string[]): string | undefined {
	try {
		// Clamp to [-1, 1] as defense against corrupted evaluation data
		const clamped = Math.max(-1, Math.min(1, agreement));

		const adjustAgreement = (clamped + 1) / 2;

		const index = Math.floor(adjustAgreement * agreementColors.length * 0.99);

		return agreementColors[index];
	} catch (error) {
		logError(error, { operation: 'dot.Dot.adjustAgreement' });

		return undefined;
	}
}
