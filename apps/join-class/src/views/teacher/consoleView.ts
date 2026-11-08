/**
 * The console's board views, one of them at a time (`?view=`). "tables" is the
 * default and has no parameter; "texts" is "What they wrote"; "student" is the
 * sample of the students' screen (Trello 7S3Axkzd). Pure, so the URL rule is tested.
 */
export type ConsoleView = 'tables' | 'texts' | 'student';

export const DEFAULT_CONSOLE_VIEW: ConsoleView = 'tables';

const NAMED_VIEWS: readonly ConsoleView[] = ['texts', 'student'];

/** The view a `?view=` value names; anything unknown is the default. */
export function consoleViewOf(param: string | undefined): ConsoleView {
	return NAMED_VIEWS.find((view) => view === param) ?? DEFAULT_CONSOLE_VIEW;
}
