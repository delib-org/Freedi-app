import { FC, TouchEvent, useState } from "react";
import { Statement } from "delib-npm";
import styles from './ProfileImage.module.scss';

interface Props {
	statement: Statement;
}

const ProfileImage: FC<Props> = ({ statement }) => {
	const [showPopup, setShowPopup] = useState(false);
	const talker = statement.creator;

	if (!talker) return null;

	if (!talker.photoURL) {
		return <div className={styles.profileName}>{talker.displayName}</div>;
	}

	const handleTouch = (e: TouchEvent) => {
		// Prevent the subsequent mouse events from firing
		e.preventDefault();
		setShowPopup(!showPopup);
		setTimeout(() => setShowPopup(false), 3000);
	};

	return (
		<div
			className={styles.profileImage}
			style={{ backgroundImage: `url(${talker.photoURL})` }}
			onMouseOver={() => setShowPopup(true)}
			onMouseOut={() => setShowPopup(false)}
			onFocus={() => setShowPopup(true)}
			onBlur={() => setShowPopup(false)}
			onTouchStart={handleTouch}
		>
			{showPopup && <div className={styles.popup}>{talker.displayName}</div>}
		</div>
	);
};

export default ProfileImage;