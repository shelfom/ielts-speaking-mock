"use client";

import {
  ArrowLeft,
  Check,
  Download,
  Headphones,
  Mic,
  Mic2,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobToMonoWav, preferredMimeType } from "@/lib/audio";
import type { ExamStep, MockTest, TurnAnalysis } from "@/lib/types";

type Screen = "home" | "live" | "analysing" | "result";
type Status = "idle" | "examiner" | "prep" | "candidate" | "uploading";
type AudioManifest = { items: Record<string, string> };

const SAY = {
  welcome: "Good morning. My name is Emma. This is an independent IELTS-style speaking practice test.",
  part1: "We will begin with Part 1. I will ask you some questions about yourself and familiar topics.",
  part2: "Thank you. Now we will move on to Part 2.",
  prep: "You have one minute to prepare. You may make notes if you wish.",
  speak: "Your preparation time is over. Please begin speaking now.",
  stop: "Thank you. You have spoken for two minutes.",
  part3: "We will now move on to Part 3. I will ask you some more general questions related to the topic.",
  end: "Thank you. That is the end of the speaking test."
};

function buildSteps(test: MockTest): ExamStep[] {
  const p1Questions = test.part1.flatMap((group) => group.questions);
  return [
    { id: "welcome", part: 1, prompt: SAY.welcome, kind: "intro", record: false },
    { id: "part1-intro", part: 1, prompt: SAY.part1, kind: "intro", record: false },
    ...p1Questions.map((prompt, index) => ({
      id: `p1-q${index + 1}`,
      part: 1 as const,
      prompt,
      kind: "question" as const,
      record: true,
      maxSeconds: 45
    })),
    { id: "part2-intro", part: 2, prompt: SAY.part2, kind: "intro", record: false },
    { id: "part2-prep", part: 2, prompt: SAY.prep, kind: "prep", record: false },
    { id: "part2-long", part: 2, prompt: SAY.speak, kind: "long-turn", record: true, maxSeconds: 120 },
    { id: "part2-close", part: 2, prompt: test.part2.closingQuestion, kind: "closing", record: true, maxSeconds: 35 },
    { id: "part3-intro", part: 3, prompt: SAY.part3, kind: "intro", record: false },
    ...test.part3.questions.map((prompt, index) => ({
      id: `p3-q${index + 1}`,
      part: 3 as const,
      prompt,
      kind: "question" as const,
      record: true,
      maxSeconds: 60
    })),
    { id: "finish", part: 3, prompt: SAY.end, kind: "finish", record: false }
  ];
}

function fmt(seconds: number) {
  const value = Math.max(0, seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [tests, setTests] = useState<MockTest[]>([]);
  const [selectedId, setSelectedId] = useState("TEST-001");
  const [manifest, setManifest] = useState<AudioManifest | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [countdown, setCountdown] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [micMessage, setMicMessage] = useState("Run a quick microphone check");
  const [checkAudioUrl, setCheckAudioUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [feedbackPlaying, setFeedbackPlaying] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const analysesRef = useRef<Promise<TurnAnalysis>[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/mock-tests.json").then((response) => response.json()),
      fetch("/data/examiner-audio.json").then((response) => response.json())
    ])
      .then(([testData, audioData]) => {
        setTests(testData.tests);
        setManifest(audioData);
        const saved = localStorage.getItem("tb-speaking-last-test");
        if (saved && testData.tests.some((item: MockTest) => item.id === saved)) setSelectedId(saved);
      })
      .catch(() => setError("The test bank could not be loaded. Please refresh."));
  }, []);

  useEffect(() => {
    stepRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (screen === "live" || screen === "analysing") event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [screen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
  }, []);

  const selectedTest = useMemo(
    () => tests.find((item) => item.id === selectedId) || tests[0],
    [tests, selectedId]
  );
  const steps = useMemo(() => (selectedTest ? buildSteps(selectedTest) : []), [selectedTest]);
  const current = steps[stepIndex];

  const ensureStream = useCallback(async () => {
    if (streamRef.current?.active) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    streamRef.current = stream;
    return stream;
  }, []);

  async function runMicCheck() {
    setError("");
    try {
      const stream = await ensureStream();
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setMicLevel(Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length) * 1.6));
      };
      const meter = setInterval(tick, 60);
      const recorder = new MediaRecorder(stream, preferredMimeType() ? { mimeType: preferredMimeType() } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.start();
      setMicMessage("Speak naturally for five seconds…");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      recorder.stop();
      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (checkAudioUrl) URL.revokeObjectURL(checkAudioUrl);
          setCheckAudioUrl(URL.createObjectURL(blob));
          resolve();
        };
      });
      clearInterval(meter);
      source.disconnect();
      await context.close();
      setMicLevel(0);
      setMicReady(true);
      setMicMessage("Microphone ready — play back your sample");
    } catch {
      setMicReady(false);
      setMicMessage("Microphone permission is required");
      setError("Allow microphone access in your browser, then run the check again.");
    }
  }

  const uploadTurn = useCallback(async (step: ExamStep, blob: Blob, durationSeconds: number) => {
    try {
      const wav = await blobToMonoWav(blob);
      const form = new FormData();
      form.append("audio", wav, `${step.id}.wav`);
      form.append("metadata", JSON.stringify({
        turnId: step.id,
        part: step.part,
        prompt: step.prompt,
        durationSeconds
      }));
      const response = await fetch("/api/analyse-turn", { method: "POST", body: form });
      if (!response.ok) throw new Error("analysis failed");
      return await response.json() as TurnAnalysis;
    } catch {
      return {
        turnId: step.id,
        part: step.part,
        prompt: step.prompt,
        durationSeconds,
        transcript: "",
        segments: [],
        audioEvidence: [],
        quality: "insufficient"
      } satisfies TurnAnalysis;
    }
  }, []);

  const startRecording = useCallback(async (step: ExamStep) => {
    const stream = await ensureStream();
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, preferredMimeType() ? { mimeType: preferredMimeType() } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
    recorder.onstop = () => {
      const duration = Math.max(0.1, (performance.now() - recordingStartedRef.current) / 1000);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      analysesRef.current.push(uploadTurn(step, blob, duration));
    };
    recordingStartedRef.current = performance.now();
    setRecordingSeconds(0);
    setStatus("candidate");
    recorder.start(1000);
    intervalRef.current = setInterval(() => {
      const seconds = Math.floor((performance.now() - recordingStartedRef.current) / 1000);
      setRecordingSeconds(seconds);
      if (step.maxSeconds && seconds >= step.maxSeconds) {
        recorder.stop();
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStepIndex((value) => value + 1);
      }
    }, 250);
  }, [ensureStream, uploadTurn]);

  const playStep = useCallback(async (step: ExamStep) => {
    if (!manifest) return;
    const src = manifest.items[step.prompt];
    if (!src) {
      setError(`Examiner audio is missing for ${step.id}.`);
      return;
    }
    setStatus("examiner");
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.preload = "auto";
    audio.onended = () => {
      if (step.kind === "prep") {
        setStatus("prep");
        setCountdown(60);
        let left = 60;
        prepTimerRef.current = setInterval(() => {
          left -= 1;
          setCountdown(left);
          if (left <= 0) {
            if (prepTimerRef.current) clearInterval(prepTimerRef.current);
            setStepIndex((value) => value + 1);
          }
        }, 1000);
      } else if (step.record) {
        startRecording(step).catch(() => setError("The microphone could not start."));
      } else if (step.kind === "finish") {
        finishTest();
      } else {
        setStepIndex((value) => value + 1);
      }
    };
    audio.onerror = () => setError("Examiner audio could not be played. Check your connection.");
    await audio.play();
  }, [manifest, startRecording]);

  useEffect(() => {
    if (screen !== "live" || !current) return;
    playStep(current).catch(() => setError("Tap Resume audio to continue."));
  }, [screen, stepIndex, current, playStep]);

  async function startTest() {
    if (!selectedTest || !manifest) return;
    setError("");
    try {
      await ensureStream();
      localStorage.setItem("tb-speaking-last-test", selectedId);
      analysesRef.current = [];
      setStepIndex(0);
      setScreen("live");
    } catch {
      setError("Microphone access is required to start the speaking test.");
    }
  }

  function doneSpeaking() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus("uploading");
    setStepIndex((value) => value + 1);
  }

  async function finishTest() {
    setScreen("analysing");
    setStatus("uploading");
    const settled = await Promise.all(analysesRef.current);
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: crypto.randomUUID(),
        testId: selectedId,
        completedAt: new Date().toISOString(),
        analyses: settled
      })
    });
    if (!response.ok) {
      setError("Scoring could not be completed. Please keep this page open and try again.");
      setScreen("home");
      return;
    }
    const scored = await response.json();
    setResult(scored);
    localStorage.setItem("tb-speaking-latest-summary", JSON.stringify({
      testId: selectedId,
      date: new Date().toISOString(),
      overall: scored.overall ?? null,
      subBands: scored.subBands ?? null
    }));
    setScreen("result");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function abortTest() {
    audioRef.current?.pause();
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    setScreen("home");
    setStatus("idle");
  }

  async function playFeedback() {
    if (!result?.spokenFeedbackZh || feedbackPlaying) return;
    setFeedbackPlaying(true);
    try {
      const response = await fetch("/api/feedback-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.spokenFeedbackZh })
      });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => {
        setFeedbackPlaying(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setFeedbackPlaying(false);
      setError("Spoken feedback is temporarily unavailable; the complete written feedback is below.");
    }
  }

  function downloadReport() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedId}-speaking-report.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (screen === "analysing") {
    return (
      <main className="shell">
        <section className="exam-panel centred-panel">
          <div className="analysis-orb" aria-hidden="true"><span /><span /><span /></div>
          <p className="eyebrow">Evidence review in progress</p>
          <h1>Analysing your speaking</h1>
          <p className="muted max-copy">Your answers are being checked across all four criteria. Keep this page open.</p>
          <div className="analysis-steps">
            <span><Check size={17} /> Three-part evidence</span>
            <span><Check size={17} /> Direct pronunciation audio</span>
            <span><Check size={17} /> Two independent evaluations</span>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "result" && result) {
    return (
      <main className="result-shell">
        <section className="result-hero">
          <p className="eyebrow">Practice report · {selectedId}</p>
          {result.status === "scored" ? (
            <>
              <div className="band-lockup"><span className="band-number">{result.overall}</span><span>estimated overall band</span></div>
              <div className="sub-bands">
                {Object.entries(result.subBands).map(([key, value]) => (
                  <div key={key}><strong>{String(value)}</strong><span>{key}</span></div>
                ))}
              </div>
            </>
          ) : (
            <h1>More evidence needed</h1>
          )}
          <p className="disclaimer">{result.label}</p>
          <div className="result-actions">
            {result.spokenFeedbackZh && (
              <button className="primary" onClick={playFeedback}><Volume2 size={18} />{feedbackPlaying ? "正在播放" : "听中文点评"}</button>
            )}
            <button className="secondary" onClick={downloadReport}><Download size={18} />Download report</button>
            <button className="secondary" onClick={() => { setResult(null); setScreen("home"); }}><RotateCcw size={18} />Try another test</button>
          </div>
        </section>

        <section className="report">
          {result.status !== "scored" ? (
            <article className="report-card"><h2>为什么现在不给分</h2><p>{result.explanationZh}</p></article>
          ) : (
            <>
              <article className="report-card diagnosis"><span>一句话诊断</span><h2>{result.diagnosisZh}</h2></article>
              <h2 className="section-title">四项评分为什么</h2>
              <div className="criteria-grid">
                {Object.entries(result.criteria).map(([key, item]: [string, any]) => (
                  <article className="report-card criterion-card" key={key}>
                    <div className="criterion-head"><span>{key}</span><strong>{item.band}</strong></div>
                    <h3>为什么是这个分数</h3><p>{item.why}</p>
                    <h3>为什么还不是更高一档</h3><p>{item.why_not_higher}</p>
                    <Evidence items={item.positive_evidence} tone="positive" />
                    <Evidence items={item.limiting_evidence} tone="limit" />
                  </article>
                ))}
              </div>
              <h2 className="section-title">原话证据与修正</h2>
              <div className="evidence-list">
                {result.evidenceCorrections?.map((item: any, index: number) => (
                  <article className="report-card correction" key={`${item.turn_id}-${index}`}>
                    <span className="timecode">{item.turn_id} · {item.start?.toFixed?.(1) ?? item.start}s</span>
                    <p className="original">{item.original}</p>
                    <p className="improved">{item.improved}</p>
                    <small>{item.reason_zh}</small>
                  </article>
                ))}
              </div>
              <h2 className="section-title">优先解决方案</h2>
              <div className="priority-list">
                {result.priorities?.map((item: any) => (
                  <article className="report-card priority" key={item.rank}>
                    <span>{String(item.rank).padStart(2, "0")}</span>
                    <div><h3>{item.diagnosis_zh}</h3><p>{item.drill_zh}</p><small>{item.schedule_zh} · {item.success_measure_zh}</small></div>
                  </article>
                ))}
              </div>
              <h2 className="section-title">三个部分的表现</h2>
              <div className="parts-report">
                {Object.entries(result.partDiagnostics || {}).map(([key, value]) => (
                  <article className="report-card" key={key}><span>{key.toUpperCase()}</span><p>{String(value)}</p></article>
                ))}
              </div>
              <h2 className="section-title">七天训练计划</h2>
              <ol className="week-plan">
                {result.sevenDayPlan?.map((item: string, index: number) => <li key={index}><span>Day {index + 1}</span>{item}</li>)}
              </ol>
            </>
          )}
        </section>
        <Footer />
      </main>
    );
  }

  if (screen === "live" && current && selectedTest) {
    const isPart2Card = current.part === 2 && ["prep", "long-turn"].includes(current.kind);
    const partProgress = current.part === 1 ? "01" : current.part === 2 ? "02" : "03";
    return (
      <main className="live-shell">
        <section className="exam-panel live-panel">
          <header className="live-header">
            <button className="icon-button" onClick={abortTest} aria-label="End test"><ArrowLeft size={20} /></button>
            <div><p>IELTS Speaking Mock Test</p><span>{selectedId}</span></div>
            <button className="end-button" onClick={abortTest}>End test</button>
          </header>
          <div className="part-track" aria-label={`Part ${current.part} of 3`}>
            {[1, 2, 3].map((part) => <span key={part} className={part <= current.part ? "active" : ""} />)}
          </div>
          <div className="live-copy">
            <p className="eyebrow">Part {current.part} <span>{partProgress}/03</span></p>
            <h1>{current.kind === "prep" ? "Preparation" : current.kind === "long-turn" ? "Long turn" : "Interview"}</h1>
          </div>

          {isPart2Card ? (
            <article className="cue-card">
              <div className="cue-head">
                <span>Part 2 cue card</span>
                <strong>{status === "prep" ? fmt(countdown) : fmt(Math.max(0, 120 - recordingSeconds))}</strong>
              </div>
              <h2>{selectedTest.part2.cueCard[0]}</h2>
              <ul>{selectedTest.part2.cueCard.slice(1).map((line) => <li key={line}>{line}</li>)}</ul>
            </article>
          ) : (
            <div className={`audio-stage ${status}`}>
              <div className="orb">
                <span /><span /><span /><Volume2 size={30} />
              </div>
              <div className="wave" aria-hidden="true">{Array.from({ length: 19 }).map((_, index) => <i key={index} />)}</div>
            </div>
          )}

          <div className="live-status" aria-live="polite">
            {status === "examiner" && <><Headphones size={18} /><strong>Examiner is speaking</strong><span>Please listen</span></>}
            {status === "candidate" && <><Mic2 size={18} /><strong>Your turn</strong><span>{fmt(recordingSeconds)}</span></>}
            {status === "prep" && <><ShieldCheck size={18} /><strong>Prepare your answer</strong><span>You may make notes</span></>}
            {status === "uploading" && <><ShieldCheck size={18} /><strong>Answer secured</strong><span>Preparing the next question</span></>}
          </div>
          <div className="live-controls">
            {status === "candidate" ? (
              <button className="primary done-button" onClick={doneSpeaking}><Square size={16} fill="currentColor" />Done speaking</button>
            ) : (
              <span className="conversation-live"><i /> Conversation is active</span>
            )}
          </div>
          {error && <button className="resume" onClick={() => current && playStep(current)}><Play size={16} />Resume audio</button>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="home-panel">
        <header className="brand">
          <div className="brand-mark"><Mic2 size={23} /></div>
          <div><strong>TB Speaking Lab</strong><span>Evidence-led IELTS practice</span></div>
        </header>
        <div className="home-grid">
          <div className="home-copy">
            <p className="eyebrow">Real test rhythm · British examiner</p>
            <h1>Speak under<br /> <em>real pressure.</em></h1>
            <p>A complete Part 1, Part 2 and Part 3 interview, followed by a precise four-criterion diagnosis in Chinese.</p>
            <div className="feature-row">
              <span><ShieldCheck size={17} />Private session</span>
              <span><Volume2 size={17} />Clear UK voice</span>
              <span><Mic size={17} />Audio evidence</span>
            </div>
          </div>
          <div className="start-card">
            <div className="test-picker">
              <label htmlFor="test">Mock test set</label>
              <select id="test" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {tests.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
              </select>
            </div>
            <div className="device-check">
              <div className="meter-head"><span><Mic size={18} />{micMessage}</span><strong>{micReady ? "Ready" : "Check"}</strong></div>
              <div className="level-track"><span style={{ width: `${micLevel}%` }} /></div>
              <div className="check-actions">
                <button className="secondary" onClick={runMicCheck}><Mic size={17} />Check microphone</button>
                {checkAudioUrl && <audio controls src={checkAudioUrl} />}
              </div>
            </div>
            <button className="primary start-button" disabled={!tests.length || !manifest} onClick={startTest}>
              Start test <span>11–14 min</span>
            </button>
            <p className="micro-copy">Independent IELTS-style practice — not an official IELTS test or score</p>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
        <Footer />
      </section>
    </main>
  );
}

function Evidence({ items, tone }: { items?: any[]; tone: "positive" | "limit" }) {
  if (!items?.length) return null;
  return (
    <ul className={`criterion-evidence ${tone}`}>
      {items.slice(0, 3).map((item, index) => (
        <li key={index}><span>{item.turn_id} · {Number(item.start).toFixed(1)}s</span>{item.note}</li>
      ))}
    </ul>
  );
}

function Footer() {
  return <footer>海归湾国际教育（天津）雅思精准学习中心 <a href="tel:4000616820">400-061-6820</a></footer>;
}
