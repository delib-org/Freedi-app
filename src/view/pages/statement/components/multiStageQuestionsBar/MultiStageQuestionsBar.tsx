import styles from './MultiStageQuestionsBar.module.scss';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import SmileSuggestionIcon from '@/assets/icons/smileSuggestionIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useNavigate, useParams } from 'react-router';
import { useContext } from 'react';
import { StatementContext } from '../../StatementCont';

const MultiStageQuestionsBar = () => {
	const navigate = useNavigate();
	const { dir } = useUserConfig();
	const { statementId } = useParams<{ statementId: string }>();
	const { statement } = useContext(StatementContext);

	const getButtonClasses = (baseClasses: string) => {
		return `${styles.barPanelBtn} ${baseClasses} ${dir === 'rtl' ? styles.rtl : styles.ltr}`;
	};

	return (
		<div className={styles.bar}>
			<div className={`${styles.barPanel} ${dir === 'rtl' ? styles.rtl : styles.ltr}`}>
				<button className={getButtonClasses(`${styles.info} ${styles.active}`)}><InfoIcon /></button>
				<button className={getButtonClasses(styles.questions)}><QuestionIcon /></button>
				<button className={getButtonClasses(styles.suggestions)}><SmileSuggestionIcon /></button>
				<button className={getButtonClasses(styles.voting)}><HandIcon /></button>
				<button className={getButtonClasses(styles.summary)}><FlagIcon /></button>
			</div>
		</div>
	);
};

export default MultiStageQuestionsBar;