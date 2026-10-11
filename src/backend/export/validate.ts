import {z} from 'zod';

const userSchema = z.object({
  username: z.string(),
  email: z.string(),
});

const categorySchema = z.object({
  name: z.string(),
  categoryStatus: z.boolean().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  kind: z.enum(['expense', 'income']).optional(),
  parentName: z.string().nullable().optional(),
});

const expenseSchema = z.object({
  title: z.string(),
  amount: z.number(),
  description: z.string().optional(),
  category: z.object({
    name: z.string(),
    kind: z.enum(['expense', 'income']).optional(),
    parentName: z.string().nullable().optional(),
  }),
  date: z.string(),
});

const incomeSchema = z.object({
  title: z.string(),
  amount: z.number(),
  category: z.object({
    name: z.string(),
    kind: z.literal('income').optional(),
    parentName: z.string().nullable().optional(),
  }),
  date: z.string(),
});

const currencySchema = z.object({
  code: z.string(),
  symbol: z.string(),
  name: z.string(),
});

const debtorSchema = z.object({
  title: z.string(),
  debtorStatus: z.boolean().optional(),
  icon: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
});

const debtSchema = z.object({
  amount: z.number(),
  description: z.string(),
  debtor: z.object({title: z.string()}),
  date: z.string(),
  type: z.string(),
});

const budgetSchema = z.object({
  amount: z.number(),
  month: z.string(),
  budgetType: z.string(),
  category: z.object({name: z.string()}).optional(), // legacy field, ignored on import
});

const exportDataSchema = z.object({
  users: z.array(userSchema).min(1),
  categories: z.array(categorySchema),
  expenses: z.array(expenseSchema),
  currencies: z.array(currencySchema),
  debtors: z.array(debtorSchema),
  debts: z.array(debtSchema),
  budgets: z.array(budgetSchema).default([]),
  incomes: z.array(incomeSchema).optional(),
});

const exportEnvelopeSchema = z.object({
  key: z.string(),
  version: z.number().optional(),
  data: exportDataSchema,
});

export type ExportData = z.infer<typeof exportDataSchema>;
export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

export interface ValidationResult {
  success: boolean;
  data?: ExportEnvelope;
  error?: string;
}

/**
 * Validates the structure of an import file before processing.
 * Returns a typed result to avoid exceptions during import.
 */
export const validateExportEnvelope = (json: unknown): ValidationResult => {
  const result = exportEnvelopeSchema.safeParse(json);
  if (result.success) {
    return {success: true, data: result.data};
  }

  const firstIssue = result.error.issues[0];
  const path = firstIssue?.path?.join('.') || '';
  const message = firstIssue?.message || 'Unknown validation error';
  return {
    success: false,
    error: path ? `Invalid field "${path}": ${message}` : message,
  };
};
