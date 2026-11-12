// Turns a Korean request ("문 쪽 벽에 코너형 넣어줘") into planner operations with Claude.
// The API key stays here on the server (ANTHROPIC_API_KEY); the page only sends the request text
// and the planner state. A shared passcode (PAX_PASSCODE) keeps strangers with the URL from
// spending the key.
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { RULES } from "../lib/rules.js";

const MODEL = "claude-opus-5-5";
const MAX_TEXT = 600;      // characters of request text
const MAX_STATE = 40000;   // characters of planner state JSON

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

function passOk(given) {
  const want = process.env.PAX_PASSCODE || "";
  if (!want || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Accept the whole reply as JSON, else a fenced block, else the outermost {...}.
function parseReply(text) {
  const tries = [text];
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) tries.push(fence[1]);
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i >= 0 && j > i) tries.push(text.slice(i, j + 1));
  for (const t of tries) {
    try { const v = JSON.parse(t); if (v && typeof v === "object") return v; } catch { /* next */ }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const keySet = !!process.env.ANTHROPIC_API_KEY, passSet = !!process.env.PAX_PASSCODE;

  if (req.method === "GET") return res.status(200).json({ keySet, passSet });
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!keySet || !passSet) return res.status(503).json({ error: "not_configured" });
  if (!passOk(req.headers["x-pax-pass"])) return res.status(401).json({ error: "bad_pass" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const text = String(body?.text ?? "").trim();
  if (!text || text.length > MAX_TEXT) return res.status(400).json({ error: "bad_text" });
  const stateJson = JSON.stringify(body?.state ?? {});
  if (stateJson.length > MAX_STATE) return res.status(413).json({ error: "state_too_large" });

  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      // If a safety classifier declines, the API re-runs the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: RULES, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `현재 상태(JSON):\n${stateJson}\n\n사용자 요청: ${text}` }],
    });

    if (msg.stop_reason === "refusal") {
      return res.status(200).json({ reply: "이 요청은 처리하지 않았습니다. 다르게 적어 보세요.", ops: [] });
    }
    const out = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const data = parseReply(out);
    if (!data) return res.status(502).json({ error: "invalid_json" });
    console.log(JSON.stringify({ ok: true, model: msg.model, usage: msg.usage, request_id: msg._request_id }));
    return res.status(200).json({
      reply: String(data.reply ?? ""),
      ops: Array.isArray(data.ops) ? data.ops.slice(0, 40) : [],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("anthropic auth", err.status, err.message);
      return res.status(503).json({ error: "not_configured" });
    }
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic api", err.status, err.message);
      return res.status(502).json({ error: "upstream", status: err.status ?? null });
    }
    console.error("server", err);
    return res.status(500).json({ error: "server" });
  }
}
