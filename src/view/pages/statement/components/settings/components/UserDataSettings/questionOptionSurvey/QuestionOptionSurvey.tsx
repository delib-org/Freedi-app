import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import React, { FC } from 'react';
import styles from './QuestionOptionSurvey.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Option {
	option: string;
	color: string;
}
interface QuestionOptionsSurveyProps {
	indx: number;
	option: Option;
	allowDelete: boolean;
	deleteOption: (indx: number) => void;
	handleOptionChange: (
		e: React.ChangeEvent<HTMLInputElement>,
		index: number
	) => void;
	handleColorChange: (
		e: React.ChangeEvent<HTMLInputElement>,
		index: number
	) => void;
}

const QuestionOptionSurvey: FC<QuestionOptionsSurveyProps> = ({
	indx,
	option,
	allowDelete,
	deleteOption,
	handleOptionChange,
	handleColorChange,
}) => {
	const { t } = useUserConfig();

	return (
		<div className={styles.option} key={indx}>
			<RadioButtonEmptyIcon />
			<input
				name={option.option}
				placeholder={t('Write Answer here')}
				required
				type='text'
				className={styles.inputAnswer}
				value={option.option}
				onChange={(e) => handleOptionChange(e, indx)}
			/>
			<input
				type='color'
				className={styles.optionColor}
				onChange={(e) => handleColorChange(e, indx)}
				value={option.color}
			/>
			<DeleteIcon
				color={allowDelete ? 'red' : 'white'}
				cursor={allowDelete ? 'pointer' : 'default'}
				onClick={() => (allowDelete ? deleteOption(indx) : '')}
			></DeleteIcon>
		</div>
	);
};

export default QuestionOptionSurvey;
