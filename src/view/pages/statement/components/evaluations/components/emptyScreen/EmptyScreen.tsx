import { FC } from 'react';
import styles from './EmptyScreen.module.scss';
import ideaImage from '@/assets/images/manWithIdeaLamp.png';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { ChevronDown } from 'lucide-react';
import { Statement } from '@freedi/shared-types';

interface Props {
	statement: Statement;
}

const EmptyScreen: FC<Props> = ({ statement: _statement }) => {
	const { t, learning } = useUserConfig();

	// Check if user is still in learning phase
	const isLearning = (learning?.addOptions ?? 0) > 0;

	return (
		<div className={styles.emptyScreen}>
			<img
				src={ideaImage}
				alt={t('Compose your suggestion')}
				className={styles.ideaImage}
			/>

			<h1 className={styles.title}>
				{isLearning
					? t('Be the first to share your idea!')
					: t('No suggestions yet')
				}
			</h1>

			<p className={styles.subtitle}>
				{isLearning
					? t('Press "Add an answer" to add your suggestion')
					: t('Press the + button to add your suggestion')
				}
			</p>

			{isLearning && <ChevronDown className={styles.arrow} size={32} />}
		</div>
	);
};

export default EmptyScreen;
