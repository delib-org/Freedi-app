import React from 'react';

interface UrlParserProps {
	text: string;
	className?: string;
	linkClassName?: string;
}

const UrlParser: React.FC<UrlParserProps> = ({
	text,
	className = '',
	linkClassName = '',
}) => {
	// More robust URL regex that better handles various URL formats
	const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

	const parseText = (text: string): React.ReactNode[] => {
		const parts: React.ReactNode[] = [];
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		URL_REGEX.lastIndex = 0;

		while ((match = URL_REGEX.exec(text)) !== null) {
			if (match.index > lastIndex) {
				parts.push(
					<span key={`text-${lastIndex}`}>
						{text.slice(lastIndex, match.index)}
					</span>
				);
			}

			const url = match[0];
			const fullUrl = url.startsWith('http') ? url : `https://${url}`;

			parts.push(
				<a
					key={`link-${match.index}`}
					href={fullUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={linkClassName}
				>
					{url}
				</a>
			);

			lastIndex = match.index + url.length;
		}

		if (lastIndex < text.length) {
			parts.push(
				<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>
			);
		}

		return parts;
	};

	return <span className={className}>{parseText(text)}</span>;
};

export default UrlParser;