/**
 * openrouter.js — Thin wrapper around the OpenRouter chat completions API.
 */
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function buildHeaders(apiKey, siteUrl, siteName) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (siteName) headers["X-Title"] = siteName;
  return headers;
}

export async function chatComplete({ apiKey, model, messages, systemPrompt, maxTokens = 1024, temperature = 0.7, siteUrl = "", siteName = "" }) {
  const payload = {
    model, max_tokens: maxTokens, temperature,
    messages: systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages,
  };
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST", headers: buildHeaders(apiKey, siteUrl, siteName), body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.error) throw new Error(`OpenRouter returned error: ${JSON.stringify(data.error)}`);
  return data.choices?.[0]?.message?.content ?? "";
}

export async function chatStream({ apiKey, model, messages, systemPrompt, maxTokens = 1024, temperature = 0.7, siteUrl = "", siteName = "", onToken }) {
  const payload = {
    model, max_tokens: maxTokens, temperature, stream: true,
    messages: systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages,
  };
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST", headers: buildHeaders(apiKey, siteUrl, siteName), body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenRouter stream error ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const json = line.slice(6).trim();
      if (json === "[DONE]") break;
      try {
        const token = JSON.parse(json).choices?.[0]?.delta?.content ?? "";
        if (token) { full += token; onToken?.(token); }
      } catch { /* partial chunk */ }
    }
  }
  return full;
}
