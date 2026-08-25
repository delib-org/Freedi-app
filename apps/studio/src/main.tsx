import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { detectBrowserLanguage } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import { AuthProvider } from '@/auth/AuthContext';
import App from '@/App';
import '@/styles/index.scss';

// Provider order: translations → auth → router → (inside App) OrgProvider,
// which reads the current org from the `/orgs/:orgId` URL segment.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<TranslationProvider initialLanguage={detectBrowserLanguage()} storageKey="studio-language">
			<AuthProvider>
				<BrowserRouter>
					<App />
				</BrowserRouter>
			</AuthProvider>
		</TranslationProvider>
	</React.StrictMode>,
);
