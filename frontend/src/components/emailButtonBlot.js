import { Quill } from "react-quill-new";

// A "button" for email campaigns. In the editor it's a gold box with the
// link inside; when the email is sent, the server turns it into a table
// button that shows properly in Outlook too (see backend utils/emailHtml.js).
export const BUTTON_CLASS = "rb-email-btn";
const GOLD = "#D19F3E";
const NAVY = "#072342";

const BlockEmbed = Quill.import("blots/block/embed");

class EmailButtonBlot extends BlockEmbed {
    static blotName = "emailButton";
    static tagName = "DIV";
    static className = BUTTON_CLASS;

    static create(value) {
        const node = super.create();
        node.setAttribute("contenteditable", "false");
        node.setAttribute("style", "text-align:center;margin:20px 0;");
        const a = document.createElement("a");
        a.setAttribute("href", value?.url || "#");
        a.setAttribute("target", "_blank");
        a.setAttribute(
            "style",
            `display:inline-block;padding:14px 28px;background-color:${GOLD};color:${NAVY};font-weight:bold;font-size:16px;text-decoration:none;border-radius:6px;font-family:Arial,Helvetica,sans-serif;`
        );
        a.textContent = value?.text || "View lots";
        node.appendChild(a);
        return node;
    }

    static value(node) {
        const a = node.querySelector("a");
        return { url: a?.getAttribute("href") || "", text: a?.textContent || "" };
    }
}

let registered = false;
export const registerEmailButton = () => {
    if (registered) return;
    Quill.register(EmailButtonBlot, true);
    const icons = Quill.import("ui/icons");
    icons.emailButton =
        '<svg viewBox="0 0 18 18"><rect class="ql-stroke" x="1.5" y="5" width="15" height="8" rx="2" fill="none"/><line class="ql-stroke" x1="5" y1="9" x2="13" y2="9"/></svg>';
    registered = true;
};

export const normaliseUrl = (raw) => {
    const url = String(raw || "").trim();
    if (!url) return "";
    if (/^(https?:|mailto:)/i.test(url)) return url;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return `https://${url}`;
    return "";
};
