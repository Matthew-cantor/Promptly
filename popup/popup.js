const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');
const toggleBtn = document.getElementById('toggle-visibility');
const siteIndicator = document.getElementById('site-indicator');

// Load saved settings
chrome.storage.sync.get(['apiKey', 'provider'], ({ apiKey, provider }) => {
  if (apiKey) apiKeyEl.value = apiKey;
  if (provider) providerEl.value = provider;
});

// Show active site
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const url = new URL(tab.url);
  const supported = ['claude.ai', 'chatgpt.com', 'chat.openai.com', 'gemini.google.com'];
  const match = supported.find((s) => url.hostname.includes(s));
  siteIndicator.textContent = match ? `● ${match}` : '○ no target';
  siteIndicator.style.color = match ? '#86b98f' : '#646a73';
});

// Toggle key visibility
toggleBtn.addEventListener('click', () => {
  const isHidden = apiKeyEl.type === 'password';
  apiKeyEl.type = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? '🔒' : '👁';
});

// Save
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  const provider = providerEl.value;

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiKey, provider });
  showStatus('Saved ✓');
});

function showStatus(msg, type = 'success') {
  statusMsg.textContent = msg;
  statusMsg.style.color = type === 'error' ? '#d98b7a' : '#86b98f';
  setTimeout(() => { statusMsg.textContent = ''; }, 2500);
}
