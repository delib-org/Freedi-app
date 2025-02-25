import React, { FC, useContext, useState } from 'react';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import styles from './AddStage.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { StatementType } from '@/types/TypeEnums';
import { StageSelectionType } from '@/types/stage/stageTypes';

interface AddStageProps {
	setShowAddStage: (showAddStage: boolean) => void;
}

const AddStage: FC<AddStageProps> = ({ setShowAddStage }) => {
	const { t } = useLanguage();
	const { statement } = useContext(StatementContext);

	const [defaultStageName, setDefaultStageName] = useState<string>('');
	const [userEnteredStageName, setUserEnteredStageName] =
		useState<boolean>(false);

	function handleCloseModal() {
		setShowAddStage(false);
	}

	function handleChangeStageName(ev: React.ChangeEvent<HTMLSelectElement>) {
		if (userEnteredStageName) return;
		const stageSelectionType = ev.target.value as StageSelectionType;
		const stageName = getDefaultStageName(stageSelectionType);
		setDefaultStageName(stageName);
	}

	function handleManualStageName() {
		setUserEnteredStageName(true);
	}

	async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const data = new FormData(ev.target as HTMLFormElement);
		const stageSelectionType = data.get('stageSelectionType') as StageSelectionType;
		const name = data.get('stageName') as string;
		const description = (data.get('stageDescription') as string) || '';

		if (!statement || !stageSelectionType) return;
		await saveStatementToDB({
			text: name,
			description,
			stageSelectionType,
			parentStatement: statement,
			statementType: StatementType.stage,
		});

		setShowAddStage(false);
	}

	return (
		<div className={styles.box}>
			<form onSubmit={handleSubmit}>
				<select
					name='stageSelectionType'
					id='stageSelectionType'
					defaultValue=''
					onChange={handleChangeStageName}
				>
					<option value='' disabled>
						{t('Select Stage Type')}
					</option>
					<option value={StageSelectionType.needs}>{t('Needs')}</option>
					<option value={StageSelectionType.explanation}>
						{t('Explanation')}
					</option>
					<option value={StageSelectionType.questions}>
						{t('Research Questions')}
					</option>
					<option value={StageSelectionType.hypothesis}>
						{t('Hypothesis')}
					</option>
					<option value={StageSelectionType.suggestions}>
						{t('Suggestions')}
					</option>
					<option value={StageSelectionType.conclusion}>
						{t('Conclusion')}
					</option>
					<option value={StageSelectionType.summary}>{t('Summery')}</option>
					<option value={StageSelectionType.other}>{t('Other')}</option>
				</select>
				<label htmlFor='stageName'>{t('Stage Name')}</label>
				<input
					type='text'
					id='stageName'
					name='stageName'
					placeholder={t('Stage Name')}
					defaultValue={defaultStageName}
					onKeyUp={handleManualStageName}
					required
				/>
				<label htmlFor='stageDescription'>
					{t('Stage Description')}
				</label>
				<textarea
					id='stageDescription'
					name='stageDescription'
					placeholder={t('Stage Description')}
				/>
				<div className='btns'>
					<Button
						text={t('Add Stage')}
						type='submit'
						buttonType={ButtonType.PRIMARY}
					/>
					<Button
						text={t('Cancel')}
						type='reset'
						buttonType={ButtonType.SECONDARY}
						onClick={handleCloseModal}
					/>
				</div>
			</form>
		</div>
	);
};

export default AddStage;

function getDefaultStageName(stageSelectionType: StageSelectionType): string {
	switch (stageSelectionType) {
		case StageSelectionType.needs:
			return 'Needs';
		case StageSelectionType.explanation:
			return 'Explanation';
		case StageSelectionType.questions:
			return 'Research Questions';
		case StageSelectionType.hypothesis:
			return 'Hypothesis';
		case StageSelectionType.suggestions:
			return 'Suggestions';
		case StageSelectionType.conclusion:
			return 'Conclusion';
		case StageSelectionType.summary:
			return 'Summery';
		case StageSelectionType.other:
			return 'Other';
		default:
			return '';
	}
}
