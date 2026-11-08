import { FC } from 'react';
import { useNavigate } from 'react-router';
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { StyleProps } from '@/controllers/hooks/useStatementColor';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface Props {
	statement?: Statement | undefined;
	headerColor?: StyleProps;
	/** Replaces the legacy `app-header-back-button` class (the new question header). */
	className?: string;
	/** When set, the icon takes its colour from this class instead of headerColor. */
	iconClassName?: string;
}

const Back: FC<Props> = ({ statement, headerColor, className, iconClassName }) => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	function handleBack() {
		try {
			if (location.pathname.includes('statement-screen')) {
				return navigate(`/statement/${statement?.statementId}`, {
					state: { from: window.location.pathname },
				});
			}
			if (location.pathname.includes('my')) {
				return navigate('/home', {
					state: { from: window.location.pathname },
				});
			}
			if (location.pathname.includes('stage')) {
				return navigate(`/statement/${statement?.statementId}`, {
					state: { from: window.location.pathname },
				});
			}
			if (statement?.parentId === 'top' || !statement?.parentId) {
				return navigate('/home', {
					state: { from: window.location.pathname },
				});
			}

			return navigate(`/statement/${statement.parentId}`, {
				state: { from: window.location.pathname },
			});
		} catch (error) {
			logError(error, { operation: 'header.Back.unknown' });
		}
	}

	return (
		<button
			type="button"
			className={className ?? 'app-header-back-button'}
			aria-label={t('Back')}
			onClick={handleBack}
			data-cy="back-icon-header"
		>
			{iconClassName ? (
				<BackArrowIcon className={iconClassName} aria-hidden="true" />
			) : (
				<BackArrowIcon
					className="back-arrow-icon"
					style={{
						color: headerColor?.color || 'white',
					}}
				/>
			)}
		</button>
	);
};

export default Back;
