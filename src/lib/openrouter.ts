const COZE_BASE_URL = process.env.COZE_INTEGRATION_MODEL_BASE_URL || "https://integration.coze.cn/api/v3";
const COZE_API_TOKEN = process.env.COZE_LOOP_API_TOKEN || "";
const SCORING_MODEL = process.env.OPENROUTER_SCORING_MODEL || "deepseek-v3-2-251201";

export async function chatJson(messages: { role: string; content: string }[]): Promise<Record<string, unknown>> {
  const res = await fetch(`${COZE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${COZE_API_TOKEN}`,
    },
    body: JSON.stringify({
      model: SCORING_MODEL,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return JSON.parse(content);
}

export async function asrTranscribe(audioBuffer: Buffer, _mimeType: string): Promise<string> {
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL || "https://integration.coze.cn";
  const apiToken = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.COZE_LOOP_API_TOKEN || "";
  const base64Data = audioBuffer.toString("base64");

  const requestBody = {
    user: { uid: "ielts-mock-examiner" },
    audio: { data: base64Data },
  };

  const res = await fetch(`${baseUrl}/api/v3/auc/bigmodel/recognize/flash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ASR ${res.status}: ${errText.slice(0, 300)}`);
  }

  // Check custom status header
  const apiStatus = res.headers.get("x-api-status-code") || "0";
  if (apiStatus !== "20000000") {
    const apiMessage = res.headers.get("x-api-message") || "unknown error";
    throw new Error(`ASR failed: ${apiStatus} - ${apiMessage}`);
  }

  const data = await res.json();
  return data.result?.text || "";
}

export async function createSpeech(text: string): Promise<{ audioUri: string; audioSize: number }> {
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL || "https://integration.coze.cn";
  const apiToken = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.COZE_LOOP_API_TOKEN || "";
  
  const requestBody = {
    user: { uid: "ielts-mock-examiner" },
    req_params: {
      speaker: "zh_female_xiaohe_uranus_bigtts",
      text,
      audio_params: {
        format: "mp3",
        sample_rate: 24000,
        speech_rate: 0,
        loudness_rate: 0,
      },
    },
  };

  const res = await fetch(`${baseUrl}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
      "Connection": "keep-alive",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS ${res.status}: ${errText.slice(0, 300)}`);
  }

  // Response is a stream of SSE events
  // code=0: audio chunk (base64 data)
  // code=20000000: final event with url and size
  const responseText = await res.text();
  const lines = responseText.split("\n");
  
  for (const line of lines) {
    if (line.startsWith("data:")) {
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.code === 20000000 && data.url) {
          return {
            audioUri: data.url,
            audioSize: data.size || 0,
          };
        }
        if (data.code && data.code !== 0 && data.code !== 20000000) {
          throw new Error(`TTS synthesis failed: ${data.message || "unknown error"}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("TTS synthesis failed")) {
          throw e;
        }
        // Continue parsing
      }
    }
  }
  
  throw new Error("TTS response did not contain audio URL");
}
