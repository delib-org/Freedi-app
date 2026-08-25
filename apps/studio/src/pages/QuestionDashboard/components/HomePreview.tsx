import type { FC } from 'react';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import styles from './HomePreview.module.scss';

/**
 * HomePreview — a CSS-only phone frame showing what a resident sees after
 * joining: the question title and the ordered activities. Desktop only.
 */
export interface HomePreviewProps {
	title: string;
	activities: DerivedActivity[];
}

const HomePreview: FC<HomePreviewProps> = ({ title, activities }) => {
	const { t } = useTranslation();

	return (
		<aside className={styles.preview} aria-label={t('Participant preview')}>
			<div className={styles.phone}>
				<div className={styles.notch} aria-hidden="true" />
				<div className={styles.screen}>
					<p className={styles.screenTitle} dir="auto">
						{title || t('Untitled')}
					</p>
					<ol className={styles.screenList}>
						{activities.map((activity) => (
							<li key={activity.statementId} className={styles.screenItem}>
								<span aria-hidden="true">{activity.def.icon}</span>
								<span className={styles.screenItemTitle} dir="auto">
									{activity.title || t('Untitled')}
								</span>
							</li>
						))}
					</ol>
				</div>
			</div>
			<p className={styles.caption}>{t('This is what a resident sees after joining.')}</p>
		</aside>
	);
};

export default HomePreview;
