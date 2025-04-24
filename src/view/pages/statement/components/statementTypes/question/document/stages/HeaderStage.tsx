import InfoImage from '@/assets/images/multiStageQuestion/info.png';
import QuestionImage from '@/assets/images/multiStageQuestion/questions.png';
import SuggestionImage from '@/assets/images/multiStageQuestion/suggestions.png';
import VotingImage from '@/assets/images/multiStageQuestion/voting.png';
import SummaryImage from '@/assets/images/multiStageQuestion/summary.png';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import React from 'react';
import styles from './StageList.module.scss';
import { Statement } from 'delib-npm';

type HeaderProps = {
	imageType: 'info' | 'questions' | 'suggestions' | 'voting' | 'summary';
	statement?: Statement;
};

const imagesMap: Record<HeaderProps['imageType'], string> = {
	info: InfoImage,
	questions: QuestionImage,
	suggestions: SuggestionImage,
	voting: VotingImage,
	summary: SummaryImage,
};

type StageInfo = {
	title: string;
	description: string;
}

const HeaderStage: React.FC<HeaderProps> = ({ imageType, statement }) => {
	const imageSrc = imagesMap[imageType];

	const stageInfoMap: Record<HeaderProps['imageType'], StageInfo> = {
		info: {
			title: "Topic description",
			description: statement ? statement.description : ""
		},
		questions: {
			title: "Research questions",
			description: "Research questions the solution should address"
		},
		suggestions: {
			title: "Suggestions",
			description: "Possible solutions for discussed issue"
		},
		voting: {
			title: "Voting",
			description: "Choosing a suggestion in a vote"
		},
		summary: {
			title: "Summary",
			description: "Discussion summary"
		}
	};

	return (
		<div className={styles.description}>
			<img src={imageSrc} alt={imageType} />
			<header className={styles.stageHeader}>

				<div className={styles.headerContent}>
					<div className={styles.headerTitle}><InfoIcon />{stageInfoMap[imageType].title}</div>
					<div style={{ display: 'flex', alignItems: 'center' }}>{stageInfoMap[imageType].description}</div>
				</div>
			</header>
		</div>
	);
};

export default HeaderStage;