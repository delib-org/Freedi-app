/** "מצב ישיר" — plain questionnaire mode without sea animations. */
export type GameMode = 'game' | 'direct';

/**
 * The voyage is the plain questionnaire, for everyone.
 *
 * The two modes used to sit behind a top-bar toggle, which asked every player
 * to choose a presentation before they knew what either one was, and split the
 * voyage into two experiences that had to be kept in step. Direct is now the
 * only mode the interface can reach.
 *
 * The 'game' branches are deliberately left standing in the pages and the sea
 * stage still exists: nothing about the Phaser stage was deleted, so restoring
 * the choice is a matter of making this function return something else again.
 */
export function useMode(): GameMode {
	return 'direct';
}
