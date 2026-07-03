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
    range = 'range',
    number = 'number',
    dropdown = 'dropdown',
}

//scope
export enum DemographicQuestionScope {
    group = 'group',
    statement = 'statement',
}

export const DemographicQuestionScopeSchema = enum_(DemographicQuestionScope);

export const UserQuestionTypeSchema = enum_(UserDemographicQuestionType);

// Preset demographic fields that can be quick-added and identified programmatically
export enum DemographicPresetKey {
    name = 'name',
    age = 'age',
    gender = 'gender',
    city = 'city',
}

export const DemographicPresetKeySchema = enum_(DemographicPresetKey);

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
    topParentId: optional(string()),  // Group identifier
    scope: optional(DemographicQuestionScopeSchema),  // 'group' | 'statement'
    allowOther: optional(boolean()),
    otherText: optional(string()),
    min: optional(number()),
    max: optional(number()),
    step: optional(number()),
    minLabel: optional(string()),
    maxLabel: optional(string()),
    presetKey: optional(DemographicPresetKeySchema), // identifies quick-added preset fields (e.g. the 'name' question used for identity display)
});

export type UserDemographicQuestion = InferOutput<typeof UserDemographicQuestionSchema>;

// Schema for tracking excluded inherited demographic questions per statement
export const ExcludedInheritedDemographicsSchema = object({
    statementId: string(),  // The statement that excludes these demographics
    excludedQuestionIds: array(string()),  // Array of userQuestionIds to exclude
});

export type ExcludedInheritedDemographics = InferOutput<typeof ExcludedInheritedDemographicsSchema>;