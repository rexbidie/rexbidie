// Turns what the campaign editor saves into HTML that email apps show
// properly. Email apps ignore the editor's CSS classes, so alignment
// becomes inline styles and buttons become a table (the only way
// Outlook desktop shows a coloured button).

export const BUTTON_CLASS = "rb-email-btn";
const GOLD = "#D19F3E";
const NAVY = "#072342";

const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const alignClassesToStyles = (html) =>
    html.replace(/<(p|h[1-6]|li|div|blockquote)\b([^>]*)>/gi, (tag, name, attrs) => {
        const m = attrs.match(/class=("|')([^"']*)\1/i);
        const align = m && m[2].match(/\bql-align-(center|right|justify)\b/);
        if (!align) return tag;
        const styleMatch = attrs.match(/style=("|')([^"']*)\1/i);
        const style = `text-align:${align[1]};${styleMatch ? styleMatch[2] : ""}`;
        const rest = attrs.replace(/\sstyle=("|')[^"']*\1/i, "");
        return `<${name}${rest} style="${style}">`;
    });

export const buttonHtml = (url, text) => `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${GOLD}" style="background-color:${GOLD};border-radius:6px;">
      <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:${NAVY};text-decoration:none;border-radius:6px;">${text}</a>
    </td>
  </tr>
</table>`;

const BUTTON_RE = new RegExp(
    `<div\\b[^>]*class=("|')[^"']*\\b${BUTTON_CLASS}\\b[^"']*\\1[^>]*>\\s*<a\\b[^>]*href=("|')([^"']*)\\2[^>]*>([\\s\\S]*?)<\\/a>\\s*<\\/div>`,
    "gi"
);

export const buttonsToEmailHtml = (html) =>
    html.replace(BUTTON_RE, (_m, _q1, _q2, href, text) => buttonHtml(href.replace(/&amp;/g, "&"), text.trim()));

export const toEmailHtml = (html) => buttonsToEmailHtml(alignClassesToStyles(String(html ?? "")));
