import {
	ChangeEvent,
	FC,
	MouseEvent,
	TouchEvent,
	useState,
} from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import RadioButtonWithLabel from '@/view/components/radioButtonWithLabel/RadioButtonWithLabel';
import styles from './ChoseBySettings.module.scss';
import { StatementSettingsProps } from '../../settingsTypeHelpers';

import { useDispatch } from 'react-redux';

import {
	ChoseByEvaluationType,
	CutoffBy,
	CutoffType,
	ResultsBy,
} from 'delib-npm';
import { updateResultSettingsToDB } from '@/controllers/db/statements/setResultSettings';
import { updateStoreResultsSettings } from '@/redux/statements/statementsSlice';

interface RangeProps {
	maxValue: number;
	minValue: number;
	step: number;
	value: number;
}

const ChoseBySettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useUserConfig();
	const dispatch = useDispatch();
	const { resultsSettings } = statement;

	const [rangeProps, setRangeProps] = useState<RangeProps>({
		maxValue: 20,
		minValue: 1,
		step: 1,
		value: resultsSettings.cutoffNumber ?? 0,
	});

	// useEffect(() => {
	// 	if (choseBy?.cutoffType === CutoffType.topOptions) {
	// 		setRangeProps({
	// 			maxValue: 20,
	// 			minValue: 1,
	// 			step: 1,
	// 			value: choseBy?.number ?? 0,
	// 		});
	// 		dispatch(
	// 			setChoseBy({ ...choseBy, number: Math.ceil(choseBy.number) })
	// 		);
	// 	} else if (choseBy?.cutoffType === CutoffType.cutoffValue) {
	// 		setRangeProps({
	// 			maxValue: 10,
	// 			minValue: -10,
	// 			step: 0.1,
	// 			value: choseBy?.number ?? 0,
	// 		});
	// 	}
	// }, [choseBy, dispatch]);

	function handleEvaluationChange(e: ChangeEvent<HTMLInputElement>) {
		if (!e.target.id) return;

		const newResultsSettings = {
			...resultsSettings,
			resultsBy: e.target.id as ResultsBy,
		};
		dispatch(updateStoreResultsSettings({ statementId: statement.statementId, resultsSettings: newResultsSettings }));

	}

	function handleCutoffChange(e: ChangeEvent<HTMLInputElement>) {
		if (!e.target.id) return;

		const newResultsSettings = {
			...resultsSettings,
			cutOffBy: e.target.id as CutoffBy,
		};
		dispatch(updateStoreResultsSettings({ statementId: statement.statementId, resultsSettings: newResultsSettings }));

	}

	function handleRangeChange(
		e:
			| ChangeEvent<HTMLInputElement>
			| MouseEvent<HTMLInputElement>
			| TouchEvent<HTMLInputElement>
	) {

		const valueAsNumber = (e.target as HTMLInputElement).valueAsNumber;

		setRangeProps({
			...rangeProps,
			value: getValue(valueAsNumber),
		});

		const newResultsSettings = {
			...resultsSettings,
			numberOfResults: getValue(valueAsNumber),
		};

		if (e.type === 'mouseup' || e.type === 'touchend') {
			updateResultSettingsToDB(statement.statementId, newResultsSettings)

			dispatch(updateStoreResultsSettings({ statementId: statement.statementId, resultsSettings: newResultsSettings }));
		}
	}

	function getValue(value: number) {
		return resultsSettings.cutoffBy === CutoffBy.aboveThreshold
			? (value ?? 0)
			: Math.ceil(value ?? 0);
	}

	return (
		<div className={styles.choseBy}>
			<h2>{t('Options Selection Criteria')}</h2>
			<section>
				<h3 className='title'>
					{t('How to evaluate and select top options')}
				</h3>
				<RadioButtonWithLabel
					id={ChoseByEvaluationType.consensus}
					labelText={t('By Consensus')}
					checked={resultsSettings?.resultsBy === ResultsBy.consensus}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ChoseByEvaluationType.likes}
					labelText={t('By most liked')}
					checked={resultsSettings?.resultsBy === ResultsBy.mostLiked}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ChoseByEvaluationType.likesDislikes}
					labelText={t('By sum liked - disliked')}
					checked={resultsSettings?.resultsBy === ResultsBy.averageLikesDislikes}
					onChange={handleEvaluationChange}
				/>
			</section>
			<section>
				<h3 className='title'>
					{t('Method of selecting leading options')}
				</h3>
				<RadioButtonWithLabel
					id={CutoffType.topOptions}
					labelText={`${t('Top results')}`}
					checked={resultsSettings.cutoffBy === CutoffBy.topOptions}
					onChange={handleCutoffChange}
				/>
				<RadioButtonWithLabel
					id={CutoffType.cutoffValue}
					labelText={`${t('Above specific value')}`}
					checked={resultsSettings.cutoffBy === CutoffBy.aboveThreshold}
					onChange={handleCutoffChange}
				/>
			</section>
			<section>
				<div className='title'>{t('Value')}</div>
				<div className={styles.range}>
					<span>{rangeProps.minValue}</span>
					<input
						className='range'
						type='range'
						aria-label='Number Of Results'
						name='numberOfResults'
						value={rangeProps?.value}
						min={rangeProps.minValue}
						max={rangeProps.maxValue}
						step={rangeProps.step}
						onChange={handleRangeChange}
						onMouseUp={handleRangeChange}
						onTouchEnd={handleRangeChange}
					/>
					<span>{rangeProps.maxValue}</span>
				</div>
				<div className={styles.cutoffValue}>{rangeProps.value}</div>
			</section>
		</div>
	);
};

export default ChoseBySettings;
