import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repository files contain no token and HTML enforces the content policy", async () => {
  const files = ["index.html", "app.js", "github-sync.js", "vocabulary.json"];
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8")),
  );
  assert.ok(
    contents[0].includes("connect-src 'self' https://api.github.com"),
  );
  const fineGrainedToken = new RegExp(`github${"_pat_"}[A-Za-z0-9_]+`);
  for (const content of contents) {
    assert.doesNotMatch(content, fineGrainedToken);
    assert.doesNotMatch(content, /<script[^>]+https?:\/\//);
  }
});

test("documentation warns about token storage and generated files stay ignored", async () => {
  const readme = await readFile("README.md", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");

  assert.match(readme, /Never commit a GitHub token to this repository\./);
  assert.match(readme, /localStorage/);
  assert.match(gitignore, /^node_modules\/$/m);
});
