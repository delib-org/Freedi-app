import React, { createContext, useContext, useState } from 'react';

interface HeaderContextProps {
	title: string | (() => string);
	backToApp?: boolean;
	isIntro?: boolean;
	setHeader: (value: HeaderContextProps) => void;
}

const HeaderContext = createContext<HeaderContextProps>({
	title: '',
	backToApp: false,
	isIntro: false,
	setHeader: () => { },
});

export const useHeader = () => useContext(HeaderContext);

export const HeaderProvider = ({ children }: { children: React.ReactNode }) => {
	const [header, setHeader] = useState<Omit<HeaderContextProps, 'setHeader'>>({
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
