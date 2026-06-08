# Promptly — Claude Code Reference

## Project Overview
Promptly is a Chrome extension (Manifest V3) that injects a prompt optimizer overlay into LLM chat interfaces. Users click the ⚡ button near the chat input, choose an optimization mode, and the rewritten prompt is inserted back into the input.

## File Structure
```
promptly/
├── manifest.json            # MV3 manifest — permissions, host_permissions, entry points
├── background/
│   └── background.js        # Service worker — handles API calls to OpenAI / Anthropic
├── content/
│   ├── content.js           # Injected into LLM sites — button + overlay logic
│   └── content.css          # Styles for the trigger button and overlay panel
├── popup/
│   ├── popup.html           # Extension popup — API key + provider settings
│   ├── popup.js             # Saves/loads settings via chrome.storage.sync
│   └── popup.css            # Popup styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Supported Sites
Defined in `content/content.js` under the `SITES` object. Each entry specifies:
- `getInput()` — finds the chat textarea/contenteditable element
- `getInputText(el)` — reads the current prompt text
- `setInputText(el, text)` — writes optimized text back into the input
- `getButtonContainer()` — where to append the ⚡ trigger button

| Hostname              | Notes                                      |
|-----------------------|--------------------------------------------|
| `claude.ai`           | Uses ProseMirror contenteditable           |
| `chatgpt.com`         | Uses `#prompt-textarea` (textarea or div)  |
| `chat.openai.com`     | Alias for ChatGPT                          |
| `gemini.google.com`   | Uses Quill editor inside `rich-textarea`   |

To add a new site: add an entry to `SITES` in `content.js` and add the URL pattern to `host_permissions` and `content_scripts.matches` in `manifest.json`.

## Optimization Modes
Defined in `background/background.js` under `SYSTEM_PROMPTS`:

| Mode           | Key            | Description                                      |
|----------------|----------------|--------------------------------------------------|
| Rewrite        | `clarity`      | Rewrites for specificity and concision           |
| Add Context    | `context`      | Adds role, format, and tone instructions         |
| Alternatives   | `alternatives` | Returns 3 variants split by `---`                |

## API Providers
Configured in the popup, stored in `chrome.storage.sync` as `{ apiKey, provider }`.

| Provider    | Value        | Model used               | Endpoint                                      |
|-------------|--------------|--------------------------|-----------------------------------------------|
| OpenAI      | `"openai"`   | `gpt-4o-mini`            | `https://api.openai.com/v1/chat/completions`  |
| Anthropic   | `"anthropic"`| `claude-haiku-4-5-20251001` | `https://api.anthropic.com/v1/messages`    |

API calls are made from the background service worker (not the content script) to avoid CORS issues.

## Message Passing
Content script → background worker via `chrome.runtime.sendMessage`:
```js
// Request
{ type: 'OPTIMIZE_PROMPT', payload: { prompt: string, mode: string, site: string } }

// Response (success - single)
{ result: string }

// Response (success - alternatives)
{ results: string[] }

// Response (error)
{ error: string }  // 'NO_API_KEY' is the special case shown to user
```

## Key Design Decisions
- **MV3 service worker** — no persistent background page; use `chrome.storage` not globals
- **MutationObserver** in content.js re-injects the button after SPA navigation
- **`document.execCommand('insertText')`** is used for contenteditable inputs to trigger React/framework change events; for textareas, a native value setter + `input` event is dispatched
- **No build step** — plain JS/CSS, load unpacked directly in Chrome

## Loading the Extension in Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `promptly/` directory
4. After editing files, click the refresh icon on the extension card (content scripts need a page reload too)

## Common Tasks

### Add a new LLM site
1. Add entry to `SITES` in `content/content.js`
2. Add URL pattern to `manifest.json` → `host_permissions[]` and `content_scripts[0].matches[]`

### Add a new optimization mode
1. Add a system prompt to `SYSTEM_PROMPTS` in `background/background.js`
2. Add a `<button class="mode-btn" data-mode="...">` in the overlay HTML inside `content/content.js`
3. If the response format differs, update `parseResult()` in `background.js` and the render logic in `runOptimization()` in `content.js`

### Change the optimizer model
Update the `model` field inside `callOpenAI()` or `callAnthropic()` in `background/background.js`.

### Style changes
- Trigger button: `#promptly-trigger-btn` in `content/content.css`
- Overlay panel: `#promptly-panel` and children in `content/content.css`
- Popup: `popup/popup.css`

## Roadmap / Planned Features
- Keyboard shortcut trigger (Cmd+Shift+P)
- Prompt history / saved templates
- Tone selector (formal, casual, technical)
- Support for additional sites (Perplexity, Mistral, etc.)
- Optional backend proxy to avoid exposing API keys client-side
