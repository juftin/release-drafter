import { C as context, D as warning, E as setFailed, O as summary, S as Minimatch, T as info, a as defineActionInputNames, b as stringbool, d as escapeStringRegexp, h as boolean, l as getGitHubAdapter, m as array, n as GITMOJI_SPEC_DATA, o as readActionInputs, r as sharedInputSchema, s as writeActionOutputs, t as composeConfigGet, v as object, w as core_exports, y as string } from "../../chunks/config.js";
import process from "node:process";
//#region packages/autolabeler/src/config/config.schema.ts
var configSchema = object({ 
/**
* Defines pull request label rules.
* `files` uses glob patterns. `branch`, `title`, and `body` use regular expressions.
* A rule matches when at least one configured matcher succeeds.
*/
autolabeler: array(object({
	label: string().min(1),
	files: array(string().min(1)).optional().default([]),
	branch: array(string().min(1)).optional().default([]),
	title: array(string().min(1)).optional().default([]),
	body: array(string().min(1)).optional().default([])
})).min(1) }).meta({
	title: "JSON schema for Release Drafter's autolabeler action config.",
	id: "https://github.com/release-drafter/release-drafter/blob/main/autolabeler/schema.json"
});
//#endregion
//#region packages/autolabeler/src/util.ts
var regexLiteral = /^\/.+\/[AJUXgimsux]*$/;
var supportedFlags = /* @__PURE__ */ new Set("gimsuy");
/** Converts a regex literal or plain text matcher into a regular expression. */
var stringToRegex = (search) => {
	if (!regexLiteral.test(search)) return new RegExp(escapeStringRegexp(search), "g");
	const delimiter = search.lastIndexOf("/");
	const flags = [...new Set(search.slice(delimiter + 1))].filter((flag) => supportedFlags.has(flag)).join("");
	return new RegExp(search.slice(1, delimiter), flags);
};
//#endregion
//#region packages/autolabeler/src/config/parse-config.ts
/** Compiles configured regex matchers while preserving all other config values. */
var parseConfig = (params) => {
	const config = structuredClone(params.config);
	const autolabeler = config.autolabeler.map((rule) => {
		try {
			return {
				...rule,
				branch: rule.branch.map(stringToRegex),
				title: rule.title.map(stringToRegex),
				body: rule.body.map(stringToRegex)
			};
		} catch {
			params.logger.warning(`Bad autolabeler regex: '${rule.branch}', '${rule.title}' or '${rule.body}'`);
			return false;
		}
	}).filter((rule) => !!rule);
	return {
		...config,
		autolabeler
	};
};
//#endregion
//#region packages/autolabeler/src/path-matcher.ts
var trimTrailingUnescapedSpaces = (pattern) => {
	let end = pattern.length;
	while (end > 0 && pattern[end - 1] === " ") {
		let backslashes = 0;
		for (let index = end - 2; index >= 0 && pattern[index] === "\\"; index--) backslashes++;
		if (backslashes % 2 === 1) break;
		end--;
	}
	return pattern.slice(0, end);
};
var compileRule = (pattern) => {
	let source = trimTrailingUnescapedSpaces(pattern);
	if (!source || source.startsWith("#")) return void 0;
	const negated = source.startsWith("!");
	if (negated) source = source.slice(1);
	const directoryOnly = source.endsWith("/") && !source.endsWith("/**/");
	if (directoryOnly) source = source.slice(0, -1);
	else if (source.endsWith("/**/")) source = source.slice(0, -1);
	const anchored = source.startsWith("/");
	if (anchored) source = source.slice(1);
	if (!source) return void 0;
	return {
		directoryOnly,
		negated,
		matcher: new Minimatch(source, {
			dot: true,
			matchBase: !anchored && !source.includes("/"),
			nobrace: true,
			nocomment: true,
			noext: true,
			nonegate: true,
			platform: "linux"
		})
	};
};
/** Compiles ordered gitignore-style patterns into a path predicate. */
var createPathMatcher = (patterns) => {
	const rules = patterns.flatMap((pattern) => {
		const rule = compileRule(pattern);
		return rule ? [rule] : [];
	});
	return (path) => {
		const segments = path.split("/").filter(Boolean);
		for (const [index] of segments.entries()) {
			const candidate = segments.slice(0, index + 1).join("/");
			const directory = index < segments.length - 1;
			let ignored = false;
			for (const rule of rules) {
				if (rule.directoryOnly && !directory) continue;
				if (rule.matcher.match(candidate)) ignored = !rule.negated;
			}
			if (directory && ignored) return true;
			if (!directory) return ignored;
		}
		return false;
	};
};
//#endregion
//#region packages/autolabeler/src/match-labels.ts
var test = (matcher, value) => {
	matcher.lastIndex = 0;
	return matcher.test(value);
};
var findMatchingFile = (patterns, files) => {
	if (patterns.length === 0) return void 0;
	const matches = createPathMatcher(patterns);
	return files.find(matches);
};
/** Evaluates configured rules in files, branch, title, and body order. */
var matchLabels = (params) => {
	const { config, pullRequest } = params;
	const labels = /* @__PURE__ */ new Set();
	const matches = [];
	for (const rule of config.autolabeler) {
		const body = pullRequest.body;
		let matcher;
		let pattern;
		let matchedValue;
		const matchedFile = findMatchingFile(rule.files, pullRequest.files);
		if (matchedFile !== void 0) {
			matcher = "files";
			pattern = rule.files.join(", ");
			matchedValue = matchedFile;
		} else {
			for (const regex of rule.branch) if (test(regex, pullRequest.branch)) {
				matcher = "branch";
				pattern = regex.toString();
				matchedValue = pullRequest.branch;
				break;
			}
			if (!matcher) {
				for (const regex of rule.title) if (test(regex, pullRequest.title)) {
					matcher = "title";
					pattern = regex.toString();
					matchedValue = pullRequest.title;
					break;
				}
			}
			if (!matcher && body != null) {
				for (const regex of rule.body) if (test(regex, body)) {
					matcher = "body";
					pattern = regex.toString();
					matchedValue = body.length > 80 ? `${body.slice(0, 77)}...` : body;
					break;
				}
			}
		}
		if (matcher) {
			labels.add(rule.label);
			matches.push({
				label: rule.label,
				matcher,
				pattern,
				matchedValue
			});
		}
	}
	return {
		labels: [...labels],
		matches
	};
};
//#endregion
//#region packages/gh-actions/src/autolabeler/action-metadata.ts
var actionInputNames = defineActionInputNames()([
	"token",
	"config-name",
	"dry-run",
	"summary",
	"pr-comment"
]);
var actionOutputNames = ["number", "labels"];
//#endregion
//#region packages/gh-actions/src/autolabeler/explainability.ts
var COMMENT_MARKER = "<!-- release-drafter-autolabeler-summary -->";
var GITMOJI_SPEC_MAP = /* @__PURE__ */ new Map();
for (const entry of GITMOJI_SPEC_DATA) {
	GITMOJI_SPEC_MAP.set(entry.name, entry);
	GITMOJI_SPEC_MAP.set(entry.code, entry);
	GITMOJI_SPEC_MAP.set(entry.emoji, entry);
	if (entry.emoji.includes("️")) GITMOJI_SPEC_MAP.set(entry.emoji.replace(/\ufe0f/g, ""), entry);
}
/** Looks up Gitmoji specification entry for a preset gitmoji label. */
var getGitmojiSpec = (label) => {
	return GITMOJI_SPEC_MAP.get(label);
};
var resolveSemverBump = (label, spec) => {
	if (spec?.semver) return spec.semver;
	if (label === "major" || label === "breaking" || label === "breaking-change") return "major";
	if (label === "minor" || label === "feat" || label === "feature") return "minor";
	return "patch";
};
var PRIORITY = {
	patch: 1,
	minor: 2,
	major: 3
};
/**
* Builds a markdown explainability summary of the autolabeler decisions.
* Only preset Gitmoji labels receive a linked intention from the Gitmoji specification.
*/
var buildExplainabilitySummary = (params) => {
	const { pullRequest, matches, categories } = params;
	if (matches.length === 0) return [
		"## 🏷️ Autolabeler & Semver Summary",
		"",
		`No autolabeler rules matched Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`).`,
		""
	].join("\n");
	const rows = [];
	let highestBump = "patch";
	const matchedLabels = new Set(matches.map((m) => m.label));
	for (const match of matches) {
		const spec = getGitmojiSpec(match.label);
		const semver = resolveSemverBump(match.label, spec);
		if (PRIORITY[semver] > PRIORITY[highestBump]) highestBump = semver;
		const intention = spec ? `[${spec.description}](https://gitmoji.dev/specification)` : "-";
		const trigger = match.matcher === "files" ? "Files" : match.matcher === "branch" ? "Branch" : match.matcher === "title" ? "Title" : "Body";
		const patternEscaped = match.pattern ? `\`${match.pattern.replace(/\|/g, "\\|")}\`` : "-";
		const valueEscaped = match.matchedValue ? `\`${match.matchedValue.replace(/\|/g, "\\|")}\`` : "-";
		const details = match.matcher === "files" ? `Pattern ${patternEscaped} matched file ${valueEscaped}` : `${trigger} ${valueEscaped} matched ${patternEscaped}`;
		rows.push(`| \`${match.label}\` | ${intention} | \`${semver}\` | ${trigger} | ${details} |`);
	}
	const sections = [];
	if (categories && categories.length > 0) {
		for (const cat of categories) if (cat.labels.some((l) => matchedLabels.has(l))) sections.push(`- ${cat.title}`);
	}
	const lines = [
		"## 🏷️ Autolabeler & Semver Summary",
		"",
		`Applied **${matches.length}** label(s) to Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`):`,
		"",
		"| Label | Gitmoji Intention | Semver Impact | Trigger | Matched Details |",
		"| :--- | :--- | :--- | :--- | :--- |",
		...rows,
		"",
		"### 🚀 Release Impact",
		`- **Calculated Version Increment:** \`${highestBump}\``
	];
	if (sections.length > 0) lines.push("- **Target Changelog Section(s):**", ...sections);
	lines.push("");
	return lines.join("\n");
};
/** Writes the explainability summary table to the GitHub Actions Job Step Summary. */
var writeStepSummary = async (markdown) => {
	try {
		await summary.addRaw(markdown).write();
	} catch (error) {
		warning(`Failed to write GitHub Actions Step Summary: ${error instanceof Error ? error.message : String(error)}`);
	}
};
/** Posts or updates an explainability comment on the pull request. */
var postOrUpdatePRComment = async (params) => {
	const { adapter, repo, issueNumber, markdown } = params;
	const fullBody = `${COMMENT_MARKER}\n${markdown}`;
	try {
		const existing = (await adapter.octokit.rest.issues.listComments({
			owner: repo.owner,
			repo: repo.repo,
			issue_number: issueNumber
		})).data.find((c) => c.body?.includes(COMMENT_MARKER));
		if (existing) {
			await adapter.octokit.rest.issues.updateComment({
				owner: repo.owner,
				repo: repo.repo,
				comment_id: existing.id,
				body: fullBody
			});
			info(`Updated existing explainability comment #${existing.id} on PR #${issueNumber}.`);
		} else {
			const created = await adapter.octokit.rest.issues.createComment({
				owner: repo.owner,
				repo: repo.repo,
				issue_number: issueNumber,
				body: fullBody
			});
			info(`Posted new explainability comment #${created.data.id} on PR #${issueNumber}.`);
		}
	} catch (error) {
		warning(`Failed to post or update pull request explainability comment: ${error instanceof Error ? error.message : String(error)}`);
	}
};
//#endregion
//#region packages/gh-actions/src/autolabeler/action-input.schema.ts
var actionInputSchema = object({
	"config-name": string().optional().default("release-drafter.yml"),
	summary: stringbool().or(boolean()).optional().default(true),
	"pr-comment": stringbool().or(boolean()).optional().default(false)
}).and(sharedInputSchema);
//#endregion
//#region packages/gh-actions/src/autolabeler/get-action-inputs.ts
var getActionInput = () => actionInputSchema.parse(readActionInputs(actionInputNames));
//#endregion
//#region packages/gh-actions/src/autolabeler/get-config.ts
var getConfig = async (configName, token) => {
	const { config, contexts } = await composeConfigGet(configName, context, token);
	if (contexts.length > 1) info(`Config was fetched from ${contexts.length} different contexts.`);
	else if (contexts.length === 1) {
		const source = contexts[0];
		let location;
		if (source.scheme === "preset") location = `from preset "${source.filepath}"`;
		else if (source.scheme === "file") location = "locally";
		else location = `on remote "${source.repo?.owner}/${source.repo?.repo}${source.ref ? `@${source.ref}` : ""}"${source.ref ? "" : " on the default branch"}`;
		info(`Config fetched ${location}.`);
	}
	const parsed = parseConfig({
		config: configSchema.parse(config),
		logger: core_exports
	});
	const rawCategories = config.categories;
	const categories = Array.isArray(rawCategories) ? rawCategories.filter((c) => typeof c === "object" && c !== null && typeof c.title === "string" && Array.isArray(c.labels)).map((c) => ({
		title: c.title,
		labels: c.labels
	})) : void 0;
	return {
		...parsed,
		categories
	};
};
//#endregion
//#region packages/gh-actions/src/autolabeler/runner.ts
/** Run the Autolabeler action using package-owned config and matching logic. */
async function run() {
	try {
		const input = getActionInput();
		const config = await getConfig(input["config-name"], input.token);
		info(`Running for event "${context.eventName || "[undefined]"}.${context.payload.action || "[undefined]"}"`);
		if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") throw new Error(`Event type is wrong. Expected 'pull_request' or 'pull_request_target', received '${context.eventName}'`);
		const adapter = getGitHubAdapter(input.token);
		const payload = context.payload;
		const result = matchLabels({
			config,
			pullRequest: {
				files: await adapter.findPullRequestChangedFiles({
					repository: {
						owner: context.repo.owner,
						name: context.repo.repo,
						serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com"
					},
					number: payload.number
				}),
				branch: payload.pull_request.head.ref,
				title: payload.pull_request.title,
				body: payload.pull_request.body
			}
		});
		for (const match of result.matches) info(`Found label for ${match.matcher}: '${match.label}'`);
		if (result.labels.length > 0) {
			if (input["dry-run"]) info(`[dry-run] Would add labels [${result.labels.join(", ")}] to PR #${payload.number}`);
			else await adapter.octokit.rest.issues.addLabels({
				...context.repo,
				issue_number: payload.number,
				labels: result.labels
			});
		}
		const summaryMarkdown = buildExplainabilitySummary({
			pullRequest: {
				number: payload.number,
				title: payload.pull_request.title,
				branch: payload.pull_request.head.ref
			},
			matches: result.matches,
			categories: config.categories
		});
		if (input.summary) await writeStepSummary(summaryMarkdown);
		if (input["pr-comment"]) {
			if (input["dry-run"]) info(`[dry-run] Would post/update PR comment on #${payload.number} with explainability summary`);
			else await postOrUpdatePRComment({
				adapter,
				repo: context.repo,
				issueNumber: payload.number,
				markdown: summaryMarkdown
			});
		}
		writeActionOutputs(actionOutputNames, {
			number: payload.number.toString(),
			labels: result.labels.length > 0 ? result.labels.join(",") : void 0
		});
	} catch (error) {
		if (error instanceof Error) setFailed(error.message);
	}
}
//#endregion
//#region packages/gh-actions/src/autolabeler/run.ts
/*! release-drafter-action-entry:autolabeler */
/* node:coverage ignore file -- @preserve */
await run();
//#endregion
export {};
