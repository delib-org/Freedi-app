import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface LockedBannerProps {
	message?: string;
	lockedText?: string;
}

const LockedBanner: FC<LockedBannerProps> = ({ message, lockedText }) => {
	const { t } = useTranslation();

	return (
		<div className="locked-banner" role="status">
			<span className="locked-banner__icon" aria-hidden="true">
				🔒
			</span>
			<div className="locked-banner__text">
				{message || t('This content has been locked')}
				{lockedText && (
					<>
						: <strong>{lockedText}</strong>
					</>
				)}
			</div>
		</div>
	);
};

export default LockedBanner;
