export {};

declare const __dirname: string;
const fs = require('fs');
const path = require('path');

describe('swipe tutorial animation contract', () => {
  it('binds entering and exiting layout animations to system reduce motion', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../SwipeTutorialTooltip.tsx'), 'utf8');

    expect(source).toContain('FadeIn.duration(300).reduceMotion(ReduceMotion.System)');
    expect(source).toContain('FadeOut.duration(200).reduceMotion(ReduceMotion.System)');
  });
});
