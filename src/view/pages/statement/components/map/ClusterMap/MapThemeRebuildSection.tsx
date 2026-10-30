import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ThemeRebuildButton, {
	type ThemeRebuildNotice,
} from '@/view/pages/statement/components/settings/components/synthesisPanel/ThemeRebuildButton';
import styles from './MapThemeRebuildSection.module.scss';

interface MapThemeRebuildSectionProps {
	questionId: string;
}

/**
 * "Re-theme with AI" inside the map's settings drawer. The button, busy state
 * and preview dialog are the same ones the synthesis panel uses; this only
 * frames them as a drawer section and shows the outcome under the button.
 */
const MapThemeRebuildSection: FC<MapThemeRebuildSectionProps> = ({ questionId }) => {
	const { t } = useTranslation();
	const [notice, setNotice] = useState<ThemeRebuildNotice | null>(null);

	return (
		<section className="admin-drawer__section" data-testid="map-theme-rebuild">
			<span className="admin-drawer__section-title">{t('Themes')}</span>
			<div className="admin-drawer__row">
				<ThemeRebuildButton
					questionId={questionId}
					fullWidth
					previewClassName={styles.preview}
					onNotice={setNotice}
				/>
				<p className="admin-drawer__row-help">
					{t("Let AI regroup all ideas into themes. You'll see a preview before anything changes.")}
				</p>
				{notice && (
					<p className={styles.notice} data-tone={notice.tone} role="status">
						{notice.message}
					</p>
				)}
			</div>
		</section>
	);
};

export default MapThemeRebuildSection;
