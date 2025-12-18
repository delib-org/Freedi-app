import { array, InferOutput, number, object, optional, string } from "valibot";
import { StatementSchema } from "./StatementTypes";

export const statementSnapShotSchema = object({
    topic:StatementSchema,
    descendants:array(StatementSchema),
    createdAt:number(),
    clusters:array(string()),
    name:optional(string()),
})

export type StatementSnapShot = InferOutput<typeof statementSnapShotSchema>;