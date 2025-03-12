import { MassConsensusPageUrls } from 'delib-npm';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import Input from '@/view/components/input/Input';
import { MailIcon } from 'lucide-react';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import styles from './LeaveFeedback.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useLeaveFeedback } from './LeaveFeedbackVM';

function LeaveFeedback() {
	const { t } = useUserConfig();
	const { handleSendButton, handleEmailChange, MailStatus } = useLeaveFeedback();

	return (
		<div>
			<HeaderMassConsensus
				title={t('Sign up')}
				backTo={MassConsensusPageUrls.voting}
			/>
			<TitleMassConsensus
				title={t('Thank you for your participation.')}
			/>
			<div className={`${styles.feedback} wrapper main-wrap`}>
				<p>{t('Please leave your email to receive updates.')}</p>
				<div className={styles.input}>
					<Input
						placeholder={t('Mail')}
						name='email'
						label=''
						onChange={handleEmailChange}
					/>
					<span> {MailStatus === "invalid"? t('Invalid email'): null} </span>
					<MailIcon />
				</div>
			</div>
			<FooterMassConsensus
				isNextActive={true}
				onNext={handleSendButton}
				isFeedback={true}
			/>
			<div style={{ textAlign: 'center', marginTop: '1rem' }}>
				<a
					href='https://freedi.co'
					target='_blank'
					style={{ color: 'var(--text-blue)' }}
				>
					{t('Yours FreeDi')}
				</a>
			</div>
		</div>
	);
}

export default LeaveFeedback;
