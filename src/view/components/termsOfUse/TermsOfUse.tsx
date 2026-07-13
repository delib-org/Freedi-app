import Button, { ButtonType } from '../buttons/button/Button';
import Modal from '../modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './TermsOfUse.module.scss';

interface Props {
	handleAgreement: (agree: boolean, agreement: string) => void;
	agreement: string;
	error?: string | null;
	isSaving?: boolean;
}

export default function TermsOfUse({
	handleAgreement,
	agreement,
	error,
	isSaving = false,
}: Readonly<Props>) {
	const { t } = useTranslation();

	return (
		<Modal>
			<div className={styles.termsOfUse} data-cy="termsOfUse">
				<h1 className={styles.termsOfUseTitle}>{t('terms of use')}</h1>
				<p>{agreement}</p>
				{error && (
					<p className={styles.termsOfUseError} role="alert" data-cy="termsOfUse-error">
						{error}
					</p>
				)}
				<div className="btns">
					<Button
						text={isSaving ? t('Saving...') : t('Agree')}
						onClick={() => handleAgreement(true, agreement)}
						className="btn btn--primary"
						disabled={isSaving}
					/>
					<Button
						data-cy="agree-btn"
						text={t("Don't agree")}
						onClick={() => handleAgreement(false, agreement)}
						buttonType={ButtonType.SECONDARY}
						disabled={isSaving}
					/>
				</div>
			</div>
		</Modal>
	);
}
