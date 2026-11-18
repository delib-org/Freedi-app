import { getImageSources, Statement } from '@freedi/shared-types';

export interface StatementImageAttrs {
	src: string;
	srcSet?: string;
	sizes?: string;
}

/**
 * <img> attributes for a statement picture. While `shown` is the saved main
 * image (not a local upload preview) and a current thumb exists, the browser
 * may pick the small copy for the given rendered `sizes`.
 */
export function statementImageAttrs(
	statement: Statement | undefined,
	shown: string,
	sizes: string | undefined,
): StatementImageAttrs {
	if (!sizes || !statement || shown !== statement.imagesURL?.main) return { src: shown };
	const sources = getImageSources(statement.imagesURL);
	if (!sources) return { src: shown };
	if (!sources.srcSet) return { src: sources.src };

	return { src: sources.src, srcSet: sources.srcSet, sizes };
}
