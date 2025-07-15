import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import { useSelector } from 'react-redux'
import GeneralHeader from '@/view/components/generalHeader/GeneralHeader';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { setUserAdvanceUserToDB } from '@/controllers/db/user/setUser';

import './my.scss'
import profilePicPH from '@/assets/images/user-page.png';
import React, { useRef, useState } from 'react';

const My = () => {
	const user = useSelector(creatorSelector);
	const { t } = useUserConfig();

	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	function handleSetAdvanceUser() {
		setUserAdvanceUserToDB(!user?.advanceUser);
	}

	function handleImageClick() {
		fileInputRef.current?.click();
	}

	function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => {
				setSelectedImage(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	}

	return (
		<div className='page'>
			<GeneralHeader />

			<div className="myContainer">
				<h1>{t("Hello")} {user?.displayName}</h1>

				{/* Clickable image area */}
				<img
					src={selectedImage || user?.photoURL || profilePicPH}
					alt="Profile"
					className='profilePicPH'
					onClick={handleImageClick}
				/>
				<input
					type="file"
					accept="image/*"
					ref={fileInputRef}
					style={{ display: 'none' }}
					onChange={handleImageChange}
				/>
				<p className='profilePicTitle'>Change profile picture</p>

				<Checkbox
					label={t("Advance User")}
					isChecked={user?.advanceUser}
					onChange={handleSetAdvanceUser}
				/>

			</div>
		</div>
	)
}

export default My