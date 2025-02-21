import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './view/style/style.scss';
import { RouterProvider } from 'react-router';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import { router } from './routes/router';
import {
	LanguageProvider,
	LanguagesEnum,
} from './controllers/hooks/useLanguages';

const root = createRoot(document.getElementById('root')!);

root.render(
	<React.StrictMode>
		<Provider store={store}>
			<LanguageProvider defaultLanguage={LanguagesEnum.he}>
				<RouterProvider router={router} />
			</LanguageProvider>
		</Provider>
	</React.StrictMode>
);
