import StorageService from './asyncStorageService';

/**
 * User preference for which day the Reports calendar week begins on.
 * Sunday is the default because it is the app's historical behaviour —
 * existing users see no change until they opt in to Monday.
 */

export type WeekStartDay = 'sunday' | 'monday';

const WEEK_START_KEY = 'weekStartDay';
const VALID_VALUES: WeekStartDay[] = ['sunday', 'monday'];

export const getWeekStartDay = (): WeekStartDay => {
  const saved = StorageService.getItemSync(WEEK_START_KEY);
  if (saved && (VALID_VALUES as string[]).includes(saved)) {
    return saved as WeekStartDay;
  }
  return 'sunday';
};

export const setWeekStartDay = (day: WeekStartDay): void => {
  StorageService.setItemSync(WEEK_START_KEY, day);
};

/** How many positions the Sunday-first weekday arrays shift left. */
export const weekStartOffset = (start: WeekStartDay): 0 | 1 =>
  start === 'monday' ? 1 : 0;

/** Rotates a Sunday-first weekday-name array to begin on the chosen day. */
export const rotateWeekdays = (names: string[], start: WeekStartDay): string[] => {
  const offset = weekStartOffset(start);
  if (offset === 0 || names.length === 0) {
    return names;
  }
  return [...names.slice(offset), ...names.slice(0, offset)];
};

/**
 * Leading blank cells for a month grid. `firstDayOfMonth` is dayjs's `.day()`
 * (0 = Sunday, always); the preference shifts which column that lands in.
 */
export const leadingBlanks = (firstDayOfMonth: number, start: WeekStartDay): number =>
  (firstDayOfMonth - weekStartOffset(start) + 7) % 7;
