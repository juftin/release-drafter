import { C as union, D as info, O as setFailed, S as stringbool, T as context, _ as boolean, a as readActionInputs, b as object, c as actionLogger, g as array, h as _enum, i as defineActionInputNames, l as getGitHubAdapter, o as writeActionOutputs, r as tokenInputSchema, s as writeStepSummary, x as string, y as number } from "../../chunks/config.js";
import { g as evaluateCategories, n as mergeInputAndConfig, t as getReleaseDrafterConfig } from "../../chunks/get-release-drafter-config.js";
//#region packages/core/src/pull-request-validation.ts
/** Remove path predicates and conditions that contain only path predicates. */
var projectPullRequestValidationCategories = (categories) => categories.flatMap((category) => {
	if (category.when.length === 0) return [category];
	const when = category.when.flatMap((condition) => {
		if (condition.conventional === void 0 && condition.labels.length === 0) return [];
		return [{
			...condition,
			paths: []
		}];
	});
	return when.length > 0 ? [{
		...category,
		when
	}] : [];
});
/** Evaluate whether a pull request's title or labels select a non-fallback category. */
var evaluatePullRequest = (pullRequest, categories) => {
	const evaluation = evaluateCategories(pullRequest, projectPullRequestValidationCategories(categories));
	if (!evaluation.included) return {
		valid: true,
		skipped: true,
		labels: evaluation.matchedLabels
	};
	const selectedCount = evaluation.changelogCategories.length + evaluation.versionResolverCategories.length;
	return {
		labels: evaluation.matchedLabels,
		valid: selectedCount > 0 && !evaluation.fallbackOnly,
		skipped: false,
		selectedCategoryCount: selectedCount
	};
};
//#endregion
//#region packages/gh-actions/src/check-pr/action-metadata.ts
var actionInputNames = defineActionInputNames()([
	"config-name",
	"token",
	"summary"
]);
var actionOutputNames = ["labels"];
//#endregion
//#region packages/gh-actions/src/check-pr/event.ts
var supportedPullRequestActions = [
	"opened",
	"edited",
	"synchronize",
	"reopened",
	"labeled",
	"unlabeled",
	"ready_for_review"
];
var labelSchema = union([string(), object({ name: string() })]);
var pullRequestEventSchema = object({
	action: _enum(supportedPullRequestActions),
	number: number().int().positive(),
	pull_request: object({
		title: string().min(1),
		labels: array(labelSchema),
		base: object({ ref: string().min(1) })
	})
});
/** Validate and normalize the current pull request webhook payload. */
var parsePullRequestEvent = (eventName, payload) => {
	if (eventName !== "pull_request" && eventName !== "pull_request_target") throw new Error(`Unsupported event '${eventName || "[undefined]"}'. Expected 'pull_request' or 'pull_request_target'.`);
	const result = pullRequestEventSchema.safeParse(payload);
	if (!result.success) {
		const action = typeof payload === "object" && payload !== null && "action" in payload ? String(payload.action) : "[undefined]";
		if (action !== "[undefined]" && !supportedPullRequestActions.includes(action)) throw new Error(`Unsupported pull request action '${action}'. Supported actions: ${supportedPullRequestActions.join(", ")}.`);
		throw new Error(`Malformed pull request event: ${result.error.message}`);
	}
	return {
		number: result.data.number,
		title: result.data.pull_request.title,
		labels: result.data.pull_request.labels.map((label) => typeof label === "string" ? label : label.name),
		baseRef: result.data.pull_request.base.ref
	};
};
//#endregion
//#region packages/gh-actions/src/check-pr/explainability.ts
var buildCheckPrSummary = (params) => {
	const { pullRequest, evaluation } = params;
	const labelsDisplay = pullRequest.labels.length > 0 ? pullRequest.labels.map((l) => `\`${l}\``).join(", ") : "_None_";
	const lines = ["### \u{1F3F7}\uFE0F Release Drafter \u2014 PR Check", ""];
	if (evaluation.skipped) lines.push("| PR | Title | Status | Labels |", "| :--- | :--- | :--- | :--- |", `| **#${pullRequest.number}** | \`${pullRequest.title}\` | \u23ED\uFE0F Skipped (\`pre-exclude\`) | ${labelsDisplay} |`, "", "> [!NOTE]", "> Excluded by configuration rule (e.g. `skip-changelog`). No release notes will be generated.");
	else if (evaluation.valid) {
		const rulesText = `${evaluation.selectedCategoryCount} rule${evaluation.selectedCategoryCount === 1 ? "" : "s"} matched`;
		lines.push("| PR | Title | Status | Labels |", "| :--- | :--- | :--- | :--- |", `| **#${pullRequest.number}** | \`${pullRequest.title}\` | \u2705 Valid (${rulesText}) | ${labelsDisplay} |`);
	} else lines.push("| PR | Title | Status | Labels |", "| :--- | :--- | :--- | :--- |", `| **#${pullRequest.number}** | \`${pullRequest.title}\` | \u274C Invalid | ${labelsDisplay} |`, "", "> [!WARNING]", "> **To resolve:** Ensure the pull request title, branch, or applied labels match at least one configured category or version-resolver rule.");
	return lines.join("\n");
};
//#endregion
//#region packages/gh-actions/src/check-pr/action-input.schema.ts
var actionInputSchema = object({
	"config-name": string().optional().default("release-drafter.yml"),
	summary: stringbool().or(boolean()).optional().default(true)
}).and(tokenInputSchema);
//#endregion
//#region packages/gh-actions/src/check-pr/get-action-inputs.ts
var getActionInput = () => actionInputSchema.parse(readActionInputs(actionInputNames));
//#endregion
//#region packages/gh-actions/src/check-pr/get-config.ts
var getConfig = async (configName, token, ref = context.ref) => getReleaseDrafterConfig(configName, {
	ref,
	repo: context.repo
}, token);
//#endregion
//#region packages/gh-actions/src/check-pr/runner.ts
var defaultDependencies = () => ({
	eventName: context.eventName,
	payload: context.payload,
	getInput: getActionInput,
	getConfig,
	getLabels: async (token, number) => {
		try {
			return (await getGitHubAdapter(token).octokit.rest.issues.listLabelsOnIssue({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: number
			})).data.map((l) => l.name);
		} catch {
			return [];
		}
	}
});
/** Check the current pull request without performing any write operation. */
async function checkPullRequest(dependencies = defaultDependencies()) {
	if (dependencies.eventName !== "pull_request" && dependencies.eventName !== "pull_request_target") throw new Error(`Unsupported event \`${dependencies.eventName}\`. Expected \`pull_request\` or \`pull_request_target\`.`);
	const pullRequest = parsePullRequestEvent(dependencies.eventName, dependencies.payload);
	const input = dependencies.getInput();
	const config = mergeInputAndConfig({
		config: await dependencies.getConfig(input["config-name"], input.token, pullRequest.baseRef),
		input: {},
		defaultCommitish: pullRequest.baseRef,
		logger: actionLogger
	});
	let labels = pullRequest.labels;
	if (dependencies.getLabels && input.token) try {
		const liveLabels = await dependencies.getLabels(input.token, pullRequest.number);
		if (liveLabels.length > 0) labels = liveLabels;
	} catch {}
	const evaluation = evaluatePullRequest({
		title: pullRequest.title,
		labels
	}, config.categories);
	writeActionOutputs(actionOutputNames, { labels: JSON.stringify(evaluation.labels) });
	const summaryMarkdown = buildCheckPrSummary({
		pullRequest: {
			number: pullRequest.number,
			title: pullRequest.title,
			baseRef: pullRequest.baseRef,
			labels
		},
		evaluation
	});
	if (input.summary) await writeStepSummary(summaryMarkdown);
	if (evaluation.skipped) {
		info(`Skipping excluded pull request #${pullRequest.number}.`);
		return;
	}
	if (!evaluation.valid) throw new Error(`No configured changelog or version-resolver category matches the title or labels of pull request #${pullRequest.number}.`);
	info(`Pull request #${pullRequest.number} matches the configuration.`);
}
async function run() {
	try {
		await checkPullRequest();
	} catch (error) {
		if (error instanceof Error) setFailed(error.message);
	}
}
//#endregion
//#region packages/gh-actions/src/check-pr/run.ts
/*! release-drafter-action-entry:check-pr */
/* node:coverage ignore file -- @preserve */
await run();
//#endregion
export {};
