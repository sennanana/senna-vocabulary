import assert from "node:assert/strict";
import test from "node:test";
import {
  createGitHubSync,
  GitHubAuthError,
  GitHubConflictError,
} from "../github-sync.js";

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("connect stores a valid token and authenticated owner", async () => {
  const local = storage();
  const fetchImpl = async (url) =>
    url.endsWith("/user")
      ? response(200, { login: "senna" })
      : response(200, { sha: "one", content: btoa("[]") });
  const sync = createGitHubSync({
    repo: "senna-vocabulary",
    fetchImpl,
    storage: local,
  });

  await sync.connect("github_pat_test");

  assert.equal(sync.isConnected(), true);
  assert.equal(local.getItem("senna:github-owner:v1"), "senna");
});

test("connect rejects invalid credentials without persisting them", async () => {
  const local = storage();
  const sync = createGitHubSync({
    repo: "senna-vocabulary",
    storage: local,
    fetchImpl: async () => response(401, {}),
  });

  await assert.rejects(() => sync.connect("bad"), GitHubAuthError);
  assert.equal(sync.isConnected(), false);
});

test("save updates vocabulary.json with the current sha", async () => {
  const local = storage();
  local.setItem("senna:github-token:v1", "github_pat_test");
  local.setItem("senna:github-owner:v1", "senna");
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return options.method === "PUT"
      ? response(200, { content: { sha: "two" } })
      : response(200, { sha: "one", content: btoa("[]") });
  };
  const sync = createGitHubSync({
    repo: "senna-vocabulary",
    fetchImpl,
    storage: local,
    now: () => 1_000,
  });
  await sync.load();

  await sync.save([{ word: "depression" }]);

  const body = JSON.parse(requests.at(-1).options.body);
  assert.equal(body.sha, "one");
  assert.match(atob(body.content), /depression/);
});

test("save refuses a stale remote sha", async () => {
  const local = storage();
  local.setItem("senna:github-token:v1", "github_pat_test");
  local.setItem("senna:github-owner:v1", "senna");
  let sha = "one";
  const sync = createGitHubSync({
    repo: "senna-vocabulary",
    storage: local,
    fetchImpl: async () =>
      response(200, { sha, content: btoa("[]") }),
  });
  await sync.load();
  sha = "changed-elsewhere";

  await assert.rejects(() => sync.save([]), GitHubConflictError);
});

test("save keeps conflict protection after the client is recreated", async () => {
  const local = storage();
  local.setItem("senna:github-token:v1", "github_pat_test");
  local.setItem("senna:github-owner:v1", "senna");
  let sha = "one";
  const fetchImpl = async () =>
    response(200, { sha, content: btoa("[]") });
  const first = createGitHubSync({
    repo: "senna-vocabulary",
    storage: local,
    fetchImpl,
  });
  await first.load();
  sha = "changed-after-reload";
  const second = createGitHubSync({
    repo: "senna-vocabulary",
    storage: local,
    fetchImpl,
  });

  await assert.rejects(() => second.save([]), GitHubConflictError);
});
