import { Link, useParams } from 'react-router';
import { useLanguageParams } from '../useParamsLang/useLanguageParams';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const MassConsensusFooter = ({
	goTo,
	isIntro,
	isNextActive,
	onNext,
}: {
	goTo: MassConsensusPageUrls;
	isIntro?: boolean;
	isNextActive?: boolean;
	onNext?: () => void;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { lang } = useLanguageParams();
	const { t } = useUserConfig();

	return (
		<div className={styles.footerMC}>
			{isIntro ? null : (
				<button
					className={`btn btn--large btn--secondary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={onNext}
				>
					{t('next')}
				</button>
			)}
			<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
				<button className='btn btn--large btn--primary'>
					{isIntro ? t('start') : t('skip')}
				</button>
			</Link>
		</div>
	);
};

export default MassConsensusFooter;
