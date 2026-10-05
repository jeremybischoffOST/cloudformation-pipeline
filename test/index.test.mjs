// Unit tests for the Lambda handler. DynamoDB is replaced by a mock,
// so the tests run without AWS credentials.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

// The handler reads its configuration when it is imported.
process.env.TABLE_NAME = "votes";
process.env.QUESTION = "Welches Menu <ist> das beste?";
process.env.OPTIONS = "Pizza, Pasta,Curry";
const { handler } = await import("../src/index.mjs");

const db = mockClient(DynamoDBDocumentClient);
const context = { logStreamName: "2026/10/04/[$LATEST]test" };

const get = () => handler({ requestContext: { http: { method: "GET" } } }, context);
const post = (body, isBase64Encoded = false) =>
  handler({
    requestContext: { http: { method: "POST" } },
    body: isBase64Encoded ? Buffer.from(body).toString("base64") : body,
    isBase64Encoded,
  }, context);

beforeEach(() => {
  db.reset();
  db.on(ScanCommand).resolves({ Items: [] });
  db.on(UpdateCommand).resolves({});
});

describe("GET", () => {
  it("renders the question and a button per option", async () => {
    const response = await get();

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["Content-Type"], /text\/html/);
    for (const option of ["Pizza", "Pasta", "Curry"]) {
      assert.match(response.body, new RegExp(`<button name="option" value="${option}">`));
    }
  });

  it("escapes HTML in the question", async () => {
    const { body } = await get();

    assert.match(body, /Welches Menu &#60;ist&#62; das beste\?/);
    assert.doesNotMatch(body, /<ist>/);
  });

  it("shows vote counts and percentages", async () => {
    db.on(ScanCommand).resolves({ Items: [{ option: "Pizza", votes: 3 }, { option: "Curry", votes: 1 }] });

    const { body } = await get();

    assert.match(body, /width:75%"><\/div><span>3<\/span>/);
    assert.match(body, /width:25%"><\/div><span>1<\/span>/);
    assert.match(body, /4 votes/);
  });

  it("ignores votes for options that are no longer configured", async () => {
    db.on(ScanCommand).resolves({ Items: [{ option: "Pizza", votes: 1 }, { option: "Salat", votes: 9 }] });

    const { body } = await get();

    assert.match(body, /1 votes/);
    assert.doesNotMatch(body, /Salat/);
  });
});

describe("POST", () => {
  it("counts a vote and redirects to the page", async () => {
    const response = await post("option=Pasta");

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.Location, "/");
    const [call] = db.commandCalls(UpdateCommand);
    assert.equal(call.args[0].input.TableName, "votes");
    assert.deepEqual(call.args[0].input.Key, { option: "Pasta" });
  });

  it("decodes base64 encoded form data", async () => {
    await post("option=Curry", true);

    assert.deepEqual(db.commandCalls(UpdateCommand)[0].args[0].input.Key, { option: "Curry" });
  });

  it("ignores votes for unknown options", async () => {
    const response = await post("option=Hacker");

    assert.equal(response.statusCode, 303);
    assert.equal(db.commandCalls(UpdateCommand).length, 0);
  });
});
