import styles from './StartLogo.module.scss';
import Logo from '../../../assets/logo/106 x 89 SVG.svg?react';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { useEffect, useRef, useState } from 'react';

const StartLogo = () => {
	const { t } = useLanguage();
	const logoRef = useRef<HTMLDivElement>(null);
	const subtitleRef = useRef<HTMLSpanElement>(null);
	const [maxWidth, setMaxWidth] = useState<string>("auto");

	const resizeTextToFit = () => {
		if (!subtitleRef.current || !logoRef.current) return;

		const containerWidth = logoRef.current.offsetWidth;
		const textElement = subtitleRef.current;
		let fontSize = 10;
		textElement.style.fontSize = `${fontSize}px`;

		while (textElement.scrollWidth <= containerWidth && fontSize < 100) {
			fontSize++;
			textElement.style.fontSize = `${fontSize}px`;
		}

		while (textElement.scrollWidth > containerWidth && fontSize > 1) {
			fontSize--;
			textElement.style.fontSize = `${fontSize}px`;
		}
	};

	useEffect(() => {
		const equalizeWidth = () => {
			if (logoRef.current && subtitleRef.current) {
				const logoWidth = logoRef.current.offsetWidth;
				setMaxWidth(`${logoWidth}px`);
				resizeTextToFit();
			}
		};

		equalizeWidth();
		window.addEventListener("resize", equalizeWidth);

		return () => window.removeEventListener("resize", equalizeWidth);
	}, []);

	return (
		<div ref={logoRef} className={styles.mainLogo}>
			<div className={styles.freeDiIcon}>
				<Logo />
			</div>
			<div
				// ref={logoRef}
				className={styles.mainLogo__title}
				style={{ minWidth: maxWidth, maxWidth: maxWidth }}
			>
				<span className={styles.mainLogo__Free}>Free</span>
				<span className={styles.mainLogo__Di}>Di</span>
			</div>
			<span
				ref={subtitleRef}
				className={styles.mainLogo__slogan}
				style={{ minWidth: maxWidth, maxWidth: maxWidth }}
			>
				{t('Fostering Collaborations')}
			</span>
		</div>
	)
}

export default StartLogo;
