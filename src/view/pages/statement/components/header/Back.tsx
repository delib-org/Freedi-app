import { FC, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { StyleProps } from '@/controllers/hooks/useStatementColor';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useUpTarget } from '@/controllers/hooks/useUpTarget';
import { HOME_PATH } from '@/view/components/atomic/organisms/BottomNav/bottomNavModel';

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
	const resolveUpTarget = useUpTarget(statement);
	// A tap can wait on a read: a newer tap, or leaving the screen, cancels it.
	const latestTap = useRef(0);

	useEffect(
		() => () => {
			latestTap.current += 1;
		},
		[statement?.statementId],
	);

	async function handleBack() {
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

			latestTap.current += 1;
			const tap = latestTap.current;
			const upTarget = await resolveUpTarget();
			if (tap !== latestTap.current) return;

			return navigate(upTarget ? `/statement/${upTarget}` : HOME_PATH, {
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
