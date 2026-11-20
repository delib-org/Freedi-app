import type { ShownSupportBySide } from './classSupportShown';
import type { TablesSetStatusResponse } from '../tableAssignment/tableAssignmentCallables';

/**
 * Wire contracts of the Tables-Class bridge callables (IA tables-class-bridge,
 * region me-west1). "Admin" is the lesson's teacher (admin or creator of the
 * workspace). Every refusal the screens branch on carries `details.reason`
 * (ClassRegistrationErrorReason).
 */

export type ClassRegistrationErrorReason =
	/** The lesson has no registration connected (or the caller asked about another one). */
	| 'not-connected'
	/** The lesson is connected to a different registration, or the registration to a different lesson. */
	| 'connected-elsewhere'
	/** Only the Google account that hosts the registration may connect it. */
	| 'not-registration-host'
	/** The registration has ended. */
	| 'registration-ended'
	/** Copying needs published tables (ranked: "קודם מפרסמים את השיבוץ"; direct: "קודם סוגרים את ההרשמה"). */
	| 'registration-not-published'
	/** Copying and "עדכון מההרשמה" happen at the Tables step only. */
	| 'not-tables-step'
	/** The seating was copied already: pass `replace: true` ("עדכון מההרשמה", after asking). */
	| 'seating-copied'
	/** The personal link is not active (unknown, cancelled, ended, disconnected). One answer for all. */
	| 'seat-link-inactive'
	/** The reserved seat is gone (the person arrived, or the seating was copied again). */
	| 'seat-taken';

/**
 * `classConnectRegistration` (admin, who must also host the registration with
 * the same Google account). One registration, one lesson. Writes the
 * registration's `contextStatementId` and the lesson's
 * `statementSettings.classRegistration`. When the registration asks a position
 * question the lesson's 'side' step is taken out (IA 2.5). Idempotent.
 */
export interface ClassConnectRegistrationRequest {
	mainId: string;
	tableAssignmentId: string;
}
export interface ClassConnectRegistrationResponse {
	connected: true;
	/** The lesson's 'side' step was taken out (the registration asks a position). */
	sideStepRemoved: boolean;
}

/**
 * `classDisconnectRegistration` (admin), "הסרת ההרשמה מהשיעור": until the
 * seating is copied (else reason `seating-copied`). Both objects stay as they
 * were; the 'side' step comes back if connecting removed it; personal links
 * stop working. No-op success when nothing is connected.
 */
export interface ClassDisconnectRegistrationRequest {
	mainId: string;
}
export interface ClassDisconnectRegistrationResponse {
	disconnected: true;
}

/**
 * `classCopySeating` (admin, at the Tables step): "הבאת השולחנות מההרשמה".
 * Copies the published tables into the lesson's tables with the same numbers
 * (run index + 1) and topics. People who arrived become members, the rest
 * reserved seats. Walk-ins go to the table with the fewest taken seats that has
 * a free one (reserved seats and people without a phone count as taken); those
 * with no free seat anywhere stay without a table. Again ("עדכון מההרשמה") needs
 * `replace: true` and undoes moves made by hand.
 */
export interface ClassCopySeatingRequest {
	mainId: string;
	replace?: boolean;
}
export interface ClassCopySeatingResponse {
	tables: number;
	/** Members seated at their registration's table. */
	arrived: number;
	/** Reserved seats of people not here yet. */
	reserved: number;
	/** Walk-ins seated at a table with a free seat. */
	walkInsSeated: number;
	/** Members left without a table ("N בלי שולחן"). */
	withoutTable: number;
}

/**
 * `classCloseRegistration` (admin, connected lesson): closes the registration
 * through the same server path as Tables (`tablesSetStatus` with
 * `registrationClosed`); the caller must host it. A "sit where you like"
 * registration is published at once; a ranked one still needs its preview
 * published in Tables.
 */
export interface ClassCloseRegistrationRequest {
	mainId: string;
}
export type ClassCloseRegistrationResponse = TablesSetStatusResponse;

/** Where an arrival left the caller. `tableN` is null before copying or with no free seat. */
export interface ClassArrival {
	mainId: string;
	/** The name the caller now carries in the lesson (the registration's full name). */
	fullName: string;
	tableN: number | null;
	/** The topic of that table, when the registration has several topics. */
	topic?: string;
	/** The seat was held by another device, which now shows "הדיון ממשיך במכשיר אחר". */
	movedFromAnotherDevice: boolean;
}

/**
 * `classSeatByCode` (any signed-in caller, anonymous included): exchanges a
 * personal link's code (`/seat/:seatCode`) for the seat. The caller joins the
 * lesson under the registration's name; the latest device holds the seat. A
 * stranger with the code gets that one seat and nothing else (no answers).
 * Refused with `not-found`, reason `seat-link-inactive`, for every dead link.
 */
export interface ClassSeatByCodeRequest {
	seatCode: string;
}
export type ClassSeatByCodeResponse = ClassArrival;

/** The caller's answer to a question the name gate asked. */
export type ClassNameAnswer =
	/** "כן, זה אני": take the seat another device holds. */
	| { kind: 'itsMe' }
	/** "לא, אני מישהו אחר": join without registration under that name. */
	| { kind: 'someoneElse' }
	/** Two registrations share the name: the one at this seat (from `choices`). */
	| { kind: 'pick'; seatId: string }
	/** "להצטרף בלי הרשמה". */
	| { kind: 'joinWithout' };

/** One registration a shared name could be, by table only. */
export interface ClassNameChoice {
	seatId: string;
	tableN: number;
	topic?: string;
}

/**
 * `classArriveByName` (any signed-in caller) on a connected lesson's name gate
 * ("כתבו שם מלא, כמו בהרשמה"). Matching is tableAssignmentNameKey, no fuzzy.
 * Outcomes (IA 5.2): one match nobody holds → `seated`; one match another
 * device holds → `nameTaken` (answer itsMe / someoneElse); two matches after
 * copying → `nameTwice` with `choices` (answer pick); before copying →
 * `nameTwiceLater` (the caller is in, without a seat; ask again once tables
 * arrive); no match → `notFound` (fix the name, or answer joinWithout).
 * `joined`: in the lesson without registration (walk-in), seated when a table
 * has a free seat.
 */
export interface ClassArriveByNameRequest {
	mainId: string;
	fullName: string;
	answer?: ClassNameAnswer;
}
export type ClassArriveByNameResponse =
	| ({ outcome: 'seated' } & ClassArrival)
	| ({ outcome: 'joined' } & ClassArrival)
	| { outcome: 'nameTaken' }
	| { outcome: 'nameTwice'; choices: ClassNameChoice[] }
	| { outcome: 'nameTwiceLater' }
	| { outcome: 'notFound' };

/**
 * `classRegistrationSupport` (admin; a member when the challenge shows support
 * by side to everyone): "Support by side" of a connected lesson whose
 * registration asked a position (IA 2.5). Totals only, computed on the server
 * from the private positions; poles are the registration's. Positions are
 * erased when the registration ends, and the totals with them.
 */
export interface ClassRegistrationSupportRequest {
	mainId: string;
}
export interface ClassRegistrationSupportResponse {
	poleA: string;
	poleB: string;
	support: ShownSupportBySide;
}
