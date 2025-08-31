import { FC } from 'react';
import UrlParser from '../edit/URLParse';
import styles from './Text.module.scss';

interface Props {
	statement?: string;
	description?: string;
	fontSize?: string;
}
const Text: FC<Props> = ({ statement, description, fontSize = "inherent" }) => {
	try {
		if (!statement && !description) return null;

		const textId = `${Math.random()}`.replace('.', '');

		//convert sentences, divided by /n to paragraphs
		const paragraphs = !description
			? ''
			: description
				.split('\n')
				.filter((p) => p)
				.map((paragraph: string, i: number) => {
					//if paragraph has * at some point and has some * at some other point make the string between the * bold
					if (paragraph.includes('*')) {
						const boldedParagraph = paragraph
							.split('*')
							.map((p, i) => {
								if (i % 2 === 1)
									return (
										<b key={`${textId}--${i}`}>
											<UrlParser text={p} />
										</b>
									);

								return p;
							});

						return (
							<p
								className={`${styles['p--bold']} ${styles.p}`}
								key={`${textId}--${i}`}
								style={{ fontSize: fontSize }}
							>
								{boldedParagraph}
							</p>
						);
					}

					return (
						<p className={styles.p} key={`${textId}--${i}`} style={{ fontSize: fontSize }}>
							<UrlParser text={paragraph} />
						</p>
					);
				});

		return (
			<>
				{statement && (
					<span className={styles.statement} style={{ fontSize: fontSize }}>
						<UrlParser text={statement} />
					</span>
				)}
				{description && paragraphs.length > 0 && (
					<div className={styles.description}>{paragraphs}</div>
				)}
			</>
		);
	} catch (error) {
		console.error(error);

		return null;
	}
};

export default Text;
