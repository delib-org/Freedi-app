import React, { FC, useContext } from 'react';
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

	function handleCloseModal() {
		setShowAddStage(false);
	}

	async function handleAddStage(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const data = new FormData(ev.target as HTMLFormElement);
		const stageSelectionType = data.get('stageSelectionType') as StageSelectionType;
		if (!stageSelectionType) return;
		const name = data.get('stageName') as string;
		const description = (data.get('stageDescription') as string) || '';

		if (!statement || !stageSelectionType) return;
		await saveStatementToDB({
			text: name,
			description,
			stageSelectionType,
			parentStatement: statement,
			statementType: StatementType.question,
		});

		setShowAddStage(false);
	}

	return (
		<div className={styles.box}>
			<form onSubmit={handleAddStage}>
				<select
					name='stageSelectionType'
					id='stageSelectionType'
					defaultValue=''
				>
					<option value='' disabled>
						{t('Define how to select top options')}
					</option>
					<option value={StageSelectionType.consensus}>
						{t('Consensus')}
					</option>
					<option value={StageSelectionType.voting}>{t('Voting')}</option>
					<option value={StageSelectionType.checkbox}>
						{t('Checkbox')}
					</option>
				</select>
				<label htmlFor='stageName'>{t('Stage Name')}</label>
				<input
					type='text'
					id='stageName'
					name='stageName'
					placeholder={t('Stage Name')}
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
