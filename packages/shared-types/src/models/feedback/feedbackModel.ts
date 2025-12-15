import { number, object, string, optional, InferOutput } from "valibot";
import { CreatorSchema } from "../user/User";

export const FeedbackSchema = object({
    feedbackId: string(),
    statementId: string(),
    statementTitle: string(),
    feedbackText: string(),
    createdAt: number(),
    creator: CreatorSchema,
    email: optional(string())
});

export type Feedback = InferOutput<typeof FeedbackSchema>;