import StorageService from './asyncStorageService';
import {getAvailableExpenseYears} from '../watermelondb/services';

/**
 * Per-user cache of the years that have expenses, used to populate the
 * month/year picker without querying the whole expenses table.
 *
 * The key is scoped by userId: restoring a backup creates a NEW user id, and
 * a global key would leave the previous user's years on screen (with the
 * `cached.length > 1` short-circuit below making the stale value permanent).
 */
const CACHE_KEY_PREFIX = 'available-expense-years';

const cacheKey = (userId: string): string => `${CACHE_KEY_PREFIX}:${userId}`;

const ensureCurrentYear = (years: number[]): number[] => {
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) {
    return [...years, currentYear].sort((a, b) => a - b);
  }
  return years;
};

export const getCachedYears = (userId: string): number[] => {
  const raw = StorageService.getItemSync(cacheKey(userId));
  if (raw) {
    try {
      return ensureCurrentYear(JSON.parse(raw));
    } catch {
      return [new Date().getFullYear()];
    }
  }
  return [new Date().getFullYear()];
};

const setCachedYears = (userId: string, years: number[]): void => {
  StorageService.setItemSync(cacheKey(userId), JSON.stringify(years));
};

export const loadAvailableYears = async (userId: string): Promise<number[]> => {
  const cached = getCachedYears(userId);
  if (cached.length > 1) {
    return cached;
  }
  return refreshYearsCache(userId);
};

export const ensureYearInCache = (userId: string, year: number): number[] => {
  const cached = getCachedYears(userId);
  if (!cached.includes(year)) {
    const updated = [...cached, year].sort((a, b) => a - b);
    setCachedYears(userId, updated);
    return updated;
  }
  return cached;
};

/** Re-reads the years from the database. Call after an import/restore. */
export const refreshYearsCache = async (userId: string): Promise<number[]> => {
  const years = await getAvailableExpenseYears(userId);
  const withCurrent = ensureCurrentYear(years);
  setCachedYears(userId, withCurrent);
  return withCurrent;
};
