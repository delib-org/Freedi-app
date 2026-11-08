'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import {
	getResearchConsent,
	saveResearchConsent,
} from '@/lib/utils/researchConsentService';
import styles from './ResearchConsentBanner.module.css';

interface ResearchConsentBannerProps {
	topParentId: string;
	enableResearchLogging: boolean;
}

export default function ResearchConsentBanner({
	topParentId,
	enableResearchLogging,
}: ResearchConsentBannerProps) {
	const { t } = useTranslation();
	const [showBanner, setShowBanner] = useState(false);
	const { user } = useAuth();
	const userId = user?.uid ?? '';

	useEffect(() => {
		if (!enableResearchLogging || !topParentId || !userId) return;

		getResearchConsent(userId, topParentId).then((consent) => {
			if (consent === null) {
				setShowBanner(true);
			}
		});
	}, [enableResearchLogging, topParentId, userId]);

	useEffect(() => {
		if (showBanner) {
			document.body.style.overflow = 'hidden';
		}

		return () => {
			document.body.style.overflow = '';
		};
	}, [showBanner]);

	if (!showBanner || !userId) return null;

	async function handleConsent(consented: boolean) {
		await saveResearchConsent(userId, topParentId, consented);
		setShowBanner(false);
	}

	return (
		<div className={styles.overlay}>
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
					{t(
						'The information collected is anonymous and used for statistical analysis only. You may stop participating at any stage.',
					)}
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
		</div>
	);
}
