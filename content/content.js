// Promptly — content script
// Detects which LLM site we're on, finds the chat input, and injects the optimizer button.

const SITES = {
  'claude.ai': {
    name: 'Claude',
    getInput: () =>
      document.querySelector('div[contenteditable="true"][data-testid="chat-input"]') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector('div[contenteditable="true"]'),
    getInputText: (el) => el.innerText.trim(),
    setInputText: (el, text) => {
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, text);
    },
    getButtonContainer: () =>
      document.querySelector('div[data-testid="chat-input-footer"]') ||
      document.querySelector('fieldset') ||
      document.querySelector('form'),
  },
  'chatgpt.com': {
    name: 'ChatGPT',
    getInput: () =>
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"]'),
    getInputText: (el) =>
      el.tagName === 'TEXTAREA' ? el.value.trim() : el.innerText.trim(),
    setInputText: (el, text) => {
      if (el.tagName === 'TEXTAREA') {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, text);
      }
    },
    getButtonContainer: () =>
      document.querySelector('div[class*="flex"][class*="bottom"]') ||
      document.querySelector('form'),
  },
  'chat.openai.com': {
    name: 'ChatGPT',
    getInput: () =>
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"]'),
    getInputText: (el) =>
      el.tagName === 'TEXTAREA' ? el.value.trim() : el.innerText.trim(),
    setInputText: (el, text) => {
      if (el.tagName === 'TEXTAREA') {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, text);
      }
    },
    getButtonContainer: () =>
      document.querySelector('form'),
  },
  'gemini.google.com': {
    name: 'Gemini',
    getInput: () =>
      document.querySelector('rich-textarea .ql-editor') ||
      document.querySelector('div[contenteditable="true"]'),
    getInputText: (el) => el.innerText.trim(),
    setInputText: (el, text) => {
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, text);
    },
    getButtonContainer: () =>
      document.querySelector('div.input-area-container') ||
      document.querySelector('div[class*="input-area"]') ||
      document.querySelector('form'),
  },
};

// ─── Identify current site ────────────────────────────────────────────────────
const hostname = location.hostname;
const site = Object.keys(SITES).find((key) => hostname.includes(key));
if (!site) throw new Error('Promptly: unsupported site');

const siteConfig = SITES[site];

// ─── Overlay injection ────────────────────────────────────────────────────────
let overlayEl = null;

function createOverlay() {
  const el = document.createElement('div');
  el.id = 'promptly-overlay';
  el.innerHTML = `
    <div id="promptly-panel">
      <div id="promptly-header">
        <span id="promptly-logo">⚡ Promptly</span>
        <button id="promptly-close" title="Close">✕</button>
      </div>

      <div id="promptly-original-section">
        <label>Your prompt</label>
        <textarea id="promptly-original" rows="4" placeholder="Your prompt will appear here…"></textarea>
      </div>

      <div id="promptly-modes">
        <button class="mode-btn active" data-mode="clarity">✨ Rewrite for Clarity</button>
        <button class="mode-btn" data-mode="context">🎯 Add Context</button>
        <button class="mode-btn" data-mode="alternatives">🔀 Alternatives</button>
      </div>

      <button id="promptly-optimize-btn">Optimize Prompt</button>

      <div id="promptly-results-section" style="display:none">
        <label>Optimized prompt</label>
        <div id="promptly-results"></div>
      </div>

      <div id="promptly-api-note" style="display:none">
        <span>⚠️ Add your API key in the extension popup to enable optimization.</span>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  // Mode selection
  let selectedMode = 'clarity';
  el.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
    });
  });

  // Close
  el.querySelector('#promptly-close').addEventListener('click', closeOverlay);
  el.addEventListener('click', (e) => { if (e.target === el) closeOverlay(); });

  // Optimize
  el.querySelector('#promptly-optimize-btn').addEventListener('click', async () => {
    const prompt = el.querySelector('#promptly-original').value.trim();
    if (!prompt) return;
    await runOptimization(prompt, selectedMode);
  });

  return el;
}

function openOverlay() {
  if (!overlayEl) overlayEl = createOverlay();

  // Pre-fill current prompt
  const input = siteConfig.getInput();
  const currentText = input ? siteConfig.getInputText(input) : '';
  overlayEl.querySelector('#promptly-original').value = currentText;
  overlayEl.querySelector('#promptly-results-section').style.display = 'none';
  overlayEl.querySelector('#promptly-api-note').style.display = 'none';
  overlayEl.style.display = 'flex';
}

function closeOverlay() {
  if (overlayEl) overlayEl.style.display = 'none';
}

// ─── Optimization logic ───────────────────────────────────────────────────────
async function runOptimization(prompt, mode) {
  const btn = overlayEl.querySelector('#promptly-optimize-btn');
  const resultsSection = overlayEl.querySelector('#promptly-results-section');
  const resultsEl = overlayEl.querySelector('#promptly-results');
  const apiNote = overlayEl.querySelector('#promptly-api-note');

  btn.disabled = true;
  btn.textContent = 'Optimizing…';
  resultsSection.style.display = 'none';
  apiNote.style.display = 'none';

  try {
    // Send to background for API call
    const response = await chrome.runtime.sendMessage({
      type: 'OPTIMIZE_PROMPT',
      payload: { prompt, mode, site: siteConfig.name },
    });

    if (response.error === 'NO_API_KEY') {
      apiNote.style.display = 'block';
      return;
    }

    if (response.error) {
      resultsEl.innerHTML = `<div class="result-card error">Error: ${response.error}</div>`;
      resultsSection.style.display = 'block';
      return;
    }

    if (mode === 'alternatives') {
      // Render multiple cards
      const alternatives = response.results;
      resultsEl.innerHTML = alternatives
        .map(
          (text, i) => `
          <div class="result-card">
            <div class="result-card-label">Option ${i + 1}</div>
            <div class="result-card-text">${escapeHtml(text)}</div>
            <button class="use-btn" data-text="${escapeAttr(text)}">Use this ↗</button>
          </div>`
        )
        .join('');
    } else {
      resultsEl.innerHTML = `
        <div class="result-card">
          <div class="result-card-text">${escapeHtml(response.result)}</div>
          <button class="use-btn" data-text="${escapeAttr(response.result)}">Use this ↗</button>
        </div>`;
    }

    resultsSection.style.display = 'block';

    // Wire up "Use this" buttons
    resultsEl.querySelectorAll('.use-btn').forEach((useBtn) => {
      useBtn.addEventListener('click', () => {
        const text = useBtn.dataset.text;
        const input = siteConfig.getInput();
        if (input) siteConfig.setInputText(input, text);
        closeOverlay();
      });
    });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Optimize Prompt';
  }
}

// ─── Button injection ─────────────────────────────────────────────────────────
function injectButton() {
  if (document.getElementById('promptly-trigger-btn')) return;

  const input = siteConfig.getInput();
  if (!input) return;

  const btn = document.createElement('button');
  btn.id = 'promptly-trigger-btn';
  btn.title = 'Open Promptly prompt optimizer';
  btn.innerHTML = '⚡';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openOverlay();
  });

  // Try to insert near the send button / form
  const container = siteConfig.getButtonContainer();
  if (container) {
    container.style.position = container.style.position || 'relative';
    container.appendChild(btn);
  } else {
    // Fallback: position near input
    const rect = input.getBoundingClientRect();
    btn.style.position = 'fixed';
    btn.style.top = `${rect.top + window.scrollY}px`;
    btn.style.left = `${rect.right + 8}px`;
    document.body.appendChild(btn);
  }
}

// ─── Observe DOM for SPA navigation ──────────────────────────────────────────
let retries = 0;
const MAX_RETRIES = 20;

function tryInject() {
  injectButton();
  const input = siteConfig.getInput();
  if (!input && retries < MAX_RETRIES) {
    retries++;
    setTimeout(tryInject, 500);
  }
}

// MutationObserver to re-inject after SPA nav
const observer = new MutationObserver(() => {
  if (!document.getElementById('promptly-trigger-btn')) {
    retries = 0;
    tryInject();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
tryInject();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
