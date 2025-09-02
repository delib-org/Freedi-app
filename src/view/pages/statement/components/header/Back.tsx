import { FC } from 'react';
import { useNavigate } from 'react-router';
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { StyleProps } from '@/controllers/hooks/useStatementColor';
import { Statement } from 'delib-npm';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

interface Props {
	statement?: Statement | undefined;
	headerColor?: StyleProps;
}

const Back: FC<Props> = ({ statement, headerColor }) => {
	const navigate = useNavigate();
	const { initialRoute } = useAuthentication();

	function handleBack() {
		try {
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

			if (initialRoute === undefined) {
				return navigate(`/statement/${statement?.parentId}`, {
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
			className='app-header-back-button'
			aria-label='Back Button'
			onClick={handleBack}
			data-cy='back-icon-header'
		>
			<BackArrowIcon
				className='back-arrow-icon'
				style={{
					color: headerColor?.color || "white",
				}}
			/>
		</button>
	);
};

export default Back;
