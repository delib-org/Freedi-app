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

export function generateTemporalName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 999) + 1;

  return `${adjective} ${noun} ${number}`;
}
