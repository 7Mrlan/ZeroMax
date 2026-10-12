// User Service
export {createUser, updateUserById, getAllUsers} from './userService';

// Category Service
export {
  createCategory,
  softDeleteCategoryById,
  restoreCategoryById,
  updateCategoryById,
  getAllCategoriesByUserId,
} from './categoryService';
export type {CategoryData} from './categoryService';

// Expense Service
export {
  createExpense,
  updateExpenseById,
  deleteExpenseById,
  getAllExpensesByUserId,
  getAllExpensesByUserIdWithCategory,
  getAllExpensesByDate,
  getAllExpensesByMonth,
  getAllExpensesByCategoryAndMonth,
  getAllExpensesByCategoriesAndMonth,
  getAvailableExpenseYears,
} from './expenseService';
export type {ExpenseData, ExpenseWithCategory} from './expenseService';

// Income service (v4 target)
export {
  createIncome,
  updateIncomeById,
  deleteIncomeById,
  getAllIncomesByMonth,
  getAllIncomesByCategoryAndMonth,
  getAllIncomesByCategoriesAndMonth,
  getIncomeById,
  getAvailableIncomeYears,
} from './incomeService';
export type {IncomeData, IncomeWithCategory} from './incomeService';

// Currency Service
export {createCurrency, updateCurrencyById, getCurrencyByUserId} from './currencyService';
export type {CurrencyData} from './currencyService';

// Debtor Service
export {
  createDebtor,
  deleteDebtorById,
  updateDebtorById,
  getAllDebtorsByUserId,
  getDebtorByDebtorId,
} from './debtorService';
export type {DebtorData} from './debtorService';

// Debt Service
export {
  createDebt,
  updateDebtById,
  deleteDebtById,
  deleteAllDebtsByDebtorId,
  getAllDebtsByUserId,
  getAllDebtsByUserIdAndDebtorId,
} from './debtService';
export type {DebtData} from './debtService';

// Get Service
export {getAllData} from './getService';
export type {ExportData} from './getService';

// Delete Service
export {deleteAllData} from './deleteService';

// Budget Service
export {upsertBudget, deleteBudget, getBudgetsByMonth} from './budgetService';
export type {BudgetData} from './budgetService';

// Import Service (atomic backup restore)
export {importAllData} from './importService';
export type {ImportResult} from './importService';
