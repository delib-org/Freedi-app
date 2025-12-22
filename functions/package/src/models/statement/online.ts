import { boolean, InferOutput, number, object, string } from "valibot";
import { CreatorSchema } from "../user/User";

export const OnlineSchema = object({
    statementId:string(),
    onlineId:string(),
    user:CreatorSchema,
    lastUpdated:number(),
    tabInFocus:boolean(),
});

export type Online = InferOutput<typeof OnlineSchema>;