import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rateLimit";

const MAX_INPUT_CHARS = 20000;

async function callCerebras(system, userText, maxTokens, apiKey) {
  const upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new UpstreamError(upstream.status, detail);
  }

  const data = await upstream.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(system, userText, maxTokens, apiKey) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new UpstreamError(upstream.status, detail);
  }

  const data = await upstream.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

class UpstreamError extends Error {
  constructor(status, detail) {
    super("Upstream request failed (" + status + ")");
    this.status = status;
    this.detail = detail;
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

  // AI_PROVIDER selects which backend serves every request. Defaults to
  // Cerebras (free tier, genuinely usable in production - see README).
  // Set AI_PROVIDER=anthropic to use Claude instead.
  const provider = (process.env.AI_PROVIDER || "cerebras").toLowerCase();

  try {
    let text;
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Server is missing ANTHROPIC_API_KEY." },
          { status: 500 }
        );
      }
      text = await callAnthropic(system, userText, clampedMaxTokens, apiKey);
    } else {
      const apiKey = process.env.CEREBRAS_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Server is missing CEREBRAS_API_KEY." },
          { status: 500 }
        );
      }
      text = await callCerebras(system, userText, clampedMaxTokens, apiKey);
    }
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof UpstreamError) {
      // 429 from the provider itself (their own free-tier rate limit) -
      // surface it distinctly so the frontend can show the same
      // rate-limit message it shows for our own limiter.
      const status = err.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "Model request failed." }, { status });
    }
    return NextResponse.json({ error: "Request to the model failed." }, { status: 500 });
  }
}
