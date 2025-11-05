import { MassConsensusPageUrls } from 'delib-npm';
import { MailIcon, MessageSquare } from 'lucide-react';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import styles from './LeaveFeedback.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useLeaveFeedback } from './LeaveFeedbackVM';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';

function LeaveFeedback() {
	const { statementId } = useParams();
	const navigate = useNavigate();
	const { t } = useTranslation();
	const {
		handleSendButton,
		handleEmailChange,
		handleFeedbackChange,
		mailStatus,
		feedbackText,
		isSubmitting
	} = useLeaveFeedback();
	const { trackStageCompleted, trackSubmission, trackStageSkipped } = useMassConsensusAnalytics();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Feedback'),
			backToApp: false,
			isIntro: false,
		});
	}, []);

	useEffect(() => {
		if (mailStatus === 'submitted') {
			trackStageCompleted('feedback');
			trackSubmission('feedback');
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.thankYou}`
			);
		}
	}, [mailStatus]);

	return (
		<div>
			<TitleMassConsensus title={t('Help us improve')} />
			<div className={styles.feedback}>
				<p>{t('Your feedback helps us make Freedi better for everyone')}</p>

				<div className={styles.feedbackSection}>
					<div className={styles.textareaWrapper}>
						<MessageSquare className={styles.icon} />
						<textarea
							className={styles.feedbackTextarea}
							placeholder={t('Share your thoughts about this process...')}
							value={feedbackText}
							onChange={handleFeedbackChange}
							maxLength={500}
							rows={4}
							disabled={isSubmitting}
						/>
						<span className={styles.charCount}>
							{feedbackText.length}/500
						</span>
					</div>
				</div>

				<div className={styles.emailSection}>
					<p className={styles.emailLabel}>
						{t('Optional: Leave your email for updates')}
					</p>
					<div className={styles.input}>
						<input
							placeholder={t('your@email.com')}
							type='email'
							name='email'
							onChange={handleEmailChange}
							disabled={isSubmitting}
							onKeyUp={(e) => {
								if (e.key === 'Enter' && feedbackText.trim()) {
									e.preventDefault();
									handleSendButton();
								}
							}}
						/>
						<span className={styles.errorMessage}>
							{mailStatus === 'invalid' ? t('Invalid email format') : null}
						</span>
						<MailIcon />
					</div>
				</div>
			</div>
			<FooterMassConsensus
				isNextActive={feedbackText.trim().length > 0 && !isSubmitting}
				onNext={handleSendButton}
				isFeedback={true}
				onSkip={() => trackStageSkipped('feedback')}
				canSkip={true}
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
