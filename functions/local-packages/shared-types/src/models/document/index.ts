import { object, string, number, enum_, InferOutput } from 'valibot';

export const DocumentSignsSchema = object({
	documentId: string(),
	viewed: number(),
	signed: number(),
	rejected: number(),
	avgSignatures: number(),
	totalSignaturesLevel: number(),
});

export type DocumentSigns = InferOutput<typeof DocumentSignsSchema>;

export enum SignatureType {
	signed = 'signed',
	rejected = 'rejected',
	viewed = 'viewed',
}

export const SignatureSchema = object({
	signatureId: string(),
	documentId: string(),
	userId: string(),
	signed: enum_(SignatureType),
	date: string(),
	levelOfSignature: number(),
});

export type Signature = InferOutput<typeof SignatureSchema>;
