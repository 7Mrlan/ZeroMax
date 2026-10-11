import {z} from 'zod';

export type AiRecordType = 'expense' | 'income';

const rawItemSchema = z
  .object({
    type: z.enum(['expense', 'income']),
    title: z.string().trim().min(1).max(200),
    amount: z.union([z.number(), z.string()]).nullable(),
    categoryName: z.string().trim().max(120).default(''),
    categoryHint: z.string().trim().max(200).default(''),
    date: z.string().trim().min(1).max(64),
    description: z.string().trim().max(500).default(''),
  })
  .strict();

const rawResponseSchema = z.object({items: z.array(rawItemSchema).max(50)}).strict();

export interface AiParserItem {
  type: AiRecordType;
  title: string;
  amount: number | null;
  categoryName: string;
  categoryHint: string;
  date: string;
  description: string;
}

export interface AiParserResponse {
  items: AiParserItem[];
}

export class AiParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiParserError';
  }
}

const MAX_RESPONSE_BYTES = 256 * 1024;
const normalizeAmount = (value: number | string | null): number | null => {
  if (value === null) return null;
  const normalized = typeof value === 'number' ? value : Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

const stripJsonFence = (value: string): string =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

export const parseAiResponse = (content: string): AiParserResponse => {
  const approximateByteLength = Array.from(content).reduce(
    (total, character) => total + (character.codePointAt(0)! > 0x7f ? 2 : 1),
    0,
  );
  if (approximateByteLength > MAX_RESPONSE_BYTES) {
    throw new AiParserError('AI response exceeds the size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new AiParserError('AI response is not valid JSON');
  }
  const result = rawResponseSchema.safeParse(parsed);
  if (!result.success) throw new AiParserError('AI response does not match the expected schema');
  return {
    items: result.data.items.map(item => ({...item, amount: normalizeAmount(item.amount)})),
  };
};

export const normalizeAiEndpoint = (baseUrl: string, allowedHosts: readonly string[]): string => {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new AiParserError('AI endpoint is invalid');
  }
  if (url.protocol !== 'https:') throw new AiParserError('AI endpoint must use HTTPS');
  if (!allowedHosts.includes(url.hostname)) throw new AiParserError('AI endpoint host is not allowed');
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) pathname += '/chat/completions';
  return `${url.protocol}//${url.host}${pathname}`;
};

export const buildAiParserPrompt = (
  input: string,
  categories: {expense: string[]; income: string[]},
  referenceDateTime: string,
): string =>
  [
    'Return JSON only with shape {"items":[{type,title,amount,categoryName,categoryHint,date,description}]}',
    'type must be expense or income; amount is positive number or null; never invent categories.',
    `Reference time: ${referenceDateTime}`,
    `Expense categories: ${categories.expense.join('|')}`,
    `Income categories: ${categories.income.join('|')}`,
    `User input: ${input.slice(0, 10000)}`,
  ].join('\n');
