import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './view/style/style.scss';
import { RouterProvider } from 'react-router';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import { router } from './routes/router';
import { UserConfigProvider } from './context/UserConfigContext';

const root = createRoot(document.getElementById('root')!);

root.render(
	<React.StrictMode>
		<Provider store={store}>
			<UserConfigProvider>
				<RouterProvider router={router} />
			</UserConfigProvider>
		</Provider>
	</React.StrictMode>
);
