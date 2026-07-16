import { validateRows } from "./row-model.js";

const TOKEN_KEY = "senna:github-token:v1";
const OWNER_KEY = "senna:github-owner:v1";
const API_VERSION = "2026-03-10";
const API_ROOT = "https://api.github.com";

export class GitHubSyncError extends Error {}
export class GitHubAuthError extends GitHubSyncError {}
export class GitHubConflictError extends GitHubSyncError {}

const encode = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decode = (value) => {
  const bytes = Uint8Array.from(
    atob(value.replace(/\s/g, "")),
    (char) => char.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
};

function errorForStatus(status) {
  if (status === 401 || status === 403) {
    return new GitHubAuthError("GitHub authorization failed");
  }
  if (status === 409) {
    return new GitHubConflictError("GitHub content conflict");
  }
  return new GitHubSyncError(`GitHub request failed (${status})`);
}

export function createGitHubSync({
  repo,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = Date.now,
}) {
  let token = storage.getItem(TOKEN_KEY);
  let owner = storage.getItem(OWNER_KEY);
  let retainedSha = null;
  let saveQueue = Promise.resolve();

  const request = async (path, options = {}, requestToken = token) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      ...options.headers,
    };
    if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
    return fetchImpl(`${API_ROOT}${path}`, { ...options, headers });
  };

  const readContents = async (targetOwner, requestToken = token) => {
    const response = await request(
      `/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(repo)}/contents/vocabulary.json`,
      {},
      requestToken,
    );
    if (!response.ok) throw errorForStatus(response.status);
    const body = await response.json();
    const rows = validateRows(JSON.parse(decode(body.content)));
    return { rows, sha: body.sha };
  };

  const connect = async (candidateToken) => {
    const cleanToken = String(candidateToken ?? "").trim();
    if (!cleanToken) throw new GitHubAuthError("GitHub token is required");

    const userResponse = await request("/user", {}, cleanToken);
    if (!userResponse.ok) throw errorForStatus(userResponse.status);
    const user = await userResponse.json();
    const connectedOwner = String(user.login ?? "").trim();
    if (!connectedOwner) throw new GitHubAuthError("GitHub login is missing");

    const remote = await readContents(connectedOwner, cleanToken);
    token = cleanToken;
    owner = connectedOwner;
    retainedSha = remote.sha;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(OWNER_KEY, owner);
    return remote.rows;
  };

  const disconnect = () => {
    token = null;
    owner = null;
    retainedSha = null;
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(OWNER_KEY);
  };

  const isConnected = () => Boolean(token && owner);

  const load = async () => {
    if (!isConnected()) throw new GitHubAuthError("GitHub is not connected");
    const remote = await readContents(owner);
    retainedSha = remote.sha;
    return remote.rows;
  };

  const performSave = async (rows) => {
    if (!isConnected()) throw new GitHubAuthError("GitHub is not connected");
    const normalized = validateRows(rows);
    const remote = await readContents(owner);
    if (retainedSha && remote.sha !== retainedSha) {
      throw new GitHubConflictError("GitHub content changed remotely");
    }

    const timestamp = new Date(now()).toISOString().slice(0, 16).replace("T", " ");
    const response = await request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/vocabulary.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update vocabulary ${timestamp}`,
          content: encode(`${JSON.stringify(normalized, null, 2)}\n`),
          sha: remote.sha,
          branch: "main",
        }),
      },
    );
    if (!response.ok) throw errorForStatus(response.status);
    const body = await response.json();
    retainedSha = body.content.sha;
    return retainedSha;
  };

  const save = (rows) => {
    const operation = saveQueue.then(() => performSave(rows));
    saveQueue = operation.catch(() => undefined);
    return operation;
  };

  return { connect, disconnect, isConnected, load, save };
}
