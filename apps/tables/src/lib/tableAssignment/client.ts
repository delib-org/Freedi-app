import { createTablesClient } from '@freedi/table-assignment-client';
import { functions } from '@/lib/firebase';

/**
 * The typed Tables callables (region me-west1), built on the shared
 * `functions` instance. This is the only client: screens import `tablesApi`
 * and never call httpsCallable themselves.
 */
export const tablesApi = createTablesClient(functions);
