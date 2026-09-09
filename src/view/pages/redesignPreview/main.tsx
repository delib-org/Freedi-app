// Standalone Vite development entry. Never imports Firebase or the live app store.
import '@/view/style/style.scss';
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RedesignPreview from './RedesignPreview';

import LandingPage from '@/view/components/atomic/organisms/LandingPage/LandingPage';

const translate = (text: string): string => text;
function PublicPreview() {
	const [entered, setEntered] = useState(new URLSearchParams(location.search).has('view'));
	if (entered) return <RedesignPreview />;

	return (
		<LandingPage
			t={translate}
			login={
				<>
					<p>
						This is the design preview. Enter the example workspace without creating an account.
					</p>
					<button onClick={() => setEntered(true)}>Enter example workspace</button>
					<p>The main app uses your existing Google or temporary-name login.</p>
				</>
			}
		/>
	);
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<PublicPreview />
	</StrictMode>,
);
