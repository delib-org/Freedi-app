import styles from './ShareButton.module.scss';
import LinkIcon from "@/assets/icons/shareIcon.svg?react";

interface ShareButtonProps {
	readonly title?: string;
	readonly text?: string;
	readonly url?: string;
}

function ShareButton({ title, text, url }: ShareButtonProps) {
	const handleShare = async () => {
		const baseUrl = window.location.origin;
		const shareUrl = `${baseUrl}${url}` || window.location.href;
		const shareTitle = title || document.title;
		const shareText = text || '';

		// Check if the Share API is supported
		if (navigator.share) {
			try {
				await navigator.share({
					title: shareTitle,
					text: shareText,
					url: shareUrl
				});
			} catch (error) {
				console.error('Error sharing content:', error);
			}
		} else {
			// Fallback for browsers that don't support the Share API
			fallbackShare(shareUrl);
		}
	};

	// Fallback function for unsupported browsers like Firefox desktop
	const fallbackShare = (url: string) => {
		// Copy to clipboard
		navigator.clipboard.writeText(url)
			.then(() => {
				alert('Link copied to clipboard!');
			})
			.catch(err => {
				console.error('Failed to copy: ', err);
				// For very old browsers without clipboard API
				promptUserToCopy(url);
			});
	};

	// Last resort fallback for very old browsers
	const promptUserToCopy = (url: string) => {
		// Create a temporary input, select its contents, and copy
		const tempInput = document.createElement('input');
		tempInput.value = url;
		document.body.appendChild(tempInput);
		tempInput.select();
		navigator.clipboard.writeText(url).then(() => {
			alert('Link copied to clipboard!');
		}).catch(err => {
			console.error('Failed to copy: ', err);
		});
		document.body.removeChild(tempInput);
		alert('Link copied to clipboard!');
	};

	return (
		<button onClick={handleShare} className={styles.shareButton}>
			<LinkIcon />{text}
		</button>
	);
}

export default ShareButton;