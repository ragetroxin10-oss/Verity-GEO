import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rateLimit";

const MAX_INPUT_CHARS = 20000;

async function callOpenAICompatible(baseUrl, model, system, userText, maxTokens, apiKey, providerName) {
  const upstream = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new UpstreamError(upstream.status, detail, providerName, model);
  }

  const data = await upstream.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(system, userText, maxTokens, apiKey) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new UpstreamError(upstream.status, detail, "anthropic", model);
  }

  const data = await upstream.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

class UpstreamError extends Error {
  constructor(status, detail, provider, model) {
    super("Upstream request failed (" + status + ")");
    this.status = status;
    this.detail = detail;
    this.provider = provider;
    this.model = model;
  }
}

export async function POST(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { system, userText, maxTokens } = body || {};
  if (!system || !userText || typeof system !== "string" || typeof userText !== "string") {
    return NextResponse.json({ error: "Missing system or userText." }, { status: 400 });
  }
  if (userText.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: "Input is too long (max " + MAX_INPUT_CHARS + " characters)." },
      { status: 400 }
    );
  }

  const clampedMaxTokens = Math.min(Math.max(parseInt(maxTokens, 10) || 1500, 200), 2000);
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();

  try {
    let text;
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error("[/api/claude] Missing ANTHROPIC_API_KEY");
        return NextResponse.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
      }
      text = await callAnthropic(system, userText, clampedMaxTokens, apiKey);
    } else if (provider === "cerebras") {
      const apiKey = process.env.CEREBRAS_API_KEY;
      if (!apiKey) {
        console.error("[/api/claude] Missing CEREBRAS_API_KEY");
        return NextResponse.json({ error: "Server is missing CEREBRAS_API_KEY." }, { status: 500 });
      }
      const model = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
      text = await callOpenAICompatible("https://api.cerebras.ai/v1/chat/completions", model, system, userText, clampedMaxTokens, apiKey, "cerebras");
    } else {
      // groq (default) - free tier, no credit card required
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        console.error("[/api/claude] Missing GROQ_API_KEY");
        return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });
      }
      const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      text = await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", model, system, userText, clampedMaxTokens, apiKey, "groq");
    }
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[/api/claude] ${err.provider} (${err.model}) failed with status ${err.status}:`, err.detail);
      const status = err.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "Model request failed." }, { status });
    }
    console.error("[/api/claude] Unexpected error:", err);
    return NextResponse.json({ error: "Request to the model failed." }, { status: 500 });
  }
}
