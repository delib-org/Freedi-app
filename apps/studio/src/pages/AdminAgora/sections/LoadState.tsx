import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, EmptyState } from '@/components/atomic/atoms';
import { getErrorCode } from '../../_shared/callableErrors';
import styles from '../AdminDetail.module.scss';

/** True when the callable said the thing does not exist (or is out of scope). */
export function isNotFound(error: Error | null): boolean {
	const code = getErrorCode(error) ?? '';

	return code.endsWith('not-found') || code.endsWith('permission-denied');
}

/**
 * The failure state of a supervision view: "not found" for a bad id, else
 * "Could not load." with a Retry that bypasses the cache.
 */
export function LoadError({
	error,
	notFoundText,
	onRetry,
}: {
	error: Error;
	notFoundText?: string;
	onRetry: () => void;
}) {
	const { t } = useTranslation();
	if (notFoundText && isNotFound(error)) {
		return <EmptyState variant="error" title={notFoundText} compact />;
	}

	return (
		<div className={styles.loadError} role="alert">
			<EmptyState variant="error" title={t('Could not load.')} compact />
			<Button text={t('Retry')} variant="secondary" onClick={onRetry} />
		</div>
	);
}

export function Loading() {
	const { t } = useTranslation();

	return (
		<p className={styles.status} role="status">
			{t('Loading…')}
		</p>
	);
}

/** The "history is capped" line shared by teacher and school views. */
export function TruncatedNote() {
	const { t } = useTranslation();

	return (
		<p className={styles.notice}>
			{t('History is limited to the newest 100 lessons; totals may be incomplete.')}
		</p>
	);
}

export function PrivacyNote() {
	const { t } = useTranslation();

	return (
		<p className={styles.notice}>
			{t(
				'Active time counts visible teacher and supervision screens after interaction. Daily totals only; no page URLs or keystrokes are recorded.',
			)}
		</p>
	);
}
