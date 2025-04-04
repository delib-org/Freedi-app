import {
	ChangeEvent,
	FC,
	MouseEvent,
	TouchEvent,
	useEffect,
	useState,
} from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import RadioButtonWithLabel from '@/view/components/radioButtonWithLabel/RadioButtonWithLabel';
import styles from './ChoseBySettings.module.scss';
import { StatementSettingsProps } from '../../settingsTypeHelpers';

import { useDispatch, useSelector } from 'react-redux';
import { choseBySelector, setChoseBy } from '@/redux/choseBy/choseBySlice';
import { setChoseByToDB } from '@/controllers/db/choseBy/setChoseBy';
import {
	ChoseBy,
	ChoseByEvaluationType,
	CutoffType,
	ResultsBy,
} from 'delib-npm';

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
		if (!choseBy) return;
		const newChoseBy = {
			...choseBy,
			choseByEvaluationType: e.target.id as ChoseByEvaluationType,
		};
		dispatch(setChoseBy(newChoseBy));

	}

	function handleCutoffChange(e: ChangeEvent<HTMLInputElement>) {
		if (!e.target.id) return;
		if (!choseBy) return;

		const newChoseBy = {
			...choseBy,
			cutoffType: e.target.id as CutoffType,
		};

	}

	function handleRangeChange(
		e:
			| ChangeEvent<HTMLInputElement>
			| MouseEvent<HTMLInputElement>
			| TouchEvent<HTMLInputElement>
	) {
		if (!choseBy) return;

		const valueAsNumber = (e.target as HTMLInputElement).valueAsNumber;

		setRangeProps({
			...rangeProps,
			value: getValue(valueAsNumber),
		});

		const newChoseBy = {
			...choseBy,
			number: getValue(valueAsNumber),
		};

		if (e.type === 'mouseup' || e.type === 'touchend') {
			setChoseByToDB(newChoseBy);
			dispatch(setChoseBy(newChoseBy));
		}
	}

	function getValue(value: number) {
		return choseBy?.cutoffType === CutoffType.cutoffValue
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
					checked={resultsSettings?.resultsBy === ResultsBy.consensusLevel}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ChoseByEvaluationType.likes}
					labelText={t('By most liked')}
					checked={
						choseBy?.choseByEvaluationType ===
						ChoseByEvaluationType.likes
					}
					onChange={handleEvaluationChange}
				/>
				<RadioButtonWithLabel
					id={ChoseByEvaluationType.likesDislikes}
					labelText={t('By sum liked - disliked')}
					checked={
						choseBy?.choseByEvaluationType ===
						ChoseByEvaluationType.likesDislikes
					}
					onChange={handleEvaluationChange}
				/>
			</section>
			<section>
				<h3 className='title'>
					{t('Method of selecting leading options')}
				</h3>
				<RadioButtonWithLabel
					id={CutoffType.topOptions}
					labelText={`${t('Top results')}: ${choseBy?.cutoffType === CutoffType.topOptions ? rangeProps.value : ''}`}
					checked={choseBy?.cutoffType === CutoffType.topOptions}
					onChange={handleCutoffChange}
				/>
				<RadioButtonWithLabel
					id={CutoffType.cutoffValue}
					labelText={`${t('Above specific value')}: ${choseBy?.cutoffType === CutoffType.cutoffValue ? rangeProps.value : ''}`}
					checked={choseBy?.cutoffType === CutoffType.cutoffValue}
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
