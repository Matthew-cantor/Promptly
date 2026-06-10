// Promptera — background service worker
// Handles API calls so we can safely store keys in chrome.storage and avoid CORS issues.

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
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  if (!geminiApiKey) {
    throw new Error('No API key set. Click the Promptera icon to add your Gemini API key.');
  }
  return callGemini(geminiApiKey, prompt, mode);
}

async function callGemini(apiKey, prompt, mode) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPTS[mode] + '\n\n' + prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(err) || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text.trim();
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
