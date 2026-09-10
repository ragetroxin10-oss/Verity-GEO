"use client";

import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import {
  ClipboardCheck, Search, Users, Link2, Quote, Wand2, TrendingUp,
  XCircle, AlertTriangle, CheckCircle2, Radar, MapPin,
  FileText, MessageCircle, Megaphone, Mic2, Building2, Mail,
} from "lucide-react";

/* ---------- shared helpers ---------- */

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}
function seededRandom(seed) {
  let s = seed;
  return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
async function callClaude(system, userText, maxTokens) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userText, maxTokens: maxTokens || 1800 }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ")");
  }
  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error("The AI provider returned an empty response. Check its API configuration.");
  }
  return data.text;
}
function parseJSON(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Fall through to a user-facing error instead of rendering a blank result.
      }
    }
    throw new Error("The AI response was not valid JSON. Please try again.");
  }
}
function rateAwareError(e, fallback) {
  if (e.message === "RATE_LIMIT") return "This app is rate-limited to keep it running for everyone \u2014 try again in a bit.";
  return e.message || fallback;
}

/* ---------- shared UI atoms ---------- */

function FieldLabel({ children, htmlFor, style }) {
  return <label className="field-label" htmlFor={htmlFor} style={style}>{children}</label>;
}
function SectionLabel({ children }) { return <p className="section-label">{children}</p>; }
function Divider() { return <div className="divider" />; }
function DemoNote({ children }) { return <p className="demo-note">{children}</p>; }
function PrimaryButton({ loading, onClick, children, style }) {
  return (
    <button className={"btn-primary" + (loading ? " is-loading" : "")} onClick={onClick} disabled={loading} style={style}>
      {loading ? <span className="btn-pulse" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">&#167;</span>
      <p>{text}</p>
    </div>
  );
}
function ResultSkeleton() {
  return (
    <div className="panel skeleton-panel" aria-hidden="true">
      <div className="skeleton-row" style={{ width: "40%", height: 34 }} />
      <div className="skeleton-row" style={{ width: "100%", height: 12, marginTop: 22 }} />
      <div className="skeleton-row" style={{ width: "92%", height: 12 }} />
      <div className="skeleton-row" style={{ width: "76%", height: 12 }} />
    </div>
  );
}
function ScoreDial({ score }) {
  const r = 54, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score));
  const [animated, setAnimated] = useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setAnimated(pct), 60);
    return () => clearTimeout(t);
  }, [pct]);
  const offset = c - (animated / 100) * c;
  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r + 9} fill="none" stroke="var(--border)" strokeWidth="1" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--accent-brass)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 70 70)" className="dial-ring" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="font-display" style={{ fontSize: 34, lineHeight: 1 }}>{animated}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}
const SEVERITY = {
  critical: { icon: XCircle, color: "var(--sev-critical)", label: "Critical" },
  fail: { icon: XCircle, color: "var(--sev-critical)", label: "Fail" },
  warning: { icon: AlertTriangle, color: "var(--sev-warning)", label: "Warning" },
  pass: { icon: CheckCircle2, color: "var(--sev-pass)", label: "Passing" },
};
function IssueList({ issues }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {issues.map((iss, i) => {
        const S = SEVERITY[iss.severity || iss.status] || SEVERITY.warning;
        const Icon = S.icon;
        return (
          <div key={i} className="issue-row" style={{ borderLeftColor: S.color }}>
            <Icon size={15} color={S.color} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)" }}>
                {iss.category ? <span style={{ color: "var(--text-muted)" }}>{iss.category} &middot; </span> : null}
                {iss.title || iss.label}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>{iss.detail || iss.note}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- generic demo-trend module (used by Market snapshot & PR mentions) ---------- */

function DemoTrendModule({ inputLabel, inputPlaceholder, buttonLabel, statFields, chartLabel, note, seedSalt }) {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState("");

  const data = useMemo(() => {
    if (!submitted) return null;
    const seed = hashString(submitted + seedSalt);
    const rand = seededRandom(seed);
    const stats = statFields.map((f) => ({
      label: f.label,
      value: Math.round(f.min + rand() * (f.max - f.min)),
    }));
    const trend = [];
    let val = 30 + rand() * 30;
    for (let i = 1; i <= 8; i++) {
      val = Math.max(3, Math.min(97, val + (rand() - 0.45) * 14));
      trend.push({ period: "P" + i, value: Math.round(val) });
    }
    return { stats, trend };
  }, [submitted]);

  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor={"dt-" + seedSalt}>{inputLabel}</FieldLabel>
        <input id={"dt-" + seedSalt} className="input" placeholder={inputPlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        <PrimaryButton onClick={() => name.trim() && setSubmitted(name.trim())}>{buttonLabel}</PrimaryButton>
        <DemoNote>{note}</DemoNote>
      </div>
      {!data && <EmptyState text="Enter a name above and the sample report will land here." />}
      {data && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(" + data.stats.length + ", 1fr)" }}>
            {data.stats.map((s, i) => (
              <div key={i} className="stat-card"><p className="stat-label">{s.label}</p><p className="stat-value">{s.value}</p></div>
            ))}
          </div>
          <Divider />
          <SectionLabel>{chartLabel}</SectionLabel>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                <Line type="monotone" dataKey="value" stroke="var(--accent-amber)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- SEO + AI search: Site audit ---------- */

function SiteAuditModule() {
  const [content, setContent] = useState(""); const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!content.trim()) { setError("Paste the page's content or HTML first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a technical + content SEO auditor. Assess the given page content for search and AI-answer-engine health. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"score": number 0-100, "issues": [{"severity": "critical"|"warning"|"pass", "category": string, "title": "short phrase", "detail": "one sentence"}]}
Cover: crawlability & indexability, heading structure, metadata, content depth, internal linking cues, mobile/accessibility signals, freshness signals, source authority signals. 8 to 12 issues total, mixing severities honestly.`;
      setResult(parseJSON(await callClaude(system, `Page URL (context only): ${url || "(not provided)"}\n\nContent:\n${content}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the audit. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  const counts = useMemo(() => {
    if (!result) return {};
    return result.issues.reduce((a, i) => { a[i.severity] = (a[i.severity] || 0) + 1; return a; }, {});
  }, [result]);
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="sa-url">Page URL (optional, for context)</FieldLabel>
        <input id="sa-url" className="input" placeholder="https://yoursite.com/page" value={url} onChange={(e) => setUrl(e.target.value)} />
        <FieldLabel htmlFor="sa-content">Page content or HTML</FieldLabel>
        <textarea id="sa-content" className="textarea" style={{ marginTop: 6 }} placeholder="Paste the page's text or HTML source..." value={content} onChange={(e) => setContent(e.target.value)} rows={10} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Auditing" : "Run audit"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Run an audit above and the score, findings, and fixes will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreDial score={result.score} />
            <div style={{ display: "flex", gap: 20 }}>
              {["critical", "warning", "pass"].map((sev) => {
                const S = SEVERITY[sev]; const Icon = S.icon;
                return <div key={sev} style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon size={16} color={S.color} /><span style={{ fontSize: 13 }}>{counts[sev] || 0} {S.label.toLowerCase()}</span></div>;
              })}
            </div>
          </div>
          <Divider /><SectionLabel>Findings</SectionLabel>
          <IssueList issues={result.issues} />
        </div>
      )}
    </div>
  );
}

/* ---------- SEO + AI search: Keywords ---------- */

function KeywordsModule() {
  const [topic, setTopic] = useState(""); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [result, setResult] = useState(null); const [selected, setSelected] = useState([]);
  const run = async () => {
    if (!topic.trim()) { setError("Enter a topic or seed keyword first."); return; }
    setError(""); setLoading(true); setResult(null); setSelected([]);
    try {
      const system = `You are a keyword research analyst. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"keywords": [{"keyword": string, "intent": "informational"|"commercial"|"transactional"|"navigational", "difficulty": "low"|"medium"|"high", "angle": "one sentence content angle"}]}
8 to 10 keywords, mixing head and long-tail terms, varied intent. Do not invent numeric search-volume figures.`;
      const parsed = parseJSON(await callClaude(system, `Topic: ${topic}`));
      setResult(parsed); setSelected((parsed.keywords || []).slice(0, 3).map((k) => k.keyword));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the research. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  const toggle = (kw) => setSelected((p) => (p.includes(kw) ? p.filter((k) => k !== kw) : p.length < 5 ? [...p, kw] : p));
  const chartData = useMemo(() => {
    if (!selected.length) return [];
    const weeks = [];
    for (let w = 1; w <= 8; w++) {
      const row = { week: "Wk " + w };
      selected.forEach((kw) => {
        const rand = seededRandom(hashString(kw) + w * 97);
        const base = 30 - (hashString(kw) % 25);
        row[kw] = Math.max(1, Math.round(base + (rand() - 0.5) * 10));
      });
      weeks.push(row);
    }
    return weeks;
  }, [selected]);
  const colors = ["var(--accent-brass)", "var(--accent-teal)", "#C1614A", "#7C93A3", "#8B7BA3"];
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="kw-topic">Topic or seed keyword</FieldLabel>
        <input id="kw-topic" className="input" placeholder="e.g. project management software" value={topic} onChange={(e) => setTopic(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Researching" : "Find keywords"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Search a topic above and keyword opportunities will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Keyword opportunities &middot; click up to 5 to chart</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.keywords.map((k, i) => (
              <div key={i} className={"kw-row" + (selected.includes(k.keyword) ? " kw-row-active" : "")} onClick={() => toggle(k.keyword)}>
                <span style={{ fontSize: 13.5, flex: 1 }}>{k.keyword}</span>
                <span className={"tag tag-" + k.intent}>{k.intent}</span>
                <span className={"tag tag-diff-" + k.difficulty}>{k.difficulty}</span>
              </div>
            ))}
          </div>
          <Divider /><SectionLabel>Content angles</SectionLabel>
          <ul className="rec-list">{result.keywords.filter((k) => selected.includes(k.keyword)).map((k, i) => <li key={i}><strong style={{ color: "var(--text)" }}>{k.keyword}:</strong> {k.angle}</li>)}</ul>
          {selected.length > 0 && (
            <>
              <Divider /><SectionLabel>Sample rank trend, last 8 weeks</SectionLabel>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} reversed domain={[1, 50]} />
                    <Tooltip contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                    {selected.map((kw, i) => <Line key={kw} type="monotone" dataKey={kw} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <DemoNote>Rank positions above are illustrative sample data. A live version needs a real rank-tracking index or search API.</DemoNote>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- SEO + AI search: Backlinks ---------- */

function BacklinksModule() {
  const [domain, setDomain] = useState(""); const [submitted, setSubmitted] = useState("");
  const data = useMemo(() => {
    if (!submitted) return null;
    const rand = seededRandom(hashString(submitted));
    const referring = Math.round(80 + rand() * 900);
    const total = Math.round(referring * (3 + rand() * 6));
    const authority = Math.round(20 + rand() * 60);
    const trend = []; let val = authority - 8;
    for (let m = 1; m <= 6; m++) { val = Math.max(5, Math.min(95, val + (rand() - 0.4) * 6)); trend.push({ month: "M" + m, authority: Math.round(val) }); }
    const types = ["industry blog", "news mention", "directory listing", "partner site", "forum thread", "resource page"];
    const referrers = Array.from({ length: 6 }, (_, i) => ({ type: types[i % types.length], strength: Math.round(30 + rand() * 65) }));
    return { referring, total, authority, trend, referrers };
  }, [submitted]);
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="bl-domain">Domain</FieldLabel>
        <input id="bl-domain" className="input" placeholder="yoursite.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <PrimaryButton onClick={() => domain.trim() && setSubmitted(domain.trim())}>Generate sample profile</PrimaryButton>
        <DemoNote>Illustrative sample data. Real backlink data needs a crawled link index (its own web-scale crawler) or a third-party backlink API in production.</DemoNote>
      </div>
      {!data && <EmptyState text="Enter a domain above and the sample backlink profile will land here." />}
      {data && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="stat-grid">
            <div className="stat-card"><p className="stat-label">Referring domains</p><p className="stat-value">{data.referring.toLocaleString()}</p></div>
            <div className="stat-card"><p className="stat-label">Total backlinks</p><p className="stat-value">{data.total.toLocaleString()}</p></div>
            <div className="stat-card"><p className="stat-label">Authority score</p><p className="stat-value">{data.authority}</p></div>
          </div>
          <Divider /><SectionLabel>Authority trend, last 6 months</SectionLabel>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                <Line type="monotone" dataKey="authority" stroke="var(--accent-amber)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Divider /><SectionLabel>Sample referring-link types</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.referrers.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 130, fontSize: 13, textTransform: "capitalize" }}>{r.type}</div>
                <div style={{ flex: 1 }}><div className="bar-track"><div className="bar-fill" style={{ width: r.strength + "%" }} /></div></div>
                <div style={{ width: 30, textAlign: "right", fontSize: 13 }}>{r.strength}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- AI visibility: Citation audit + Citation tracking ---------- */

function CitationAuditModule() {
  const [content, setContent] = useState(""); const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!content.trim()) { setError("Paste some content to audit first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a GEO (Generative Engine Optimization) analyst assessing how likely an AI answer engine is to extract, quote, or cite given content. Score strictly - most first drafts score 30-70. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"score": number 0-100, "verdict": "short phrase, under 8 words", "breakdown": [{"criterion": string, "score": number 0-10, "note": "one sentence"}], "recommendations": ["actionable sentence", ...]}
Breakdown must contain exactly these 6 criteria in order: "Direct-answer clarity", "Scannable structure", "Factual specificity", "Source authority signals", "Topical completeness", "Extractable statements". 4 to 6 recommendations, most impactful first.`;
      setResult(parseJSON(await callClaude(system, `Target query: ${query || "(infer)"}\n\nContent:\n${content}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the audit. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="ca-query">Target query (optional)</FieldLabel>
        <input id="ca-query" className="input" placeholder="e.g. best budgeting apps for freelancers" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FieldLabel htmlFor="ca-content" style={{ marginTop: 16 }}>Content to audit</FieldLabel>
        <textarea id="ca-content" className="textarea" style={{ marginTop: 6 }} placeholder="Paste an article, product page, or blog post..." value={content} onChange={(e) => setContent(e.target.value)} rows={9} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Auditing" : "Run audit"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Audit a piece of content above and its citation score will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreDial score={result.score} />
            <div><p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>Overall verdict</p><p className="font-display" style={{ fontSize: 22, margin: 0 }}>{result.verdict}</p></div>
          </div>
          <Divider /><SectionLabel>Breakdown</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {result.breakdown.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 150, flexShrink: 0, fontSize: 13, paddingTop: 2 }}>{b.criterion}</div>
                <div style={{ flex: 1 }}><div className="bar-track"><div className="bar-fill" style={{ width: (b.score / 10) * 100 + "%" }} /></div>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" }}>{b.note}</p></div>
                <div style={{ width: 30, textAlign: "right", fontSize: 13, paddingTop: 2 }}>{b.score}/10</div>
              </div>
            ))}
          </div>
          <Divider /><SectionLabel>Recommendations</SectionLabel>
          <ol className="rec-list">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </div>
      )}
    </div>
  );
}

const ENGINES = [
  { id: "chatgpt", label: "ChatGPT" }, { id: "perplexity", label: "Perplexity" },
  { id: "aio", label: "Google AI Overviews" }, { id: "gemini", label: "Gemini" }, { id: "claude", label: "Claude" },
];
function CitationTrackModule() {
  const [brand, setBrand] = useState(""); const [selectedEngines, setSelectedEngines] = useState(["chatgpt", "perplexity", "aio"]);
  const [submitted, setSubmitted] = useState("");
  const toggle = (id) => setSelectedEngines((p) => (p.includes(id) ? p.filter((e) => e !== id) : [...p, id]));
  const chartData = useMemo(() => {
    if (!submitted) return [];
    const rand = seededRandom(hashString(submitted));
    const base = {}; ENGINES.forEach((e, i) => { base[e.id] = 15 + Math.floor(rand() * 45) + i * 3; });
    const weeks = [];
    for (let w = 1; w <= 8; w++) {
      const row = { week: "Wk " + w };
      ENGINES.forEach((e) => { row[e.id] = Math.max(2, Math.round(base[e.id] + (rand() - 0.4) * 8 * w * 0.3)); });
      weeks.push(row);
    }
    return weeks;
  }, [submitted]);
  const totals = useMemo(() => {
    if (!chartData.length) return [];
    const last = chartData[chartData.length - 1];
    return ENGINES.filter((e) => selectedEngines.includes(e.id)).map((e) => ({ engine: e.label, value: last[e.id] }));
  }, [chartData, selectedEngines]);
  const colors = ["var(--accent-brass)", "var(--accent-teal)", "#C1614A", "#7C93A3", "#8B7BA3"];
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="tr-brand">Brand or site name</FieldLabel>
        <input id="tr-brand" className="input" placeholder="e.g. Northwind Analytics" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <p className="field-label" style={{ marginTop: 16 }}>Engines to include</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ENGINES.map((e) => <button key={e.id} className={"chip" + (selectedEngines.includes(e.id) ? " chip-active" : "")} onClick={() => toggle(e.id)} type="button">{e.label}</button>)}
        </div>
        <PrimaryButton style={{ marginTop: 18 }} onClick={() => brand.trim() && setSubmitted(brand.trim())}>Generate sample report</PrimaryButton>
        <DemoNote>Sample data for illustration. A live version would poll each engine on a schedule and store results in a backend.</DemoNote>
      </div>
      {!submitted && <EmptyState text="Enter a brand above and the sample citation report will land here." />}
      {submitted && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Citation share, last 8 weeks &middot; {submitted}</SectionLabel>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                {ENGINES.filter((e) => selectedEngines.includes(e.id)).map((e, i) => <Line key={e.id} type="monotone" dataKey={e.id} name={e.label} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Divider /><SectionLabel>Current citation index by engine</SectionLabel>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={totals}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="engine" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                <Bar dataKey="value" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Traffic & market: Competitors ---------- */

function CompetitorsModule() {
  const [you, setYou] = useState(""); const [competitor, setCompetitor] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!you.trim() || !competitor.trim()) { setError("Describe both your site and the competitor's first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a competitive content strategist. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"your_strengths": [string, ...], "competitor_strengths": [string, ...], "gaps": [string, ...], "opportunities": [string, ...]}
3 to 5 items per array, specific and grounded in what was described - do not invent unstated facts.`;
      setResult(parseJSON(await callClaude(system, `Your site:\n${you}\n\nCompetitor site:\n${competitor}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the comparison. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="comp-you">Your site: positioning, audience, offer</FieldLabel>
        <textarea id="comp-you" className="textarea" placeholder="Describe what your site does, who it's for, and how it's positioned..." value={you} onChange={(e) => setYou(e.target.value)} rows={5} />
        <FieldLabel htmlFor="comp-them" style={{ marginTop: 16 }}>Competitor's site: same</FieldLabel>
        <textarea id="comp-them" className="textarea" style={{ marginTop: 6 }} placeholder="Describe the competitor the same way..." value={competitor} onChange={(e) => setCompetitor(e.target.value)} rows={5} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Comparing" : "Compare"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Describe both sites above and the comparison will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="comp-grid">
            <div><SectionLabel>Your strengths</SectionLabel><ul className="rec-list">{result.your_strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div><SectionLabel>Competitor strengths</SectionLabel><ul className="rec-list">{result.competitor_strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          </div>
          <Divider /><SectionLabel>Gaps in your content</SectionLabel>
          <ul className="rec-list">{result.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <Divider /><SectionLabel>Opportunities</SectionLabel>
          <ul className="rec-list">{result.opportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Local ---------- */

function LocalModule() {
  const [info, setInfo] = useState(""); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!info.trim()) { setError("Describe the business first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a local-SEO and local-AI-visibility auditor (for how a business shows up in Google Maps/local pack results and in AI assistants answering "near me" or local queries). Respond with ONLY valid JSON, no markdown fences, no commentary:
{"score": number 0-100, "checks": [{"status": "pass"|"warning"|"fail", "label": "short phrase", "note": "one sentence"}]}
Cover: business-name/address/phone consistency signals, category and service clarity, review signal strength, local content specificity (neighborhood/service-area mentions), structured local-business markup cues, and how easily an AI assistant could answer "who's the best/nearest X" about this business based on what's given. 6 to 9 checks, honest mix.`;
      setResult(parseJSON(await callClaude(system, `Business description:\n${info}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the check. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  const counts = useMemo(() => {
    if (!result) return {};
    return result.checks.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
  }, [result]);
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="local-info">Business name, category, city, and a short description</FieldLabel>
        <textarea id="local-info" className="textarea" placeholder="e.g. Maple & Oak Dental, a family dentist in Leeds offering emergency and cosmetic dentistry..." value={info} onChange={(e) => setInfo(e.target.value)} rows={7} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Checking" : "Check local visibility"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Describe a business above and its local-visibility check will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreDial score={result.score} />
            <div style={{ display: "flex", gap: 20 }}>
              {["fail", "warning", "pass"].map((s) => {
                const S = SEVERITY[s]; const Icon = S.icon;
                return <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon size={16} color={S.color} /><span style={{ fontSize: 13 }}>{counts[s] || 0} {S.label.toLowerCase()}</span></div>;
              })}
            </div>
          </div>
          <Divider /><SectionLabel>Checks</SectionLabel>
          <IssueList issues={result.checks} />
        </div>
      )}
    </div>
  );
}

/* ---------- Content ---------- */

function ContentOptimizeModule() {
  const [content, setContent] = useState(""); const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!content.trim()) { setError("Paste some content to optimize first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a GEO editor. Rewrite content so AI answer engines are more likely to extract or cite it - lead with a direct answer, add scannable structure, keep specific facts, add quotable self-contained statements - without inventing new claims. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"optimized": "rewritten content as plain text, may use markdown-style headers and lists", "changes": ["one sentence describing a specific change and why", ...]}
4 to 6 items in changes.`;
      setResult(parseJSON(await callClaude(system, `Target query: ${query || "(infer)"}\n\nOriginal:\n${content}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't complete the rewrite. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="co-query">Target query (optional)</FieldLabel>
        <input id="co-query" className="input" placeholder="e.g. how does compound interest work" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FieldLabel htmlFor="co-content" style={{ marginTop: 16 }}>Content to optimize</FieldLabel>
        <textarea id="co-content" className="textarea" style={{ marginTop: 6 }} placeholder="Paste the content you want rewritten..." value={content} onChange={(e) => setContent(e.target.value)} rows={9} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Rewriting" : "Optimize content"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Paste content above and the rewritten version will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Optimized version</SectionLabel>
          <div className="optimized-box">{result.optimized}</div>
          <Divider /><SectionLabel>What changed</SectionLabel>
          <ul className="rec-list">{result.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function ContentBriefModule() {
  const [topic, setTopic] = useState(""); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!topic.trim()) { setError("Enter a topic or target keyword first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a content strategist writing a brief for a writer. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"title_suggestions": [string, string, string], "outline": [{"heading": string, "notes": "one sentence on what to cover"}], "must_cover": [string, ...], "word_count_guidance": "one sentence"}
Outline should have 5 to 8 headings. must_cover should have 4 to 6 items (facts, subtopics, or questions the piece must address to be genuinely useful).`;
      setResult(parseJSON(await callClaude(system, `Topic / target keyword: ${topic}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't generate the brief. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="brief-topic">Topic or target keyword</FieldLabel>
        <input id="brief-topic" className="input" placeholder="e.g. how to choose a business bank account" value={topic} onChange={(e) => setTopic(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Drafting" : "Generate brief"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Enter a topic above and the brief will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Title options</SectionLabel>
          <ul className="rec-list">{result.title_suggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <Divider /><SectionLabel>Outline</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {result.outline.map((o, i) => (
              <div key={i}><p style={{ margin: 0, fontSize: 13.5 }}>{i + 1}. {o.heading}</p><p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>{o.notes}</p></div>
            ))}
          </div>
          <Divider /><SectionLabel>Must cover</SectionLabel>
          <ul className="rec-list">{result.must_cover.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <Divider />
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{result.word_count_guidance}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Social ---------- */

function SocialModule() {
  const [topic, setTopic] = useState(""); const [platform, setPlatform] = useState("LinkedIn");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const platforms = ["LinkedIn", "X", "Instagram", "TikTok"];
  const run = async () => {
    if (!topic.trim()) { setError("Enter a brand, product, or topic first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a social media strategist. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"ideas": [{"hook": "first line/hook, under 15 words", "caption": "the rest of the post, 2-4 sentences", "format": "e.g. carousel, short video, single image, thread"}]}
5 ideas, tailored to the given platform's norms and tone.`;
      setResult(parseJSON(await callClaude(system, `Platform: ${platform}\nBrand/product/topic: ${topic}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't generate ideas. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="soc-topic">Brand, product, or topic</FieldLabel>
        <input id="soc-topic" className="input" placeholder="e.g. a new cold-brew coffee launch" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <p className="field-label" style={{ marginTop: 16 }}>Platform</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {platforms.map((p) => <button key={p} className={"chip" + (platform === p ? " chip-active" : "")} onClick={() => setPlatform(p)} type="button">{p}</button>)}
        </div>
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run} style={{ marginTop: 18 }}>{loading ? "Writing" : "Generate post ideas"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Enter a topic above and post ideas will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Post ideas &middot; {platform}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {result.ideas.map((idea, i) => (
              <div key={i} className="issue-row" style={{ borderLeftColor: "var(--accent-amber)" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5 }}><span style={{ color: "var(--text-muted)" }}>{idea.format} &middot; </span>{idea.hook}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>{idea.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Advertising ---------- */

function AdvertisingModule() {
  const [offer, setOffer] = useState(""); const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!offer.trim()) { setError("Describe the product or offer first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a paid-ads copywriter. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"headlines": [string x5, each under 30 characters], "primary_texts": [string x3, each 1-2 sentences], "notes": [string, ...]}
notes should have 2 to 4 tactical suggestions (angle, targeting cue, or offer framing) - not generic advice.`;
      setResult(parseJSON(await callClaude(system, `Product/offer: ${offer}\nTarget audience: ${audience || "(not specified - infer a reasonable one)"}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't generate copy. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="ad-offer">Product or offer</FieldLabel>
        <textarea id="ad-offer" className="textarea" placeholder="What are you advertising, and what's the offer?" value={offer} onChange={(e) => setOffer(e.target.value)} rows={4} />
        <FieldLabel htmlFor="ad-audience" style={{ marginTop: 16 }}>Target audience (optional)</FieldLabel>
        <input id="ad-audience" className="input" placeholder="e.g. small business owners, 30-50" value={audience} onChange={(e) => setAudience(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Writing" : "Generate ad copy"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Describe an offer above and ad copy will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Headlines</SectionLabel>
          <ul className="rec-list">{result.headlines.map((h, i) => <li key={i}>{h}</li>)}</ul>
          <Divider /><SectionLabel>Primary text options</SectionLabel>
          <ul className="rec-list">{result.primary_texts.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <Divider /><SectionLabel>Notes</SectionLabel>
          <ul className="rec-list">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- AI PR ---------- */

function PRPitchModule() {
  const [story, setStory] = useState(""); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [result, setResult] = useState(null);
  const run = async () => {
    if (!story.trim()) { setError("Describe the company or story first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const system = `You are a PR strategist. Respond with ONLY valid JSON, no markdown fences, no commentary:
{"pitch_angles": [{"angle": "short phrase", "hook": "one sentence a journalist would care about", "beat": "the journalist beat this fits, e.g. fintech, local business, climate tech"}]}
5 distinct angles, grounded in what was actually described.`;
      setResult(parseJSON(await callClaude(system, `Company / story:\n${story}`)));
    } catch (e) { setError(rateAwareError(e, "Couldn't generate angles. Try again in a moment.")); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <div className="panel">
        <FieldLabel htmlFor="pr-story">Company, product, or story</FieldLabel>
        <textarea id="pr-story" className="textarea" placeholder="What's newsworthy about it? Include any real milestones, data, or angle you already have..." value={story} onChange={(e) => setStory(e.target.value)} rows={6} />
        {error && <p className="error-text">{error}</p>}
        <PrimaryButton loading={loading} onClick={run}>{loading ? "Drafting" : "Generate pitch angles"}</PrimaryButton>
      </div>
      {loading && <ResultSkeleton />}
      {!loading && !result && <EmptyState text="Describe a story above and pitch angles will land here." />}
      {result && (
        <div className="panel" style={{ marginTop: 24 }}>
          <SectionLabel>Pitch angles</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {result.pitch_angles.map((p, i) => (
              <div key={i} className="issue-row" style={{ borderLeftColor: "var(--accent-teal)" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5 }}><span style={{ color: "var(--text-muted)" }}>{p.beat} &middot; </span>{p.angle}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>{p.hook}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Enterprise (static placeholder, not wired to any backend) ---------- */

function EnterpriseModule() {
  const features = [
    "Single sign-on (SSO) and role-based access for teams",
    "Dedicated support with a guaranteed response-time SLA",
    "Custom data retention and export controls",
    "Multiple workspaces with centralized billing",
    "Usage analytics across your whole team",
  ];
  return (
    <div className="panel">
      <SectionLabel>What's included</SectionLabel>
      <ul className="rec-list">{features.map((f, i) => <li key={i}>{f}</li>)}</ul>
      <Divider />
      <a className="btn-primary" style={{ textDecoration: "none", display: "inline-flex" }} href="mailto:sales@example.com">
        <Mail size={16} />Contact sales
      </a>
      <DemoNote>This is a placeholder page - none of it is wired to real billing, SSO, or support infrastructure. Swap the mailto address and build out the rest when you're ready to sell an enterprise tier.</DemoNote>
    </div>
  );
}

/* ---------- navigation + app shell ---------- */

const GROUPS = [
  { id: "seo", label: "SEO + AI search", icon: Radar, items: [
    { id: "audit", label: "Site audit", Component: SiteAuditModule, blurb: "Paste a page's content or HTML and get a technical + content health report." },
    { id: "keywords", label: "Keywords", Component: KeywordsModule, blurb: "Research keyword opportunities around a topic, with intent and difficulty." },
    { id: "backlinks", label: "Backlinks", Component: BacklinksModule, blurb: "A sample referring-domain and authority profile for a site." },
  ]},
  { id: "visibility", label: "AI visibility", icon: Quote, items: [
    { id: "citation-audit", label: "Citation audit", Component: CitationAuditModule, blurb: "Score content on how likely an AI answer engine is to cite it." },
    { id: "citation-track", label: "Citation tracking", Component: CitationTrackModule, blurb: "See a sample citation-visibility report across AI engines." },
  ]},
  { id: "traffic", label: "Traffic & market", icon: TrendingUp, items: [
    { id: "competitors", label: "Competitors", Component: CompetitorsModule, blurb: "Compare your positioning against a competitor's, side by side." },
    { id: "market", label: "Market snapshot", Component: () => (
      <DemoTrendModule inputLabel="Market or industry" inputPlaceholder="e.g. project management software"
        buttonLabel="Generate sample snapshot" chartLabel="Estimated share of voice, last 8 periods" seedSalt="market"
        statFields={[{ label: "Est. market share", min: 2, max: 35 }, { label: "Category growth", min: -5, max: 40 }, { label: "Active competitors tracked", min: 4, max: 60 }]}
        note="Illustrative sample data. Real market sizing needs a licensed data provider or your own traffic panel." />
    ), blurb: "A sample market share and growth snapshot for a category." },
  ]},
  { id: "local", label: "Local", icon: MapPin, items: [
    { id: "local-check", label: "Local visibility", Component: LocalModule, blurb: "Check how ready a business is to show up in local and \"near me\" AI answers." },
  ]},
  { id: "content", label: "Content", icon: FileText, items: [
    { id: "brief", label: "Content brief", Component: ContentBriefModule, blurb: "Turn a topic into a structured outline and must-cover checklist." },
    { id: "optimize", label: "Optimize", Component: ContentOptimizeModule, blurb: "Rewrite content to be more extractable and quotable by AI models." },
  ]},
  { id: "social", label: "Social", icon: MessageCircle, items: [
    { id: "social-ideas", label: "Post ideas", Component: SocialModule, blurb: "Generate platform-tailored post ideas for a brand or topic." },
  ]},
  { id: "advertising", label: "Advertising", icon: Megaphone, items: [
    { id: "ad-copy", label: "Ad copy", Component: AdvertisingModule, blurb: "Generate headline and primary-text options for a paid ad." },
  ]},
  { id: "pr", label: "AI PR", icon: Mic2, items: [
    { id: "pitch", label: "Pitch angles", Component: PRPitchModule, blurb: "Generate journalist-ready pitch angles for a company or story." },
    { id: "mentions", label: "Mention tracker", Component: () => (
      <DemoTrendModule inputLabel="Brand or company name" inputPlaceholder="e.g. Northwind Analytics"
        buttonLabel="Generate sample report" chartLabel="Mentions, last 8 periods" seedSalt="pr"
        statFields={[{ label: "Total mentions", min: 5, max: 400 }, { label: "Positive sentiment %", min: 30, max: 90 }, { label: "Outlets reached", min: 2, max: 50 }]}
        note="Illustrative sample data. Real media monitoring needs a news/social listening API." />
    ), blurb: "A sample media-mention volume and sentiment report." },
  ]},
  { id: "enterprise", label: "Enterprise", icon: Building2, items: [
    { id: "overview", label: "Overview", Component: EnterpriseModule, blurb: "Team features for larger organizations." },
  ]},
];

export default function App() {
  const [groupId, setGroupId] = useState(GROUPS[0].id);
  const [itemId, setItemId] = useState(GROUPS[0].items[0].id);
  const group = GROUPS.find((g) => g.id === groupId);
  const item = group.items.find((i) => i.id === itemId) || group.items[0];
  const Active = item.Component;

  const selectGroup = (g) => { setGroupId(g.id); setItemId(g.items[0].id); };

  return (
    <div className="verity-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Archivo:wght@400;500;600;700&display=swap');
        .verity-app {
          --bg: #0E1512; --surface: #141F1A; --surface-alt: #1B2A23; --text: #EDEAE0; --text-muted: #8FA396;
          --accent-amber: #C9A24B; --accent-brass: var(--accent-amber); --accent-teal: #4FA88A; --border: #2A3D34; --border-strong: #3A5245;
          --sev-critical: #C1614A; --sev-warning: #C9A24B; --sev-pass: #4FA88A;
          --on-brass: #221A08;
          background: var(--bg); color: var(--text); font-family: 'Archivo', sans-serif; min-height: 100vh; display: flex;
        }
        .verity-app *:focus-visible { outline: 2px solid var(--accent-brass); outline-offset: 2px; border-radius: 3px; }
        .font-display { font-family: 'Newsreader', serif; font-weight: 500; }
        .sidebar { width: 232px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 26px 14px; box-sizing: border-box; overflow-y: auto; }
        .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 24px; }
        .brand-mark { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border-strong); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .brand-text { font-family: 'Newsreader', serif; font-weight: 500; font-size: 20px; letter-spacing: 0.2px; }
        .group-btn { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: none; border-left: 2px solid transparent; color: var(--text-muted); font-family: 'Archivo', sans-serif; font-size: 13.5px; padding: 9px 8px; cursor: pointer; text-align: left; margin-bottom: 1px; transition: color 0.15s ease, border-color 0.15s ease; }
        .group-btn:hover { color: var(--text); }
        .group-btn.active { color: var(--text); border-left-color: var(--accent-brass); }
        .group-btn.active svg { color: var(--accent-brass); }
        .item-list { margin: 2px 0 12px 12px; padding-left: 18px; border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 1px; }
        .item-btn { background: none; border: none; color: var(--text-muted); font-family: 'Archivo', sans-serif; font-size: 13px; padding: 6px 8px; border-radius: 4px; cursor: pointer; text-align: left; transition: color 0.15s ease; }
        .item-btn:hover { color: var(--text); }
        .item-btn.active { color: var(--accent-brass); }
        .main { flex: 1; padding: 32px 32px 64px; min-width: 0; }
        .main-shell { max-width: 720px; margin: 0 auto; }
        .main-header { display: flex; align-items: center; gap: 10px; }
        .main-title { font-family: 'Newsreader', serif; font-weight: 500; font-size: 23px; margin: 0; }
        .main-blurb { color: var(--text-muted); font-size: 14px; margin: 10px 0 26px; max-width: 60ch; line-height: 1.55; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 22px; }
        .field-label { display: block; font-size: 12.5px; color: var(--text-muted); margin: 0 0 6px; }
        .input, .textarea { width: 100%; box-sizing: border-box; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font-family: 'Archivo', sans-serif; font-size: 14px; padding: 10px 12px; outline: none; margin-bottom: 4px; transition: border-color 0.15s ease; }
        .input:focus, .textarea:focus { border-color: var(--accent-brass); }
        .textarea { resize: vertical; line-height: 1.5; }
        .btn-primary { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; background: var(--accent-brass); color: var(--on-brass); border: none; border-radius: 5px; font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 14px; padding: 10px 18px; cursor: pointer; transition: opacity 0.15s ease, transform 0.1s ease; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:active { transform: scale(0.97); }
        .btn-primary:disabled { opacity: 0.65; cursor: default; }
        .btn-primary.is-loading span:last-child { opacity: 0.85; }
        .btn-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--on-brass); animation: pulse 1.1s ease-in-out infinite; flex-shrink: 0; }
        @keyframes pulse { 0%, 100% { opacity: 0.35; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        .error-text { color: #E0917E; font-size: 13px; margin: 8px 0 0; }
        .divider { border-top: 1px solid var(--border); margin: 22px 0; }
        .section-label { font-size: 12.5px; color: var(--text-muted); margin: 0 0 12px; }
        .bar-track { height: 6px; background: var(--surface-alt); border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--accent-brass); }
        .rec-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
        .rec-list li { font-size: 13.5px; line-height: 1.5; }
        .optimized-box { white-space: pre-wrap; font-size: 14px; line-height: 1.65; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 6px; padding: 16px; max-height: 400px; overflow-y: auto; }
        .chip { background: var(--surface-alt); border: 1px solid var(--border); color: var(--text-muted); font-family: 'Archivo', sans-serif; font-size: 13px; padding: 6px 12px; border-radius: 20px; cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease; }
        .chip:hover { border-color: var(--border-strong); }
        .chip-active { border-color: var(--accent-brass); color: var(--accent-brass); }
        .demo-note { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; line-height: 1.5; }
        .issue-row { display: flex; gap: 10px; border-left: 2px solid; padding: 4px 0 4px 12px; }
        .kw-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
        .kw-row:hover { border-color: var(--border-strong); }
        .kw-row-active { border-color: var(--accent-brass); background: var(--surface-alt); }
        .tag { font-size: 11px; padding: 3px 8px; border-radius: 12px; background: var(--surface-alt); color: var(--text-muted); }
        .tag-diff-low { color: var(--sev-pass); } .tag-diff-medium { color: var(--sev-warning); } .tag-diff-high { color: var(--sev-critical); }
        .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .stat-grid { display: grid; gap: 12px; }
        .stat-card { background: var(--surface-alt); border-radius: 6px; padding: 14px 16px; }
        .stat-label { font-size: 12px; color: var(--text-muted); margin: 0 0 6px; }
        .stat-value { font-family: 'Newsreader', serif; font-size: 24px; margin: 0; }
        .dial-ring { transition: stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1); }
        .empty-state { display: flex; align-items: flex-start; gap: 10px; padding: 20px 4px; color: var(--text-muted); }
        .empty-mark { font-family: 'Newsreader', serif; font-size: 16px; color: var(--border-strong); line-height: 1.5; }
        .empty-state p { margin: 0; font-size: 13.5px; line-height: 1.6; max-width: 42ch; }
        .skeleton-panel { display: flex; flex-direction: column; }
        .skeleton-row { border-radius: 4px; background: linear-gradient(90deg, var(--surface-alt) 25%, var(--border) 50%, var(--surface-alt) 75%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (max-width: 860px) {
          .verity-app { flex-direction: column; }
          .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border); padding: 16px; display: flex; flex-direction: column; }
          .brand { padding: 0 4px 14px; }
          .sidebar > div { display: contents; }
          .item-list { margin: 2px 0 8px 0; padding-left: 12px; }
          .main { padding: 24px 20px 48px; }
        }
      `}</style>

      <div className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Quote size={14} color="var(--accent-brass)" /></div>
          <span className="brand-text">Verity</span>
        </div>
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const isActiveGroup = g.id === groupId;
          return (
            <div key={g.id}>
              <button className={"group-btn" + (isActiveGroup ? " active" : "")} onClick={() => selectGroup(g)}>
                <Icon size={16} />{g.label}
              </button>
              {isActiveGroup && (
                <div className="item-list">
                  {g.items.map((i) => (
                    <button key={i.id} className={"item-btn" + (i.id === itemId ? " active" : "")} onClick={() => setItemId(i.id)}>{i.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="main">
        <div className="main-shell">
          <div className="main-header"><p className="main-title">{item.label}</p></div>
          <p className="main-blurb">{item.blurb}</p>
          <Active />
        </div>
      </div>
    </div>
  );
}
