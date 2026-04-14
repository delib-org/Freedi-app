'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import {
	getResearchConsent,
	saveResearchConsent,
} from '@/lib/utils/researchConsentService';
import Modal from './Modal';
import styles from './ResearchConsentBanner.module.scss';

interface ResearchConsentBannerProps {
	topParentId: string;
}

export default function ResearchConsentBanner({
	topParentId,
}: ResearchConsentBannerProps) {
	const { t } = useTranslation();
	const [showBanner, setShowBanner] = useState(false);
	const [userId, setUserId] = useState<string>('');

	useEffect(() => {
		if (!topParentId) return;

		const uid = getOrCreateAnonymousUser();
		setUserId(uid);

		getResearchConsent(uid, topParentId).then((consent) => {
			if (consent === null) {
				setShowBanner(true);
			}
		});
	}, [topParentId]);

	if (!showBanner || !userId) return null;

	async function handleConsent(consented: boolean) {
		await saveResearchConsent(userId, topParentId, consented);
		setShowBanner(false);
	}

	return (
		<Modal onClose={() => handleConsent(false)} size="small">
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
		</Modal>
	);
}
