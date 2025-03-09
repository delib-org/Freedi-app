// Third party imports
import { Link } from 'react-router';

// Custom components
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementSettings from '@/view/pages/statement/components/settings/StatementSettings';
import './AddStatement.scss';

export const AddStatement = () => {
	const { t, dir } = useUserConfig();

	return (
		<main className={`page slide-out add-statement`}>
			<div className={`page__header ${dir}`}>
				<Link
					to={'/home'}
					state={{ from: window.location.pathname }}
					className='back-arrow-icon'
					aria-label='Back to Home page'
				>
					<BackArrowIcon />
				</Link>
				<h1>{t('Add New Group')}</h1>
			</div>
			<StatementSettings />
		</main>
	);
};

export default AddStatement;
