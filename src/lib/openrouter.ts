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

export async function createSpeech(text: string): Promise<{ audioUri: string; audioSize: number }> {
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL || "https://integration.coze.cn";
  const token = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.COZE_LOOP_API_TOKEN;
  if (!token) throw new Error("Coze API token not configured");

  const response = await fetch(`${baseUrl}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      req_params: {
        audio_params: { format: "mp3", sample_rate: 24000, speech_rate: 0, loudness_rate: 0 },
        text,
        speaker: "zh_female_xiaohe_uranus_bigtts"
      }
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);

  // Parse SSE stream to collect audio data
  const reader = response.body?.getReader();
  if (!reader) throw new Error("TTS stream missing body");
  const decoder = new TextDecoder();
  let buffer = "";
  let audioUri = "";
  let audioSize = 0;
  let audioData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        const event = JSON.parse(raw);
        const evt = event?.data;
        // Check for audio URL (if provided)
        if (evt?.audio?.audio_url) {
          audioUri = evt.audio.audio_url;
          audioSize = evt.audio.audio_size || 0;
        }
        // Check for base64 audio data
        if (typeof evt === "string" && evt.length > 100) {
          audioData += evt;
        }
      } catch { /* ignore partial JSON */ }
    }
    if (audioUri) break;
  }

  // If we have base64 audio data but no URL, create data URI
  if (audioData && !audioUri) {
    audioUri = `data:audio/mp3;base64,${audioData}`;
    audioSize = Math.ceil((audioData.length * 3) / 4);
  }

  if (!audioUri) throw new Error("TTS stream missing audio data");
  return { audioUri, audioSize };
}
