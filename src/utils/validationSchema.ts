import {z} from 'zod';
import i18n from '../i18n';

/**
 * Validation messages use zod's function form (`error: () => ...`) so that
 * `i18n.t` runs at VALIDATION time. Passing the string directly evaluates it
 * at module load and freezes every message in whichever language happened to
 * be active on first import — they would never follow a language change.
 */

/**
 * Person/category names accept any script: letters (\p{L}) and combining
 * marks (\p{M}) plus spaces, apostrophes and hyphens. The previous
 * `[A-Za-z\s]` rejected José, हिंदी, Ольga and every non-Latin name — an
 * unacceptable restriction for an app positioned as India-first.
 */
const NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u;
const CATEGORY_PATTERN = /^[\p{L}\p{M}\p{N}\s'-]+$/u;

export const nameSchema = z
  .string()
  .refine(value => NAME_PATTERN.test(value), {
    error: () => i18n.t('validation.nameLettersOnly'),
  })
  .refine(value => value.length >= 3, {
    error: () => i18n.t('validation.nameMinLength'),
  })
  .refine(value => value.length <= 50, {
    error: () => i18n.t('validation.nameMaxLength'),
  });

export const expenseSchema = z
  .string()
  .min(1, {error: () => i18n.t('validation.expenseMinLength')})
  .max(25, {error: () => i18n.t('validation.expenseMaxLength')});

export const expenseDescriptionSchema = z
  .string()
  .min(0, {error: () => i18n.t('validation.descriptionMinLength')})
  .max(50, {error: () => i18n.t('validation.descriptionMaxLength')});

export const expenseAmountSchema = z
  .number()
  .min(0.01, {error: () => i18n.t('validation.amountMin')})
  .max(1000000, {error: () => i18n.t('validation.amountMax')});

export const categorySchema = z
  .string()
  .refine(value => CATEGORY_PATTERN.test(value), {
    error: () => i18n.t('validation.categoryLettersOnly'),
  })
  .refine(value => value.length >= 1, {
    error: () => i18n.t('validation.categoryMinLength'),
  })
  .refine(value => value.length <= 18, {
    error: () => i18n.t('validation.categoryMaxLength'),
  });
