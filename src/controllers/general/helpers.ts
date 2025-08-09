import firebaseConfig from "@/controllers/db/configKey";
import {
  functionConfig,
  StatementSubscription,
  Statement,
  Role,
  StatementType,
  QuestionType,
} from "delib-npm";
import { useAuthentication } from "../hooks/useAuthentication";
import { EnhancedEvaluationThumb } from "@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel";

export function isAuthorized(
  statement: Statement | undefined,
  statementSubscription: StatementSubscription | undefined,
  parentStatementCreatorId?: string | undefined,
  authorizedRoles?: Array<Role>
) {
  try {
    if (!statement) throw new Error("No statement");

    const { user } = useAuthentication();
    if (!user) return false;

    if (
      isUserCreator(
        user.uid,
        statement,
        parentStatementCreatorId,
        statementSubscription
      )
    ) {
      return true;
    }

    if (
      statementSubscription &&
      isUserAuthorizedByRole(statementSubscription.role, authorizedRoles)
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(error);

    return false;
  }
}

function isUserCreator(
  userId: string,
  statement: Statement,
  parentStatementCreatorId?: string,
  statementSubscription?: StatementSubscription
): boolean {
  return (
    statement.creator?.uid === userId ||
    statement.creator?.uid === parentStatementCreatorId ||
    statement.creator?.uid === statementSubscription?.userId
  );
}
export function isChatMessage(statementType: StatementType): boolean {
  if (statementType === StatementType.statement) return true;

  return false;
}
export function isMassConsensus(questionType: QuestionType): boolean {
  if (questionType === QuestionType.massConsensus) return true;

  return false;
}
function isUserAuthorizedByRole(
  role: Role,
  authorizedRoles?: Array<Role>
): boolean {
  return role === Role.admin || (authorizedRoles?.includes(role) ?? false);
}

export function isAdmin(role: Role | undefined): boolean {
  if (role === Role.admin || role === Role.creator) return true;

  return false;
}

export function getInitials(fullName: string) {
  // Split the full name into words
  const words = fullName.split(" ");

  // Initialize an empty string to store the initials
  let initials = "";

  // Iterate through each word and append the first letter to the initials string
  for (const word of words) {
    if (word.length > 0) {
      initials += word[0].toUpperCase();
    }
  }

  return initials;
}

export function generateRandomLightColor(uuid: string) {
  // Generate a random number based on the UUID
  const seed = parseInt(uuid.replace(/[^\d]/g, ""), 10);
  const randomValue = (seed * 9301 + 49297) % 233280;

  // Convert the random number to a hexadecimal color code
  const hexColor = `#${((randomValue & 0x00ffffff) | 0xc0c0c0)
    .toString(16)
    .toUpperCase()}`;

  return hexColor;
}
export function isStatementTypeAllowedAsChildren(
  parentStatement: string | { statementType: StatementType },
  childType: StatementType
): boolean {
  // Handle 'top' case and string case
  if (parentStatement === "top" || typeof parentStatement === "string") {
    return true;
  }

  // Handle the group/option case
  if (
    parentStatement.statementType === StatementType.group &&
    childType === StatementType.option
  ) {
    return false;
  }

  return true;
}
export const statementTitleToDisplay = (
  statement: string,
  titleLength: number
) => {
  const _title =
    statement.split("\n")[0].replace("*", "") || statement.replace("*", "");

  const titleToSet =
    _title.length > titleLength - 3
      ? _title.substring(0, titleLength) + "..."
      : _title;

  return { shortVersion: titleToSet, fullVersion: _title };
};

//function which check if the statement can be linked to children

export function getPastelColor() {
  return `hsl(${360 * Math.random()},100%,75%)`;
}

export function calculateFontSize(text: string, maxSize = 6, minSize = 14) {
  // Set the base font size and a multiplier for adjusting based on text length
  const baseFontSize = minSize;
  const fontSizeMultiplier = 0.2;

  // Calculate the font size based on the length of the text
  const fontSize = Math.max(
    baseFontSize - fontSizeMultiplier * text.length,
    maxSize
  );

  return `${fontSize}px`;
}

export function getTitle(statement: Statement | undefined) {
  try {
    if (!statement) return "";

    const title = statement.statement.split("\n")[0].replace("*", "");

    return title;
  } catch (error) {
    console.error(error);

    return "";
  }
}

export function getDescription(statement: Statement) {
  try {
    if (!statement) throw new Error("No statement");

    const description = statement.statement.split("\n").slice(1).join("\n");

    return description;
  } catch (error) {
    console.error(error);

    return "";
  }
}

export function getSetTimerId(statementId: string, order: number) {
  return `${statementId}--${order}`;
}

export function getRoomTimerId(
  statementId: string,
  roomNumber: number,
  order: number
) {
  return `${statementId}--${roomNumber}--${order}`;
}

export function getStatementSubscriptionId(
  statementId: string,
  userId: string
): string | undefined {
  try {
    if (!statementId) throw new Error("No statementId");

    return `${userId}--${statementId}`;
  } catch (error) {
    console.error(error);

    return undefined;
  }
}

//get first name from full name or first name with firs family name letter

export function getFirstName(fullName: string) {
  try {
    if (!fullName) return "";
    const names = fullName.split(" ");
    if (names.length > 1) return names[0] + " " + names[1][0] + ".";

    return names[0];
  } catch (error) {
    console.error(error);

    return "";
  }
}

export function getNumberDigits(number: number): number {
  const _number = Math.floor(number);

  return _number.toString().length;
}

export function isProduction(): boolean {
  return window.location.hostname !== "localhost";
}

export const handleCloseInviteModal = (
  setShowModal: (show: boolean) => void
) => {
  const inviteModal = document.querySelector(".inviteModal");
  inviteModal.classList.add("closing");

  setTimeout(() => {
    setShowModal(false);
  }, 400);
};

export function getLastElements(
  array: Array<unknown>,
  number: number
): Array<unknown> {
  return array.slice(Math.max(array.length - number, 1));
}

export function getTime(time: number): string {
  const timeEvent = new Date(time);
  const hours = timeEvent.getHours();
  const minutes = timeEvent.getMinutes();

  const timeDay = timeEvent.getDate();
  const timeMonth = timeEvent.getMonth() + 1;
  const timeYear = timeEvent.getFullYear();

  const currentTime = new Date();
  const currentDay = currentTime.getDate();
  const currentMonth = currentTime.getMonth() + 1;
  const currentYear = currentTime.getFullYear();

  if (currentYear !== timeYear) {
    return `${timeDay}/${timeMonth}/${timeYear} ${hours}:${minutes?.toString().length === 1 ? "0" + minutes : minutes}`;
  } else if (
    currentDay !== timeDay &&
    currentMonth === timeMonth &&
    currentYear === timeYear
  ) {
    return `${timeDay}/${timeMonth} ${hours}:${minutes?.toString().length === 1 ? "0" + minutes : minutes}`;
  } else if (
    currentDay === timeDay &&
    currentMonth === timeMonth &&
    currentYear === timeYear
  ) {
    return `${hours}:${minutes?.toString().length === 1 ? "0" + minutes : minutes}`;
  }

  return `${hours}:${minutes?.toString().length === 1 ? "0" + minutes : minutes}`;
}

export function truncateString(text: string, maxLength = 20): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

export function getLatestUpdateStatements(statements: Statement[]): number {
  if (!statements || statements.length === 0) {
    return 0;
  }

  return statements.reduce(
    (latestUpdate, statement) =>
      statement.lastUpdate > latestUpdate ? statement.lastUpdate : latestUpdate,
    0
  );
}

export const emojiTransformer = (text: string): string => {
  // Define the sentiment emoji mapping
  const sentimentEmojis = {
    ":-1": "😠", // Really disagree
    ":-0.75": "🙁", // Strongly disagree
    ":-0.5": "😕", // Half disagree
    ":-0.25": "😐", // Slightly disagree
    ":0": "😐", // Neutral
    ":0.25": "🙂", // Slightly agree
    ":0.5": "😊", // Half agree
    ":0.75": "😄", // Strongly agree
    ":1": "😁", // Really agree
  };

  // Transform the text with emoji replacements
  if (!text) return "";

  let result = text;

  // Replace all sentiment codes with corresponding emojis
  // Use a more precise regex pattern that looks for the exact codes
  Object.entries(sentimentEmojis).forEach(([code, emoji]) => {
    // Escape special characters in the code
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Use lookahead and lookbehind to ensure we're matching standalone codes
    // Or use a regex that matches the code at the start, end, or surrounded by spaces
    const regex = new RegExp(`(^|\\s)${escapedCode}(\\s|$)`, "g");
    result = result.replace(regex, `$1${emoji}$2`);
  });

  return result;
};

/**
 * Find the closest evaluation value in the array to a given target value
 * @param {Array} array - Array of objects with evaluation property
 * @param {number} targetValue - The value to find the closest match for (-1 to 1)
 * @returns {Object} - The object with the closest evaluation value
 */
export function findClosestEvaluation(
  array: EnhancedEvaluationThumb[],
  targetValue = 0
) {
  // Validate input
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("Input must be a non-empty array");
  }

  if (targetValue < -1 || targetValue > 1) {
    throw new Error("Target value must be between -1 and 1");
  }

  // Sort the array by the absolute difference between evaluation and target value
  return array.reduce((closest, current) => {
    const currentDiff = Math.abs(current.evaluation - targetValue);
    const closestDiff = Math.abs(closest.evaluation - targetValue);

    return currentDiff < closestDiff ? current : closest;
  }, array[0]);
}

/**
 * Generates an API endpoint for Firebase Cloud Functions
 * @param {string} functionName - The name of the Firebase function
 * @param {Record<string, string|number>} queryParams - Query parameters to append to the URL
 * @param {string} envVarName - Optional environment variable name to use for production endpoints
 * @returns {string} - The complete API endpoint URL
 */
export function APIEndPoint(
  functionName: string,
  queryParams: Record<string, string | number>,
  envVarName?: string
): string {
  // Convert query parameters to URL search params
  const queryString = Object.entries(queryParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  // Check if running on localhost
  if (window.location.hostname === "localhost") {
    return `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/${functionName}${queryString ? "?" : ""}${queryString}`;
  }

  // For production, use the provided environment variable or construct a default one
  const envVar = envVarName
    ? import.meta.env[envVarName]
    : import.meta.env[`VITE_APP_${functionName.toUpperCase()}_ENDPOINT`];

  // If the environment variable exists, use it, otherwise use a standard pattern
  if (envVar) {
    return `${envVar}?${queryString}`;
  }

  // Fallback if no environment variable is found
  return `https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/${functionName}?${queryString}`;
}

// Last edited statement marker helpers
export const LAST_EDITED_KEY = "lastEditedNodeId";

export function markLastEdited(id: string) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_EDITED_KEY, id);
    }
  } catch {
    // ignore storage errors
  }
}
// NEW: read without clearing
export function peekLastEdited(): string | null {
  try {
    return typeof window !== "undefined"
      ? localStorage.getItem(LAST_EDITED_KEY)
      : null;
  } catch {
    return null;
  }
}

// NEW: clear when you're done animating
export function clearLastEdited() {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(LAST_EDITED_KEY);
  } catch {
    /* empty */
  }
}

export function consumeLastEdited(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const id = localStorage.getItem(LAST_EDITED_KEY);
    if (id) localStorage.removeItem(LAST_EDITED_KEY);

    return id;
  } catch {
    return null;
  }
}
