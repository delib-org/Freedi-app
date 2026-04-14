import React, { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { JoinResolutionUser, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementsSelector } from '@/redux/statements/statementsSlice';
import { getMyResolutionState, markPruningComplete } from '@/controllers/db/joining/joinResolution';
import { toggleJoining } from '@/controllers/db/joining/setJoining';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { logError } from '@/utils/errorHandling';
import styles from './PruningBanner.module.scss';

interface Props {
	question: Statement;
}

/**
 * Banner + modal shown to users whose activated intents exceed the
 * `maxCommitmentsPerUser` cap after the admin runs "Resolve intents".
 *
 * Soft enforcement per the feature spec: the banner is dismissible per
 * session but comes back on next load until the user actually prunes.
 */
const PruningBanner: FC<Props> = ({ question }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const allStatements = useSelector(statementsSelector);

	const [resolutionState, setResolutionState] = useState<JoinResolutionUser | undefined>();
	const [dismissed, setDismissed] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [keptIds, setKeptIds] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const resolutionConfig = question.statementSettings?.joinResolution;
	const isResolved = resolutionConfig?.phase === 'resolved' && resolutionConfig.enabled === true;

	useEffect(() => {
		let cancelled = false;
		if (!isResolved || !creator?.uid) {
			setResolutionState(undefined);

			return;
		}
		getMyResolutionState(question.statementId, creator.uid).then((state) => {
			if (!cancelled) {
				setResolutionState(state);
				setKeptIds(state?.activatedIntents ?? []);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [isResolved, creator?.uid, question.statementId]);

	if (!resolutionState || resolutionState.status !== 'needsPruning' || dismissed || !creator?.uid) {
		return null;
	}

	const maxAllowed = resolutionState.maxAllowed;
	const overCount = resolutionState.activatedIntents.length - maxAllowed;

	// Look up the full option statements for display.
	const optionMap = new Map(allStatements.map((s) => [s.statementId, s]));
	const activatedOptions = resolutionState.activatedIntents
		.map((id) => optionMap.get(id))
		.filter((s): s is Statement => Boolean(s));

	const handleToggleKept = (optionId: string) => {
		setKeptIds((prev) =>
			prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
		);
	};

	const handleSubmit = async () => {
		if (keptIds.length > maxAllowed || keptIds.length === 0) return;
		setIsSubmitting(true);
		try {
			const dropIds = resolutionState.activatedIntents.filter((id) => !keptIds.includes(id));
			// Drop each un-kept option via toggleJoining as activist.
			for (const optionId of dropIds) {
				await toggleJoining({
					statementId: optionId,
					parentStatementId: question.statementId,
					role: 'activist',
				});
			}
			await markPruningComplete(question.statementId, creator.uid, keptIds);
			setResolutionState({ ...resolutionState, status: 'confirmed', activatedIntents: keptIds });
			setModalOpen(false);
		} catch (error) {
			logError(error, {
				operation: 'PruningBanner.handleSubmit',
				userId: creator.uid,
				statementId: question.statementId,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const canSubmit = keptIds.length > 0 && keptIds.length <= maxAllowed;

	return (
		<>
			<div className={styles.banner} role="status">
				<div className={styles.banner__message}>
					<strong>{t('Great news!')}</strong> {t('Your picks activated. Please commit to at most')}{' '}
					{maxAllowed} {t('of them.')}{' '}
					<span className={styles.banner__over}>
						({t('You have')} {overCount} {t('extra')})
					</span>
				</div>
				<div className={styles.banner__actions}>
					<Button
						text={t('Choose')}
						size="small"
						variant="primary"
						onClick={() => setModalOpen(true)}
					/>
					<button
						type="button"
						className={styles.banner__dismiss}
						onClick={() => setDismissed(true)}
						aria-label={t('Dismiss for now')}
					>
						×
					</button>
				</div>
			</div>

			<Modal
				isOpen={modalOpen}
				onClose={() => setModalOpen(false)}
				title={t('Keep up to') + ` ${maxAllowed}`}
				size="medium"
				footer={
					<>
						<Button
							text={t('Cancel')}
							variant="cancel"
							size="small"
							onClick={() => setModalOpen(false)}
							disabled={isSubmitting}
						/>
						<Button
							text={isSubmitting ? t('Saving...') : t('Confirm')}
							variant="primary"
							size="small"
							onClick={handleSubmit}
							disabled={!canSubmit || isSubmitting}
							loading={isSubmitting}
						/>
					</>
				}
			>
				<p className={styles.modal__intro}>
					{t('These options reached critical mass. Keep up to')} {maxAllowed}.
				</p>
				<ul className={styles.modal__list}>
					{activatedOptions.map((option) => {
						const checked = keptIds.includes(option.statementId);
						const disabled = !checked && keptIds.length >= maxAllowed;

						return (
							<li key={option.statementId} className={styles.modal__item}>
								<label
									className={`${styles.modal__label} ${disabled ? styles['modal__label--disabled'] : ''}`}
								>
									<input
										type="checkbox"
										checked={checked}
										disabled={disabled}
										onChange={() => handleToggleKept(option.statementId)}
									/>
									<span>{option.statement}</span>
								</label>
							</li>
						);
					})}
				</ul>
				<p className={styles.modal__counter}>
					{t('Selected')}: {keptIds.length} / {maxAllowed}
				</p>
			</Modal>
		</>
	);
};

export default PruningBanner;
