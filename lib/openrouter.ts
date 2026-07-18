const ENDPOINT = "https://openrouter.ai/api/v1";
const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504]);

type JsonContract<T> = {
  name: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
};

type ChatJsonOptions<T> = {
  models: string[];
  contract: JsonContract<T>;
  operation: string;
  sessionId?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxTokens?: number;
  requireParameters?: boolean;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  signal?: AbortSignal;
  responseMode?: "json_schema" | "json_object";
};

export class OpenRouterRequestError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly code: string;

  constructor({
    message,
    status,
    retryable,
    retryAfterSeconds,
    code
  }: {
    message: string;
    status?: number;
    retryable: boolean;
    retryAfterSeconds?: number;
    code: string;
  }) {
    super(message);
    this.name = "OpenRouterRequestError";
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
  }
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return key;
}

function safeProviderCode(body: string) {
  try {
    const payload = JSON.parse(body);
    return String(
      payload?.error?.metadata?.provider_error_code ||
      payload?.error?.code ||
      payload?.code ||
      "PROVIDER_ERROR"
    );
  } catch {
    return "PROVIDER_ERROR";
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (
        typeof item === "string"
          ? item
          : typeof item?.text === "string"
            ? item.text
            : ""
      ))
      .join("");
  }
  throw new OpenRouterRequestError({
    message: "Evaluator returned no JSON content",
    retryable: true,
    code: "EMPTY_MODEL_OUTPUT"
  });
}

function trace(event: Record<string, unknown>) {
  console.info(JSON.stringify({ service: "ielts-speaking-ai", ...event }));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableOpenRouterError(error: unknown): error is OpenRouterRequestError {
  return error instanceof OpenRouterRequestError && error.retryable;
}

export async function chatJson<T>(
  messages: unknown[],
  options: ChatJsonOptions<T>
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 45000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  let lastError: OpenRouterRequestError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = {
        models: options.models,
        messages,
        temperature: 0,
        max_tokens: options.maxTokens ?? 12000,
        response_format: options.responseMode === "json_object"
          ? { type: "json_object" }
          : {
              type: "json_schema",
              json_schema: {
                name: options.contract.name,
                strict: true,
                schema: options.contract.schema
              }
            },
        plugins: [{ id: "response-healing" }],
        ...(options.reasoningEffort
          ? {
              reasoning: {
                effort: options.reasoningEffort,
                exclude: true
              }
            }
          : {}),
        provider: {
          allow_fallbacks: true,
          require_parameters: options.requireParameters ?? true,
          sort: { by: "throughput", partition: "model" }
        }
      };
      const response = await fetch(`${ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://jmw4nw2n85.coze.site",
          "X-Title": "TB IELTS Speaking Mock Examiner"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const requestId =
        response.headers.get("x-request-id") ||
        response.headers.get("x-openrouter-request-id") ||
        undefined;

      if (!response.ok) {
        const responseBody = await response.text();
        const retryAfterHeader = Number(response.headers.get("retry-after"));
        const retryAfterSeconds =
          Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? retryAfterHeader
            : undefined;
        throw new OpenRouterRequestError({
          message: `OpenRouter request failed with HTTP ${response.status}`,
          status: response.status,
          retryable: TRANSIENT_STATUSES.has(response.status),
          retryAfterSeconds,
          code: safeProviderCode(responseBody)
        });
      }

      const payload = await response.json();
      const content = contentText(payload?.choices?.[0]?.message?.content);
      const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
      const validated = options.contract.parse(parsed);
      trace({
        event: "model_success",
        operation: options.operation,
        sessionId: options.sessionId,
        attempt,
        model: payload?.model,
        requestId,
        durationMs: Date.now() - startedAt
      });
      return validated;
    } catch (error) {
      const normalized =
        error instanceof OpenRouterRequestError
          ? error
          : error instanceof SyntaxError
            ? new OpenRouterRequestError({
                message: "Model output was not valid JSON",
                retryable: true,
                code: "INVALID_JSON"
              })
            : new OpenRouterRequestError({
                message: error instanceof Error ? error.message : "OpenRouter request failed",
                retryable: true,
                code: error instanceof Error && error.name === "TimeoutError"
                  ? "TIMEOUT"
                  : "NETWORK_OR_VALIDATION_ERROR"
              });
      lastError = normalized;
      trace({
        event: "model_failure",
        operation: options.operation,
        sessionId: options.sessionId,
        attempt,
        code: normalized.code,
        status: normalized.status,
        retryable: normalized.retryable,
        durationMs: Date.now() - startedAt
      });

      if (!normalized.retryable || attempt >= maxAttempts) throw normalized;
      if (normalized.retryAfterSeconds && normalized.retryAfterSeconds > 5) throw normalized;
      const backoff = normalized.retryAfterSeconds
        ? normalized.retryAfterSeconds * 1000
        : 700 * (2 ** (attempt - 1));
      await delay(backoff);
    } finally {
      clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  throw lastError || new OpenRouterRequestError({
    message: "OpenRouter request failed",
    retryable: true,
    code: "UNKNOWN"
  });
}

export async function createSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch(`${ENDPOINT}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "minimax/speech-2.8-hd",
      input: text,
      voice: "Wise_Woman",
      response_format: "mp3",
      speed: 1
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Speech ${response.status}: ${await response.text()}`);
  return response.arrayBuffer();
}
