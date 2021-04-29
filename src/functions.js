const xml2js = require("xml2js");
const fs = require("fs");
const axios = require("axios");
const _ = require("lodash");

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
        // const content = JSON.parse(data);
        resolve(data);
      }
    });
  });

const parser = new xml2js.Parser(/* options */);

async function postTestReport(fileName) {
  const content = await fs.readFileAsyncJson(fileName);
  const payload = { message: content };
  try {
    const resPost = await axios.post(
      "https://test-coverage-report.herokuapp.com/test-reports",
      payload
    );
    console.log(resPost);
  } catch (error) {
    console.log(error);
  }
}

async function readFile(filename) {
  const fileContent = parser.parseStringPromise(
    await fs.readFileAsync(filename)
  );
  return fileContent;
}
function calcRate({ total, covered }) {
  return total ? Number((covered / total) * 100).toFixed(2) * 1 : 0;
}
function calcRateNumber(covered, total) {
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
async function compareCoverage() {}
const convertArrayToObject = (array, key) => {
  const initialValue = {};
  return array.reduce((obj, item) => {
    return {
      ...obj,
      [item[key]]: item,
    };
  }, initialValue);
};
async function readMetric(
  coverage,
  prUrl,
  ref,
  { thresholdAlert = 50, thresholdWarning = 90 } = {}
) {
  const data = coverage.coverage.project[0].metrics[0].$;
  let detailMetric;
  let diffResult;

  if (coverage.coverage.project[0].package) {
    const detailsData = coverage.coverage.project[0].package;
    detailMetric = detailsData.map((detailData) => {
      let file;
      if (detailData.file) {
        file = detailData.file.map((fileItem) => {
          const fileName = fileItem.$.name;
          const metric = fileItem.metrics[0].$;
          return {
            name: fileName,
            metrics: {
              statementsRate: calcRateNumber(
                metric.coveredstatements * 1,
                metric.statements * 1
              ),
              conditionalsRate: calcRateNumber(
                metric.coveredconditionals * 1,
                metric.conditionals * 1
              ),
              methodsRate: calcRateNumber(
                metric.coveredmethods * 1,
                metric.methods * 1
              ),
            },
          };
        });
      }
      const metric = detailData.metrics[0].$;
      return {
        name: detailData.$.name ? detailData.$.name : "",
        metrics: {
          statements: metric.statements * 1,
          coveredstatements: metric.coveredstatements * 1,
          conditionals: metric.conditionals * 1,
          coveredconditionals: metric.coveredconditionals * 1,
          methods: metric.methods * 1,
          coveredmethods: metric.coveredmethods * 1,
        },
        ...convertArrayToObject(file, "name"),
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
    prUrl: prUrl ? prUrl : "I am pr Url",
    branchName: ref ? ref : "I am branch name",
  };
  try {
    const resGet = await axios.get(
      "https://test-coverage-report.herokuapp.com/reports"
    );
    const resPost = await axios.post(
      "https://test-coverage-report.herokuapp.com/reports",
      payload
    );

    const baseCoverage = JSON.parse(resGet.data[resGet.data.length - 1].message)
      .detailMetric;
    const diff = _.differenceWith(detailMetric, baseCoverage, _.isEqual);
    let diffFileName = [];
    const diffFiles = [...new Set(diffFileName)].filter(
      (name) => name !== "name" && name !== "metrics"
    );
    generateDiffItems(diff, baseCoverage, diffFiles);
  } catch (error) {
    console.log(error);
  }
  return metric;
}

function isDefined(maybe) {
  return maybe !== undefined;
}

const generateDiffItems = (diff, baseCoverage, fileNames) => {
  let getBaseCoverageForFile = [];
  let getNewCoverageForFile = [];
  baseCoverage.forEach((baseCoverageItem) => {
    for (let i = 0; i < fileNames.length; i++) {
      if (
        baseCoverageItem[fileNames[i]] &&
        baseCoverageItem[fileNames[i]].metrics
      ) {
        getBaseCoverageForFile.push({
          [fileNames[i]]: baseCoverageItem[fileNames[i]].metrics,
        });
      }
    }
  });
  diff.forEach((diffCoverageItem) => {
    for (let i = 0; i < fileNames.length; i++) {
      if (
        diffCoverageItem[fileNames[i]] &&
        diffCoverageItem[fileNames[i]].metrics
      ) {
        getNewCoverageForFile.push({
          [fileNames[i]]: diffCoverageItem[fileNames[i]].metrics,
        });
      }
    }
  });
  getBaseCoverageForFile = getBaseCoverageForFile.filter(isDefined);
  getNewCoverageForFile = getNewCoverageForFile.filter(isDefined);
  // getNewCovarageForFile.map((newCoverageForFile) => {
  //   [Object.keys(newCoverageForFile)[0]];
  // });
  console.log(getBaseCoverageForFile, getNewCoverageForFile);
};

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
        head: { sha, ref } = {},
      } = {},
    } = {},
  } = request || {};
  if (!prNumber || !prUrl || !sha) {
    throw new Error("Action supports only pull_request event");
  }
  return {
    prNumber,
    prUrl,
    sha,
    ref,
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
  postTestReport,
};
