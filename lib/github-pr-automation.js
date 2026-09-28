import { createHmac, timingSafeEqual } from "node:crypto";
import { getAnthropicConfig } from "@/lib/anthropic-config.js";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_FILES = 20;
const MAX_PATCH_CHARS = 2000;
const MAX_COMMITS = 10;
const MAX_EXISTING_COMMENTS = 100;
const MAX_SUGGESTIONS = 5;

const parseBoolean = (value) => String(value || "").toLowerCase() === "true";

export const getPrAutomationConfig = () => {
  const anthropic = getAnthropicConfig();
  return {
    enabled: parseBoolean(process.env.PR_AUTOMATION_ENABLED),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    githubToken: process.env.GITHUB_TOKEN || "",
    botName: process.env.PR_AUTOMATION_BOT_NAME || "Claude PR MVP",
    anthropic,
  };
};

export const verifyGitHubWebhookSignature = (secret, rawBody, signatureHeader) => {
  if (!secret || !rawBody || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
};

export const buildDuplicateMarker = (headSha) => `<!-- pr-automation-review:${headSha} -->`;

const githubRequest = async (path, token, options = {}) => {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "personaforge-pr-automation",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorText || "request failed"}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const listPullFiles = async (owner, repo, pullNumber, token) => {
  const allFiles = [];

  for (let page = 1; page <= 3; page += 1) {
    const items = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      token
    );
    if (!Array.isArray(items) || items.length === 0) break;
    allFiles.push(...items);
    if (items.length < 100 || allFiles.length >= MAX_FILES) break;
  }

  return allFiles.slice(0, MAX_FILES);
};

const listPullCommits = async (owner, repo, pullNumber, token) => {
  const commits = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/commits?per_page=${MAX_COMMITS}`,
    token
  );
  return Array.isArray(commits) ? commits.slice(0, MAX_COMMITS) : [];
};

const listIssueComments = async (owner, repo, issueNumber, token) => {
  const comments = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${MAX_EXISTING_COMMENTS}`,
    token
  );
  return Array.isArray(comments) ? comments : [];
};

const getCombinedStatus = async (owner, repo, sha, token) =>
  githubRequest(`/repos/${owner}/${repo}/commits/${sha}/status`, token);

const getCheckRuns = async (owner, repo, sha, token) =>
  githubRequest(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=20`, token);

const truncate = (value, maxLength) => {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const compactPatch = (patch) => truncate((patch || "").trim(), MAX_PATCH_CHARS);

const summarizeFiles = (files) =>
  files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
    patch: compactPatch(file.patch),
  }));

const summarizeCommits = (commits) =>
  commits.map((commit) => ({
    sha: commit.sha,
    message: truncate(commit?.commit?.message || "", 500),
    author: commit?.commit?.author?.name || commit?.author?.login || "unknown",
  }));

const classifyRiskSignals = (files, pullRequest) => {
  const filenames = files.map((file) => file.filename.toLowerCase());
  const riskyPatterns = [
    { label: "auth", regex: /auth|login|session|token|oauth|password/ },
    { label: "secrets", regex: /\.env|secret|private[-_]?key|token/ },
    { label: "workflows", regex: /^\.github\/workflows\// },
    { label: "deployment", regex: /vercel|docker|terraform|k8s|helm|nginx/ },
    { label: "payments", regex: /billing|payment|stripe|checkout/ },
  ];

  const touchedRiskAreas = riskyPatterns
    .filter(({ regex }) => filenames.some((name) => regex.test(name)))
    .map(({ label }) => label);

  const hasTests = filenames.some((name) => /test|spec/.test(name));
  const totalChanges = files.reduce((sum, file) => sum + (file.changes || 0), 0);
  const largeDiff = totalChanges > 500 || files.length > 10;
  const isDraft = !!pullRequest?.draft;

  return {
    touchedRiskAreas,
    hasTests,
    totalChanges,
    largeDiff,
    isDraft,
  };
};

const buildComputedData = ({ payload, files, commits, status, checkRuns }) => {
  const pr = payload.pull_request;
  const riskSignals = classifyRiskSignals(files, pr);
  const filesSummary = summarizeFiles(files);
  const commitsSummary = summarizeCommits(commits);

  return {
    repository: payload.repository?.full_name,
    pullRequest: {
      number: pr.number,
      title: pr.title,
      body: truncate(pr.body || "", 4000),
      htmlUrl: pr.html_url,
      baseRef: pr.base?.ref,
      headRef: pr.head?.ref,
      headSha: pr.head?.sha,
      author: pr.user?.login,
      changedFiles: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      commits: pr.commits,
      draft: !!pr.draft,
    },
    files: filesSummary,
    commits: commitsSummary,
    checks: {
      combinedStatus: status?.state || "unknown",
      statuses: Array.isArray(status?.statuses)
        ? status.statuses.slice(0, 10).map((item) => ({
            context: item.context,
            state: item.state,
            description: item.description || "",
          }))
        : [],
      checkRuns: Array.isArray(checkRuns?.check_runs)
        ? checkRuns.check_runs.slice(0, 10).map((run) => ({
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
          }))
        : [],
    },
    metrics: {
      fileCount: filesSummary.length,
      totalPatchCharacters: filesSummary.reduce((sum, file) => sum + (file.patch?.length || 0), 0),
      hasTests: riskSignals.hasTests,
      totalChanges: riskSignals.totalChanges,
      largeDiff: riskSignals.largeDiff,
      touchedRiskAreas: riskSignals.touchedRiskAreas,
    },
  };
};

const buildReviewPrompt = (computedData) => ({
  system: `You are a cautious automated pull request reviewer. Review only the provided pull request context. Return ONLY valid JSON with this schema:
{
  "verdict": "approve" | "comment",
  "risk": "low" | "medium" | "high",
  "summary": "one concise sentence",
  "suggestions": [
    {
      "file": "path or general",
      "priority": "low" | "medium" | "high",
      "issue": "specific problem",
      "recommendation": "specific fix or follow-up"
    }
  ]
}
Rules:
- Use "approve" only when the PR looks safe enough to merge as-is from the provided context.
- Use "comment" when there is any actionable improvement, missing validation, security concern, or uncertainty.
- Keep suggestions to the 5 highest-signal items.
- Do not invent files, code, or test results that are not in the context.
- Prefer security, correctness, and missing tests over style.`,
  user: `Review this pull request context:\n${JSON.stringify(computedData)}`,
});

const parseAnthropicText = (data) =>
  data?.content?.map((block) => block?.text || "").join("").trim() || "";

const parseReviewResponse = (text) => {
  const normalized = typeof text === "string" ? text.trim() : "";
  const candidate = normalized.startsWith("{")
    ? normalized
    : normalized.slice(normalized.indexOf("{"), normalized.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, MAX_SUGGESTIONS) : [];
  return {
    verdict: parsed?.verdict === "approve" ? "approve" : "comment",
    risk: ["low", "medium", "high"].includes(parsed?.risk) ? parsed.risk : "medium",
    summary: truncate(parsed?.summary || "Review completed.", 280),
    suggestions: suggestions.map((item) => ({
      file: truncate(item?.file || "general", 200),
      priority: ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium",
      issue: truncate(item?.issue || "No issue details provided.", 500),
      recommendation: truncate(item?.recommendation || "No recommendation provided.", 700),
    })),
  };
};

const requestClaudeReview = async (computedData, anthropicConfig) => {
  if (!anthropicConfig?.apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const prompt = buildReviewPrompt(computedData);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicConfig.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicConfig.model,
      max_tokens: 900,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errorText || "request failed"}`);
  }

  return parseReviewResponse(parseAnthropicText(await response.json()));
};

const formatCommentBody = ({ review, computedData, marker, botName }) => {
  const lines = [
    marker,
    `## ${botName}`,
    "",
    `**Summary:** ${review.summary}`,
    `**Verdict:** ${review.verdict === "approve" ? "Approve signal" : "Needs attention"}`,
    `**Risk:** ${review.risk}`,
    `**Checks:** ${computedData.checks.combinedStatus}`,
    "",
  ];

  if (review.suggestions.length === 0) {
    lines.push(
      review.verdict === "approve"
        ? "No concrete changes were suggested from the available PR context."
        : "No detailed suggestions were returned, but the PR still needs manual review."
    );
  } else {
    lines.push("### Suggestions");
    review.suggestions.forEach((suggestion, index) => {
      lines.push(
        `${index + 1}. **${suggestion.file}** (${suggestion.priority}) — ${suggestion.issue}\n   - ${suggestion.recommendation}`
      );
    });
  }

  lines.push("", "_MVP mode: this automation comments only and never pushes code automatically._");
  return lines.join("\n");
};

const postIssueComment = async (owner, repo, issueNumber, body, token) =>
  githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });

export const processPullRequestWebhook = async (payload, config) => {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const pullNumber = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;

  if (!owner || !repo || !pullNumber || !headSha) {
    throw new Error("Pull request payload is missing repository or PR identifiers");
  }

  const existingComments = await listIssueComments(owner, repo, pullNumber, config.githubToken);
  const duplicateMarker = buildDuplicateMarker(headSha);
  const hasExistingReview = existingComments.some((comment) => comment?.body?.includes(duplicateMarker));
  if (hasExistingReview) {
    return { skipped: true, reason: "Review already posted for this head SHA" };
  }

  const [files, commits, status, checkRuns] = await Promise.all([
    listPullFiles(owner, repo, pullNumber, config.githubToken),
    listPullCommits(owner, repo, pullNumber, config.githubToken),
    getCombinedStatus(owner, repo, headSha, config.githubToken),
    getCheckRuns(owner, repo, headSha, config.githubToken),
  ]);

  const computedData = buildComputedData({ payload, files, commits, status, checkRuns });
  const review = await requestClaudeReview(computedData, config.anthropic);
  const commentBody = formatCommentBody({
    review,
    computedData,
    marker: duplicateMarker,
    botName: config.botName,
  });
  const comment = await postIssueComment(owner, repo, pullNumber, commentBody, config.githubToken);

  return {
    skipped: false,
    review,
    commentUrl: comment?.html_url || null,
    pullRequest: payload.pull_request?.html_url || null,
  };
};
