import { FC, useEffect, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	getResearchConsent,
	saveResearchConsent,
} from '@/controllers/db/researchLogs/researchConsentService';
import Modal from '@/view/components/modal/Modal';
import styles from './ResearchConsentBanner.module.scss';

interface ResearchConsentBannerProps {
	topParentId: string;
}

const ResearchConsentBanner: FC<ResearchConsentBannerProps> = ({ topParentId }) => {
	const { t } = useTranslation();
	const creator = useAppSelector(creatorSelector);
	const [showBanner, setShowBanner] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!creator?.uid || !topParentId) {
			setLoading(false);

			return;
		}

		getResearchConsent(creator.uid, topParentId).then((consent) => {
			// Show banner only if no consent record exists yet
			if (consent === null) {
				setShowBanner(true);
			}
			setLoading(false);
		});
	}, [creator?.uid, topParentId]);

	if (loading || !showBanner || !creator?.uid) return null;

	async function handleConsent(consented: boolean) {
		if (!creator?.uid) return;
		await saveResearchConsent(creator.uid, topParentId, consented);
		setShowBanner(false);
	}

	return (
		<Modal>
			<div className={styles.banner}>
				<div className={styles.icon}>&#128300;</div>
				<h2 className={styles.title}>{t('Academic Research')}</h2>
				<p className={styles.message}>
					{t(
						'This discussion is part of academic research aimed at improving democratic decision-making. By consenting, you help improve our democracy.',
					)}
				</p>
				<p className={styles.privacy}>
					{t('All data is collected anonymously — no personal information is stored.')}
				</p>
				<p className={styles.optOut}>
					{t('You may opt out and continue participating without being tracked.')}
				</p>
				<div className={styles.buttons}>
					<button className={styles.consentBtn} onClick={() => handleConsent(true)}>
						{t('I Consent')}
					</button>
					<button className={styles.declineBtn} onClick={() => handleConsent(false)}>
						{t('No Thanks')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ResearchConsentBanner;
