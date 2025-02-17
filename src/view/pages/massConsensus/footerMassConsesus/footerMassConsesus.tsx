import { Link, useParams } from 'react-router';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

const FooterMassConsensus = ({ goTo, isIntro }: { goTo: MassConsensusPageUrls, isIntro?: boolean }) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { lang } = useParamsLanguage();

	return (
		<div className="btns">
			{isIntro? "":<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
				<button className="btn btn--large btn--secondary">skip</button>
			</Link>}
			<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
				<button className="btn btn--large btn--primary">{isIntro? "start": "next"}</button>
			</Link>
		</div>
	)
}

export default FooterMassConsensus
