import { object, string, number, array, InferOutput } from 'valibot';
import { DemographicOptionSchema } from '../userDemographic/userDemographicModel';

// Schema for individual group within an axis
export const DemographicGroupSchema = object({
    mad: number(),
    mean: number(),
    n: number(),
    option: DemographicOptionSchema,
});

export type DemographicGroup = InferOutput<typeof DemographicGroupSchema>;

// Schema for axes items
export const AxesItemSchema = object({
    axId: string(),
    groups: array(DemographicGroupSchema),
    question: string(),
    groupsMAD: number(),
});

export type AxesItem = InferOutput<typeof AxesItemSchema>;

// Main schema
export const PolarizationIndexSchema = object({
    averageAgreement: number(),
    lastUpdated: number(),
    overallMAD: number(),
    overallMean: number(),
    overallN: number(),
    parentId: string(),
    statement: string(),
    statementId: string(),
    color: string(),
    axes: array(AxesItemSchema),
});

// Type inference
export type PolarizationIndex = InferOutput<typeof PolarizationIndexSchema>;


