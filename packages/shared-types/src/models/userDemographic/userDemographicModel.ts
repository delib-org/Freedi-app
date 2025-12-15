import {
    object,
    string,
    number,
    boolean,
    optional,
    enum_,
    InferOutput,
    array,
} from 'valibot';

export enum UserDemographicQuestionType {
    text = 'text',
    textarea = 'textarea',
    checkbox = 'checkbox',
    radio = 'radio',
}

//scope
export enum DemographicQuestionScope {
    group = 'group',
    statement = 'statement',
}

export const DemographicQuestionScopeSchema = enum_(DemographicQuestionScope);

export const UserQuestionTypeSchema = enum_(UserDemographicQuestionType);

export const DemographicOptionSchema = object({
    option: string(),
    color: optional(string()),
});

export type DemographicOption = InferOutput<typeof DemographicOptionSchema>;

export const UserDemographicQuestionSchema = object({
    question: string(),
    userId: optional(string()),
    type: UserQuestionTypeSchema,
    options: array(DemographicOptionSchema),
    answerOptions: optional(array(string())),
    answer: optional(string()), // can be string, array of strings, or boolean
    statementId: string(),
    order: optional(number()),
    required: optional(boolean()),
    userQuestionId: optional(string()),
    topParentId: optional(string()),  // NEW: Group identifier
    scope: optional(DemographicQuestionScopeSchema),  // NEW: 'group' | 'statement' 
});

export type UserDemographicQuestion = InferOutput<typeof UserDemographicQuestionSchema>;