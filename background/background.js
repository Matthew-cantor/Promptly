// Promptera — background service worker
// Handles API calls so we can safely store keys in chrome.storage and avoid CORS issues.

const GEMINI_API_KEY = 'placeholder';

const SYSTEM_PROMPTS = {
  clarity: `You are an expert prompt engineer.
Rewrite the user's prompt to be clearer, more specific, and more likely to get a high-quality response from an AI assistant.
- Fix ambiguity
- Be concise but complete
- Use direct language
Return ONLY the rewritten prompt, no commentary.`,

  context: `You are an expert prompt engineer.
Enhance the user's prompt by adding useful context, specifying the desired format, tone, and role for the AI.
- Add a role if helpful (e.g., "You are an expert in...")
- Specify output format if relevant
- Clarify any implicit assumptions
Return ONLY the enhanced prompt, no commentary.`,

  alternatives: `You are an expert prompt engineer.
Generate 3 distinct, high-quality alternative versions of the user's prompt. Each version should take a slightly different angle or framing while preserving the original intent.
Return ONLY the 3 alternatives, each on a new line, separated by "---".
No labels, no commentary, just the prompts separated by ---.`,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPTIMIZE_PROMPT') {
    handleOptimize(message.payload).then(sendResponse).catch((err) =>
      sendResponse({ error: err.message })
    );
    return true; // keep channel open for async response
  }
});

async function handleOptimize({ prompt, mode }) {
  // Gemini key is bundled — no storage or provider lookup needed.
  return callGemini(GEMINI_API_KEY, prompt, mode);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(apiKey, prompt, mode) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[mode] }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text.trim();
  return parseResult(text, mode);
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────
async function callOpenAI(apiKey, prompt, mode) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[mode] },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices[0].message.content.trim();
  return parseResult(text, mode);
}

// ─── Anthropic ────────────────────────────────────────────────────────────────
async function callAnthropic(apiKey, prompt, mode) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPTS[mode],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  return parseResult(text, mode);
}

// ─── Parse result ─────────────────────────────────────────────────────────────
function parseResult(text, mode) {
  if (mode === 'alternatives') {
    const parts = text.split(/\n---\n|^---$/m).map((s) => s.trim()).filter(Boolean);
    return { results: parts.length >= 2 ? parts : [text] };
  }
  return { result: text };
}
