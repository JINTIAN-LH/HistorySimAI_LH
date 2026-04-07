import { buildStoryTemplatePaths } from './storySystem.js';
import { RIGID_MODE_ID } from '../rigid/config.js';

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

  it('uses hard mode first-turn baseline for rigid mode', () => {
    const paths = buildStoryTemplatePaths({
      currentPhase: 'evening',
      lastChoiceId: null,
      storyHistory: [],
      config: { storyMode: 'llm', gameplayMode: RIGID_MODE_ID },
    });

    expect(paths).toEqual(['data/story/hard_mode_day1_evening.json']);
  });
});