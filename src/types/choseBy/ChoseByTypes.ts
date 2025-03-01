import { enum_, object, string, number, InferInput } from 'valibot';

export enum CutoffType {
	topOptions = 'topOptions',
	cutoffValue = 'cutoffValue',
}

export enum ChoseByEvaluationType {
	consensus = 'consensus',
	likes = 'likes',
	likesDislikes = 'likesDislikes',
}

export const ChoseBySchema = object({
	statementId: string(),
	cutoffType: enum_(CutoffType),
	choseByEvaluationType: enum_(ChoseByEvaluationType),
	number: number(),
});

export type ChoseBy = InferInput<typeof ChoseBySchema>;

export function defaultChoseBySettings(statementId: string) {
	return {
		number: 1,
		cutoffType: CutoffType.topOptions,
		choseByEvaluationType: ChoseByEvaluationType.consensus,
		statementId,
	};
}
