import * as v from 'valibot';

/**
 * Interface for detailed validation error information
 */
interface ValidationError {
  /** The field path where the error occurred (e.g., "user.email" or "items[0].name") */
  field: string;
  /** The type that was expected (e.g., "string", "number", "email") */
  expectedType: string;
  /** The actual value that was provided */
  actualValue: unknown;
  /** Human-readable error message */
  message: string;
  /** The kind of validation error (schema, validation, transformation) */
  kind: 'schema' | 'validation' | 'transformation';
  /** Additional requirement info (e.g., minimum length for minLength validation) */
  requirement?: unknown;
}

/**
 * Interface for the validation result
 */
interface ValidationResult<T> {
  /** Whether validation was successful */
  success: boolean;
  /** The validated data (only present if success is true) */
  data?: T;
  /** Array of validation errors (only present if success is false) */
  errors?: ValidationError[];
}

/**
 * Helper function to build the field path from Valibot's path array
 */
function buildFieldPath(path?: Array<{ type: string; key?: unknown; [key: string]: unknown }>): string {
  if (!path || path.length === 0) {
    return 'root';
  }

  return path
    .map((pathItem) => {
      if (pathItem.key !== undefined) {
        // Handle array indices and object keys
        if (typeof pathItem.key === 'number') {
          return `[${pathItem.key}]`;
        }
        
return String(pathItem.key);
      }
      
return '';
    })
    .filter(Boolean)
    .join('.');
}

/**
 * Validates data using Valibot's safeParse and returns detailed error information
 * 
 * @param schema - The Valibot schema to validate against
 * @param data - The data to validate
 * @param config - Optional Valibot configuration
 * @returns ValidationResult with success status and detailed error information
 * 
 * @example
 * ```typescript
 * const UserSchema = v.object({
 *   name: v.pipe(v.string(), v.minLength(2)),
 *   email: v.pipe(v.string(), v.email()),
 *   age: v.pipe(v.number(), v.minValue(18))
 * });
 * 
 * const result = checkValidationErrors(UserSchema, {
 *   name: "A",
 *   email: "invalid-email",
 *   age: 16
 * });
 * 
 * if (!result.success) {
 *   result.errors?.forEach(error => {
 *     console.log(`Field: ${error.field}`);
 *     console.log(`Expected: ${error.expectedType}`);
 *     console.log(`Got: ${JSON.stringify(error.actualValue)}`);
 *     console.log(`Message: ${error.message}`);
 *   });
 * }
 * ```
 */
export function checkValidationErrors<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  data: unknown,
  config?: v.Config<v.InferIssue<TSchema>>
): ValidationResult<v.InferOutput<TSchema>> {
  const result = v.safeParse(schema, data, config);

  if (result.success) {
    return {
      success: true,
      data: result.output,
    };
  }

  // Process validation issues into detailed error information
  const errors: ValidationError[] = result.issues.map((issue) => {
    //@ts-ignore
    const fieldPath = buildFieldPath(issue.path);
    
    return {
      field: fieldPath,
      expectedType: issue.expected || issue.type,
      actualValue: issue.input,
      message: issue.message,
      kind: issue.kind,
      requirement: issue.requirement,
    };
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Convenience function that logs validation errors in a formatted way
 * 
 * @param schema - The Valibot schema to validate against
 * @param data - The data to validate
 * @param config - Optional Valibot configuration
 * @returns The validation result
 */
export function validateAndLogErrors<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  data: unknown,
  config?: v.Config<v.InferIssue<TSchema>>
): ValidationResult<v.InferOutput<TSchema>> {
  const result = checkValidationErrors(schema, data, config);

  if (!result.success && result.errors) {
    console.group('🚨 Validation Errors:');
    result.errors.forEach((error, index) => {
      console.group(`Error ${index + 1}:`);
      console.log(`📍 Field: ${error.field}`);
      console.log(`✅ Expected: ${error.expectedType}`);
      console.log(`❌ Received: ${JSON.stringify(error.actualValue)} (${typeof error.actualValue})`);
      console.log(`💬 Message: ${error.message}`);
      if (error.requirement !== undefined) {
        console.log(`📋 Requirement: ${JSON.stringify(error.requirement)}`);
      }
      console.groupEnd();
    });
    console.groupEnd();
  } else if (result.success) {
    console.log('✅ Validation successful!');
  }

  return result;
}