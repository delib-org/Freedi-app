import { MassConsensusPageUrls } from '@/types/TypeEnums'
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import Button, { ButtonType } from '@/view/components/buttons/button/Button'
import Input from '@/view/components/input/Input'
import { MailIcon } from 'lucide-react'
import './LeaveFeedback.scss'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLanguage } from '@/controllers/hooks/useLanguages'

function LeaveFeedback() {
	const navigate = useNavigate();
	const { t } = useLanguage();
	const [email, setEmail] = useState('');

	const handleSendButton = () => {
		console.log('send', email);
	}

	const handleEmailChange = (value: string) => {
		setEmail(value);
	};

	return (
		<div className='leave-feedback'>
			<HeaderMassConsensus title="הרשמה" backTo={MassConsensusPageUrls.voting} />
			<div className="wrapper main-wrap">
				<p>
					{t('Thank you for your participation.')}
				</p>
				<p>
					{t('Please leave your email to receive updates.')}
				</p>
				<div className='input-line'>
					<Input
						placeholder={t('Mail')}
						name='email'
						label=''
						onChange={handleEmailChange}
					/>
					<MailIcon />
				</div>
				<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "1rem" }}>
					<Button text={t('Send')} onClick={handleSendButton} />

					<a href="https://freedi.co" target="_blank" style={{ color: "var(--text-blue)", margin: "0 0 3rem 0" }}>
						{t('Yours FreeDi')}
					</a>
					<Button text={t('Back')} onClick={() => { navigate(-1) }} buttonType={ButtonType.SECONDARY} />
				</div>
			</div>
		</div>
	)
}

export default LeaveFeedback