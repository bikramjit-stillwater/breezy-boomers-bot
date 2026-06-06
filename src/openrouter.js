/**
 * openrouter.js — Thin wrapper around the OpenRouter chat completions API
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Send a chat completion request via OpenRouter.
 *
 * @param {object} opts
 * @param {string}   opts.apiKey        OpenRouter API key
 * @param {string}   opts.model         e.g. "anthropic/claude-sonnet-4-5"
 * @param {object[]} opts.messages      OpenAI-format messages array
 * @param {string}   [opts.systemPrompt] Optional system message (prepended)
 * @param {number}   [opts.maxTokens]   Default 1024
 * @param {number}   [opts.temperature] Default 0.7
 * @param {string}   [opts.siteUrl]     For OpenRouter rankings
 * @param {string}   [opts.siteName]
 * @returns {Promise<string>} The assistant reply text
 */
export async function chatComplete({
  apiKey,
  model,
  messages,
  systemPrompt,
  maxTokens = 1024,
  temperature = 0.7,
  siteUrl = "",
  siteName = "",
}) {
  const payload = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages,
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (siteName) headers["X-Title"] = siteName;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`OpenRouter returned error: ${JSON.stringify(data.error)}`);
  }

  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Stream a chat completion via OpenRouter (SSE).
 * Calls onToken(token) for each streamed chunk.
 * Returns the full assembled response string when done.
 */
export async function chatStream({
  apiKey,
  model,
  messages,
  systemPrompt,
  maxTokens = 1024,
  temperature = 0.7,
  siteUrl = "",
  siteName = "",
  onToken,
}) {
  const payload = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages: systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages,
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (siteName) headers["X-Title"] = siteName;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter stream error ${res.status}: ${errBody}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const json = line.slice(6).trim();
      if (json === "[DONE]") break;
      try {
        const obj = JSON.parse(json);
        const token = obj.choices?.[0]?.delta?.content ?? "";
        if (token) {
          full += token;
          if (onToken) onToken(token);
        }
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }

  return full;
}
