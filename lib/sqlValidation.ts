const DISALLOWED_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "attach",
  "detach",
  "pragma",
  "vacuum",
  "copy",
  "transaction",
  "grant",
  "revoke",
  "call",
  "execute",
  "merge",
  "truncate",
];

const TABLE_PATTERN = /\b(?:from|join|into)\s+([`"'[\]]?[A-Za-z0-9_\.]+[`"'\]]?)/gi;
const TABLE_KEYWORD_PATTERN = /\b(from|join|into)(\s+)([`"'[\]]?[A-Za-z0-9_\.]+[`"'\]]?)/gi;

function escapeForRegex(value: string) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^[`"'[\]]+|[`"'[\]]+$/g, "");
  const parts = stripped.split(".");
  return parts[parts.length - 1] ?? stripped;
}

function detectCteNames(text: string): Set<string> {
  const result = new Set<string>();
  const trimmed = text.trimStart();
  const withMatch = trimmed.match(/^with\s+(recursive\s+)?/i);
  if (!withMatch) return result;

  let cursor = trimmed.slice(withMatch[0].length);
  while (cursor.length) {
    cursor = cursor.trimStart();
    const nameMatch = cursor.match(/^([A-Za-z_][\w]*)/);
    if (!nameMatch) break;
    result.add(nameMatch[1].toLowerCase());
    cursor = cursor.slice(nameMatch[0].length).trimStart();

    const asMatch = cursor.match(/^as\s*\(/i);
    if (!asMatch) break;
    cursor = cursor.slice(asMatch[0].length);

    let depth = 1;
    let idx = 0;
    for (; idx < cursor.length; idx++) {
      const char = cursor[idx];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          idx += 1;
          break;
        }
      }
    }
    if (depth !== 0) break;

    cursor = cursor.slice(idx).trimStart();
    if (cursor.startsWith(",")) {
      cursor = cursor.slice(1);
      continue;
    }
    break;
  }

  return result;
}

export function extractReferencedTables(sql: string): string[] {
  if (!sql) return [];
  const cteNames = detectCteNames(sql);
  // Allow set-returning functions like UNNEST in FROM/JOIN without
  // treating them as table references.
  const setReturningFuncs = new Set(["unnest"]);
  const matches = [...sql.matchAll(TABLE_PATTERN)];
  const tables = matches
    .map((match) => normalizeIdentifier(match[1] ?? ""))
    .filter((name) => name.length > 0)
    .filter((name) => !cteNames.has(name.toLowerCase()))
    .filter((name) => !setReturningFuncs.has(name.toLowerCase()));
  return Array.from(new Set(tables));
}

export type SqlValidationResult =
  | { ok: true; tables: string[] }
  | { ok: false; message: string };

export function validateSqlAgainstTables(
  sql: string,
  allowedTables: string[],
): SqlValidationResult {
  const text = sql.trim();
  if (!text) {
    return { ok: false, message: "SQL is empty" };
  }

  const lower = text.toLowerCase();
  const startsWithSelect = lower.startsWith("select");
  const startsWithWith = lower.startsWith("with ");
  if (!startsWithSelect && !startsWithWith) {
    return { ok: false, message: "Only SELECT queries (optionally wrapped in WITH) are allowed." };
  }

  if (text.split(";").filter((segment) => segment.trim().length > 0).length > 1) {
    return { ok: false, message: "Only a single SQL statement is allowed." };
  }

  for (const keyword of DISALLOWED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(text)) {
      return { ok: false, message: `Keyword "${keyword}" is not permitted.` };
    }
  }

  const tables = extractReferencedTables(text);
  if (!tables.length) {
    return { ok: false, message: "Query must reference at least one uploaded table." };
  }

  const allowedSet = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const table of tables) {
    if (!allowedSet.has(table.toLowerCase())) {
      return {
        ok: false,
        message: `Table "${table}" is not available. Upload the dataset first.`,
      };
    }
  }

  return { ok: true, tables };
}

export function rewriteSqlTables(
  sql: string,
  aliasToTableId: Record<string, string>,
): string {
  if (!sql) return sql;
  let result = sql.replace(
    TABLE_KEYWORD_PATTERN,
    (fullMatch, keyword, spacing, tableToken) => {
      const normalized = normalizeIdentifier(tableToken);
      const replacement = aliasToTableId[normalized.toLowerCase()];
      if (!replacement) return fullMatch;
      return `${keyword}${spacing}"${replacement}"`;
    },
  );

  Object.entries(aliasToTableId).forEach(([aliasLower, tableId]) => {
    if (!tableId || aliasLower === tableId.toLowerCase()) return;
    const escaped = escapeForRegex(aliasLower);
    const regexBare = new RegExp(`\\b${escaped}\\b(?=\\.)`, "gi");
    result = result.replace(regexBare, `"${tableId}"`);
    const regexQuoted = new RegExp(`"${escaped}"(?=\\.)`, "gi");
    result = result.replace(regexQuoted, `"${tableId}"`);
  });

  return result;
}
