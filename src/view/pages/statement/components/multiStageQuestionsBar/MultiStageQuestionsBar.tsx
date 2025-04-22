import styles from './MultiStageQuestionsBar.module.scss';
import InfoIcon from '@/assets/icons/info.svg?react';
import HandIcon from '@/assets/icons/navVoteIcon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import QuestionIcon from '@/assets/icons/questionIcon.svg?react';
import SmileSuggestionIcon from '@/assets/icons/smileSuggestionIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { FC, useEffect, useState, useRef } from 'react';

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
	const manualScrollRef = useRef(false);
	const timeoutRef = useRef<number | undefined>(undefined);

	const getButtonClasses = (baseClasses: string, id: SectionId) => {
		return `${styles.barPanelBtn} ${baseClasses} ${dir === 'rtl' ? styles.rtl : styles.ltr} ${activeSection === id ? styles.active : ''}`;
	};

	const scrollToSection = (id: SectionId) => {
		// Устанавливаем активный раздел немедленно при клике
		setActiveSection(id);

		// Отмечаем, что это ручной скролл
		manualScrollRef.current = true;

		// Сбрасываем флаг через небольшую задержку после завершения прокрутки
		if (timeoutRef.current !== undefined) {
			window.clearTimeout(timeoutRef.current);
		}

		const section = document.getElementById(id);
		if (section) {
			section.scrollIntoView({ behavior: 'smooth', block: 'start' });

			// Устанавливаем таймаут на сброс флага немного дольше, чем анимация скролла
			timeoutRef.current = window.setTimeout(() => {
				manualScrollRef.current = false;
			}, 1000); // 1 секунда должна быть достаточной для завершения анимации скролла
		}
	};

	useEffect(() => {
		// Используем меньший порог для лучшего определения видимости
		const observer = new IntersectionObserver(
			(entries) => {
				// Если происходит ручной скролл, игнорируем обработку IntersectionObserver
				if (manualScrollRef.current) return;

				// Находим элемент с наибольшей видимостью
				const visibleEntries = entries.filter(entry => entry.isIntersecting);

				if (visibleEntries.length > 0) {
					// Сортируем по коэффициенту пересечения (intersection ratio) в порядке убывания
					const mostVisible = visibleEntries.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

					if (mostVisible?.target.id && sectionIds.includes(mostVisible.target.id as SectionId)) {
						setActiveSection(mostVisible.target.id as SectionId);
					}
				}
			},
			{
				root: null,
				rootMargin: '-10% 0px -70% 0px', // Это дает приоритет элементам ближе к верху видимой области
				threshold: [0.1, 0.2, 0.3, 0.4, 0.5], // Множественные пороги для лучшего определения
			}
		);

		// Наблюдаем только за существующими разделами
		const availableSectionIds = sectionIds.filter(id => {
			switch (id) {
				case 'questions': return !!questions;
				case 'suggestions': return !!suggestions;
				case 'voting': return !!voting;
				case 'summary': return !!summary;
				case 'info': return true; // info всегда доступен
				default: return false;
			}
		});

		availableSectionIds.forEach(id => {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		});

		return () => {
			observer.disconnect();
			if (timeoutRef.current !== undefined) {
				window.clearTimeout(timeoutRef.current);
			}
		};
	}, [questions, suggestions, voting, summary]); // Зависимости пересоздания observer

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