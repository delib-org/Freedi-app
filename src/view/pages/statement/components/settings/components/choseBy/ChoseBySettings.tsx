import {
	ChangeEvent,
	FC,
	MouseEvent,
	TouchEvent,
	useState,
} from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import RadioButtonWithLabel from '@/view/components/radioButtonWithLabel/RadioButtonWithLabel';
import styles from './ChoseBySettings.module.scss';
import { StatementSettingsProps } from '../../settingsTypeHelpers';

import { useSelector } from 'react-redux';

import {
	CutoffBy,
	ResultsBy,
	Statement,
} from '@freedi/shared-types';
import { updateResultSettingsToDB } from '@/controllers/db/statements/setResultSettings';
import { statementSelector } from '@/redux/statements/statementsSlice';
import SectionTitle from '../sectionTitle/SectionTitle';

interface RangeProps {
	maxValue: number;
	minValue: number;
	step: number;
	value: number;
}

interface RangeConfig {
	min: number;
	max: number;
	step: number;
	suffix: string;
	convert: (displayValue: number) => number;
	reverse: (storedValue: number) => number;
}

function getRangeConfig(resultsBy: ResultsBy): RangeConfig {
	switch (resultsBy) {
		case ResultsBy.consensus:
			return {
				min: -100,
				max: 100,
				step: 5,
				suffix: '%',
				convert: (v: number) => v / 100,
				reverse: (v: number) => v * 100,
			};
		case ResultsBy.mostLiked:
			return {
				min: 0,
				max: 100,
				step: 1,
				suffix: '',
				convert: (v: number) => v,
				reverse: (v: number) => v,
			};
		case ResultsBy.averageLikesDislikes:
			return {
				min: -100,
				max: 100,
				step: 1,
				suffix: '',
				convert: (v: number) => v,
				reverse: (v: number) => v,
			};
		default:
			return {
				min: -100,
				max: 100,
				step: 5,
				suffix: '%',
				convert: (v: number) => v / 100,
				reverse: (v: number) => v * 100,
			};
	}
}

const ChoseBySettings: FC<StatementSettingsProps> = ({ statement: _statement }) => {
	const { t } = useTranslation();
	const statement = useSelector(statementSelector(_statement.statementId)) as Statement;
	const [rangeProps, setRangeProps] = useState<RangeProps>({
		maxValue: 20,
		minValue: 1,
		step: 1,
		value: statement?.resultsSettings?.cutoffNumber ?? 1,
	});
	
	if (!statement) return null;
	const { resultsSettings } = statement;

	function handleEvaluationChange(e: ChangeEvent<HTMLInputElement>) {
		if (!e.target.id) return;

		const newResultsSettings = {
			...resultsSettings,
			resultsBy: e.target.id as ResultsBy,
		};
		// dispatch(updateStoreResultsSettings({ statementId: statement.statementId, resultsSettings: newResultsSettings }));
		updateResultSettingsToDB(statement.statementId, newResultsSettings)
	}

	function handleCutoffChange(e: ChangeEvent<HTMLInputElement>) {
		if (!e.target.id) return;

		const newResultsSettings = {
			...resultsSettings,
			cutoffBy: e.target.id as CutoffBy,
		};

		// dispatch(updateStoreResultsSettings({ statementId: statement.statementId, resultsSettings: newResultsSettings }));
		updateResultSettingsToDB(statement.statementId, newResultsSettings)
	}

	function handleRangeChange(
		e:
			| ChangeEvent<HTMLInputElement>
			| MouseEvent<HTMLInputElement>
			| TouchEvent<HTMLInputElement>
	) {
		const displayValue = (e.target as HTMLInputElement).valueAsNumber;

		setRangeProps({
			...rangeProps,
			value: displayValue,
		});

		let newResultsSettings;

		if (resultsSettings.cutoffBy === CutoffBy.topOptions) {
			newResultsSettings = {
				...resultsSettings,
				numberOfResults: Math.ceil(displayValue ?? 0),
			};
		} else if (resultsSettings.cutoffBy === CutoffBy.aboveThreshold) {
			const rangeConfig = getRangeConfig(resultsSettings.resultsBy);
			const storedValue = rangeConfig.convert(displayValue ?? 0);

			newResultsSettings = {
				...resultsSettings,
				cutoffNumber: storedValue,
			};
		}

		if (newResultsSettings && (e.type === 'mouseup' || e.type === 'touchend')) {
			updateResultSettingsToDB(statement.statementId, newResultsSettings);
		}
	}

	return (
		<div className={styles.choseBy}>
			<SectionTitle title={t('Options Selection Criteria')} />
			<section>
				<h3 className='title'>
					{t('How to evaluate and select top options')}
				</h3>
				<RadioButtonWithLabel
					id={ResultsBy.consensus}
					name='resultsBy'
					labelText={t('By Consensus')}
					checked={resultsSettings?.resultsBy === ResultsBy.consensus}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ResultsBy.mostLiked}
					name='resultsBy'
					labelText={t('By most liked')}
					checked={resultsSettings?.resultsBy === ResultsBy.mostLiked}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ResultsBy.averageLikesDislikes}
					name='resultsBy'
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
					id={CutoffBy.topOptions}
					name='cutoffBy'
					labelText={`${t('Top results')}`}
					checked={resultsSettings.cutoffBy === CutoffBy.topOptions}
					onChange={handleCutoffChange}
				/>
				<RadioButtonWithLabel
					id={CutoffBy.aboveThreshold}
					name='cutoffBy'
					labelText={`${t('Above specific value')}`}
					checked={resultsSettings.cutoffBy === CutoffBy.aboveThreshold}
					onChange={handleCutoffChange}
				/>
			</section>
			<section>
				{resultsSettings.cutoffBy === CutoffBy.topOptions ? (
					<TopOptionsRange statement={statement} handleRangeChange={handleRangeChange} />
				) : (
					<AboveThresholdRange statement={statement} handleRangeChange={handleRangeChange} />
				)}
			</section>
		</div>
	);
};

export default ChoseBySettings;

interface ComponentRangeProps {
	statement: Statement;
	handleRangeChange: (e: ChangeEvent<HTMLInputElement> | MouseEvent<HTMLInputElement> | TouchEvent<HTMLInputElement>) => void;
}

function TopOptionsRange({ statement: statement, handleRangeChange }: ComponentRangeProps) {
	const { t } = useTranslation();
	const [value, setValue] = useState<number>(statement.resultsSettings.numberOfResults ?? 1);
	const rangeProps = {
		maxValue: 20,
		minValue: 1,
		step: 1
	};

	return (
		<>
			<div className='title'>{t('Top options to be selected')}: {value}</div>
			<div className={styles.range}>
				<span>{rangeProps.minValue}</span>
				<input
					className='range'
					type='range'
					aria-label='Number Of Results'
					name='numberOfResults'
					defaultValue={value}
					min={rangeProps.minValue}
					max={rangeProps.maxValue}
					step={rangeProps.step}
					onChange={(e) => setValue((e.target as HTMLInputElement).valueAsNumber)}
					onMouseUp={handleRangeChange}
					onTouchEnd={handleRangeChange}
				/>
				<span>{rangeProps.maxValue}</span>
			</div>
		</>
	)
}
function AboveThresholdRange({ statement, handleRangeChange }: ComponentRangeProps) {
	const { t } = useTranslation();
	const { resultsBy, cutoffNumber } = statement.resultsSettings;
	const rangeConfig = getRangeConfig(resultsBy);

	const getInitialDisplayValue = (): number => {
		const storedValue = cutoffNumber ?? 0;

		if (resultsBy === ResultsBy.consensus) {
			if (storedValue > 1 || storedValue < -1) {
				return 0;
			}

			return rangeConfig.reverse(storedValue);
		}

		return storedValue;
	};

	const [displayValue, setDisplayValue] = useState<number>(getInitialDisplayValue());

	const formatDisplayValue = (val: number): string => {
		return rangeConfig.suffix ? `${val}${rangeConfig.suffix}` : String(val);
	};

	return (
		<>
			<div className='title'>
				{t('The score to be considered as a top option')}: {formatDisplayValue(displayValue)}
			</div>
			<div className={styles.range}>
				<span>{formatDisplayValue(rangeConfig.min)}</span>
				<input
					className='range'
					type='range'
					aria-label='Cutoff Threshold'
					name='cutoffNumber'
					value={displayValue}
					min={rangeConfig.min}
					max={rangeConfig.max}
					step={rangeConfig.step}
					onChange={(e) => setDisplayValue((e.target as HTMLInputElement).valueAsNumber)}
					onMouseUp={handleRangeChange}
					onTouchEnd={handleRangeChange}
				/>
				<span>{formatDisplayValue(rangeConfig.max)}</span>
			</div>
		</>
	);
}
