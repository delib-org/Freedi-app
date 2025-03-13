import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './view/style/style.scss';
import { RouterProvider } from 'react-router';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import { router } from './routes/router';
import { UserConfigProvider } from './context/UserConfigContext';
import PWAWrapper from './view/components/pwa/PWAWrapper';

const root = createRoot(document.getElementById('root')!);

root.render(
	<React.StrictMode>
		<Provider store={store}>
			<UserConfigProvider>
				<PWAWrapper>
					<RouterProvider router={router} />
				</PWAWrapper>
			</UserConfigProvider>
		</Provider>
	</React.StrictMode>
);
