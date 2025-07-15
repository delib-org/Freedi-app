import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import { useSelector } from 'react-redux';
import GeneralHeader from '@/view/components/generalHeader/GeneralHeader';
import { setUserAdvanceUserToDB } from '@/controllers/db/user/setUser';

import './my.scss';
import profilePicPH from '@/assets/images/user-page.png';
import React, { useRef, useState } from 'react';
import RadioButtonWithLabel from '@/view/components/radioButtonWithLabel/RadioButtonWithLabel';
import Button from '@/view/components/buttons/button/Button';
import { useNavigate } from 'react-router';

const My = () => {
	const user = useSelector(creatorSelector);
	const { t } = useUserConfig();
	const isAdvancedUser = user?.advanceUser;
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const navigate = useNavigate();

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

			<div className='myContainer'>
				<h1>
					{t('Hello')} {user?.displayName}
				</h1>

				{/* Clickable image area */}
				<img
					src={selectedImage || user?.photoURL || profilePicPH}
					alt='Profile'
					className='profilePicPH'
					onClick={handleImageClick}
				/>
				<input
					type='file'
					accept='image/*'
					ref={fileInputRef}
					style={{ display: 'none' }}
					onChange={handleImageChange}
				/>
				<p className='profilePicTitle'>Change profile picture</p>
				<div className='radioContainer'>
					<h3>Profile Setting</h3>

					<RadioButtonWithLabel
						id='simple-user'
						labelText={t('Simple User')}
						checked={!isAdvancedUser}
						onChange={() => setUserAdvanceUserToDB(false)}
					/>
					<RadioButtonWithLabel
						id='advanced-user'
						labelText={t('Advance User')}
						checked={isAdvancedUser}
						onChange={() => setUserAdvanceUserToDB(true)}
					/>
					<Button
						className='save'
						text='save'
						onClick={() => navigate('/')}
					/>
				</div>
			</div>
		</div>
	);
};

export default My;
