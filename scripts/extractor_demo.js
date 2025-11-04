// Simple demo script for the extractor logic. Run with: node scripts/extractor_demo.js

function normalizeText(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['the','and','a','an','in','on','for','with','to','of','is','are','was','were','it','this','that','by','from','as','at','or','be','we','you','your','our']);

function getNgrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

function extractKeywords(title, content) {
  const normalized = normalizeText((title + ' ' + content).slice(0, 20000));
  const tokens = normalized.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t) && t.length > 1);

  const freq = {};
  for (const unigram of tokens) {
    freq[unigram] = (freq[unigram] || 0) + 1;
  }
  const bigrams = getNgrams(tokens, 2);
  for (const bigram of bigrams) {
    freq[bigram] = (freq[bigram] || 0) + 2;
  }

  const normalizedTitle = normalizeText(title || '');
  const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
  for (const t of titleTokens) {
    if (freq[t]) freq[t] = freq[t] * 1.5;
  }

  const items = Object.entries(freq).map(([keyword, count]) => ({ keyword, score: count }));
  items.sort((a, b) => b.score - a.score);
  const top = items.slice(0, 15);
  const maxScore = top[0]?.score || 1;
  const extracted = top.map((it) => ({ keyword: it.keyword, score: Math.round((it.score / maxScore) * 100) / 100, source: titleTokens.has(it.keyword) ? 'title' : 'body' }));

  const recommended = extracted.slice(0, 6).map((k, i) => ({ topic: `${k.keyword.charAt(0).toUpperCase() + k.keyword.slice(1)}: A Practical Guide`, score: k.score * (1 - i * 0.05), reason: 'High relevance based on post content and title' }));

  return { extracted, recommended };
}

if (require.main === module) {
  const sampleTitle = 'How to improve SEO with keyword research';
  const sampleContent = `Keyword research is the foundation of good SEO. In 2025, focusing on long-tail keywords and user intent matters. Tools like Google Keyword Planner, DataForSEO, and others help find low-competition phrases.`;

  const result = extractKeywords(sampleTitle, sampleContent);
  console.log('Extracted Keywords:', JSON.stringify(result.extracted, null, 2));
  console.log('Recommended Topics:', JSON.stringify(result.recommended, null, 2));
}

module.exports = { extractKeywords };
