import { FC, memo, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import Dot from './dot/Dot';
import styles from './Triangle.module.scss';
import { statementOptionsSelector, statementSelector } from '@/redux/statements/statementsSlice';
import { Statement } from '@freedi/shared-types';
import { useParams } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { LoadAllBanner } from '@/view/components/atomic/molecules/LoadAllBanner';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import { MAP_SCALES, MapScale } from './dotPlacement';

const SCALE_LABELS: Record<MapScale, string> = {
	absolute: 'Totals',
	average: 'Average',
};

function isMapScale(id: string): id is MapScale {
	return (MAP_SCALES as string[]).includes(id);
}

const Triangle: FC = () => {
	const { t } = useTranslation();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [scale, setScale] = useState<MapScale>('absolute');

	const statementsFromStore = useSelector(statementOptionsSelector(statement?.statementId));

	// Filter out hidden options - agreement map should only show visible options
	const subStatements: Statement[] = useMemo(
		() =>
			statementsFromStore.filter(
				(s: Statement) => s.evaluation?.sumCon !== undefined && s.hide !== true,
			),
		[statementsFromStore],
	);

	// Return early if statement is not found
	if (!statement || !statementId) {
		return (
			<div className={styles.triangleScreen}>
				<div className={styles.triangle__loading}>{t('Loading statement data...')}</div>
			</div>
		);
	}

	let maxEvaluators = 0;
	subStatements.forEach((subStatement: Statement) => {
		if (
			subStatement.evaluation?.numberOfEvaluators !== undefined &&
			subStatement.evaluation?.numberOfEvaluators > maxEvaluators
		)
			maxEvaluators = subStatement.evaluation.numberOfEvaluators;
	});

	return (
		<div className={styles.triangleScreen}>
			<LoadAllBanner rootId={statementId} mode="direct" />
			<div className={styles.scaleBar}>
				<SegmentedControl
					segments={MAP_SCALES.map((id) => ({ id, label: t(SCALE_LABELS[id]) }))}
					activeId={scale}
					onChange={(id) => isMapScale(id) && setScale(id)}
					ariaLabel={t('Map scale')}
				/>
				{scale === 'average' && (
					<span className={styles.scaleHint}>{t('Fuller dot = more evaluators')}</span>
				)}
			</div>
			<div className={styles.triangleCanvas}>
				<div className={styles.triangle}></div>
				<div className={`${styles.triangle} ${styles['triangle--invisible']}`}>
					{subStatements.map((subStatement: Statement) => {
						return (
							<Dot
								key={subStatement.statementId}
								subStatement={subStatement}
								maxEvaluators={maxEvaluators}
								scale={scale}
							/>
						);
					})}
					<span className={styles.xAxis}>{t('Agreements')}</span>
					<span className={styles.yAxis}>{t('Objections')}</span>
					<span className={styles.conflicts}>{t('Conflicts')}</span>
					<span className={styles.abstention}>{t('Abstention')}</span>
					<span className={styles.totalEvaluators}>
						{t('Total evaluators')}: {statement?.totalEvaluators ?? 0}
					</span>
				</div>
			</div>
		</div>
	);
};

export default memo(Triangle);
