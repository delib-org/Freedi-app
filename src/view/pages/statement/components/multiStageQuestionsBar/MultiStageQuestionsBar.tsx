import styles from './MultiStageQuestionsBar.module.scss';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import SmileSuggestionIcon from '@/assets/icons/smileSuggestionIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { FC, useEffect, useState } from 'react';

interface Props {
	questions?: boolean,
	suggestions?: boolean,
	voting?: boolean,
	summary?: boolean,
}

const sectionIds = ['info', 'questions', 'suggestions', 'voting', 'summary'] as const;
type SectionId = (typeof sectionIds)[number];

const MultiStageQuestionsBar: FC<Props> = ({ questions, suggestions, voting, summary }) => {
	const { dir } = useUserConfig();
	const [activeSection, setActiveSection] = useState<SectionId>('info');

	const getButtonClasses = (baseClasses: string, id: SectionId) => {
		return `${styles.barPanelBtn} ${baseClasses} ${dir === 'rtl' ? styles.rtl : styles.ltr} ${activeSection === id ? styles.active : ''}`;
	};

	const scrollToSection = (id: SectionId) => {
		const section = document.getElementById(id);
		if (section) {
			section.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.find(entry => entry.isIntersecting);
				if (visible?.target.id && sectionIds.includes(visible.target.id as SectionId)) {
					setActiveSection(visible.target.id as SectionId);
				}
			},
			{
				root: null,
				rootMargin: '0px',
				threshold: 0.4,
			}
		);

		sectionIds.forEach(id => {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		});

		return () => observer.disconnect();
	}, []);

	return (
		<div className={styles.bar}>
			<div className={`${styles.barPanel} ${dir === 'rtl' ? styles.rtl : styles.ltr}`}>
				<button className={getButtonClasses(styles.info, 'info')} onClick={() => scrollToSection('info')}><InfoIcon /></button>
				{questions && (
					<button className={getButtonClasses(styles.questions, 'questions')} onClick={() => scrollToSection('questions')}><QuestionIcon /></button>
				)}
				{suggestions && (
					<button className={getButtonClasses(styles.suggestions, 'suggestions')} onClick={() => scrollToSection('suggestions')}><SmileSuggestionIcon /></button>
				)}
				{voting && (
					<button className={getButtonClasses(styles.voting, 'voting')} onClick={() => scrollToSection('voting')}><HandIcon /></button>
				)}
				{summary && (
					<button className={getButtonClasses(styles.summary, 'summary')} onClick={() => scrollToSection('summary')}><FlagIcon /></button>
				)}
			</div>
		</div>
	);
};

export default MultiStageQuestionsBar;
