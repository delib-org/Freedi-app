import './landing-main.scss';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from '@/view/components/atomic/organisms/LandingPage/LandingPage';
import { landingLanguages, landingTranslations, type LandingLanguage } from './landingTranslations';

const languageNames: Record<LandingLanguage, string> = {
	en: 'English',
	he: 'עברית',
	ar: 'العربية',
	fa: 'فارسی',
	de: 'Deutsch',
	es: 'Español',
	nl: 'Nederlands',
};

function savedLanguage(): LandingLanguage {
	try {
		const value = JSON.parse(localStorage.getItem('userConfig') || '{}')?.chosenLanguage;

		return landingLanguages.includes(value) ? value : 'en';
	} catch {
		return 'en';
	}
}

function LandingApp() {
	const [language, setLanguage] = useState<LandingLanguage>(savedLanguage);
	const [nickname, setNickname] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const t = useCallback(
		(key: string) => landingTranslations[language][key] || landingTranslations.en[key] || key,
		[language],
	);
	const warmAuth = useCallback(() => {
		void import('./landingAuth');
	}, []);

	useEffect(() => {
		document.documentElement.lang = language;
		document.documentElement.dir =
			language === 'he' || language === 'ar' || language === 'fa' ? 'rtl' : 'ltr';
	}, [language]);

	const changeLanguage = (next: LandingLanguage): void => {
		setLanguage(next);
		try {
			const previous = JSON.parse(localStorage.getItem('userConfig') || '{}');
			localStorage.setItem('userConfig', JSON.stringify({ ...previous, chosenLanguage: next }));
		} catch {
			// The chosen language still applies for this visit when storage is unavailable.
		}
	};

	const google = async (): Promise<void> => {
		setBusy(true);
		setError('');
		try {
			await (await import('./landingAuth')).signInWithGoogle();
		} catch (cause) {
			if ((cause as { code?: string })?.code !== 'auth/popup-closed-by-user') {
				console.error('Landing sign-in failed', cause);
				setError(t('Sign-in failed. Please try again.'));
			}
			setBusy(false);
		}
	};

	const temporary = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		const name = nickname.trim();
		if (!name) return;
		setBusy(true);
		setError('');
		try {
			await (await import('./landingAuth')).signInWithTemporaryName(name);
		} catch (cause) {
			console.error('Temporary landing sign-in failed', cause);
			setError(t('Sign-in failed. Please try again.'));
			setBusy(false);
		}
	};

	return (
		<LandingPage
			t={t}
			onLoginIntent={warmAuth}
			dir={language === 'he' || language === 'ar' || language === 'fa' ? 'rtl' : 'ltr'}
			language={
				<label aria-label={t('Language')}>
					<select
						value={language}
						onChange={(event) => changeLanguage(event.target.value as LandingLanguage)}
					>
						{landingLanguages.map((code) => (
							<option value={code} key={code}>
								{languageNames[code]}
							</option>
						))}
					</select>
				</label>
			}
			login={
				<>
					<button type="button" disabled={busy} onClick={() => void google()}>
						{busy ? t('Opening…') : t('Continue with Google')}
					</button>
					<form onSubmit={(event) => void temporary(event)}>
						<label htmlFor="landing-nickname">{t('Or choose a temporary name')}</label>
						<input
							id="landing-nickname"
							value={nickname}
							maxLength={60}
							autoComplete="nickname"
							onChange={(event) => setNickname(event.target.value)}
						/>
						<button disabled={busy || !nickname.trim()}>{t('Enter the conversation')}</button>
					</form>
					{error && <p role="alert">{error}</p>}
				</>
			}
		/>
	);
}

document.getElementById('initial-loader')?.remove();
createRoot(document.getElementById('root')!).render(<LandingApp />);
