import { useEffect, useRef, type ReactNode } from 'react';
import {
	ArrowUpRight,
	Sparkles,
	MessagesSquare,
	Layers3,
	FileHeart,
	ChevronDown,
	Languages,
	LogIn,
	X,
} from 'lucide-react';
import type { Translate } from '../ThinkingSpace/ThinkingSpace';
import styles from './LandingPage.module.scss';

interface LandingPageProps {
	t: Translate;
	dir?: 'ltr' | 'rtl';
	login: ReactNode | ((close: () => void) => ReactNode);
	language?: ReactNode;
	onLoginIntent?: () => void;
}
export default function LandingPage({
	t,
	dir = 'ltr',
	login,
	language,
	onLoginIntent,
}: LandingPageProps) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		document.title = 'WizCol · ' + t('Find a way forward. Together.');
	}, [t]);
	const openLogin = (): void => {
		onLoginIntent?.();
		dialog.current?.showModal();
	};
	const steps = [
		[
			MessagesSquare,
			'Start with a question.',
			'Explore solutions and sub-questions. Each sub-question has its own solutions and can branch further.',
		],
		[
			Layers3,
			'See what connects us.',
			'Explore themes, synthesis, summaries and maps. Keep different perspectives in view.',
		],
		[
			Sparkles,
			'Make good ideas better.',
			'Work through concerns and improve the wording together.',
		],
		[
			FileHeart,
			'Put it into shared words.',
			'Build an אמנה: a shared agreement people endorse and others can accept without objection.',
		],
	] as const;

	return (
		<div className={`thinking-space ${styles.landing}`} dir={dir}>
			<a className={styles.landing__skip} href="#landing-main">
				{t('Skip to content')}
			</a>
			<header className={styles.landing__nav}>
				<a href="#" className={styles.landing__brand} aria-label="WizCol">
					<picture>
						<source media="(prefers-color-scheme: dark)" srcSet="/brand/wizcol-logo-dark.webp" />
						<img
							src="/brand/wizcol-logo.webp"
							alt="WizCol"
							width="320"
							height="230"
							fetchPriority="high"
							decoding="async"
						/>
					</picture>
				</a>
				<nav aria-label={t('Main navigation')}>
					<a href="#how-it-works">{t('How it works')}</a>
					{language && (
						<span className={styles.landing__language}>
							<Languages aria-hidden="true" />
							{language}
							<ChevronDown className={styles.landing__languageChevron} aria-hidden="true" />
						</span>
					)}
					<button onClick={openLogin} aria-label={t('Log in')}>
						<span className={styles.landing__loginLabel}>{t('Log in')}</span>
						<LogIn className={styles.landing__loginIcon} aria-hidden="true" />
						<ArrowUpRight className={styles.landing__loginArrow} size={17} />
					</button>
				</nav>
			</header>
			<main id="landing-main">
				<section className={styles.landing__hero}>
					<div>
						<p className={styles.landing__eyebrow}>
							{t('A LITTLE CURIOSITY. A SHARED POSSIBILITY.')}
						</p>
						<h1>
							{t('Find a way forward.')}
							<br />
							<em>{t('Together.')}</em>
							<span aria-hidden="true">✳</span>
						</h1>
						<p className={styles.landing__intro}>
							{t(
								'WizCol helps communities turn different views into decisions they can stand behind.',
							)}
						</p>
						<div className={styles.landing__actions}>
							<button onClick={openLogin}>
								{t('Let’s find common ground')} <ArrowUpRight size={20} />
							</button>
							<a href="#how-it-works">{t('See how it happens')} ↓</a>
						</div>
						<p className={styles.landing__small}>
							{t('For neighbors, teams and communities with something to decide together.')}
						</p>
					</div>
					<div
						className={styles.landing__scene}
						aria-label={t('From different voices to a shared agreement')}
					>
						<div className={styles.landing__bubble}>
							<span aria-hidden="true">◡ ◡</span>
							<p>{t('What if we tried…?')}</p>
						</div>
						<div className={styles.landing__bubble}>
							<span aria-hidden="true">• ◡ •</span>
							<p>{t('I could support that if…')}</p>
						</div>
						<div className={styles.landing__paper}>
							<span className={styles.landing__eyebrow}>{t('OUR SHARED AGREEMENT')}</span>
							<h2>{t('A little more us.')}</h2>
							<p>
								{t('Ideas we shaped together. Concerns we listened to. Words we can stand behind.')}
							</p>
							<div aria-hidden="true">
								<span>✳</span>
								<span>♡</span>
								<span>✓</span>
							</div>
							<span>{t('Our אמנה')}</span>
						</div>
						<span className={styles.landing__spark} aria-hidden="true">
							✺
						</span>
					</div>
				</section>
				<section id="how-it-works" className={styles.landing__process}>
					<p className={styles.landing__eyebrow}>{t('FROM “WHAT IF” TO “WE AGREE”')}</p>
					<h2>{t('Good decisions grow through conversation.')}</h2>
					<div className={styles.landing__grid}>
						{steps.map(([Icon, title, body], i) => (
							<article key={title}>
								<div>
									<Icon size={28} />
									<span>0{i + 1}</span>
								</div>
								<h3>{t(title)}</h3>
								<p>{t(body)}</p>
							</article>
						))}
					</div>
				</section>
				<section className={styles.landing__invitation}>
					<span aria-hidden="true">✳</span>
					<div>
						<h2>{t('Agreement has room for differences.')}</h2>
						<p>
							{t(
								'The aim is broad support with no unresolved objections to the final agreement. Silence is never consent.',
							)}
						</p>
					</div>
					<button onClick={openLogin}>
						{t('Bring your perspective')} <ArrowUpRight size={20} />
					</button>
				</section>
			</main>
			<footer className={styles.landing__footer}>
				<strong>WizCol.</strong>
				<span>{t('A little curiosity. A better possibility.')}</span>
				<a href="https://delib.org" target="_blank" rel="noreferrer">
					{t('From the Institute for Deliberative Democracy')} ↗
				</a>
			</footer>
			<dialog
				ref={dialog}
				aria-labelledby="landing-login-title"
				className={styles.landing__dialog}
				onClick={(e) => {
					if (e.target === e.currentTarget) dialog.current?.close();
				}}
			>
				<button
					className={styles.landing__close}
					aria-label={t('Close')}
					onClick={() => dialog.current?.close()}
				>
					<X />
				</button>
				<span className={styles.landing__eyebrow}>WizCol.</span>
				<h2 id="landing-login-title">{t('Your perspective belongs here.')}</h2>
				<div className={styles.landing__login}>
					{typeof login === 'function' ? login(() => dialog.current?.close()) : login}
				</div>
			</dialog>
		</div>
	);
}
