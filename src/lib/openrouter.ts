const ENDPOINT = "https://openrouter.ai/api/v1";

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return key;
}

export async function chatJson(messages: unknown[], model = process.env.OPENROUTER_SCORING_MODEL || "deepseek/deepseek-v4-flash") {
  const response = await fetch(`${ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ielts-speaking-mock.coze.site",
      "X-Title": "TB IELTS Speaking Mock Examiner"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Evaluator returned no JSON content");
  return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
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
