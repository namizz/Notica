/**
 * Strips script tags and standard HTML tags from a text string to prevent XSS injection.
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  // Strip script tags and everything inside them
  let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip all other HTML tags
  clean = clean.replace(/<[^>]*>/g, '');
  return clean.trim();
}
