// Third party imports
import { Link } from 'react-router';

// Custom components
import BackArrowIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import StatementSettings from '@/view/pages/statement/components/settings/StatementSettings';
import styles from './AddStatement.module.scss';

export const AddStatement = () => {
	const { t, dir } = useTranslation();

	return (
		<main className={`page slide-out ${styles.addStatement}`}>
			<div className={`page__header app-header app-header--sticky ${dir} ${styles.header}`}>
				<div className="app-header-wrapper">
					{dir === 'rtl' ? (
						<>
							<div className="app-header-spacer" />
							<h1 className="app-header-title">{t('Add New Group')}</h1>
							<Link
								to={'/home'}
								state={{ from: window.location.pathname }}
								className="app-header-back-button"
								aria-label="Back to Home page"
							>
								<BackArrowIcon className="back-arrow-icon" />
							</Link>
						</>
					) : (
						<>
							<Link
								to={'/home'}
								state={{ from: window.location.pathname }}
								className="app-header-back-button"
								aria-label="Back to Home page"
							>
								<BackArrowIcon className="back-arrow-icon" />
							</Link>
							<h1 className="app-header-title">{t('Add New Group')}</h1>
							<div className="app-header-spacer" />
						</>
					)}
				</div>
			</div>
			<StatementSettings />
		</main>
	);
};

export default AddStatement;
