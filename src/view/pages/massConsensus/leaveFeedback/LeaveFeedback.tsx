import { MassConsensusPageUrls } from 'delib-npm';
import { MailIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import styles from './LeaveFeedback.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useLeaveFeedback } from './LeaveFeedbackVM';
import { useHeader } from '../headerMassConsensus/HeaderContext';

function LeaveFeedback() {
	const { t } = useUserConfig();
	const { handleSendButton, handleEmailChange, MailStatus } = useLeaveFeedback();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Sign up'),
			backTo: MassConsensusPageUrls.voting,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	const handleSendButton = () => {
		return email;
	};

	const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setEmail(value);
	};

	return (
		<div>
			<TitleMassConsensus
				title={t('Thank you for your participation')}
			/>
			<div className={styles.feedback}>
				<h3>{t('Please leave your email to receive updates')}</h3>
				<div className={styles.input}>
					{/* <Input
						placeholder={t('Mail')}
						name='email'
						label=''
						onChange={handleEmailChange}
					/> */}
					<input placeholder={t('Mail')} type='email' name='email' onChange={handleEmailChange} />

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
