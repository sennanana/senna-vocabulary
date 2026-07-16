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

test("ships all recovered personal rows", async () => {
  const rows = validateRows(
    JSON.parse(await readFile("vocabulary.json", "utf8")),
  );
  assert.equal(rows.length, 43);
  assert.equal(rows.filter((row) => row.word.trim()).length, 37);
  assert.equal(rows[0].word, "depression");
  assert.ok(rows.some((row) => row.word === "constantly"));
});
