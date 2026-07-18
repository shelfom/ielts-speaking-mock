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

  const contentType = response.headers.get("content-type") || "";
  const fullText = await response.text();

  let audioData = "";

  // Handle SSE format: multiple "data: {...}" lines
  if (contentType.includes("text/event-stream") || fullText.includes("\ndata: ") || fullText.startsWith("data: ")) {
    const lines = fullText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt?.code !== undefined && evt.code !== 0) {
          throw new Error(`Coze TTS error code ${evt.code}: ${evt.msg || "unknown"}`);
        }
        if (typeof evt?.data === "string" && evt.data.length > 0) {
          audioData += evt.data;
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message.startsWith("Coze TTS error")) throw parseErr;
        // skip malformed JSON lines
      }
    }
  } else {
    // Handle single JSON response
    try {
      const evt = JSON.parse(fullText);
      if (evt?.code !== undefined && evt.code !== 0) {
        throw new Error(`Coze TTS error code ${evt.code}: ${evt.msg || "unknown"}`);
      }
      if (typeof evt?.data === "string") {
        audioData = evt.data;
      }
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Coze TTS error")) throw parseErr;
      throw new Error(`Failed to parse Coze TTS response: ${fullText.slice(0, 200)}`);
    }
  }

  if (!audioData) throw new Error("No audio data received from Coze TTS");
  const binary = Uint8Array.from(atob(audioData), (c) => c.charCodeAt(0));
  return binary.buffer;
}
