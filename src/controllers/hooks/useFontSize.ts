import { useState, useEffect } from 'react';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { increaseFontSize } from '@/redux/users/userSlice';
import { updateUserFontSize } from '@/controllers/db/users/setUsersDB';

export const useFontSize = (initialSize: number, isUser: boolean) => {
	const dispatch = useAppDispatch();
	const [localFontSize, setLocalFontSize] = useState(initialSize);

	useEffect(() => {
		const size = isUser ? initialSize : localFontSize;
		document.documentElement.style.fontSize = `${size}px`;
	}, [localFontSize, initialSize, isUser]);

	const handleLocalFontSizeChange = (increment: number) => {
		const screenWidth = window.innerWidth;
		let newSize = localFontSize + increment;

		if (screenWidth <= 600 && newSize > 21) {
			newSize = 21;
		}

		setLocalFontSize(newSize);
	};

	const handleUserFontSizeChange = (increment: number) => {
		const screenWidth = window.innerWidth;
		let newSize = initialSize + increment;

		if (screenWidth <= 600 && newSize > 21) {
			newSize = 21;
		}

		updateUserFontSize(newSize);
		dispatch(increaseFontSize(increment));
	};

	const currentFontSize = isUser ? initialSize : localFontSize;

	return {
		currentFontSize,
		handleChangeFontSize: isUser
			? handleUserFontSizeChange
			: handleLocalFontSizeChange,
	};
};
