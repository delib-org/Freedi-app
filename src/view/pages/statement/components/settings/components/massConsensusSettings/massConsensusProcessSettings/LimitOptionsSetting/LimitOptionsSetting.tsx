import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { ChangeEvent, MouseEvent, TouchEvent, useState } from 'react';
import { useSelector } from 'react-redux';
import styles from './LimitOptionSetting.module.scss';
import { useParams } from 'react-router';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';

const LimitOptionsSetting = () => {
	const { t } = useUserConfig();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const { numberOfOptionsPerUser = 1 } = statement.statementSettings;
	const RANGE = { min: 1, max: 20, step: 1 };

	const [value, setValue] = useState<number>(numberOfOptionsPerUser);

	function handleChange(e: ChangeEvent<HTMLInputElement>) {
		setValue(e.target.valueAsNumber);
	}

	if (!statement) return null;

	function handleCommit(
		e: MouseEvent<HTMLInputElement> | TouchEvent<HTMLInputElement>
	) {
		const newValue = e.currentTarget.valueAsNumber;
		setStatementSettingToDB({
			statement,
			property: 'numberOfOptionsPerUser',
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	return (
		<>
			<div className={`title ${styles.title}`}>
				{t('Maximum options submitted by user')}: {value}
			</div>
			<div className={styles.range}>
				<span>{RANGE.min}</span>
				<input
					className='range'
					type='range'
					aria-label='Number Of Results'
					name='numberOfResults'
					value={value}
					min={RANGE.min}
					max={RANGE.max}
					step={RANGE.step}
					onChange={handleChange}
					onMouseUp={handleCommit}
					onTouchEnd={handleCommit}
				/>
				<span>{RANGE.max}</span>
			</div>
		</>
	);
};

export default LimitOptionsSetting;
