import React, { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { JoinResolutionUser, Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementsSelector } from '@/redux/statements/statementsSlice';
import { getMyResolutionState } from '@/controllers/db/joining/joinResolution';
import styles from './OrphanedBanner.module.scss';

interface Props {
	question: Statement;
}

/**
 * Shown to users whose intents all landed on failed options after resolution.
 * Points them to the activated options on the same question so they can
 * still contribute.
 */
const OrphanedBanner: FC<Props> = ({ question }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const allStatements = useSelector(statementsSelector);

	const [state, setState] = useState<JoinResolutionUser | undefined>();
	const [dismissed, setDismissed] = useState(false);

	const resolutionConfig = question.statementSettings?.joinResolution;
	const isResolved = resolutionConfig?.phase === 'resolved' && resolutionConfig.enabled === true;

	useEffect(() => {
		let cancelled = false;
		if (!isResolved || !creator?.uid) {
			setState(undefined);

			return;
		}
		getMyResolutionState(question.statementId, creator.uid).then((s) => {
			if (!cancelled) setState(s);
		});

		return () => {
			cancelled = true;
		};
	}, [isResolved, creator?.uid, question.statementId]);

	if (!state || state.status !== 'orphaned' || dismissed) return null;

	const activatedOptions = allStatements.filter(
		(s) =>
			s.parentId === question.statementId &&
			s.statementType === StatementType.option &&
			s.joinStatus === 'activated',
	);

	return (
		<div className={styles.banner} role="status">
			<div className={styles.banner__message}>
				<strong>{t('None of your picks reached critical mass.')}</strong>{' '}
				{activatedOptions.length > 0
					? t('Here are options that did — feel free to join one:')
					: t('No options activated on this question.')}
			</div>
			{activatedOptions.length > 0 && (
				<ul className={styles.banner__list}>
					{activatedOptions.map((option) => (
						<li key={option.statementId}>
							<a href={`#${option.statementId}`}>{option.statement}</a>
						</li>
					))}
				</ul>
			)}
			<button
				type="button"
				className={styles.banner__dismiss}
				onClick={() => setDismissed(true)}
				aria-label={t('Dismiss for now')}
			>
				×
			</button>
		</div>
	);
};

export default OrphanedBanner;
