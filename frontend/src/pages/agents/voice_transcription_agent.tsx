import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  Upload,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Activity,
  MessageSquare,
  FileText,
  X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import {
  API_TRANSCRIPTION_ENDPOINT,
  sentimentClass,
  sentimentBarClass,
  speakerAccent,
  speakerInitials,
  formatDuration,
  formatPercent,
  formatBytes,
} from './data';
import type { TranscriptionResponse } from './types';

const clampPct = (value: number): number => Math.max(0, Math.min(100, Number(value) || 0));

/** Turn a non-OK response into a useful message: Spring's JSON error detail when
 *  present, then a plain-text body, then the bare status. */
async function describeHttpError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.clone().json();
    if (body && typeof body === 'object') {
      const b = body as { message?: string; error?: string; path?: string };
      const detail = b.message || b.error;
      if (detail) return `${res.status} · ${detail}${b.path ? ` (${b.path})` : ''}`;
    }
  } catch {
    /* response was not JSON */
  }
  try {
    const text = (await res.text()).trim();
    if (text) return `${res.status} · ${text.slice(0, 300)}`;
  } catch {
    /* ignore */
  }
  return `Backend responded with status ${res.status}`;
}

/** 141000 → "2:21". */
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const VoiceTranscriptionAgentPage: React.FC = () => {
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TranscriptionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Hard, synchronous guard against duplicate/concurrent submits. React's
  // `loading` state updates a tick late, so two fast clicks (or the header +
  // card button) could otherwise both fire before `disabled` takes effect.
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Cancel any in-flight upload if the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const pickFile = useCallback((next: File | null) => {
    setFile(next);
    setValidationError('');
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files?.[0] ?? null;
      if (dropped) pickFile(dropped);
    },
    [pickFile]
  );

  const transcribe = useCallback(async () => {
    if (inFlightRef.current) return; // already running — ignore duplicate clicks
    if (!file) {
      setValidationError('Please select an audio file to transcribe.');
      return;
    }
    setValidationError('');
    setError('');

    inFlightRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    const startedAt = Date.now();
    setElapsedMs(0);
    setLoading(true);
    const ticker = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);

    try {
      const formData = new FormData();
      // Mirror Postman as closely as possible: send an explicit filename, and a
      // concrete audio MIME type when the OS didn't supply one (browsers can send
      // application/octet-stream for .wav, which may trip a server-side decoder).
      const upload = file.type ? file : new File([file], file.name, { type: 'audio/wav' });
      formData.append('file', upload, file.name);

      // Do NOT set Content-Type manually — the browser adds the multipart boundary.
      const res = await fetch(API_TRANSCRIPTION_ENDPOINT, {
        method: 'POST',
        body: formData,
        signal: ac.signal,
      });

      if (!res.ok) {
        throw new Error(await describeHttpError(res));
      }

      const data = (await res.json()) as TranscriptionResponse;
      setResult(data);
    } catch (e) {
      if (ac.signal.aborted) return; // user cancelled / page unmounted
      setResult(null);
      setError(e instanceof Error ? e.message : 'Unable to reach the transcription backend.');
    } finally {
      window.clearInterval(ticker);
      inFlightRef.current = false;
      abortRef.current = null;
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [file]);

  const cancelTranscription = useCallback(() => {
    abortRef.current?.abort();
    inFlightRef.current = false;
    setLoading(false);
  }, []);

  // Stable left/right side + accent per speaker, by first appearance.
  const speakerOrder = useMemo(() => {
    const order = new Map<string, number>();
    for (const seg of result?.transcriptionText ?? []) {
      if (!order.has(seg.speaker)) order.set(seg.speaker, order.size);
    }
    return order;
  }, [result]);

  const transcribeButton = (
    <button
      onClick={transcribe}
      disabled={loading || !file}
      className="group relative overflow-hidden px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 rounded-xl flex items-center gap-2 active:scale-95 transition-all duration-300 shadow-[0_0_18px_rgba(6,182,212,0.18)] hover:shadow-[0_0_28px_rgba(6,182,212,0.28)] border border-cyan-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
      {loading ? (
        <Loader2 className="w-4 h-4 text-white relative z-10 animate-spin" />
      ) : (
        <Mic className="w-4 h-4 text-white relative z-10" strokeWidth={2.5} />
      )}
      <span className="text-[12px] font-bold text-white tracking-wide relative z-10">
        {loading ? 'Transcribing...' : 'Transcribe'}
      </span>
    </button>
  );

  return (
    <AppShell searchPlaceholder="Voice Transcription" headerActions={transcribeButton}>
      <div className="max-w-[1600px] mx-auto space-y-6 lg:space-y-8">
        {/* Heading + back link */}
        <section>
          <button
            onClick={() => navigate('/agents')}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-cyan-300 transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Agents
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-inner">
                  <Mic className="w-4.5 h-4.5 text-cyan-400" strokeWidth={2.2} />
                </div>
                <h2 className="text-[22px] sm:text-[24px] font-extrabold text-white tracking-wide">Voice Transcription</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
                  <Activity className="w-3 h-3" /> Active
                </span>
              </div>
              <p className="text-[13px] font-medium text-slate-400">
                Upload a call recording to transcribe, diarize speakers, and score conversation sentiment.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6 lg:gap-8">
          {/* Left: uploader */}
          <div className="space-y-6">
            <div className="bg-[#0A0D14]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl p-5">
              <h3 className="text-[13px] font-bold text-slate-200 tracking-wide mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" /> Audio Source
              </h3>

              {/* Dropzone */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`rounded-xl border border-dashed flex flex-col items-center justify-center text-center px-4 py-8 cursor-pointer transition-colors ${
                  dragging
                    ? 'border-cyan-500/50 bg-cyan-500/[0.06]'
                    : 'border-white/10 bg-[#050812] hover:border-cyan-500/30 hover:bg-cyan-500/[0.03]'
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-[12px] font-semibold text-slate-200">Drop an audio file here</p>
                <p className="text-[11px] text-slate-500 mt-1">or click to browse · WAV, MP3, M4A…</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Selected file */}
              {file && (
                <div className="mt-4 flex items-center gap-3 bg-[#050812] border border-white/5 rounded-xl p-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-indigo-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-200 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={() => {
                      pickFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    className="p-1.5 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {validationError && (
                <div className="mt-4 flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-rose-200 leading-relaxed">{validationError}</p>
                </div>
              )}

              <button
                onClick={transcribe}
                disabled={loading || !file}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[12px] font-bold tracking-wide border border-cyan-400/20 shadow-[0_0_18px_rgba(6,182,212,0.18)] hover:shadow-[0_0_28px_rgba(6,182,212,0.28)] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" strokeWidth={2.5} />}
                {loading ? 'Transcribing…' : 'Transcribe Audio'}
              </button>
            </div>
          </div>

          {/* Right: results */}
          <div className="space-y-6 min-w-0">
            {/* Error */}
            {error ? (
              <div className="bg-[#0A0D14]/80 border border-rose-500/30 rounded-2xl p-6 shadow-[0_0_18px_rgba(244,63,94,0.08)]">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <h3 className="text-[15px] font-bold text-rose-200 tracking-wide">Transcription Failed</h3>
                </div>
                <p className="text-[12px] text-slate-300 leading-relaxed font-mono bg-[#050812] border border-white/5 rounded-xl p-3 break-words">
                  {error}
                </p>
              </div>
            ) : null}

            {/* Idle */}
            {!result && !error && !loading ? (
              <div className="bg-[#0A0D14]/80 border border-white/[0.04] rounded-2xl p-10 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                  <Mic className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-200 mb-1">Ready to transcribe</h3>
                <p className="text-[12px] text-slate-400 max-w-sm">
                  Select an audio file, then run <span className="text-cyan-300 font-semibold">Transcribe</span> to generate a diarized transcript and sentiment analysis.
                </p>
              </div>
            ) : null}

            {/* Loading */}
            {loading ? (
              <div className="bg-[#0A0D14]/80 border border-white/[0.04] rounded-2xl p-10 text-center flex flex-col items-center">
                <Loader2 className="w-7 h-7 text-cyan-400 animate-spin mb-4" />
                <h3 className="text-[15px] font-bold text-slate-200 mb-1">Transcribing audio…</h3>
                <p className="text-[12px] text-slate-400 max-w-sm">
                  Large recordings can take a few minutes. Keep this tab open — there's no need to click again.
                </p>
                <p className="text-[13px] font-mono text-cyan-300 mt-3">Elapsed {formatElapsed(elapsedMs)}</p>
                <button
                  onClick={cancelTranscription}
                  className="mt-4 px-4 py-2 rounded-lg text-[12px] font-bold text-slate-300 bg-white/[0.03] border border-white/[0.08] hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {/* Success */}
            {result && !loading ? (
              <>
                <div className="bg-[#0A0D14]/80 border border-emerald-500/25 rounded-2xl p-5 shadow-[0_0_18px_rgba(16,185,129,0.08)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold text-emerald-200 tracking-wide">Transcription Complete</h3>
                      <p className="text-[11px] text-slate-400 font-mono truncate" title={result.fileName}>
                        {result.fileName}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <SummaryTile
                    icon={<Gauge className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />}
                    label="Confidence"
                    value={formatPercent(result.confidenceScore)}
                  />
                  <div className="bg-[#0A0D14]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl p-4">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center shadow-inner">
                        <Activity className="w-4 h-4 text-indigo-400" strokeWidth={2.5} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sentiment</span>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest border ${sentimentClass(result.overallSentiment)}`}>
                      {result.overallSentiment}
                    </span>
                  </div>
                  <SummaryTile
                    icon={<MessageSquare className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />}
                    label="Segments"
                    value={String(result.transcriptionText.length)}
                  />
                  <SummaryTile
                    icon={<Clock className="w-4 h-4 text-amber-400" strokeWidth={2.5} />}
                    label="Processing"
                    value={formatDuration(result.processingTimeMs)}
                    mono
                  />
                </div>

                {/* Sentiment breakdown */}
                <div className="bg-[#0A0D14]/80 border border-white/[0.04] rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Sentiment Breakdown</h3>
                  </div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
                    <div className={sentimentBarClass('positive')} style={{ width: `${clampPct(result.positivePercent)}%` }} />
                    <div className={sentimentBarClass('neutral')} style={{ width: `${clampPct(result.neutralPercent)}%` }} />
                    <div className={sentimentBarClass('negative')} style={{ width: `${clampPct(result.negativePercent)}%` }} />
                  </div>
                  <div className="flex items-center gap-5 mt-3 flex-wrap">
                    <Legend dot="bg-emerald-400" label="Positive" value={formatPercent(result.positivePercent)} />
                    <Legend dot="bg-cyan-400" label="Neutral" value={formatPercent(result.neutralPercent)} />
                    <Legend dot="bg-rose-400" label="Negative" value={formatPercent(result.negativePercent)} />
                  </div>
                </div>

                {/* Transcript timeline */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-4.5 h-4.5 text-indigo-400" />
                    <h3 className="text-[16px] font-bold text-slate-200 tracking-wide">Transcript</h3>
                  </div>

                  {result.transcriptionText.length === 0 ? (
                    <div className="bg-[#0A0D14]/80 border border-white/[0.04] rounded-2xl p-8 text-center text-[13px] text-slate-400">
                      The backend returned no transcript segments.
                    </div>
                  ) : (
                    <div className="bg-[#0A0D14]/80 border border-white/[0.04] rounded-2xl p-5 space-y-4">
                      {result.transcriptionText.map((seg, index) => {
                        const order = speakerOrder.get(seg.speaker) ?? 0;
                        const isRight = order % 2 === 1;
                        const accent = speakerAccent(seg.speaker, order);
                        return (
                          <div
                            key={`${index}-${seg.speaker}`}
                            className={`flex items-start gap-2.5 ${isRight ? 'flex-row-reverse' : ''}`}
                          >
                            <div className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center text-[9px] font-bold ${accent}`}>
                              {speakerInitials(seg.speaker)}
                            </div>
                            <div className="min-w-0 max-w-[82%]">
                              <div className={`flex items-center gap-2 mb-1 ${isRight ? 'justify-end' : ''}`}>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{seg.speaker}</span>
                                <span className="text-[9px] font-mono text-slate-600">#{index + 1}</span>
                              </div>
                              <div className="inline-block rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-200 bg-[#050812] border border-white/[0.05]">
                                {seg.text}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
};

interface SummaryTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}

const SummaryTile: React.FC<SummaryTileProps> = ({ icon, label, value, mono }) => (
  <div className="bg-[#0A0D14]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl p-4">
    <div className="flex items-center gap-2.5 mb-2.5">
      <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center shadow-inner">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
    <p className={`text-slate-100 leading-tight break-words ${mono ? 'text-[18px] font-mono' : 'text-[22px] font-bold'}`}>
      {value}
    </p>
  </div>
);

const Legend: React.FC<{ dot: string; label: string; value: string }> = ({ dot, label, value }) => (
  <div className="flex items-center gap-2">
    <span className={`w-2 h-2 rounded-full ${dot}`} />
    <span className="text-[11px] font-medium text-slate-400">{label}</span>
    <span className="text-[11px] font-mono font-bold text-slate-200">{value}</span>
  </div>
);

export default VoiceTranscriptionAgentPage;