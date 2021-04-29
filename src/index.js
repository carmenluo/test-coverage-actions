const core = require("@actions/core");
const github = require("@actions/github");
const {
  readFile,
  readMetric,
  generateStatus,
  generateTable,
  loadConfig,
  generateCommentHeader,
  parseWebhook,
  postTestReport,
} = require("./functions");
const {
  createStatus,
  listComments,
  insertComment,
  upsertComment,
  replaceComment,
} = require("./github");

async function run() {
  const {
    comment,
    check,
    githubToken,
    cloverFile,
    thresholdAlert,
    thresholdWarning,
    statusContext,
    commentContext,
    commentMode,
    getTestReport,
    testReportFile,
  } = loadConfig(core);

  if (!check && !comment) {
    return;
  }
  if (getTestReport) {
    const result = await postTestReport(testReportFile);
    console.log(result);
    return;
  }
  const { context = {} } = github || {};
  const { prNumber, prUrl, sha, ref } = parseWebhook(context);
  if (core.isDebug()) {
    core.debug("Handle webhook request");
    console.log(prNumber, prUrl, sha);
  }

  const client = github.getOctokit(githubToken);

  const coverage = await readFile(cloverFile);
  const metric = await readMetric(coverage, prUrl, ref, {
    thresholdAlert,
    thresholdWarning,
  });
  if (prNumber && prUrl && sha) {
    if (check) {
      await createStatus({
        client,
        context,
        sha,
        status: generateStatus({ targetUrl: prUrl, metric, statusContext }),
      });
    }

    if (comment) {
      const message = generateTable({ metric, commentContext });

      switch (commentMode) {
        case "insert":
          await insertComment({
            client,
            context,
            prNumber,
            body: message,
          });

          break;
        case "update":
          await upsertComment({
            client,
            context,
            prNumber,
            body: message,
            existingComments: await listComments({
              client,
              context,
              prNumber,
              commentHeader: generateCommentHeader({ commentContext }),
            }),
          });

          break;
        case "replace":
        default:
          await replaceComment({
            client,
            context,
            prNumber,
            body: message,
            existingComments: await listComments({
              client,
              context,
              prNumber,
              commentContext,
              commentHeader: generateCommentHeader({ commentContext }),
            }),
          });
      }
    }
  }
}

run().catch((error) => core.setFailed(error.message));
