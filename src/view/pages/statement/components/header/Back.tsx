import { FC } from 'react';
import { useNavigate } from 'react-router';
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { StyleProps } from '@/controllers/hooks/useStatementColor';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { Statement } from '@/types/statement/StatementTypes';

interface Props {
	statement: Statement | undefined;
	headerColor: StyleProps;
}

const Back: FC<Props> = ({ statement, headerColor }) => {
	const navigate = useNavigate();
	const { initialRoute } = useAuthentication();

	function handleBack() {
		try {
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

			if (initialRoute === undefined) {
				return navigate(`/statement/${statement?.parentId}/chat`, {
					state: { from: window.location.pathname },
				});
			}

			if (!initialRoute || !statement)
				return navigate('/home', {
					state: { from: window.location.pathname },
				});

			return navigate(initialRoute, {
				state: { from: window.location.pathname },
			});
		} catch (error) {
			console.error(error);
		}
	}

	return (
		<button
			className='page__header__wrapper__actions__iconButton'
			aria-label='Back Button'
			onClick={handleBack}
			style={{ cursor: 'pointer' }}
			data-cy='back-icon-header'
		>
			<BackArrowIcon
				className='back-arrow-icon'
				style={{
					color: headerColor.color,
				}}
			/>
		</button>
	);
};

export default Back;
