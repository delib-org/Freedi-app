import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './NewSolutionsPill.module.scss';

interface NewSolutionsPillProps {
	count: number;
	maxDisplayCount: number;
	onClick: () => void;
}

const NewSolutionsPill: FC<NewSolutionsPillProps> = ({ count, maxDisplayCount, onClick }) => {
	const { t } = useTranslation();
	const [countBump, setCountBump] = useState(false);
	const [stickyTop, setStickyTop] = useState(0);
	const prevCountRef = useRef(count);
	const pillRef = useRef<HTMLButtonElement>(null);

	// Measure the sticky header height so the pill sits right below it
	const measureHeader = useCallback(() => {
		const el = pillRef.current?.closest('.page__main');
		if (!el) return;
		const header = el.querySelector<HTMLElement>('[class*="stickyTop"]');
		if (header) {
			setStickyTop(header.getBoundingClientRect().height);
		}
	}, []);

	useEffect(() => {
		measureHeader();
		window.addEventListener('resize', measureHeader);

		return () => window.removeEventListener('resize', measureHeader);
	}, [measureHeader]);

	// Brief scale pulse when the count changes
	useEffect(() => {
		if (count !== prevCountRef.current && prevCountRef.current > 0) {
			setCountBump(true);
			const timer = setTimeout(() => setCountBump(false), 250);
			prevCountRef.current = count;

			return () => clearTimeout(timer);
		}
		prevCountRef.current = count;
	}, [count]);

	const isOverMax = count >= maxDisplayCount;
	const displayCount = isOverMax ? `${maxDisplayCount}+` : String(count);
	const label =
		count === 1
			? t('1 new solution')
			: t('New solutions').replace('{{count}}', String(displayCount));

	return (
		<button
			ref={pillRef}
			className={styles['new-pill']}
			style={stickyTop > 0 ? { top: `${stickyTop}px` } : undefined}
			onClick={onClick}
			aria-label={label}
			role="status"
		>
			<span className={`material-symbols-outlined ${styles['new-pill__icon']}`}>arrow_upward</span>
			<span className={styles['new-pill__text']}>
				<span
					className={`${styles['new-pill__count']} ${countBump ? styles['new-pill__count--bump'] : ''}`}
				>
					{displayCount}
				</span>{' '}
				{count === 1 ? t('new solution') : t('new solutions')}
			</span>
			<span className={`material-symbols-outlined ${styles['new-pill__chevron']}`}>
				expand_more
			</span>
		</button>
	);
};

export default NewSolutionsPill;
