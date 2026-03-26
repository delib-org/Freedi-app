import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import LockIcon from '@/assets/icons/lockIcon.svg?react';
import UnlockIcon from '@/assets/icons/unlockIcon.svg?react';

interface LockedBannerProps {
	message?: string;
	lockedText?: string;
	onUnlock?: () => void;
}

const LockedBanner: FC<LockedBannerProps> = ({ message, lockedText, onUnlock }) => {
	const { t } = useTranslation();

	return (
		<div className="locked-banner" role="status">
			<span className="locked-banner__icon" aria-hidden="true">
				<LockIcon />
			</span>
			<div className="locked-banner__text">
				{message || t('This content has been locked')}
				{lockedText && (
					<>
						: <strong>{lockedText}</strong>
					</>
				)}
			</div>
			{onUnlock && (
				<button
					className="locked-banner__unlock"
					onClick={onUnlock}
					aria-label={t('Unlock Title')}
					title={t('Unlock Title')}
				>
					<UnlockIcon />
				</button>
			)}
		</div>
	);
};

export default LockedBanner;
