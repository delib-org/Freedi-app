import { useTranslation } from '@freedi/shared-i18n/react';
import { AGORA_APP_URL } from '@/config';
import { Button } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import { Notice, useNotice } from '../_shared/Notice';
import styles from './AccessRequests.module.scss';

/** The school's teacher sign-up link: where the Agora request form opens with the school fixed. */
export function signUpUrl(schoolId: string, base: string = AGORA_APP_URL): string {
	return `${base.replace(/\/+$/, '')}/teach/request?school=${encodeURIComponent(schoolId)}`;
}

/**
 * "Teacher sign-up link" with a copy button. Teachers who open it ask for
 * access at this school and their request goes to the school's coordinators.
 */
export default function SignUpLink({ schoolId }: { schoolId: string }) {
	const { t } = useTranslation();
	const { notice, show } = useNotice();
	const url = signUpUrl(schoolId);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			show(t('Copied!'));
		} catch (err) {
			logError(err, { operation: 'SignUpLink.copy', metadata: { schoolId } });
			show(t('Could not copy the link.'), 'error');
		}
	};

	return (
		<section className={styles.signUp} aria-label={t('Teacher sign-up link')}>
			<h3 className={styles.name}>{t('Teacher sign-up link')}</h3>
			<code className={styles.signUpUrl}>{url}</code>
			<Button text={t('Copy link')} variant="secondary" onClick={() => void copy()} />
			<Notice notice={notice} />
		</section>
	);
}
