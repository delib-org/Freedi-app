import styles from './MultiStageQuestionsBar.module.scss';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import SmileSuggestionIcon from '@/assets/icons/smileSuggestionIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useNavigate, useParams } from 'react-router';
import { FC, useContext } from 'react';
import { StatementContext } from '../../StatementCont';

interface Props {
	questions?: boolean,
	suggestions?: boolean,
	voting?: boolean,
	summary?: boolean
	// Props expected for the navigation bar, likely including an array of navigation items.
}

const MultiStageQuestionsBar: FC<Props> = ({ questions, suggestions, voting, summary }) => {
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
				{/* Implementing anchors using standard HTML <a> tags and the 'href' attribute referencing element IDs. */}
				<button className={getButtonClasses(styles.info)}><InfoIcon /></button>
				{questions && <button className={getButtonClasses(styles.questions)}><QuestionIcon /></button>}
				{suggestions && <button className={getButtonClasses(styles.suggestions)}><SmileSuggestionIcon /></button>}
				{voting && <button className={getButtonClasses(styles.voting)}><HandIcon /></button>}
				{summary && <button className={getButtonClasses(styles.summary)}><FlagIcon /></button>}
			</div>
		</div>
	);
};

export default MultiStageQuestionsBar;