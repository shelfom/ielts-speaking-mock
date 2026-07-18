import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  OpenRouterRequestError,
  chatJson,
  isRetryableOpenRouterError
} from "../lib/openrouter";
import {
  adjudicationJsonSchema,
  evaluatorJsonSchema
} from "../lib/scoring-contracts";

const originalFetch = globalThis.fetch;
process.env.OPENROUTER_API_KEY = "test-only-key";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const contract = {
  name: "resilience_test",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { value: { type: "string" } },
    required: ["value"]
  },
  parse(value: unknown) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as { value?: unknown }).value !== "string"
    ) {
      throw new Error("invalid contract");
    }
    return value as { value: string };
  }
};

function success(value = "ok", model = "openai/gpt-5-mini") {
  return new Response(JSON.stringify({
    model,
    choices: [{ message: { content: JSON.stringify({ value }) } }]
  }), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "request-test" }
  });
}

test("retries the exact upstream 429 failure and preserves fallback model order", async () => {
  const requests: Array<Record<string, unknown>> = [];
  let call = 0;
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({
        error: {
          code: 429,
          metadata: { provider_error_code: "limit_burst_rate" }
        }
      }), { status: 429 });
    }
    return success();
  };

  const result = await chatJson([{ role: "user", content: "score" }], {
    models: ["qwen/qwen3.7-max", "anthropic/claude-sonnet-4.5", "openai/gpt-5-mini"],
    contract,
    operation: "test_429",
    sessionId: "session-test",
    maxAttempts: 2,
    timeoutMs: 1000
  });

  assert.equal(result.value, "ok");
  assert.equal(call, 2);
  assert.deepEqual(requests[0].models, [
    "qwen/qwen3.7-max",
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5-mini"
  ]);
  assert.deepEqual(requests[0].plugins, [{ id: "response-healing" }]);
  assert.equal(
    (requests[0].provider as { allow_fallbacks: boolean }).allow_fallbacks,
    true
  );
});

test("retries malformed model JSON and validates the recovered response", async () => {
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({
        model: "qwen/qwen3.7-max",
        choices: [{ message: { content: "{\"value\":" } }]
      }), { status: 200 });
    }
    return success("recovered");
  };

  const result = await chatJson([{ role: "user", content: "analyse" }], {
    models: ["qwen/qwen3.7-max", "openai/gpt-5-mini"],
    contract,
    operation: "test_invalid_json",
    maxAttempts: 2,
    timeoutMs: 1000
  });

  assert.equal(result.value, "recovered");
  assert.equal(call, 2);
});

test("caps model fallback lists at the OpenRouter limit of three", async () => {
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return success();
  };

  await chatJson([{ role: "user", content: "score" }], {
    models: ["a/model", "b/model", "c/model", "d/model"],
    contract,
    operation: "test_model_cap",
    maxAttempts: 1,
    timeoutMs: 1000
  });

  assert.deepEqual(requestBody?.models, ["a/model", "b/model", "c/model"]);
});

test("does not retry permanent authentication or credit failures", async () => {
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    return new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 });
  };

  await assert.rejects(
    chatJson([{ role: "user", content: "score" }], {
      models: ["qwen/qwen3.7-max", "openai/gpt-5-mini"],
      contract,
      operation: "test_permanent",
      maxAttempts: 2,
      timeoutMs: 1000
    }),
    (error) => {
      assert.ok(error instanceof OpenRouterRequestError);
      assert.equal(error.status, 401);
      assert.equal(isRetryableOpenRouterError(error), false);
      return true;
    }
  );
  assert.equal(call, 1);
});

test("provider-facing scoring schemas avoid unsupported numeric constraints", () => {
  const schemaText = JSON.stringify({
    evaluatorJsonSchema,
    adjudicationJsonSchema
  });
  for (const keyword of ["multipleOf", "minimum", "maximum", "minItems"]) {
    assert.equal(
      schemaText.includes(`"${keyword}"`),
      false,
      `provider-facing schema must not contain ${keyword}`
    );
  }
});

test("actively aborts a hung provider request at the route time budget", async () => {
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  const startedAt = Date.now();
  await assert.rejects(
    chatJson([{ role: "user", content: "score" }], {
      models: ["qwen/qwen3.7-max", "openai/gpt-5-mini"],
      contract,
      operation: "test_timeout_abort",
      maxAttempts: 1,
      timeoutMs: 25
    }),
    (error) => {
      assert.ok(error instanceof OpenRouterRequestError);
      assert.equal(isRetryableOpenRouterError(error), true);
      return true;
    }
  );
  assert.ok(Date.now() - startedAt < 250);
});
