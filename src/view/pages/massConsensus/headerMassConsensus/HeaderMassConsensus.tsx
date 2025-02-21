import { Link, useParams } from 'react-router';
import BackIcon from '../../../../assets/icons/chevronLeftIcon.svg?react';
import styles from './HeaderMassConsensus.module.scss';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { HomeIcon } from 'lucide-react';

const HeaderMassConsensus = ({ backTo, backToApp, title, isIntro }: { backTo: MassConsensusPageUrls, backToApp?: boolean, title?: string, isIntro?: boolean }) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { dir, lang } = useParamsLanguage();

	return (
		<div className={styles.headerMC} style={{ direction: dir }}>
			<Link
				className={
					dir === 'ltr'
						? styles.back
						: `${styles.back} ${styles['back--ltr']}`
				}
				to={
					backToApp
						? `/statement/${statementId}`
						: `/mass-consensus/${statementId}/${backTo}?lang=${lang}`
				}
			>
				<BackIcon />
			</Link>
			<h1 className={styles.title}>{title}</h1>
			{isIntro? "":<Link className={`${styles.home}`}
						to={backToApp ? `/statement/${statementId}` : `/mass-consensus/${statementId}/${backTo}?lang=${lang}`}>
					<HomeIcon />
				</Link>
			}
		</div >
	)
}

export default HeaderMassConsensus
