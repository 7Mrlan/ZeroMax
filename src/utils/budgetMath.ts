/**
 * Daily-budget maths, shared by HomeScreen, ReportsScreen and ExpenseEntry —
 * previously three divergent inline copies of `budget / daysInMonth`.
 *
 * The per-day figure is ADAPTIVE for the current month: what is actually left
 * of the monthly budget, spread over the days that remain (including today).
 *
 *   30k budget over 30 days                 → day 1:  (30k − 0)  / 30 = 1000/day
 *   spend 10k on day 2                      → day 3:  (30k − 10k) / 28 ≈  714/day
 *
 * Past (and future) months have no "remaining days", so they keep the plain
 * monthly average — which also means historical screens render exactly as
 * they did before this existed.
 */

export interface DailyAllowanceInput {
  monthlyBudget: number;
  /** Spend in this month EXCLUDING the reference day itself. */
  spentBeforeToday: number;
  /** 1-based day of month the allowance is computed for. */
  dayOfMonth: number;
  daysInMonth: number;
  /** False → static monthly average (historical months). */
  isCurrentMonth: boolean;
}

export interface DailyAllowance {
  /** Per-day figure to display. Never negative. */
  allowance: number;
  /** The month's budget is already fully spent before the reference day. */
  budgetExhausted: boolean;
}

export const computeDailyAllowance = ({
  monthlyBudget,
  spentBeforeToday,
  dayOfMonth,
  daysInMonth,
  isCurrentMonth,
}: DailyAllowanceInput): DailyAllowance => {
  if (monthlyBudget <= 0 || daysInMonth <= 0) {
    return {allowance: 0, budgetExhausted: monthlyBudget <= 0};
  }

  if (!isCurrentMonth) {
    return {allowance: monthlyBudget / daysInMonth, budgetExhausted: false};
  }

  const remainingBudget = monthlyBudget - spentBeforeToday;
  const remainingDays = Math.max(daysInMonth - dayOfMonth + 1, 1);

  return {
    // Clamped at 0: an overspent month shows "~0/day" and everything spent
    // today reads as "over today" — a negative daily allowance means nothing.
    allowance: Math.max(remainingBudget, 0) / remainingDays,
    budgetExhausted: remainingBudget <= 0,
  };
};
