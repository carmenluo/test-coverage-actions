const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
// const CLOUDINARY_URL =
//   "cloudinary://815243618947779:8-CPxPzTZlnd31eZsli4qsMjU4k@dkfrhpxfo";
// cloudinary.config(CLOUDINARY_URL);

fs.readFileAsync = (filename) =>
  new Promise((resolve, reject) => {
    fs.readFile(filename, { encoding: "utf-8" }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(`${data}`.replace("\ufeff", ""));
      }
    });
  });

fs.readFileAsyncJson = (filename) =>
  new Promise((resolve, reject) => {
    fs.readFile(filename, (err, data) => {
      if (err) {
        reject(err);
      } else {
        const content = JSON.parse(data);

        resolve(content);
      }
    });
  });

const parser = new xml2js.Parser(/* options */);

async function readFile(filename) {
  // async function readFile() {
  // console.log(path.dirname);
  const fileContent = parser.parseStringPromise(
    await fs.readFileAsync(filename)
  );
  return fileContent;
  // const fileContent = await fs.readFileAsyncJson("out.json");
  // const payload = {
  //   report: "Test",
  //   title: "report",
  //   message: JSON.stringify(fileContent),
  // };
  // const res = await axios.post(
  //   "https://test-coverage-report.herokuapp.com/posts/report",
  //   payload
  // );
  // console.log("somehting");
  // const cloudinaryUrl =
  //   "cloudinary://815243618947779:8-CPxPzTZlnd31eZsli4qsMjU4k@dkfrhpxfo";
  // const cloudinaryKey = "815243618947779";
  // const secret = "8-CPxPzTZlnd31eZsli4qsMjU4k";
  // const name = "dkfrhpxfo";
  // cloudinary.config({
  //   cloud_name: name,
  //   api_key: cloudinaryKey,
  //   api_secret: secret,
  // });
  // await cloudinary.uploader.upload(
  //   "index.html",
  //   { resource_type: "raw" },
  //   async function (error, result) {
  //     console.log(result.url);
  //     const payload = {
  //       report: "Test",
  //       title: "report",
  //       message: result.url,
  //     };
  //     const res = await axios.post(
  //       "https://test-coverage-report.herokuapp.com/reports",
  //       payload
  //     );
  //   }
  // );
}
// async function runFunc() {
//   const coverage = await readFile();
//   const metric = readMetric(coverage);
//   // return metric;
// }
// runFunc();
function calcRate({ total, covered }) {
  return total ? Number((covered / total) * 100).toFixed(2) * 1 : 0;
}

function calculateLevel(
  metric,
  { thresholdAlert = 50, thresholdWarning = 90 } = {}
) {
  const { rate: linesRate } = metric.lines;

  if (linesRate < thresholdAlert) {
    return "red";
  }

  if (linesRate < thresholdWarning) {
    return "yellow";
  }

  return "green";
}

async function readMetric(
  coverage,
  { thresholdAlert = 50, thresholdWarning = 90 } = {}
) {
  const data = coverage.coverage.project[0].metrics[0].$;
  let detailMetric;
  if (coverage.coverage.project[0].package) {
    const detailsData = coverage.coverage.project[0].package;
    detailMetric = detailsData.map((detailData) => {
      const metric = detailData.metrics[0].$;
      return {
        name: detailData.$.name ?? "",
        metrics: {
          statements: metric.statements * 1,
          coveredstatements: metric.coveredstatements * 1,
          conditionals: metric.conditionals * 1,
          coveredconditionals: metric.coveredconditionals * 1,
          methods: metric.methods * 1,
          coveredmethods: metric.coveredmethods * 1,
        },
      };
    });
  }

  const metric = {
    statements: {
      total: data.elements * 1,
      covered: data.coveredelements * 1,
    },
    lines: {
      total: data.statements * 1,
      covered: data.coveredstatements * 1,
    },
    methods: {
      total: data.methods * 1,
      covered: data.coveredmethods * 1,
    },
    branches: {
      total: data.conditionals * 1,
      covered: data.coveredconditionals * 1,
    },
  };

  metric.statements.rate = calcRate(metric.statements);
  metric.lines.rate = calcRate(metric.lines);
  metric.methods.rate = calcRate(metric.methods);
  metric.branches.rate = calcRate(metric.branches);

  metric.level = calculateLevel(metric, { thresholdAlert, thresholdWarning });
  const payload = {
    report: "Test",
    title: "report",
    message: JSON.stringify({ metric, detailMetric }),
  };
  try {
    const res = await axios.post(
      "https://test-coverage-report.herokuapp.com/reports",
      payload
    );
  } catch (error) {
    console.log(error);
  }
  return metric;
}

function generateBadgeUrl(metric) {
  return `https://img.shields.io/static/v1?label=coverage&message=${Math.round(
    metric.lines.rate
  )}%&color=${metric.level}`;
}

function generateEmoji(metric) {
  return metric.lines.rate === 100 ? " 🎉" : "";
}

function generateInfo({ rate, total, covered }) {
  return `${rate}% ( ${covered} / ${total} )`;
}

function generateCommentHeader({ commentContext }) {
  return `<!-- coverage-monitor-action: ${commentContext} -->`;
}

function generateTable({ metric, commentContext }) {
  return `${generateCommentHeader({ commentContext })}
## ${commentContext}${generateEmoji(metric)}

|  Totals | ![Coverage](${generateBadgeUrl(metric)}) |
| :-- | --: |
| Statements: | ${generateInfo(metric.lines)} |
| Methods: | ${generateInfo(metric.methods)} |
`;
}

function generateStatus({
  metric: {
    level,
    lines: { rate },
  },
  targetUrl,
  statusContext,
}) {
  if (level === "red") {
    return {
      state: "failure",
      description: `Error: Too low coverage - ${rate}%`,
      target_url: targetUrl,
      context: statusContext,
    };
  }

  if (level === "yellow") {
    return {
      state: "success",
      description: `Warning: low coverage - ${rate}%`,
      target_url: targetUrl,
      context: statusContext,
    };
  }

  return {
    state: "success",
    description: `Success: Coverage - ${rate}%`,
    target_url: targetUrl,
    context: statusContext,
  };
}

function toBool(value) {
  return typeof value === "boolean" ? value : value === "true";
}

function toInt(value) {
  return value * 1;
}

function loadConfig({ getInput }) {
  const comment = toBool(getInput("comment"));
  const check = toBool(getInput("check"));
  const githubToken = getInput("github_token", { required: true });
  const cloverFile = getInput("clover_file", { required: true });
  const thresholdAlert = toInt(getInput("threshold_alert") || 90);
  const thresholdWarning = toInt(getInput("threshold_warning") || 50);
  const statusContext = getInput("status_context") || "Coverage Report";
  const commentContext = getInput("comment_context") || "Coverage Report";
  let commentMode = getInput("comment_mode");

  if (!["replace", "update", "insert"].includes(commentMode)) {
    commentMode = "replace";
  }

  return {
    comment,
    check,
    githubToken,
    cloverFile,
    thresholdAlert,
    thresholdWarning,
    statusContext,
    commentContext,
    commentMode,
  };
}

function parseWebhook(request) {
  const {
    payload: {
      pull_request: {
        number: prNumber,
        html_url: prUrl,
        head: { sha } = {},
      } = {},
    } = {},
  } = request || {};
  console.log(JSON.stringify(request));
  if (!prNumber || !prUrl || !sha) {
    throw new Error("Action supports only pull_request event");
  }

  return {
    prNumber,
    prUrl,
    sha,
  };
}

module.exports = {
  readFile,
  readMetric,
  generateBadgeUrl,
  generateEmoji,
  generateTable,
  calculateLevel,
  generateStatus,
  loadConfig,
  generateCommentHeader,
  parseWebhook,
};
