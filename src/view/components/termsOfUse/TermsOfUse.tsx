import Button, { ButtonType } from '../buttons/button/Button';
import Modal from '../modal/Modal';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import './TermsOfUse.scss';

interface Props {
	handleAgreement: (agree: boolean, agreement: string) => void;
	agreement: string;
}

export default function TermsOfUse({
	handleAgreement,
	agreement,
}: Readonly<Props>) {
	const { t } = useUserConfig();

	return (
		<Modal>
			<div className='terms-of-use' data-cy='termsOfUse'>
				<h1 className='terms-of-use-title'>{t('terms of use')}</h1>
				<p>{agreement}</p>
				<div className='btns'>
					<Button
						text={t('Agree')}
						onClick={() => handleAgreement(true, agreement)}
						className='btn btn--primary'
					/>
					<Button
						data-cy='agree-btn'
						text={t("Don't agree")}
						onClick={() => handleAgreement(false, agreement)}
						buttonType={ButtonType.SECONDARY}
					/>
				</div>
			</div>
		</Modal>
	);
}
