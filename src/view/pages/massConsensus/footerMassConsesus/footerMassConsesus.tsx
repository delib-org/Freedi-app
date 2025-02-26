import { Link, useParams } from 'react-router';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import styles from './FooterMassConsensus.module.scss';
import { useLanguage } from '@/controllers/hooks/useLanguages';

const FooterMassConsensus = ({ goTo, isIntro, isNextActive, onNext }: { goTo: MassConsensusPageUrls, isIntro?: boolean, isNextActive?: boolean, onNext?:()=> void }) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { lang } = useParamsLanguage();
	const { t } = useLanguage();

	return (
		<div className={styles.footerMC}>
			{isIntro? null:
				<button
				className={`btn btn--large btn--secondary ${!isNextActive ? 'btn--disabled' : ''}`}
				onClick={onNext}
			  >
				{t('Next')}
			  </button>
			}
			<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
				<button className="btn btn--large btn--primary">{isIntro? t('Start'): t('Skip')}</button>
			</Link>
		</div>
	)
}

export default FooterMassConsensus
