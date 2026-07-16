import assert from "node:assert/strict";
import test from "node:test";
import { createLocalState } from "../app.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("dirty local recovery wins over bundled rows", () => {
  const storage = memoryStorage();
  const state = createLocalState({ storage, key: "test" });
  state.write([{ word: "absorbed" }]);

  assert.equal(state.load([{ word: "remote" }]).rows[0].word, "absorbed");
  assert.equal(state.isDirty(), true);
});

test("markClean does not clear a newer local mutation", () => {
  const storage = memoryStorage();
  const state = createLocalState({ storage, key: "test" });
  const firstVersion = state.write([{ word: "one" }]);
  state.write([{ word: "two" }]);

  state.markClean(firstVersion);

  assert.equal(state.isDirty(), true);
});
