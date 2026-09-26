// Server-only: PDF text extraction, PII redaction, and Gemini parsing.
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import {
  CATEGORIES,
  isValidDate,
  parseTransaction,
  toAmount,
  type ExtractedTransaction,
  type RedactionKind,
  type RedactionSummary,
  type StatementExtraction,
} from "@/lib/statement-types";

export function hashFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ---- Extraction ------------------------------------------------------------

export type ExtractResult =
  | { needsPassword: true; incorrectPassword: boolean }
  | {
      needsPassword: false;
      redactedText: string;
      pageCount: number;
      redactions: RedactionSummary;
    };

type Piece = { str: string; x: number; y: number; width: number };

// Rebuild visual lines from pdf.js text items. Items on the same baseline
// (within a couple of points) are one row; wide gaps become double spaces
// so table columns stay readable for the model.
function piecesToLines(pieces: Piece[]): string[] {
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Piece[][] = [];
  for (const piece of pieces) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - piece.y) <= 2.5) row.push(piece);
    else rows.push([piece]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd: number | null = null;
    for (const p of row) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        if (gap > 12) line += "  ";
        else if (gap > 1 && !line.endsWith(" ") && !p.str.startsWith(" ")) line += " ";
      }
      line += p.str;
      prevEnd = p.x + p.width;
    }
    return line.replace(/\s+$/, "");
  });
}

export async function extractAndRedactPdf(
  buffer: Buffer,
  password?: string,
  options: { knownNames?: string[] } = {},
): Promise<ExtractResult> {
  // The legacy build is the one that runs in Node. pdfjs-dist is listed in
  // serverExternalPackages so its fake worker can resolve pdf.worker.mjs.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer), // copy: pdf.js detaches the array it's given
    password: password || undefined,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    if (err instanceof pdfjs.PasswordException) {
      return {
        needsPassword: true,
        incorrectPassword: err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD,
      };
    }
    throw err;
  }

  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        pieces.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      pages.push(`--- Page ${n} ---\n${piecesToLines(pieces).join("\n")}`);
      page.cleanup();
    }

    const rawText = pages.join("\n\n");
    const { text, summary } = redactText(rawText, options.knownNames);
    return { needsPassword: false, redactedText: text, pageCount: doc.numPages, redactions: summary };
  } finally {
    await task.destroy();
  }
}

// ---- Redaction -------------------------------------------------------------

const STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|PR|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

const STREET_SUFFIX =
  "Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy|Trail|Trl|Square|Sq|Loop|Plaza|Plz";

// Words that show up in header lines above the bank's own address. A line
// containing one of these is not treated as the account holder's name.
const NOT_A_NAME =
  /\b(bank|n\.a\.|credit union|financial|federal|savings|checking|card services|visa|mastercard|rewards|statement|account|summary|page|customer service|member fdic|payments?|p\.?\s*o\.?\s*box|period|balance|return service)\b/i;

const NAME_LINE = /^[A-Z][A-Za-z.'-]*(?:\s+(?:&|and|AND|[A-Z][A-Za-z.'-]*)){1,5},?$/;

const last4 = (digits: string) => digits.replace(/\D/g, "").slice(-4);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Rule = {
  kind: RedactionKind;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
};

// Order matters: specific, labeled patterns run before the broad ones so a
// routing number isn't counted as a generic account number, etc.
const RULES: Rule[] = [
  { kind: "EMAIL", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replace: () => "[EMAIL]" },
  {
    kind: "SSN",
    pattern: /\b(SSN|Social Security(?: No\.?| Number)?)(\s*[:#]?\s*)\d{3}[- ]?\d{2}[- ]?\d{4}\b/gi,
    replace: (_m, label, sep) => `${label}${sep}[SSN]`,
  },
  { kind: "SSN", pattern: /(?:\b\d{3}|\bX{3}|\*{3})-(?:\d{2}|X{2}|\*{2})-\d{4}\b/gi, replace: () => "[SSN]" },
  {
    kind: "TAX_ID",
    pattern:
      /\b(EIN|TIN|ITIN|Tax\s*ID(?:\s*(?:No\.?|Number))?|Employer ID(?:entification)?(?: Number)?)(\s*[:#]?\s*)\d{2}-?\d{7}\b/gi,
    replace: (_m, label, sep) => `${label}${sep}[TAX ID]`,
  },
  { kind: "TAX_ID", pattern: /\b\d{2}-\d{7}\b/g, replace: () => "[TAX ID]" },
  {
    kind: "ROUTING_NUMBER",
    pattern: /\b(Routing|ABA|RTN|Transit)(\s*(?:Number|No\.?|#)?\s*[:#]?\s*)\d{9}\b/gi,
    replace: (_m, label, sep) => `${label}${sep}[ROUTING #]`,
  },
  // 4-4-4-x and Amex 4-6-5, plus masked "XXXX XXXX XXXX 1234"
  {
    kind: "CARD_NUMBER",
    pattern: /(?:\b\d{4}|\bX{4}|[*•]{4})([ -])(?:\d{4}|X{4}|[*•]{4})\1(?:\d{4}|X{4}|[*•]{4})\1\d{1,7}\b|\b\d{4}([ -])\d{6}\2\d{5}\b/gi,
    replace: (m) => `[CARD ••${last4(m)}]`,
  },
  {
    kind: "ACCOUNT_NUMBER",
    pattern: /\b(Account|Acct\.?|A\/C)(\s*(?:Number|No\.?|#|Num)?\s*[:#]?\s*)([X*•\d](?:[X*•\d-]{2,}[X*•\d]))/gi,
    replace: (_m, label, sep, num) => `${label}${sep}[ACCOUNT ••${last4(num)}]`,
  },
  // Any leftover 8-17 digit run (account numbers printed without a label).
  // Amounts are skipped because they carry a decimal part.
  {
    kind: "ACCOUNT_NUMBER",
    pattern: /\b\d{8,17}\b(?![.,]\d)/g,
    replace: (m) => `[ACCOUNT ••${last4(m)}]`,
  },
  {
    kind: "PHONE",
    pattern: /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b/g,
    replace: () => "[PHONE]",
  },
  { kind: "ADDRESS", pattern: /\bP\.?\s*O\.?\s*Box\s+\d+\b/gi, replace: () => "[ADDRESS]" },
  {
    kind: "ADDRESS",
    pattern: new RegExp(
      // Street words are letters or ordinals only, so "01/15 WALMART 45.00 DR" (DR = debit) never matches.
      `(?<![/\\d.,$-])\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:(?:[A-Za-z][A-Za-z'-]*|\\d+(?:st|nd|rd|th))\\s+){1,4}(?:${STREET_SUFFIX})\\b\\.?` +
        `(?:\\s+[NSEW]{1,2}\\b\\.?)?(?:,?\\s*(?:Apt|Apartment|Unit|Suite|Ste|#)\\.?\\s*[A-Za-z0-9-]+)?`,
      "gi",
    ),
    replace: () => "[ADDRESS]",
  },
  {
    kind: "ADDRESS",
    pattern: new RegExp(`\\b[A-Z][A-Za-z.'-]*(?:\\s+[A-Z][A-Za-z.'-]*){0,3},?\\s+(?:${STATES})\\s+\\d{5}(?:-\\d{4})?\\b`, "g"),
    replace: () => "[ADDRESS]",
  },
];

const LABELED_NAME =
  /\b(Account Holders?|Account Owners?|Primary Account Holder|Customer Name|Member Name|Cardholder|Card Member|Prepared For|Statement For|Name)(\s*:\s*)([A-Z][A-Za-z.'-]+(?:[ \t]+(?:&|and|AND|[A-Z][A-Za-z.'-]*)){1,5})/g;

export function redactText(input: string, knownNames: string[] = []) {
  const summary: RedactionSummary = {};
  const bump = (kind: RedactionKind, by = 1) => {
    summary[kind] = (summary[kind] ?? 0) + by;
  };

  let text = input;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...args) => {
      bump(rule.kind);
      // replace() passes (match, ...groups, offset, string); drop the last two
      const [match, ...rest] = args.slice(0, -2) as string[];
      return rule.replace(match, ...rest);
    });
  }

  // Names. Collect candidates, then redact every occurrence of each one.
  const names = new Set(knownNames.map((n) => n.trim()).filter((n) => n.length > 2));

  for (const m of text.matchAll(LABELED_NAME)) {
    // "Bank Name: Chase" is the bank, not the customer.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index);
    if (!/bank\s*$/i.test(before) && !NOT_A_NAME.test(m[3])) names.add(m[3].trim());
  }

  // Mailing block: the line(s) right above a redacted street/PO box address
  // are the account holder (or business) name on almost every statement.
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!line.trim().startsWith("[ADDRESS]")) return;
    for (const j of [i - 1, i - 2]) {
      const candidate = lines[j]?.trim();
      if (candidate && NAME_LINE.test(candidate) && !NOT_A_NAME.test(candidate)) {
        names.add(candidate.replace(/,$/, ""));
      }
    }
  });

  // Longest first so "JANE A DOE" is replaced before "JANE".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    // Also catch "JANE DOE" (no middle initial) and "DOE JANE" / "DOE, JANE",
    // which is how payment apps often print it in transaction descriptions.
    const variants = [name];
    const parts = name.split(/\s+/).filter((p) => p.replace(/\./g, "").length > 1);
    if (parts.length >= 2 && !/&|\band\b/i.test(name)) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      variants.push(`${first} ${last}`, `${last}, ${first}`, `${last} ${first}`);
    }
    for (const v of variants) {
      const re = new RegExp(`\\b${escapeRegex(v).replace(/\s+/g, "\\s+")}\\b`, "gi");
      text = text.replace(re, () => {
        bump("NAME");
        return "[NAME]";
      });
    }
  }

  return { text, summary };
}

// ---- Gemini ----------------------------------------------------------------

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    bank_name: { type: "string", description: "Issuing bank, e.g. 'Chase'." },
    account_identifier: {
      type: "string",
      description: "Last 4 digits of the account as shown in a placeholder like [ACCOUNT ••1234], formatted '••1234'. Empty string if unknown.",
    },
    account_type: { type: "string", enum: ["DEPOSIT", "CREDIT_CARD"] },
    start_date: { type: "string", format: "date", description: "Statement period start, YYYY-MM-DD." },
    end_date: { type: "string", format: "date", description: "Statement period end, YYYY-MM-DD." },
    starting_balance: { type: "number" },
    ending_balance: { type: "number" },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          transaction_time: { type: "string", format: "date", description: "Posting date, YYYY-MM-DD." },
          raw_description: { type: "string", description: "Description exactly as printed." },
          clean_description: { type: "string", description: "Short human-friendly merchant or payee name." },
          category: { type: "string", enum: [...CATEGORIES] },
          is_ai_tool: { type: "boolean" },
          transaction_type: { type: "string", enum: ["INCOME", "EXPENSE"] },
          nominal_amount: { type: "number", description: "Absolute value, always positive." },
        },
        required: [
          "transaction_time",
          "raw_description",
          "clean_description",
          "category",
          "is_ai_tool",
          "transaction_type",
          "nominal_amount",
        ],
      },
    },
  },
  required: [
    "bank_name",
    "account_identifier",
    "account_type",
    "start_date",
    "end_date",
    "starting_balance",
    "ending_balance",
    "transactions",
  ],
} as const;

const SYSTEM_INSTRUCTION = `You extract structured data from bank and credit card statement text.
Personal details were replaced with placeholders like [NAME], [ADDRESS], [ACCOUNT ••1234]. Never guess what they hide.

Rules:
- Include every posted transaction exactly once. Skip running-balance columns, subtotals, and summary rows.
- nominal_amount is always a positive number. transaction_type says the direction:
  INCOME = money into the account (deposits, credits, refunds, payments received on a card);
  EXPENSE = money out of the account (purchases, withdrawals, fees, checks, debits).
- account_type is CREDIT_CARD when the balance is an amount owed, otherwise DEPOSIT.
- starting_balance / ending_balance are the statement's previous/opening and new/closing balances.
- Dates are YYYY-MM-DD. If a row shows only month/day, take the year from the statement period.
- is_ai_tool is true for AI products and APIs: OpenAI, ChatGPT, Anthropic, Claude, Google Gemini, Midjourney,
  Cursor, GitHub Copilot, Perplexity, Replicate, Hugging Face, ElevenLabs, Runway, Jasper, Character.AI, and similar.
  Use category "AI Tools" for those.
- Use "Transfers" for moves between the owner's own accounts and credit card payments.`;

export class GeminiParseError extends Error {}

function normalizeExtraction(data: unknown): StatementExtraction {
  if (!data || typeof data !== "object") throw new GeminiParseError("Gemini returned no object");
  const d = data as Record<string, unknown>;

  const starting = toAmount(d.starting_balance);
  const ending = toAmount(d.ending_balance);
  if (starting === null || ending === null) throw new GeminiParseError("Missing starting or ending balance");
  if (!Array.isArray(d.transactions)) throw new GeminiParseError("Missing transactions array");

  const transactions: ExtractedTransaction[] = [];
  for (const raw of d.transactions) {
    const result = parseTransaction(raw);
    // A single unreadable row shouldn't sink the whole statement; the
    // balance check on the review screen will flag anything missing.
    if (result.ok) transactions.push(result.value);
  }

  const acct = typeof d.account_identifier === "string" ? d.account_identifier : "";
  return {
    bank_name: typeof d.bank_name === "string" && d.bank_name.trim() ? d.bank_name.trim() : "Unknown bank",
    account_identifier: last4(acct) ? `••${last4(acct)}` : "",
    account_type: d.account_type === "CREDIT_CARD" ? "CREDIT_CARD" : "DEPOSIT",
    start_date: isValidDate(d.start_date) ? d.start_date : (transactions[0]?.transaction_time ?? ""),
    end_date: isValidDate(d.end_date) ? d.end_date : (transactions[transactions.length - 1]?.transaction_time ?? ""),
    starting_balance: starting,
    ending_balance: ending,
    transactions: transactions.sort((a, b) => a.transaction_time.localeCompare(b.transaction_time)),
  };
}

let client: GoogleGenAI | null = null;

async function callModel(model: string, redactedText: string) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: `Statement text:\n\n${redactedText}` }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });

  if (!response.text) throw new GeminiParseError(`${model} returned an empty response`);
  try {
    return normalizeExtraction(JSON.parse(response.text));
  } catch (err) {
    if (err instanceof GeminiParseError) throw err;
    throw new GeminiParseError(`${model} returned invalid JSON`);
  }
}

// Tries the primary model, then the lite model on any failure (rate limit,
// outage, or unusable output).
export async function parsePdfWithGemini(
  redactedText: string,
): Promise<{ extraction: StatementExtraction; model: string }> {
  try {
    return { extraction: await callModel(PRIMARY_MODEL, redactedText), model: PRIMARY_MODEL };
  } catch (primaryErr) {
    console.warn(`[gemini] ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, primaryErr);
    return { extraction: await callModel(FALLBACK_MODEL, redactedText), model: FALLBACK_MODEL };
  }
}
