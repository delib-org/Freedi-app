import styles from './MultiStageQuestionsBar.module.scss';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import SmileSuggestionIcon from '@/assets/icons/smileSuggestionIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { FC, useEffect, useState, useRef } from 'react';
import { Statement } from 'delib-npm';

interface Props {
	infoData?: Statement | null;
	questionsData?: Statement[];
	suggestionsData?: Statement[];
	votingData?: Statement[];
	summaryData?: Statement[];
}

const sectionIds = ['info', 'questions', 'suggestions', 'voting', 'summary'] as const;
type SectionId = (typeof sectionIds)[number];

const MultiStageQuestionsBar: FC<Props> = ({
	infoData,
	questionsData = [],
	suggestionsData = [],
	votingData = [],
	summaryData = []
}) => {
	const { dir } = useUserConfig();
	const [activeSection, setActiveSection] = useState<SectionId>('info');
	const manualScrollRef = useRef(false);
	const timeoutRef = useRef<number | undefined>(undefined);

	const hasInfo = !!infoData;
	const hasQuestions = questionsData.length > 0;
	const hasSuggestions = suggestionsData.length > 0;
	const hasVoting = votingData.length > 0;
	const hasSummary = summaryData.length > 0;

	const availableSections = sectionIds.filter(id => {
		switch (id) {
			case 'info': return hasInfo;
			case 'questions': return hasQuestions;
			case 'suggestions': return hasSuggestions;
			case 'voting': return hasVoting;
			case 'summary': return hasSummary;
			default: return false;
		}
	});

	useEffect(() => {
		if (availableSections.length > 0 && !availableSections.includes(activeSection)) {
			setActiveSection(availableSections[0]);
		}
	}, [availableSections, activeSection]);

	const getButtonClasses = (baseClasses: string, id: SectionId) => {
		return `${styles.barPanelBtn} ${baseClasses} ${dir === 'rtl' ? styles.rtl : styles.ltr} ${activeSection === id ? styles.active : ''}`;
	};

	const scrollToSection = (id: SectionId) => {
		setActiveSection(id);

		manualScrollRef.current = true;

		if (timeoutRef.current !== undefined) {
			window.clearTimeout(timeoutRef.current);
		}

		const section = document.getElementById(id);
		if (section) {
			section.scrollIntoView({ behavior: 'smooth', block: 'start' });

			timeoutRef.current = window.setTimeout(() => {
				manualScrollRef.current = false;
			}, 1000);
		}
	};

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (manualScrollRef.current) return;

				const visibleEntries = entries.filter(entry => entry.isIntersecting);

				if (visibleEntries.length > 0) {
					const mostVisible = visibleEntries.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

					if (mostVisible?.target.id && sectionIds.includes(mostVisible.target.id as SectionId)) {
						setActiveSection(mostVisible.target.id as SectionId);
					}
				}
			},
			{
				root: null,
				rootMargin: '-10% 0px -70% 0px',
				threshold: [0.1, 0.2, 0.3, 0.4, 0.5],
			}
		);

		availableSections.forEach(id => {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		});

		return () => {
			observer.disconnect();
			if (timeoutRef.current !== undefined) {
				window.clearTimeout(timeoutRef.current);
			}
		};
	}, [availableSections]);

	return (
		<div className={styles.bar}>
			<div className={`${styles.barPanel} ${dir === 'rtl' ? styles.rtl : styles.ltr}`}>
				{hasInfo && (
					<button className={getButtonClasses(styles.info, 'info')} onClick={() => scrollToSection('info')}>
						<InfoIcon />
					</button>
				)}

				{hasQuestions && (
					<button className={getButtonClasses(styles.questions, 'questions')} onClick={() => scrollToSection('questions')}>
						<QuestionIcon />
					</button>
				)}

				{hasSuggestions && (
					<button className={getButtonClasses(styles.suggestions, 'suggestions')} onClick={() => scrollToSection('suggestions')}>
						<SmileSuggestionIcon />
					</button>
				)}

				{hasVoting && (
					<button className={getButtonClasses(styles.voting, 'voting')} onClick={() => scrollToSection('voting')}>
						<HandIcon />
					</button>
				)}

				{hasSummary && (
					<button className={getButtonClasses(styles.summary, 'summary')} onClick={() => scrollToSection('summary')}>
						<FlagIcon />
					</button>
				)}
			</div>
		</div>
	);
};

export default MultiStageQuestionsBar;