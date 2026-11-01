import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './YouTubeEmbed.module.scss';

interface YouTubeEmbedProps {
	embedUrl: string;
}

const YouTubeEmbed: FC<YouTubeEmbedProps> = ({ embedUrl }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.youTubeEmbed}>
			<iframe
				className={styles.frame}
				src={embedUrl}
				title={t('YouTube video player')}
				loading="lazy"
				allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
				referrerPolicy="strict-origin-when-cross-origin"
				allowFullScreen
			/>
		</div>
	);
};

export default YouTubeEmbed;
