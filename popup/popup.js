const siteIndicator = document.getElementById('site-indicator');

// Show active site
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const url = new URL(tab.url);
  const supported = ['claude.ai', 'chatgpt.com', 'chat.openai.com', 'gemini.google.com'];
  const match = supported.find((s) => url.hostname.includes(s));
  siteIndicator.textContent = match ? `● ${match}` : '○ no target';
  siteIndicator.style.color = match ? '#86b98f' : '#646a73';
});
