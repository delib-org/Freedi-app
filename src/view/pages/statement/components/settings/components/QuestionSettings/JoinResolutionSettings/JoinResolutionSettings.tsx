import React, { FC, useState } from 'react';
import { setDoc } from 'firebase/firestore';
import { Statement, JoinResolutionConfig } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import Button from '@/view/components/atomic/atoms/Button/Button';
import SectionTitle from '../../sectionTitle/SectionTitle';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import { resolveJoinIntents, ResolveSummary } from '@/controllers/db/joining/joinResolution';
import styles from './JoinResolutionSettings.module.scss';

interface Props {
	statement: Statement;
}

const DEFAULT_MAX_COMMITMENTS = 2;

async function saveJoinResolution(
	statement: Statement,
	config: JoinResolutionConfig,
): Promise<void> {
	try {
		const ref = createStatementRef(statement.statementId);
		await setDoc(
			ref,
			{
				statementSettings: {
					joinResolution: config,
				},
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'JoinResolutionSettings.saveJoinResolution',
			statementId: statement.statementId,
		});
	}
}

const JoinResolutionSettings: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const existing = statement.statementSettings?.joinResolution;
	const minJoinMembers = statement.statementSettings?.minJoinMembers;

	const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? false);
	const [maxCommitments, setMaxCommitments] = useState<number>(
		existing?.maxCommitmentsPerUser ?? DEFAULT_MAX_COMMITMENTS,
	);
	const [isResolving, setIsResolving] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [lastSummary, setLastSummary] = useState<ResolveSummary | null>(null);

	const phase = existing?.phase ?? 'intent';
	const isResolved = phase === 'resolved';
	const resolvedAt = existing?.resolvedAt;
	const summary: ResolveSummary | null =
		lastSummary ??
		(isResolved && existing
			? {
					activatedCount: existing.activatedCount ?? 0,
					failedCount: existing.failedCount ?? 0,
					confirmedCount: 0,
					orphanedCount: existing.orphanedCount ?? 0,
					pruningCount: existing.pruningCount ?? 0,
				}
			: null);

	const handleToggleEnabled = async (next: boolean) => {
		setEnabled(next);
		await saveJoinResolution(statement, {
			enabled: next,
			phase: existing?.phase ?? 'intent',
			maxCommitmentsPerUser: maxCommitments,
			resolvedAt: existing?.resolvedAt,
			resolvedBy: existing?.resolvedBy,
			activatedCount: existing?.activatedCount,
			failedCount: existing?.failedCount,
			orphanedCount: existing?.orphanedCount,
			pruningCount: existing?.pruningCount,
		});
	};

	const handleMaxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = Math.max(1, Number(e.target.value) || 1);
		setMaxCommitments(value);
		if (enabled) {
			await saveJoinResolution(statement, {
				enabled: true,
				phase: existing?.phase ?? 'intent',
				maxCommitmentsPerUser: value,
				resolvedAt: existing?.resolvedAt,
				resolvedBy: existing?.resolvedBy,
				activatedCount: existing?.activatedCount,
				failedCount: existing?.failedCount,
				orphanedCount: existing?.orphanedCount,
				pruningCount: existing?.pruningCount,
			});
		}
	};

	const handleResolve = async () => {
		setIsResolving(true);
		try {
			const result = await resolveJoinIntents(statement.statementId);
			if (result) {
				setLastSummary(result);
			}
		} finally {
			setIsResolving(false);
			setShowConfirm(false);
		}
	};

	const canResolve =
		enabled && !isResolved && typeof minJoinMembers === 'number' && minJoinMembers >= 1;

	return (
		<>
			<SectionTitle title={t('Conditional joining')} />
			<p className={styles.description}>
				{t(
					"During the intent phase, users mark options as conditional picks. When you resolve, options below the minimum threshold release their intents and users whose picks didn't pass are prompted to choose from the activated ones.",
				)}
			</p>

			<CustomSwitchSmall
				label={t('Enable conditional joining')}
				checked={enabled}
				setChecked={handleToggleEnabled}
				textChecked={t('Enabled')}
				textUnchecked={t('Disabled')}
				imageChecked={<UsersIcon />}
				imageUnchecked={<UsersIcon />}
				colorChecked="var(--question)"
				colorUnchecked="var(--question)"
			/>

			{enabled && (
				<div className={styles.panel}>
					<label className={styles.panel__row}>
						<span>{t('Max commitments per user after resolution')}</span>
						<input
							type="number"
							min={1}
							value={maxCommitments}
							onChange={handleMaxChange}
							className={styles.panel__input}
							disabled={isResolved}
						/>
					</label>

					{typeof minJoinMembers !== 'number' && (
						<div className={styles.panel__warning}>
							{t('Set a minimum members threshold on this question before resolving.')}
						</div>
					)}

					{!isResolved && (
						<div className={styles.panel__resolveRow}>
							<Button
								text={isResolving ? t('Resolving...') : t('Resolve intents')}
								variant="primary"
								size="small"
								onClick={() => setShowConfirm(true)}
								disabled={!canResolve || isResolving}
							/>
						</div>
					)}

					{isResolved && summary && (
						<div className={styles.panel__summary}>
							<h4>
								{t('Resolved')}
								{resolvedAt ? ` — ${new Date(resolvedAt).toLocaleString()}` : ''}
							</h4>
							<ul>
								<li>
									{t('Activated')}: <strong>{summary.activatedCount}</strong>
								</li>
								<li>
									{t('Failed')}: <strong>{summary.failedCount}</strong>
								</li>
								<li>
									{t('Orphaned users')}: <strong>{summary.orphanedCount}</strong>
								</li>
								<li>
									{t('Users to prune')}: <strong>{summary.pruningCount}</strong>
								</li>
							</ul>
						</div>
					)}
				</div>
			)}

			{showConfirm && (
				<div className={styles.confirmOverlay} onClick={() => setShowConfirm(false)}>
					<div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
						<h3>{t('Resolve intents?')}</h3>
						<p>
							{t(
								'This is a one-time, irreversible action. Options below the threshold will release their intents and be marked as failed. Make sure the intent phase is complete.',
							)}
						</p>
						<div className={styles.confirmDialog__actions}>
							<Button
								text={t('Cancel')}
								variant="cancel"
								size="small"
								onClick={() => setShowConfirm(false)}
								disabled={isResolving}
							/>
							<Button
								text={isResolving ? t('Resolving...') : t('Resolve now')}
								variant="primary"
								size="small"
								onClick={handleResolve}
								disabled={isResolving}
								loading={isResolving}
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default JoinResolutionSettings;
