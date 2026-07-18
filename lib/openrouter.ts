const ENDPOINT = "https://openrouter.ai/api/v1";

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return key;
}

export async function chatJson(messages: unknown[], model = process.env.OPENROUTER_SCORING_MODEL || "qwen/qwen3.7-max") {
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
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL;
  const apiKeyVal = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  if (!baseUrl || !apiKeyVal) throw new Error("Coze TTS environment not configured");

  const response = await fetch(`${baseUrl}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKeyVal}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: text,
      voice_id: "zh_female_shuangkuai",
      response_format: "mp3",
      speed: 1.0,
      sample_rate: 24000
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Coze TTS ${response.status}: ${await response.text()}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Coze TTS");

  const decoder = new TextDecoder();
  let audioData = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt?.data && typeof evt.data === "string" && evt.data.length > 100) {
          audioData += evt.data;
        }
      } catch {
        // skip malformed SSE events
      }
    }
  }

  if (!audioData) throw new Error("No audio data received from Coze TTS");
  const binary = Uint8Array.from(atob(audioData), (c) => c.charCodeAt(0));
  return binary.buffer;
}
