import { boolean, number, object, optional, string } from "valibot";

//used to se if the option was selected in a fair division, and as a parent, does it have a fair division mechanism
export const FairDivisionSelectionSchema = object({
    asOption: object({
        costCoins: optional(number()), // the cost of the option to the users
        selected:boolean(), // true if the option is selected
        updatedAt: optional(number()), // the last time the option was updated (in milliseconds)
    }),
    asParent: object({
        isFairDivision: boolean(), // true if the parent has fair division mechanism for selecting options
    })
});  

export type FairDivisionSelection = typeof FairDivisionSelectionSchema;

//used to store user slections on fair division. is stored on fairDivision collection
export const FairDivisionUserSelectionSchema = object({
    userId: string(), // the id of the user
    statementId: string(), // the id of the statement
    investment:number(), // The measure of the user's willingness to select this option
    parentId: string(), // the id of the parent statement
});

export type FairDivisionUserSelection = typeof FairDivisionUserSelectionSchema;