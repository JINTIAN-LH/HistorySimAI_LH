import { buildStoryTemplatePaths } from './storySystem.js';

describe('buildStoryTemplatePaths', () => {
  it('falls back to the phase baseline when llm turn snapshots are unavailable', () => {
    const paths = buildStoryTemplatePaths({
      currentYear: 3,
      currentMonth: 5,
      currentPhase: 'morning',
      lastChoiceId: 'choice_1',
      storyHistory: [{ turn: 1 }],
      config: { storyMode: 'llm' },
    });

    expect(paths).toEqual([
      'data/story/year3_month5_morning.json',
      'data/story/day1_morning.json',
    ]);
  });
});