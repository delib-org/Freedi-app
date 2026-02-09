/**
 * Deterministic pseudo-name generator for anonymous identity display.
 * Same userId always produces the same pseudo-name.
 */

const adjectives = [
  'Clear', 'Thoughtful', 'Curious', 'Insightful', 'Creative',
  'Analytical', 'Observant', 'Mindful', 'Reflective', 'Intuitive',
  'Logical', 'Wise', 'Bright', 'Deep', 'Fair',
  'Open', 'Sharp', 'Quick', 'Keen', 'Bold',
];

const nouns = [
  'Thought', 'Mind', 'Voice', 'Perspective', 'View',
  'Insight', 'Question', 'Explorer', 'Thinker', 'Observer',
  'Analyst', 'Contributor', 'Participant', 'Learner', 'Seeker',
  'Scholar', 'Listener', 'Speaker', 'Idea', 'Vision',
];

/**
 * Generate a deterministic pseudo-name from a userId.
 * Same userId always produces the same name.
 *
 * @param userId - The user's unique identifier
 * @returns A pseudo-name like "Clear Thought 423"
 */
export function getPseudoName(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  hash = Math.abs(hash);

  const adjIdx = hash % adjectives.length;
  const nounIdx = Math.floor(hash / adjectives.length) % nouns.length;
  const number = (hash % 999) + 1;

  return `${adjectives[adjIdx]} ${nouns[nounIdx]} ${number}`;
}
