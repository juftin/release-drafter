import { C as Minimatch, D as setFailed, E as info, O as warning, T as core_exports, a as readActionInputs, b as string, c as getGitHubAdapter, d as escapeStringRegexp, f as GITMOJI_SPEC_DATA, g as boolean, h as array, i as defineActionInputNames, k as summary, n as sharedInputSchema, o as writeActionOutputs, t as composeConfigGet, w as context, x as stringbool, y as object } from "../../chunks/config.js";
import process from "node:process";
//#region packages/autolabeler/src/config/config.schema.ts
var labelSchema = string().min(1).describe("Backward-compatible single label. Prefer labels for new rules.");
var labelsSchema = array(string().min(1)).min(1).describe("Labels to add when this rule matches, in configuration order.");
var ruleSchema = object({
	labels: labelsSchema.optional(),
	label: labelSchema.optional(),
	/** Add these labels only when no ordinary rule matches. */
	fallback: boolean().optional().default(false),
	/** Stop evaluating later rules after this rule matches and adds its labels. */
	"stop-on-match": boolean().optional().default(false),
	files: array(string().min(1)).optional().default([]),
	branch: array(string().min(1)).optional().default([]),
	title: array(string().min(1)).optional().default([]),
	body: array(string().min(1)).optional().default([])
});
var configSchema = object({
	"sync-labels": boolean().optional().default(false).describe("Remove configured labels when they are not selected by this run."),
	/**
	* Defines pull request label rules.
	* `files` uses glob patterns. `branch`, `title`, and `body` use regular expressions.
	* A rule matches when at least one configured matcher succeeds.
	*/
	autolabeler: array(ruleSchema.extend({ labels: labelsSchema }).or(ruleSchema.extend({ label: labelSchema })))
}).meta({
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
//#region packages/autolabeler/src/config/validate-config.ts
/** Validates fallback rules after structural configuration parsing. */
var validateConfig = (config) => {
	const fallbacks = config.autolabeler.filter((rule) => rule.fallback);
	if (fallbacks.length > 1) throw new Error("Only one Autolabeler fallback rule is supported.");
	const fallback = fallbacks[0];
	if (fallback?.["stop-on-match"]) throw new Error("An Autolabeler rule cannot enable both 'fallback' and 'stop-on-match'.");
	if (fallback && [
		fallback.files,
		fallback.branch,
		fallback.title,
		fallback.body
	].some((matchers) => matchers.length > 0)) throw new Error("An Autolabeler fallback rule must not specify matchers.");
};
//#endregion
//#region packages/autolabeler/src/config/parse-config.ts
/** Normalizes label shorthand and compiles configured regex matchers. */
var parseConfig = (params) => {
	validateConfig(params.config);
	const config = structuredClone(params.config);
	const autolabeler = config.autolabeler.map((rule) => {
		try {
			return {
				...rule,
				labels: [...rule.labels ?? [], ...rule.label !== void 0 ? [rule.label] : []],
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
var SEMVER_PRECEDENCE = {
	major: 3,
	minor: 2,
	patch: 1
};
var test = (matcher, value) => {
	matcher.lastIndex = 0;
	return matcher.test(value);
};
var findMatchingFile = (patterns, files) => {
	if (patterns.length === 0) return void 0;
	const matches = createPathMatcher(patterns);
	return files.find(matches);
};
/** Evaluates rules in configuration order, stopping on request or adding a fallback. */
var matchLabels = (params) => {
	const { config, pullRequest, explainable = false } = params;
	const labels = /* @__PURE__ */ new Set();
	const matches = [];
	for (const rule of config.autolabeler) {
		if (rule.fallback) continue;
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
			for (const label of rule.labels) {
				labels.add(label);
				matches.push(explainable ? {
					label,
					matcher,
					pattern,
					matchedValue
				} : {
					label,
					matcher
				});
			}
			if (rule["stop-on-match"]) break;
		}
	}
	const fallback = config.autolabeler.find((rule) => rule.fallback);
	if (labels.size === 0 && fallback) for (const label of fallback.labels) {
		labels.add(label);
		matches.push(explainable ? {
			label,
			matcher: "fallback",
			pattern: "fallback",
			matchedValue: "fallback"
		} : {
			label,
			matcher: "fallback"
		});
	}
	const rawLabels = [...labels];
	const supersededLabels = rawLabels.filter((l) => l in SEMVER_PRECEDENCE).sort((a, b) => SEMVER_PRECEDENCE[b] - SEMVER_PRECEDENCE[a]).slice(1);
	return {
		labels: rawLabels.filter((l) => !supersededLabels.includes(l)),
		matches,
		supersededLabels
	};
};
//#endregion
//#region packages/gh-actions/src/autolabeler/action-metadata.ts
var actionInputNames = defineActionInputNames()([
	"token",
	"config-name",
	"dry-run",
	"summary"
]);
var actionOutputNames = ["number", "labels"];
//#endregion
//#region packages/gh-actions/src/autolabeler/explainability.ts
var isGitHubEnvironment = () => {
	return Boolean(process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_STEP_SUMMARY || process.env.GITHUB_REPOSITORY);
};
var GITMOJI_SPEC_MAP = /* @__PURE__ */ new Map();
for (const entry of GITMOJI_SPEC_DATA) {
	GITMOJI_SPEC_MAP.set(entry.name, entry);
	GITMOJI_SPEC_MAP.set(entry.code, entry);
	GITMOJI_SPEC_MAP.set(entry.emoji, entry);
	if (entry.emoji.includes("\uFE0F")) GITMOJI_SPEC_MAP.set(entry.emoji.replace(/\ufe0f/g, ""), entry);
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
	const { pullRequest, matches, appliedLabels, supersededLabels, categories } = params;
	if (matches.length === 0) return [
		"## \u{1F3F7}\uFE0F Release Drafter Summary",
		"",
		`No autolabeler rules matched Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`).`,
		""
	].join("\n");
	let highestBump = "patch";
	const matchedLabels = new Set(matches.map((m) => m.label));
	const titleMatches = /* @__PURE__ */ new Set();
	const branchMatches = /* @__PURE__ */ new Set();
	const fileMatches = /* @__PURE__ */ new Set();
	const bodyMatches = /* @__PURE__ */ new Set();
	for (const match of matches) {
		const spec = getGitmojiSpec(match.label);
		const semver = resolveSemverBump(match.label, spec);
		if (PRIORITY[semver] > PRIORITY[highestBump]) highestBump = semver;
		if (match.matchedValue) {
			if (match.matcher === "title") titleMatches.add(match.matchedValue);
			if (match.matcher === "branch") branchMatches.add(match.matchedValue);
			if (match.matcher === "files") fileMatches.add(match.matchedValue);
			if (match.matcher === "body") bodyMatches.add(match.matchedValue);
		}
	}
	const matchCallouts = [];
	if (titleMatches.size > 0) for (const val of titleMatches) matchCallouts.push(`- **Matched Title:** \`${val}\``);
	if (branchMatches.size > 0) for (const val of branchMatches) matchCallouts.push(`- **Matched Branch:** \`${val}\``);
	if (fileMatches.size > 0) {
		const files = [...fileMatches];
		const maxFiles = 5;
		matchCallouts.push("- **Matched Files:**");
		const shown = files.slice(0, maxFiles);
		for (const f of shown) matchCallouts.push(`  - \`${f}\``);
		if (files.length > maxFiles) matchCallouts.push(`  - *(and ${files.length - maxFiles} more)*`);
	}
	if (bodyMatches.size > 0) for (const val of bodyMatches) matchCallouts.push(`- **Matched Body:** \`${val}\``);
	const rows = [];
	for (const match of matches) {
		if (supersededLabels?.includes(match.label)) continue;
		const spec = getGitmojiSpec(match.label);
		const semver = resolveSemverBump(match.label, spec);
		const intention = spec ? `[${spec.description}](https://gitmoji.dev/specification)` : "-";
		const trigger = match.matcher === "files" ? "Files" : match.matcher === "branch" ? "Branch" : match.matcher === "title" ? "Title" : match.matcher === "body" ? "Body" : "Fallback";
		const patternEscaped = match.pattern ? `\`${match.pattern.replace(/\|/g, "\\|")}\`` : "-";
		const details = match.matcher === "files" ? `Files matched pattern ${patternEscaped}` : `${trigger} matched ${patternEscaped}`;
		rows.push(`| \`${match.label}\` | ${intention} | \`${semver}\` | ${trigger} | ${details} |`);
	}
	const releaseSectionList = [];
	if (categories && categories.length > 0) {
		const matchedSections = [];
		for (const cat of categories) if (cat.labels.some((l) => matchedLabels.has(l))) matchedSections.push(`  - ${cat.title}`);
		if (matchedSections.length > 0) releaseSectionList.push("- **Release Sections:**", ...matchedSections);
	}
	const lines = [
		"## \u{1F3F7}\uFE0F Release Drafter Summary",
		"",
		`Applied **${appliedLabels ? appliedLabels.length : rows.length}** label(s) to PR **#${pullRequest.number}** (\`${pullRequest.branch}\`) with **\`${highestBump}\`** version increment.`,
		"",
		...matchCallouts,
		...releaseSectionList
	];
	lines.push("", "<details>", "<summary>\u{1F3F7}\uFE0F Label Decision Details</summary>", "", "| Label | Gitmoji Intention | Semver Impact | Trigger | Matched Rule |", "| :--- | :--- | :--- | :--- | :--- |", ...rows, "", "</details>", "");
	return lines.join("\n");
};
/** Writes the explainability summary table to the GitHub Actions Job Step Summary when GitHub is detected. */
var writeStepSummary = async (markdown) => {
	if (!isGitHubEnvironment()) return;
	try {
		await summary.addRaw(markdown).write();
	} catch (error) {
		warning(`Failed to write GitHub Actions Step Summary: ${error instanceof Error ? error.message : String(error)}`);
	}
};
//#endregion
//#region packages/gh-actions/src/autolabeler/action-input.schema.ts
var actionInputSchema = object({
	"config-name": string().optional().default("release-drafter.yml"),
	summary: stringbool().or(boolean()).optional().default(true)
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
		const location = source.scheme === "file" ? "locally" : source.scheme === "preset" ? `from preset "${source.filepath}"` : `on remote "${source.repo?.owner}/${source.repo?.repo}${source.ref ? `@${source.ref}` : ""}"${source.ref ? "" : " on the default branch"}`;
		info(`Config fetched ${location}.`);
	}
	return parseConfig({
		config: configSchema.parse(config),
		logger: core_exports
	});
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
		const files = await adapter.findPullRequestChangedFiles({
			repository: {
				owner: context.repo.owner,
				name: context.repo.repo,
				serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com"
			},
			number: payload.number
		});
		const result = matchLabels({
			config,
			pullRequest: {
				files,
				branch: payload.pull_request.head.ref,
				title: payload.pull_request.title,
				body: payload.pull_request.body
			},
			explainable: true
		});
		for (const match of result.matches) info(`Found label for ${match.matcher}: '${match.label}'`);
		const labelsToRemove = [];
		if (config["sync-labels"]) {
			const currentLabels = await adapter.octokit.paginate(adapter.octokit.rest.issues.listLabelsOnIssue, {
				...context.repo,
				issue_number: payload.number,
				per_page: 100
			});
			const managedLabels = new Set(config.autolabeler.flatMap((rule) => rule.labels.map((label) => label.toLowerCase())));
			const selectedLabels = new Set(result.labels.map((label) => label.toLowerCase()));
			for (const { name } of currentLabels) if (managedLabels.has(name.toLowerCase()) && !selectedLabels.has(name.toLowerCase())) labelsToRemove.push(name);
		}
		if (result.supersededLabels && result.supersededLabels.length > 0) {
			for (const superseded of result.supersededLabels) if (!labelsToRemove.includes(superseded)) labelsToRemove.push(superseded);
		}
		if (result.labels.length > 0) {
			if (input["dry-run"]) info(`[dry-run] Would add labels [${result.labels.join(", ")}] to PR #${payload.number}`);
			else await adapter.octokit.rest.issues.addLabels({
				...context.repo,
				issue_number: payload.number,
				labels: result.labels
			});
		}
		for (const name of labelsToRemove) if (input["dry-run"]) info(`[dry-run] Would remove label '${name}' from PR #${payload.number}`);
		else {
			await adapter.octokit.rest.issues.removeLabel({
				...context.repo,
				issue_number: payload.number,
				name
			});
			info(`Removed label '${name}' from PR #${payload.number}`);
		}
		const summaryMarkdown = buildExplainabilitySummary({
			pullRequest: {
				number: payload.number,
				title: payload.pull_request.title,
				branch: payload.pull_request.head.ref
			},
			matches: result.matches,
			appliedLabels: result.labels,
			supersededLabels: result.supersededLabels
		});
		if (input.summary) await writeStepSummary(summaryMarkdown);
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
