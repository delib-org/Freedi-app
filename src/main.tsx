import * as React from "react";
import { createRoot } from "react-dom/client";
import "./view/style/style.scss";
import { RouterProvider } from "react-router";
import { store } from "./redux/store";
import { Provider } from "react-redux";
import { router } from "./router";
import {
	LanguageProvider,
	LanguagesEnum,
} from "./controllers/hooks/useLanguages";
import { setInitLocation } from "./redux/location/locationSlice";

const root = createRoot(document.getElementById("root")!);

root.render(
	<React.StrictMode>
		<Provider store={store}>
			<LanguageProvider defaultLanguage={LanguagesEnum.he}>
				<RouterProvider router={router} />
			</LanguageProvider>
		</Provider>
	</React.StrictMode>,
);

store.dispatch(
	setInitLocation(
		window.location.pathname === "/" ? "/home" : window.location.pathname,
	),
);