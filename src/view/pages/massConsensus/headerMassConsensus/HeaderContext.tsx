import React, { createContext, useContext, useState } from 'react';

interface HeaderData {
	title: string | (() => string);
	backToApp?: boolean;
	isIntro?: boolean;
}

interface HeaderContextProps extends HeaderData {
	setHeader: (value: HeaderData) => void;
}

const HeaderContext = createContext<HeaderContextProps>({
	title: '',
	backToApp: false,
	isIntro: false,
	setHeader: () => { },
});

export const useHeader = () => useContext(HeaderContext);

export const HeaderProvider = ({ children }: { children: React.ReactNode }) => {
	const [header, setHeader] = useState<HeaderData>({
		title: '',
		backToApp: false,
		isIntro: false,
	});

	return (
		<HeaderContext.Provider value={{ ...header, setHeader }}>
			{children}
		</HeaderContext.Provider>
	);
};
