import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRow, validateRows } from "../row-model.js";

test("normalizes every vocabulary field to a string", () => {
  assert.deepEqual(normalizeRow({ word: "depression", familiarity: 2 }), {
    date: "",
    word: "depression",
    pronunciation: "",
    part: "",
    meaning: "",
    context: "",
    collocation: "",
    source: "",
    recall: "未测",
    familiarity: "2",
    review: "",
    notes: "",
  });
});

test("ships a nonempty personal vocabulary list", async () => {
  const rows = validateRows(
    JSON.parse(await readFile("vocabulary.json", "utf8")),
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.some((row) => row.word.trim()));
  assert.ok(rows.some((row) => row.word === "constantly"));
});
