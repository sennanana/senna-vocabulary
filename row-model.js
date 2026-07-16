export const ROW_KEYS = [
  "date",
  "word",
  "pronunciation",
  "part",
  "meaning",
  "context",
  "collocation",
  "source",
  "recall",
  "familiarity",
  "review",
  "notes",
];

export function normalizeRow(value = {}) {
  const row = Object.fromEntries(
    ROW_KEYS.map((key) => [key, String(value[key] ?? "")]),
  );
  if (!row.recall) row.recall = "未测";
  if (!row.familiarity) row.familiarity = "0";
  return row;
}

export function validateRows(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Vocabulary data must be an array");
  }
  return value.map(normalizeRow);
}
