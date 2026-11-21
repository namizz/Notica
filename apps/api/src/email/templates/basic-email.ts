function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export interface BasicEmailOptions {
  title: string;
  body: string;
}

export function renderBasicEmail(opts: BasicEmailOptions): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(opts.title)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;color:#111">${escapeHtml(opts.title)}</h1>
  <div style="color:#333;line-height:1.5">${textToHtml(opts.body)}</div>
</body>
</html>`;
  const text = `${opts.title}\n\n${opts.body}`;
  return { html, text };
}
