import { STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';

/** The JSON the consultant model must emit (see `schema.ts` for the parser). */
export const OUTPUT_CONTRACT = `## Output contract
Reply with ONE JSON object and nothing else (no markdown fences, no prose outside the JSON):
{
  "diagnosis": {                       // your current understanding; omit fields you do not know
    "hasDraft": "text" | "material" | "nothing",   // the entry rule: a written draft / results but no text / nothing yet
    "decisionType": "gatherIdeas" | "prioritize" | "allocate" | "choose" | "draftText" | "bridgeConflict" | "legitimize" | "educate",
    "whoDecides": string, "whoIsAffected": string,
    "audienceSize": "team" | "room" | "community" | "public",
    "audienceSegments": string[],      // groups with different stakes that need their own live session (e.g. "members", "youth")
    "decisionBody": "assembly" | "council" | "leadership" | "voteInMain",
    "polarization": "low" | "contested" | "hostile",
    "existingOptions": string[], "timeHorizonDays": number, "hardDeadline": "YYYY-MM-DD",
    "facilitationCapacity": "none" | "canRunRoom",
    "desiredOutput": "ideas" | "ranking" | "agreedText" | "decision" | "learning",
    "constraints": string[],
    "confidence": { "<field>": 0..1 }   // how sure you are, per field
  },
  "patternId": string | null,          // the playbook pattern you based the plan on
  "missingCritical": string[],         // diagnosis fields you still need
  "reply": string,                     // what the admin reads, in their language; short, warm, concrete
  "readyToBuild": boolean,             // true ONLY after the admin explicitly approved or asked to build
  "plan": null | {                     // null only while you still ask clarifying questions
    "mainQuestion": { "title": string, "description"?: string },
    "activities": [{
      "tempId": "a1",                  // stable ids a1, a2, … — reuse them when revising
      "type": "crowdSurvey" | "liveSession" | "discussion" | "document",
      "title": string,                 // ONE open question for participants
      "description"?: string,          // ≤ 2 sentences for participants
      "openNow": boolean,              // false → created hidden; schedule an "open" action. A drafted document is ALWAYS false.
      "change": "add" | "keep" | "update",
      "existingStatementId"?: string | null,
      "role"?: "widen" | "measure" | "converge" | "deepen" | "decide" | "ratify" | "comment" | "write",
      "draftFrom": string[] | null,    // document only: tempIds (or existing statementIds) of the activities whose results the Draft step writes it from
      "draftCutoff": null | { "mode": "chosen" | "topN" | "threshold", "n"?: number, "minConsensus"?: number, "minEvaluators"?: number },
      "draftIntent": string | null,    // document only: what the draft should be (one or two sentences for the Draft step)
      "survey"?: null | {              // crowdSurvey only
        "intro"?: string,
        "explanationPages"?: [{ "title": string, "content": string }],
        "allowParticipantsToAddSuggestions"?: boolean,
        "minEvaluationsPerQuestion"?: number,
        "askUserForASolutionBeforeEvaluation"?: boolean,
        "seedOptions": string[],       // EXACTLY 6 starting suggestions, participant-phrased, diverse, in the participants' language
        "extraQuestions"?: [{ "tempId"?: string, "title": string, "description"?: string }]
      }
    }],
    "scheduledActions": [{
      "tempId": "s1",
      "target": string,                // an activity tempId, or an existing statementId
      "action": "open" | "freeze" | "close" | "nudge" | "draft",   // draft: write the target document from its sources (target must be a document)
      "at": string,                    // ISO-8601 with offset, e.g. "2026-09-10T09:00:00+03:00"
      "nudgeMessage"?: string | null,  // nudge only, ≤ ${STUDIO_NUDGE_MESSAGE_MAX} characters, in the participants' language
      "draftFrom": string[] | null     // draft only; defaults to the target document's draftFrom
    }],
    "summary": string                  // 2–4 sentences for the admin: why this sequence, and what to read in Main before opening each stage
  }
}`;
