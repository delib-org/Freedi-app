/**
 * Question format & data settings (question type, Mass Consensus link,
 * nightly backup). The participation-mode and rating-scale controls live in
 * InstantSettings (the hero panel) — the single source of truth.
 */
import React, { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import styles from './QuestionSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementType, QuestionType, CompoundPhase } from '@freedi/shared-types';
import { setQuestionTypeToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { createStatementRef } from '@/utils/firebaseUtils';
import { setDoc } from 'firebase/firestore';
import EvaluationsIcon from '@/assets/icons/evaluationsIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import { logError } from '@/utils/errorHandling';
import { requestSurveyBackup } from '@/controllers/db/backup/backupController';

// Sub-components
import QuestionLinkSection from './QuestionLinkSection';

const QuestionSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const [backupStatus, setBackupStatus] = React.useState<
		| { kind: 'idle' }
		| { kind: 'pending' }
		| { kind: 'done'; destination: string }
		| { kind: 'error'; message: string }
	>({ kind: 'idle' });

	async function handleAutoBackupToggle(enabled: boolean) {
		setStatementSettingToDB({
			statement,
			property: 'autoBackup',
			newValue: enabled,
			settingsSection: 'questionSettings',
		});
		// Flipping ON also fires one immediate backup so the admin doesn't have
		// to wait until the next 03:00 cron to see a file land.
		if (enabled) {
			setBackupStatus({ kind: 'pending' });
			try {
				const res = await requestSurveyBackup(statement.statementId);
				setBackupStatus({ kind: 'done', destination: res.destination });
			} catch (error) {
				setBackupStatus({
					kind: 'error',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		} else {
			setBackupStatus({ kind: 'idle' });
		}
	}

	try {
		const { questionSettings } = statement;
		if (statement.statementType !== StatementType.question) return null;

		function handleQuestionTypeChange(ev: React.ChangeEvent<HTMLSelectElement>) {
			const newType = ev.target.value as QuestionType;
			setQuestionTypeToDB({ statement, questionType: newType });

			if (newType === QuestionType.compound && !questionSettings?.compoundSettings) {
				const ref = createStatementRef(statement.statementId);
				setDoc(
					ref,
					{
						questionSettings: {
							compoundSettings: {
								currentPhase: CompoundPhase.defineQuestion,
							},
						},
					},
					{ merge: true },
				);
			}
		}

		const isCompound = questionSettings?.questionType === QuestionType.compound;

		return (
			<div className={styles.questionSettings}>
				<SectionTitle title={t('Question format')} />
				<p className={styles.sectionDescription}>
					{t('Changing this changes the whole participant flow')}
				</p>
				<select
					className={styles.questionTypeSelect}
					value={questionSettings?.questionType || QuestionType.multiStage}
					onChange={handleQuestionTypeChange}
				>
					<option value={QuestionType.multiStage}>{t('Simple Question')}</option>
					<option value={QuestionType.massConsensus}>{t('Mass Consensus')}</option>
					<option value={QuestionType.compound}>{t('Compound Question')}</option>
				</select>

				{isCompound && (
					<p className={styles.sectionDescription}>
						{t('Compound question phases')}:{' '}
						{questionSettings?.compoundSettings?.currentPhase || CompoundPhase.defineQuestion}
					</p>
				)}

				<SectionTitle title={t('Mass Consensus Settings')} />
				<p className={styles.sectionDescription}>
					{t('These settings control the new Mass Consensus app behavior')}
				</p>

				<QuestionLinkSection statementId={statement.statementId} />

				<SectionTitle title={t('Daily Backup')} />
				<p className={styles.sectionDescription}>
					{t(
						'When on, this question is included in the nightly backup at 03:00. Flipping it on also runs an immediate backup so you have a snapshot now.',
					)}
				</p>
				<CustomSwitchSmall
					label={t('Auto-backup this question')}
					checked={questionSettings?.autoBackup === true}
					setChecked={handleAutoBackupToggle}
					textChecked={t('Auto-backup on')}
					textUnchecked={t('Auto-backup off')}
					imageChecked={<EvaluationsIcon />}
					imageUnchecked={<EvaluationsIcon />}
					colorChecked="var(--question)"
					colorUnchecked="var(--question)"
				/>
				{backupStatus.kind === 'pending' && (
					<p className={styles.sectionDescription}>{t('Requesting backup…')}</p>
				)}
				{backupStatus.kind === 'done' && (
					<p className={styles.sectionDescription}>
						{t('Backup queued. It will land here within a minute or two:')}{' '}
						<code>{backupStatus.destination}</code>
					</p>
				)}
				{backupStatus.kind === 'error' && (
					<p className={styles.sectionDescription}>
						{t('Backup failed:')} {backupStatus.message}
					</p>
				)}
			</div>
		);
	} catch (error: unknown) {
		logError(error, { operation: 'QuestionSettings.QuestionSettings' });

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
