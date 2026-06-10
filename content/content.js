// Promptera — content script
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
    buttonClass: 'promptera-btn--claude',
    // Anchor = the mic/dictation button in the input's bottom-right action group.
    // ⚡ is inserted BEFORE it (to its left). Falls back to the send button.
    getButtonAnchor: () =>
      document.querySelector('button[aria-label="Dictate button"]') ||
      document.querySelector('button[aria-label*="dictation" i]') ||
      document.querySelector('button[aria-label*="voice" i]') ||
      document.querySelector('button[aria-label="Send message" i]') ||
      document.querySelector('fieldset button[aria-label*="send" i]'),
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
    buttonClass: 'promptera-btn--chatgpt',
    // Anchor = the mic/voice button in the composer's trailing actions. ⚡ is
    // inserted BEFORE it, so it sits to the left of the right-side buttons. The
    // send button only mounts once you type, so the mic is the reliable anchor.
    getButtonAnchor: () =>
      document.querySelector('[data-testid="composer-speech-button"]') ||
      document.querySelector('button[aria-label="Start voice mode"]') ||
      document.querySelector('button[aria-label="Dictate button"]') ||
      document.querySelector('[data-testid="send-button"]'),
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
    buttonClass: 'promptera-btn--chatgpt',
    // Mirror chatgpt.com: insert ⚡ before the mic/voice button.
    getButtonAnchor: () =>
      document.querySelector('[data-testid="composer-speech-button"]') ||
      document.querySelector('button[aria-label="Start voice mode"]') ||
      document.querySelector('button[aria-label="Dictate button"]') ||
      document.querySelector('[data-testid="send-button"]'),
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
    buttonClass: 'promptera-btn--gemini',
    // Anchor = the mic button in the right-side action row (alongside the model
    // selector). ⚡ is inserted BEFORE it. Falls back to the send button.
    getButtonAnchor: () =>
      document.querySelector('speech-dictation-mic-button button') ||
      document.querySelector('button[aria-label*="microphone" i]') ||
      document.querySelector('button[mattooltip*="microphone" i]') ||
      document.querySelector('button.mic-button') ||
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('button.send-button'),
  },
};

// ─── Identify current site ────────────────────────────────────────────────────
const hostname = location.hostname;
const site = Object.keys(SITES).find((key) => hostname.includes(key));
if (!site) throw new Error('Promptera: unsupported site');

const siteConfig = SITES[site];

// ─── Overlay injection ────────────────────────────────────────────────────────
let overlayEl = null;

function createOverlay() {
  const el = document.createElement('div');
  el.id = 'promptera-overlay';
  el.innerHTML = `
    <div id="promptera-panel">
      <div id="promptera-grain"></div>

      <header id="promptera-header">
        <div id="promptera-brand">
          <span id="promptera-logo"><img src="${chrome.runtime.getURL('icons/Icon.png')}" alt="" /></span>
          <span id="promptera-titles">
            <span id="promptera-wordmark">Promptera</span>
            <span id="promptera-tagline">AI&nbsp;PROMPT&nbsp;OPTIMIZER</span>
          </span>
        </div>
        <button id="promptera-close" title="Close" aria-label="Close">✕</button>
      </header>

      <div id="promptera-body">
        <section id="promptera-original-section">
          <label for="promptera-original">Input · your prompt</label>
          <textarea id="promptera-original" rows="4" placeholder="Paste or type the prompt you want to refine…"></textarea>
        </section>

        <section id="promptera-modes-section">
          <label>Optimization mode</label>
          <div id="promptera-modes">
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

        <button id="promptera-optimize-btn">Optimize Prompt</button>

        <section id="promptera-results-section" style="display:none">
          <label>Output · optimized</label>
          <div id="promptera-results"></div>
        </section>

        <div id="promptera-api-note" style="display:none">
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
  el.querySelector('#promptera-close').addEventListener('click', closeOverlay);
  el.addEventListener('click', (e) => { if (e.target === el) closeOverlay(); });

  // Optimize
  el.querySelector('#promptera-optimize-btn').addEventListener('click', async () => {
    const prompt = el.querySelector('#promptera-original').value.trim();
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
  overlayEl.querySelector('#promptera-original').value = currentText;
  overlayEl.querySelector('#promptera-results-section').style.display = 'none';
  overlayEl.querySelector('#promptera-api-note').style.display = 'none';
  overlayEl.style.display = 'flex';
}

function closeOverlay() {
  if (overlayEl) overlayEl.style.display = 'none';
}

// ─── Optimization logic ───────────────────────────────────────────────────────
async function runOptimization(prompt, mode) {
  const btn = overlayEl.querySelector('#promptera-optimize-btn');
  const resultsSection = overlayEl.querySelector('#promptera-results-section');
  const resultsEl = overlayEl.querySelector('#promptera-results');
  const apiNote = overlayEl.querySelector('#promptera-api-note');

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

    if (response.error) {
      resultsEl.innerHTML = `<div class="result-card error">Error: ${escapeHtml(response.error)}</div>`;
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
  if (document.getElementById('promptera-trigger-btn')) return;

  const input = siteConfig.getInput();
  if (!input) return;

  // Anchor = the native button we sit beside (the mic). We insert ⚡ *before* it so
  // it lands inside the action row, to the left of the mic. If the bar hasn't
  // mounted yet, bail — the MutationObserver will call back once it renders.
  const anchor = siteConfig.getButtonAnchor();
  if (!anchor || !anchor.parentElement) return;

  const btn = document.createElement('button');
  btn.id = 'promptera-trigger-btn';
  if (siteConfig.buttonClass) btn.classList.add(siteConfig.buttonClass);
  btn.title = 'Open Promptera prompt optimizer';
  btn.innerHTML = `<img src="${chrome.runtime.getURL('icons/Icon.png')}" alt="Promptera" />`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openOverlay();
  });

  anchor.parentElement.insertBefore(btn, anchor);
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
  if (!document.getElementById('promptera-trigger-btn')) {
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
