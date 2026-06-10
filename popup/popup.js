const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');
const siteIndicator = document.getElementById('site-indicator');

// Load saved key — prompt the user to add one if none is stored yet
chrome.storage.local.get(['geminiApiKey'], ({ geminiApiKey }) => {
  if (geminiApiKey) {
    apiKeyEl.value = geminiApiKey;
  } else {
    showStatus('Add your Gemini API key to get started', 'info');
  }
});

// Save key
saveBtn.addEventListener('click', () => {
  const key = apiKeyEl.value.trim();
  if (!key) {
    showStatus('Please enter your Gemini API key', 'error');
    return;
  }
  chrome.storage.local.set({ geminiApiKey: key }, () => {
    showStatus('Saved ✓');
  });
});

function showStatus(msg, type = 'success') {
  statusMsg.textContent = msg;
  statusMsg.style.color =
    type === 'error' ? '#d98b7a' : type === 'info' ? '#9aa0aa' : '#86b98f';
}

// Show active site
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const url = new URL(tab.url);
  const supported = ['claude.ai', 'chatgpt.com', 'chat.openai.com', 'gemini.google.com'];
  const match = supported.find((s) => url.hostname.includes(s));
  siteIndicator.textContent = match ? `● ${match}` : '○ no target';
  siteIndicator.style.color = match ? '#86b98f' : '#646a73';
});
