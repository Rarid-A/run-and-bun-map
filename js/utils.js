// Utility functions
export function safeImageUrl(url) {
  // Encode filename part so URLs with #, spaces, etc. load correctly
  if (!url) return '';
  const idx = url.lastIndexOf('/');
  if (idx === -1) return encodeURIComponent(url);
  return url.slice(0, idx + 1) + encodeURIComponent(url.slice(idx + 1));
}

// Add more utility functions as needed
