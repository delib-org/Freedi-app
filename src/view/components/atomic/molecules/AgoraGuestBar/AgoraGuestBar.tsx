import React from 'react';
import clsx from 'clsx';
import { Button } from '@/view/components/atomic/atoms/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface AgoraGuestBarProps {
	/** "Back to the village" — absent while the way back is not known yet */
	onBack?: () => void;
	/** The back is on its way (signing out, closing the tab) */
	leaving?: boolean;
	className?: string;
}

/**
 * The guest bar: "A task from your Agora lesson" and the one exit, "Back to
 * the village". All styling lives in `style/molecules/_agora-guest-bar.scss`.
 */
const AgoraGuestBar: React.FC<AgoraGuestBarProps> = ({ onBack, leaving = false, className }) => {
	const { t } = useTranslation();

	return (
		<div
			className={clsx('agora-guest-bar', className)}
			role="region"
			aria-label={t('A task from your Agora lesson')}
		>
			<p className="agora-guest-bar__text">{t('A task from your Agora lesson')}</p>
			{onBack && (
				<Button
					text={t('Back to the village')}
					variant="primary"
					size="small"
					loading={leaving}
					disabled={leaving}
					onClick={onBack}
					className="agora-guest-bar__back"
				/>
			)}
		</div>
	);
};

export default AgoraGuestBar;
