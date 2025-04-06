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

import { useSelector } from 'react-redux';

import {
	CutoffBy,
	ResultsBy,
	Statement,
} from 'delib-npm';
import { updateResultSettingsToDB } from '@/controllers/db/statements/setResultSettings';
import { statementSelector } from '@/redux/statements/statementsSlice';

interface RangeProps {
	maxValue: number;
	minValue: number;
	step: number;
	value: number;
}

const ChoseBySettings: FC<StatementSettingsProps> = ({ statement: _statement }) => {
	const { t } = useUserConfig();
	const statement = useSelector(statementSelector(_statement.statementId)) as Statement;
	if (!statement) return null;
	const { resultsSettings } = statement;

	const [rangeProps, setRangeProps] = useState<RangeProps>({
		maxValue: 20,
		minValue: 1,
		step: 1,
		value: resultsSettings.cutoffNumber ?? 1,
	});

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

		const valueAsNumber = (e.target as HTMLInputElement).valueAsNumber;

		setRangeProps({
			...rangeProps,
			value: getValue(valueAsNumber),
		});

		let newResultsSettings;

		if (resultsSettings.cutoffBy === CutoffBy.topOptions) {
			newResultsSettings = {
				...resultsSettings,
				numberOfResults: getValue(valueAsNumber),
			};
		} else if (resultsSettings.cutoffBy === CutoffBy.aboveThreshold) {
			newResultsSettings = {
				...resultsSettings,
				cutoffNumber: getValue(valueAsNumber),
			};
		}

		if (newResultsSettings && (e.type === 'mouseup' || e.type === 'touchend')) {

			updateResultSettingsToDB(statement.statementId, newResultsSettings);

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
					id={ResultsBy.consensus}
					labelText={t('By Consensus')}
					checked={resultsSettings?.resultsBy === ResultsBy.consensus}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ResultsBy.mostLiked}
					labelText={t('By most liked')}
					checked={resultsSettings?.resultsBy === ResultsBy.mostLiked}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ResultsBy.averageLikesDislikes}
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
					labelText={`${t('Top results')}`}
					checked={resultsSettings.cutoffBy === CutoffBy.topOptions}
					onChange={handleCutoffChange}
				/>
				<RadioButtonWithLabel
					id={CutoffBy.aboveThreshold}
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
	const { t } = useUserConfig();
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
function AboveThresholdRange({ statement: statement, handleRangeChange }: ComponentRangeProps) {
	const { t } = useUserConfig();
	const [value, setValue] = useState<number>(statement.resultsSettings.cutoffNumber ?? 1);
	const rangeProps = {
		maxValue: 10,
		minValue: 1,
		step: 1,
	};

	return (
		<>
			<div className='title'>{t('The score to be considered as a top option')}: {value}</div>
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
