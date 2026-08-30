import { useEffect, useState, type FC } from 'react';
import clsx from 'clsx';
import { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { Checkbox } from '@/components/atomic/atoms/Checkbox';
import { Input } from '@/components/atomic/atoms/Input';
import {
	ActivityTypePicker,
	DEFAULT_ACTIVITY_OPTIONS,
} from '@/components/atomic/molecules/ActivityTypePicker';
import { createOrgStatement, type OrgStatementKind } from '@/db/orgFunctions';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';
import styles from './AddActivityModal.module.scss';

/**
 * AddActivityModal — two steps: pick a type, then name it and choose
 * whether it opens right away.
 */
export interface AddActivityModalProps {
	isOpen: boolean;
	orgId: string;
	qId: string;
	/** Skip straight to step 2 with this type (used by the empty-state picker). */
	initialType?: ActivityType;
	onClose: () => void;
	onCreated: (statementId: string, type: ActivityType) => void;
}

/** Only the types the create function knows how to build. */
const KIND_BY_TYPE: Partial<Record<ActivityType, OrgStatementKind>> = {
	[ActivityType.massConsensus]: 'massConsensus',
	[ActivityType.join]: 'join',
	[ActivityType.question]: 'question',
	[ActivityType.signDocument]: 'document',
};

/**
 * Live sessions are run from the front, so they start closed to the room.
 * Documents are created hidden (admin review in Sign) whatever this says.
 */
function defaultOpenNow(type: ActivityType | undefined): boolean {
	return type !== ActivityType.join && type !== ActivityType.signDocument;
}

/** Types that continue in another app right after creation. */
function continueLabel(kind: OrgStatementKind | undefined, t: (text: string) => string): string {
	if (kind === 'massConsensus') return t('Continue in Crowd survey');
	if (kind === 'document') return t('Continue in Sign');

	return t('Create activity');
}

const AddActivityModal: FC<AddActivityModalProps> = ({
	isOpen,
	orgId,
	qId,
	initialType,
	onClose,
	onCreated,
}) => {
	const { t } = useTranslation();
	const [step, setStep] = useState<1 | 2>(1);
	const [type, setType] = useState<ActivityType | undefined>(initialType);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [openNow, setOpenNow] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!isOpen) return;
		setStep(initialType ? 2 : 1);
		setType(initialType);
		setTitle('');
		setDescription('');
		setOpenNow(defaultOpenNow(initialType));
		setError('');
		// The modal instance stays mounted between opens, so a stale
		// `submitting` from a previous create would lock the footer.
		setSubmitting(false);
	}, [isOpen, initialType]);

	const kind = type ? KIND_BY_TYPE[type] : undefined;
	const canContinue = kind !== undefined;
	const canCreate = !submitting && canContinue && title.trim().length > 0;

	const goToDetails = () => {
		if (!canContinue) return;
		setOpenNow(defaultOpenNow(type));
		setStep(2);
	};

	const handleCreate = async () => {
		if (!canCreate || !kind || !type) return;
		setSubmitting(true);
		setError('');
		try {
			// "Not open yet" has no distinct backend status: a question with no
			// `questionStatus` is live everywhere. `frozen` is the closest thing
			// — visible, but nobody can act until the facilitator opens it.
			const { statementId } = await createOrgStatement({
				organizationId: orgId,
				parentId: qId,
				kind,
				title: title.trim(),
				description: description.trim() || undefined,
				// A document's run state lives in Sign (`signSettings`), not here.
				initialStatus: kind === 'document' ? undefined : openNow ? 'live' : 'frozen',
			});
			setSubmitting(false);
			onCreated(statementId, type);
		} catch (err) {
			logError(err, {
				operation: 'AddActivityModal.create',
				organizationId: orgId,
				statementId: qId,
				metadata: { kind, openNow },
			});
			setError(t('Could not create the activity. Please try again.'));
			setSubmitting(false);
		}
	};

	const footer =
		step === 1 ? (
			<>
				<Button text={t('Cancel')} variant="secondary" onClick={onClose} />
				<Button text={t('Next')} variant="primary" disabled={!canContinue} onClick={goToDetails} />
			</>
		) : (
			<>
				<Button text={t('Cancel')} variant="secondary" onClick={onClose} disabled={submitting} />
				<Button
					text={continueLabel(kind, t)}
					variant="primary"
					disabled={!canCreate}
					loading={submitting}
					onClick={() => void handleCreate()}
				/>
			</>
		);

	return (
		<ModalFrame
			isOpen={isOpen}
			onClose={submitting ? () => undefined : onClose}
			title={t('Add activity')}
			size="large"
			footer={footer}
		>
			{step === 1 ? (
				<div className={styles.step}>
					<ActivityTypePicker
						options={DEFAULT_ACTIVITY_OPTIONS(t)}
						value={type}
						onChange={setType}
						label={t('Activity type')}
					/>
				</div>
			) : (
				<form
					className={clsx(styles.step, styles.stepForward)}
					onSubmit={(event) => {
						event.preventDefault();
						void handleCreate();
					}}
				>
					{!initialType && (
						<button type="button" className={styles.back} onClick={() => setStep(1)}>
							‹ {t('Back')}
						</button>
					)}
					<Input
						label={kind === 'document' ? t('Document title') : t('Question for participants')}
						value={title}
						onChange={setTitle}
						required
						fullWidth
						autoFocus
						name="activity-title"
					/>
					<Input
						as="textarea"
						label={t('Short explanation (optional)')}
						value={description}
						onChange={setDescription}
						fullWidth
						rows={3}
						name="activity-description"
					/>
					{kind === 'massConsensus' ? (
						<p className={styles.note}>
							{t(
								"Next you'll set up the full survey — questions, demographics, logos — in Crowd survey, then come back here.",
							)}
						</p>
					) : kind === 'document' ? (
						<p className={styles.note}>
							{t('Write or paste the text in Sign, then come back to open it for comment.')}
						</p>
					) : (
						<Checkbox
							label={t('Open it now')}
							hint={t('Participants can join as soon as you share the link.')}
							checked={openNow}
							onChange={setOpenNow}
						/>
					)}
					{error && <p role="alert">{error}</p>}
				</form>
			)}
		</ModalFrame>
	);
};

export default AddActivityModal;
