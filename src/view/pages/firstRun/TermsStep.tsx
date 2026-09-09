import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Button } from '@/view/components/atomic/atoms/Button';
import styles from './FirstRunFlow.module.scss';

export interface TermsStepProps {
	agreementText: string;
	/** When set, the optional research-consent checkbox is offered. */
	researchTopic?: string;
	error: string | null;
	isSaving: boolean;
	onAccept: (researchConsent: boolean | undefined) => void;
	onDecline: () => void;
}

const TermsStep: FC<TermsStepProps> = ({
	agreementText,
	researchTopic,
	error,
	isSaving,
	onAccept,
	onDecline,
}) => {
	const { t } = useTranslation();
	const [research, setResearch] = useState(false);
	const offersResearch = researchTopic !== undefined;

	return (
		<section className={styles.step} data-testid="first-run-terms">
			<h2 className={styles.step__title}>{t('firstRun.termsTitle')}</h2>
			<p className={styles.step__body}>{agreementText}</p>

			{offersResearch && (
				<label className={styles.consent}>
					<input
						type="checkbox"
						checked={research}
						onChange={(event) => setResearch(event.target.checked)}
						id="first-run-research-consent"
					/>
					<span>
						<strong>{t('firstRun.researchTitle')}</strong>
						<br />
						{t('firstRun.researchBody')}
					</span>
				</label>
			)}

			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}

			<div className={styles.actions}>
				<Button
					text={t('Agree')}
					variant="primary"
					loading={isSaving}
					disabled={isSaving}
					onClick={() => onAccept(offersResearch ? research : undefined)}
					id="first-run-accept"
				/>
				<Button
					text={t("Don't agree")}
					variant="secondary"
					disabled={isSaving}
					onClick={onDecline}
					id="first-run-decline"
				/>
			</div>
		</section>
	);
};

export default TermsStep;
