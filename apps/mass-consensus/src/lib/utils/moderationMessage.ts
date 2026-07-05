/**
 * Maps a moderation category returned by the server to a warm, good-faith
 * message KEY that the client localizes with `t()` in the participant's own UI
 * language.
 *
 * Why not use the server's free-text `reason`? The model doesn't reliably match
 * the input language (an English input can come back explained in Hebrew), and
 * quoting a user's own harsh words back at them isn't especially kind. The
 * category is stable, so we render a consistent, gentle message locally instead.
 * The specific model `reason` is still kept server-side for the admin
 * moderation log, where the extra detail is useful.
 */

// The generic fallback is already defined + translated for the submit path.
const GENERIC_KEY = "This didn't quite fit here. Please rephrase and try again.";

const CATEGORY_MESSAGE_KEYS: Record<string, string> = {
  personal_attack: 'That came across as a personal attack. Could you rephrase it more kindly?',
  profanity: "Let's keep it friendly — could you rephrase that without the strong language?",
  hate_speech: 'That could come across as hurtful to a group of people. Could you rephrase it more respectfully?',
  sexual_content: "That's a little too explicit for here. Could you rephrase it?",
  violence_threats: 'That reads as a threat. Could you make your point without it?',
};

export function moderationMessageKey(category?: string | null): string {
  if (category && CATEGORY_MESSAGE_KEYS[category]) {
    return CATEGORY_MESSAGE_KEYS[category];
  }

  return GENERIC_KEY;
}
