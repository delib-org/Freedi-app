import { FC, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import Sheet from '@/view/components/atomic/molecules/Sheet/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { selectWaitingMemberByStatementId } from '@/redux/subscriptions/subscriptionsSlice';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { uxAnalytics } from '@/services/analytics';
import { useStatementSettingsHandlers } from '../settings/useStatementSettingsHandlers';
import { ALLOW_ADD_ANSWERS_KEYS } from '../settings/components/allowAddAnswers/AllowAddAnswersToggle';
import { canParticipantsAddAnswers } from '../questionScreen/questionScreenLogic';
import {
	QuestionStageIndex,
	STAGE_LABEL_KEYS,
	STAGE_TO_STEP,
} from '../questionScreen/questionStage';
import { buildHostHubPath, HostHubSectionId } from './hostHubLogic';
import styles from './HostHubSheet.module.scss';

interface HostHubSheetProps {
	isOpen: boolean;
	onClose: () => void;
	statement: Statement;
	stage: QuestionStageIndex;
}

type ToggleKey = 'answers' | 'rating' | 'live';

const ROWS: ReadonlyArray<{ section: HostHubSectionId; title: string; description: string }> = [
	{ section: 'people', title: 'host.people', description: 'host.peopleDesc' },
	{ section: 'answers', title: 'host.answers', description: 'host.answersDesc' },
	{ section: 'results', title: 'host.results', description: 'host.resultsDesc' },
	{ section: 'insights', title: 'host.insights', description: 'host.insightsDesc' },
	{ section: 'settings', title: 'Advanced settings', description: 'host.settingsDesc' },
];

/**
 * ⚙ מארח/ת — one sheet with what a host flips mid-session: the stage, three
 * switches, and a row into each full Host hub section (Live now stays one tap
 * away through "All host tools"). Every change saves on tap.
 */
const HostHubSheet: FC<HostHubSheetProps> = ({
	isOpen,
	onClose,
	statement: propStatement,
	stage,
}) => {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
	const live = useAppSelector(statementSelector(propStatement.statementId));
	const statement = live ?? propStatement;
	const handlers = useStatementSettingsHandlers(statement);
	const waiting = useSelector(selectWaitingMemberByStatementId(statement.statementId));
	const [status, setStatus] = useState('');

	const settings = statement.statementSettings;
	const toggles: ReadonlyArray<{ key: ToggleKey; label: string; checked: boolean }> = [
		{
			key: 'answers',
			label: t('Participants can add answers'),
			checked: canParticipantsAddAnswers(statement),
		},
		{ key: 'rating', label: t('Accepting ratings'), checked: settings?.enableEvaluation ?? true },
		{
			key: 'live',
			label: t('Live results for participants'),
			checked: settings?.showEvaluation ?? false,
		},
	];

	function pickStage(index: QuestionStageIndex) {
		const step = STAGE_TO_STEP[index];
		uxAnalytics.settingChanged(statement.statementId, 'currentStep', step);
		setStatementSettingToDB({
			statement,
			property: 'currentStep',
			newValue: step,
			settingsSection: 'questionSettings',
		});
		setStatus(
			t('The question moved to stage: {stage}').replace('{stage}', t(STAGE_LABEL_KEYS[index])),
		);
	}

	function flip(key: ToggleKey, next: boolean) {
		if (key === 'answers')
			ALLOW_ADD_ANSWERS_KEYS.forEach((k) => handlers.handleSettingChange(k, next));
		if (key === 'rating') handlers.handleSettingChange('enableEvaluation', next);
		if (key === 'live') handlers.handleSettingChange('showEvaluation', next);
		setStatus(t('Saved'));
	}

	function open(section: HostHubSectionId | 'live') {
		onClose();
		navigate(buildHostHubPath(statement.statementId, section));
	}

	const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

	return (
		<Sheet isOpen={isOpen} onClose={onClose} title={t('Host tools')} id="host-hub-sheet">
			<div className={styles.hub} data-testid="host-hub-sheet">
				<p className={styles.hub__caption}>{t('host.caption')}</p>

				<div className={styles.hub__stages} role="radiogroup" aria-label={t('Question stage')}>
					{STAGE_LABEL_KEYS.map((key, index) => (
						<button
							key={key}
							type="button"
							role="radio"
							aria-checked={stage === index}
							className={`${styles.hub__stage} ${stage === index ? styles['hub__stage--on'] : ''}`}
							onClick={() => pickStage(index as QuestionStageIndex)}
							data-testid={`host-stage-${index}`}
						>
							{t(key)}
						</button>
					))}
				</div>

				{toggles.map((toggle) => (
					<button
						key={toggle.key}
						type="button"
						role="switch"
						aria-checked={toggle.checked}
						className={styles.hub__toggle}
						onClick={() => flip(toggle.key, !toggle.checked)}
						data-testid={`host-toggle-${toggle.key}`}
					>
						<span>{toggle.label}</span>
						<span
							className={`${styles.hub__switch} ${toggle.checked ? styles['hub__switch--on'] : ''}`}
							aria-hidden="true"
						>
							<span className={styles.hub__knob} />
						</span>
					</button>
				))}

				{ROWS.map((row) => (
					<div key={row.section} className={styles.hub__row}>
						<button
							type="button"
							className={styles.hub__rowButton}
							onClick={() => open(row.section)}
							data-testid={`host-row-${row.section}`}
						>
							<span className={styles.hub__rowText}>
								<span className={styles.hub__rowTitle}>{t(row.title)}</span>
								<span className={styles.hub__rowSub}>{t(row.description)}</span>
							</span>
							<Chevron size={16} aria-hidden="true" className={styles.hub__chevron} />
						</button>
						{row.section === 'people' && waiting.length > 0 && (
							<button
								type="button"
								className={styles.hub__approve}
								onClick={() => open('people')}
								data-testid="host-approve-pending"
							>
								{t('Approve {n}').replace('{n}', String(waiting.length))}
							</button>
						)}
					</div>
				))}

				<button type="button" className={styles.hub__all} onClick={() => open('live')}>
					{t('host.allHostTools')}
				</button>
				<p className={styles.hub__status} role="status" aria-live="polite">
					{status}
				</p>
			</div>
		</Sheet>
	);
};

export default HostHubSheet;
