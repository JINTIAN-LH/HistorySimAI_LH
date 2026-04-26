import { applyOpeningTurnWorldviewOverride, buildStoryTemplatePaths } from './storySystem.js';

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

  it('prefers custom worldview opening content on the first turn', () => {
    const baseline = {
      storyParagraphs: ['模板首回合文案'],
      choices: [
        { id: 'baseline_1', text: '模板选项一', hint: '模板提示一', effects: { treasury: 10 } },
        { id: 'baseline_2', text: '模板选项二', hint: '模板提示二', effects: { grain: 5 } },
      ],
    };

    const state = {
      config: {
        worldviewData: {
          openingTurn: {
            briefingTitle: '新世界开场',
            briefingLines: ['自定义首回合文案'],
            openingChoices: [
              { id: 'opening_1', label: '自定义选项一', summary: '自定义摘要一' },
              { id: 'opening_2', label: '自定义选项二', summary: '自定义摘要二' },
            ],
          },
        },
      },
    };

    const result = applyOpeningTurnWorldviewOverride(baseline, state, true);

    expect(result.storyParagraphs).toEqual(['【新世界开场】', '自定义首回合文案']);
    expect(result.choices).toEqual([
      { id: 'opening_1', text: '自定义选项一', hint: '自定义摘要一', effects: { treasury: 10 } },
      { id: 'opening_2', text: '自定义选项二', hint: '自定义摘要二', effects: { grain: 5 } },
    ]);
  });
});