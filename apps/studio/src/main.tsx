import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { detectBrowserLanguage, LanguagesEnum, loadLanguageData } from '@freedi/shared-i18n';
import { LazyTranslationProvider } from '@freedi/shared-i18n/react';
import { AuthProvider } from '@/auth/AuthContext';
import App from '@/App';
import '@/styles/index.scss';

const STORAGE_KEY = 'studio-language';

function resolveInitialLanguage(): LanguagesEnum {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && Object.values(LanguagesEnum).includes(saved as LanguagesEnum)) {
			return saved as LanguagesEnum;
		}
	} catch {
		// localStorage not available
	}

	return detectBrowserLanguage();
}

// Provider order: translations → auth → router → (inside App) OrgProvider,
// which reads the current org from the `/orgs/:orgId` URL segment.
// Only the active language's dictionary is fetched (its own chunk); it is
// awaited before the first render so the UI never flashes raw keys.
async function bootstrap(): Promise<void> {
	const initialLanguage = resolveInitialLanguage();
	const initialData = await loadLanguageData(initialLanguage).catch(() => undefined);

	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
		<React.StrictMode>
			<LazyTranslationProvider
				initialLanguage={initialLanguage}
				initialData={initialData}
				storageKey={STORAGE_KEY}
			>
				<AuthProvider>
					<BrowserRouter>
						<App />
					</BrowserRouter>
				</AuthProvider>
			</LazyTranslationProvider>
		</React.StrictMode>,
	);
}

void bootstrap();
