import React, { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { JoinRole, ToggleJoiningResult } from '@/controllers/db/joining/setJoining';
import { useJoinFlow } from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/useJoinFlow';
import JoinFormModal from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/joinFormModal/JoinFormModal';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { logError } from '@/utils/errorHandling';
import styles from './JoinButtons.module.scss';

interface JoinButtonsProps {
	statement: Statement;
	parentStatement?: Statement;
	className?: string;
}

/**
 * Activist + organizer join buttons for a single option card. Shared between
 * `SuggestionCard` (flat/stage view) and `TreeOptionNode` (tree view) so
 * behavior stays in one place. Reads `parentStatement.statementSettings.joiningEnabled`
 * to decide whether to render at all.
 */
const JoinButtons: FC<JoinButtonsProps> = ({ statement, parentStatement, className }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);

	const enableJoining = parentStatement?.statementSettings?.joiningEnabled;

	const hasJoinedServer = statement.joined?.some((c) => c?.uid === creator?.uid) ?? false;
	const hasOrganizedServer = statement.organizers?.some((c) => c?.uid === creator?.uid) ?? false;

	const [hasJoinedOptimistic, setHasJoinedOptimistic] = useState(hasJoinedServer);
	const [hasOrganizedOptimistic, setHasOrganizedOptimistic] = useState(hasOrganizedServer);
	const [isJoinLoading, setIsJoinLoading] = useState(false);
	const [isOrganizerLoading, setIsOrganizerLoading] = useState(false);

	useEffect(() => {
		setHasJoinedOptimistic(hasJoinedServer);
	}, [hasJoinedServer]);
	useEffect(() => {
		setHasOrganizedOptimistic(hasOrganizedServer);
	}, [hasOrganizedServer]);

	const joinFlow = useJoinFlow({ option: statement, parentStatement });

	if (!enableJoining) return null;

	async function handleJoin(role: JoinRole) {
		const prevJoined = hasJoinedOptimistic;
		const prevOrganized = hasOrganizedOptimistic;

		// Mutual exclusivity: joining one role clears the other optimistically.
		// (The transaction in toggleJoining enforces this on the server too.)
		if (role === 'activist') {
			const next = !prevJoined;
			setHasJoinedOptimistic(next);
			if (next && prevOrganized) setHasOrganizedOptimistic(false);
			setIsJoinLoading(true);
		} else {
			const next = !prevOrganized;
			setHasOrganizedOptimistic(next);
			if (next && prevJoined) setHasJoinedOptimistic(false);
			setIsOrganizerLoading(true);
		}

		function revert() {
			setHasJoinedOptimistic(prevJoined);
			setHasOrganizedOptimistic(prevOrganized);
		}

		try {
			const result: ToggleJoiningResult | undefined = await joinFlow.startJoin({ role });
			if (!result) return;

			if (!result.success) {
				revert();
				logError(new Error(result.error ?? 'Failed to toggle joining'), {
					operation: 'JoinButtons.handleJoin',
					statementId: statement.statementId,
					metadata: { role },
				});
			}
		} catch (error) {
			logError(error, {
				operation: 'JoinButtons.handleJoin',
				statementId: statement.statementId,
				metadata: { role },
			});
			revert();
		} finally {
			if (role === 'activist') setIsJoinLoading(false);
			else setIsOrganizerLoading(false);
		}
	}

	async function handleJoinFormSubmit(payload: {
		displayName: string;
		values: Record<string, string>;
	}) {
		const result = await joinFlow.submitForm(payload);
		if (result?.success === false) {
			setHasJoinedOptimistic(hasJoinedServer);
			setHasOrganizedOptimistic(hasOrganizedServer);
		}
	}

	const activistCount = statement.joined?.length ?? 0;
	const organizerCount = statement.organizers?.length ?? 0;

	// Phase-aware rendering driven by the parent question's joinResolution.
	const resolution = parentStatement?.statementSettings?.joinResolution;
	const minJoinMembers = parentStatement?.statementSettings?.minJoinMembers;
	const isConditional = resolution?.enabled === true;
	const isIntentPhase = isConditional && resolution?.phase === 'intent';
	const isResolvedPhase = isConditional && resolution?.phase === 'resolved';
	const isFailed = isResolvedPhase && statement.joinStatus === 'failed';

	// Activist button label adapts to phase.
	let activistLabel: string;
	if (isIntentPhase && minJoinMembers) {
		activistLabel = hasJoinedOptimistic
			? t('Withdraw intent')
			: `${t('Count me in if this reaches')} ${minJoinMembers}`;
	} else {
		activistLabel = hasJoinedOptimistic ? t('Leave as activist') : t('Join as activist');
	}

	const organizerLabel = hasOrganizedOptimistic ? t('Leave as organizer') : t('Join as organizer');

	return (
		<>
			<div className={`${styles.joinButtons} ${className ?? ''}`.trim()}>
				{isFailed ? (
					<span className={styles.joinButtons__failedBadge}>
						{t('Did not reach critical mass')}
					</span>
				) : (
					<div className={styles.joinButtons__activistGroup}>
						<Button
							text={`${activistLabel} (${activistCount}${
								isIntentPhase && minJoinMembers ? `/${minJoinMembers}` : ''
							})`}
							size="small"
							variant={hasJoinedOptimistic ? 'approve' : 'secondary'}
							onClick={() => handleJoin('activist')}
							disabled={isJoinLoading || joinFlow.isLoading}
							ariaLabel={activistLabel}
						/>
						{isIntentPhase && (
							<span className={styles.joinButtons__hint}>{t('Conditional — until resolved')}</span>
						)}
					</div>
				)}
				<Button
					text={`${organizerLabel} (${organizerCount})`}
					size="small"
					variant={hasOrganizedOptimistic ? 'approve' : 'secondary'}
					onClick={() => handleJoin('organizer')}
					disabled={isOrganizerLoading || joinFlow.isLoading}
					ariaLabel={organizerLabel}
				/>
			</div>
			<JoinFormModal
				isOpen={joinFlow.modalOpen}
				onClose={joinFlow.closeModal}
				fields={joinFlow.fields}
				initialDisplayName={creator?.displayName ?? ''}
				onSubmit={handleJoinFormSubmit}
			/>
		</>
	);
};

export default JoinButtons;
