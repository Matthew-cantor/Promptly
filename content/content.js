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
    getButtonContainer: () => {
      // Right-side trailing actions in the composer footer (mic + send). The send
      // button only renders once you've typed, so also anchor on the always-present
      // mic/voice button. Return null (never <form>) when the footer hasn't mounted
      // yet, so the MutationObserver retries instead of pinning ⚡ to the bottom-left.
      const trailing = document.querySelector('[data-testid="composer-trailing-actions"]');
      if (trailing) return trailing;
      const anchorBtn =
        document.querySelector('[data-testid="send-button"]') ||
        document.querySelector('[data-testid="composer-speech-button"]') ||
        document.querySelector('button[aria-label="Start voice mode"]') ||
        document.querySelector('button[aria-label="Dictate button"]');
      return anchorBtn ? anchorBtn.parentElement : null;
    },
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
    getButtonContainer: () => {
      // Mirror chatgpt.com: anchor on the always-present mic/voice button (and the
      // trailing-actions wrapper), returning null rather than <form> until mounted.
      const trailing = document.querySelector('[data-testid="composer-trailing-actions"]');
      if (trailing) return trailing;
      const anchorBtn =
        document.querySelector('[data-testid="send-button"]') ||
        document.querySelector('[data-testid="composer-speech-button"]') ||
        document.querySelector('button[aria-label="Start voice mode"]') ||
        document.querySelector('button[aria-label="Dictate button"]');
      return anchorBtn ? anchorBtn.parentElement : null;
    },
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
      <div id="promptly-grain"></div>

      <header id="promptly-header">
        <div id="promptly-brand">
          <span id="promptly-logo"><img src="${chrome.runtime.getURL('icons/Icon.png')}" alt="" /></span>
          <span id="promptly-titles">
            <span id="promptly-wordmark">Promptly</span>
            <span id="promptly-tagline">AI&nbsp;PROMPT&nbsp;OPTIMIZER</span>
          </span>
        </div>
        <button id="promptly-close" title="Close" aria-label="Close">✕</button>
      </header>

      <div id="promptly-body">
        <section id="promptly-original-section">
          <label for="promptly-original">Input · your prompt</label>
          <textarea id="promptly-original" rows="4" placeholder="Paste or type the prompt you want to refine…"></textarea>
        </section>

        <section id="promptly-modes-section">
          <label>Optimization mode</label>
          <div id="promptly-modes">
            <button class="mode-btn active" data-mode="clarity">
              <span class="mode-idx">01</span>
              <span class="mode-name">Rewrite</span>
              <span class="mode-desc">Specificity &amp; concision</span>
            </button>
            <button class="mode-btn" data-mode="context">
              <span class="mode-idx">02</span>
              <span class="mode-name">Add Context</span>
              <span class="mode-desc">Role, format &amp; tone</span>
            </button>
            <button class="mode-btn" data-mode="alternatives">
              <span class="mode-idx">03</span>
              <span class="mode-name">Alternatives</span>
              <span class="mode-desc">Three variants</span>
            </button>
          </div>
        </section>

        <button id="promptly-optimize-btn">Optimize Prompt</button>

        <section id="promptly-results-section" style="display:none">
          <label>Output · optimized</label>
          <div id="promptly-results"></div>
        </section>

        <div id="promptly-api-note" style="display:none">
          <span class="note-bar"></span>
          <span>Add your API key in the extension popup to enable optimization.</span>
        </div>
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
      apiNote.style.display = 'flex';
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
  btn.innerHTML = `<img src="${chrome.runtime.getURL('icons/Icon.png')}" alt="Promptly" />`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openOverlay();
  });

  // Insert into the composer's trailing-actions group (right side of the bar).
  // If the container isn't there yet, bail without injecting — the MutationObserver
  // will call back once it mounts, rather than stranding ⚡ in a fixed-position spot.
  const container = siteConfig.getButtonContainer();
  if (!container) return;
  container.style.position = container.style.position || 'relative';
  container.appendChild(btn);
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
