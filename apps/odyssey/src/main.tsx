import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initSentry } from './lib/sentry';
import { initI18n } from './i18n/i18n';
import './styles.css';

// Error reporting first, so anything thrown during the first render is captured.
initSentry();

// Hebrew resolves at once (bundled); English/Arabic wait for their chunk, so
// the first render is already in the player's language.
void initI18n().finally(() => {
	ReactDOM.createRoot(document.getElementById('root')!).render(
		<React.StrictMode>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</React.StrictMode>,
	);
});
