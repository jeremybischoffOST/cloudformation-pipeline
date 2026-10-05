// Live voting app running on AWS Lambda behind a function URL.
// The AWS SDK v3 is part of the Node.js Lambda runtime, so there are
// no dependencies to install.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient());

// Configuration is passed in as environment variables by the CloudFormation template.
const TABLE_NAME = process.env.TABLE_NAME;
const QUESTION = process.env.QUESTION;
const OPTIONS = process.env.OPTIONS.split(",").map((o) => o.trim()).filter(Boolean);

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// POST: count one vote for the selected option, then redirect back to the page.
async function vote(event) {
  let body = event.body ?? "";
  if (event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf-8");
  }
  const option = new URLSearchParams(body).get("option");
  if (OPTIONS.includes(option)) {
    await db.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { option },
      UpdateExpression: "ADD votes :one",
      ExpressionAttributeValues: { ":one": 1 },
    }));
  }
  return { statusCode: 303, headers: { Location: "/" } };
}

// GET: render the voting page with the current results.
async function results(context) {
  const { Items } = await db.send(new ScanCommand({ TableName: TABLE_NAME }));
  const votes = Object.fromEntries(Items.map((item) => [item.option, item.votes]));
  const total = OPTIONS.reduce((sum, option) => sum + (votes[option] ?? 0), 0);

  const rows = OPTIONS.map((option) => {
    const count = votes[option] ?? 0;
    const percent = total ? Math.floor((100 * count) / total) : 0;
    const name = escapeHtml(option);
    return `<button name="option" value="${name}">${name}</button>
      <div class="bar"><div style="width:${percent}%"></div><span>${count}</span></div>`;
  }).join("\n");

  const page = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Live Voting</title>
<style>
body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
button { width: 100%; padding: .6rem; margin-top: 1rem; font-size: 1.1rem; cursor: pointer; }
.bar { background: #eee; height: 1.6rem; position: relative; }
.bar div { background: #ff9900; height: 100%; }
.bar span { position: absolute; right: .5rem; top: .2rem; }
footer { margin-top: 2rem; color: #888; font-size: .8rem; }
</style></head>
<body><h1>${escapeHtml(QUESTION)}</h1>
<form method="post">
${rows}
</form>
<footer>${total} votes &middot; served by ${escapeHtml(context.logStreamName)}</footer>
</body></html>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: page,
  };
}

export const handler = async (event, context) =>
  event.requestContext.http.method === "POST" ? vote(event) : results(context);
