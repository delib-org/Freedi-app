import { object, string, boolean, InferOutput } from 'valibot';

export const ApprovalSchema = object({
	approvalId: string(),
	statementId: string(),
	documentId: string(),
	topParentId: string(),
	userId: string(),
	approval: boolean(),
});

export type Approval = InferOutput<typeof ApprovalSchema>;
