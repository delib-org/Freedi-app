import { FC } from 'react';
import { useNavigate } from 'react-router';
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { StyleProps } from '@/controllers/hooks/useStatementColor';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

interface Props {
	statement?: Statement | undefined;
	headerColor?: StyleProps;
}

const Back: FC<Props> = ({ statement, headerColor }) => {
	const navigate = useNavigate();

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
			className="app-header-back-button"
			aria-label="Back Button"
			onClick={handleBack}
			data-cy="back-icon-header"
		>
			<BackArrowIcon
				className="back-arrow-icon"
				style={{
					color: headerColor?.color || 'white',
				}}
			/>
		</button>
	);
};

export default Back;
