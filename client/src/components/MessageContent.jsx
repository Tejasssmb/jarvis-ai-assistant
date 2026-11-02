import { useEffect, useRef, useState } from "react";
import "./MessageContent.css";

/**
 * MessageContent - shows a chat message the way ChatGPT / Claude do:
 *   - ```lang ... ```  becomes a code panel with the language name, colours and a Copy button
 *   - `inline code` and **bold** are styled
 *   - line breaks are kept (emails, WhatsApp chats, lists)
 */

const KNOWN_LANGS = new Set([
  "java", "python", "py", "javascript", "js", "jsx", "typescript", "ts", "tsx", "c", "cpp", "c++", "cs", "csharp",
  "go", "rust", "rs", "php", "ruby", "rb", "kotlin", "kt", "swift", "sql", "bash", "sh", "shell", "zsh", "powershell",
  "ps1", "html", "css", "scss", "json", "yaml", "yml", "xml", "r", "dart", "lua", "perl", "matlab", "text", "txt", "markdown", "md",
]);

const LANG_LABEL = {
  js: "JavaScript", javascript: "JavaScript", jsx: "JSX", ts: "TypeScript", typescript: "TypeScript", tsx: "TSX",
  py: "Python", python: "Python", java: "Java", c: "C", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#",
  go: "Go", rust: "Rust", rs: "Rust", php: "PHP", ruby: "Ruby", rb: "Ruby", kotlin: "Kotlin", kt: "Kotlin",
  swift: "Swift", sql: "SQL", bash: "Bash", sh: "Shell", shell: "Shell", zsh: "Shell", powershell: "PowerShell", ps1: "PowerShell",
  html: "HTML", css: "CSS", scss: "SCSS", json: "JSON", yaml: "YAML", yml: "YAML", xml: "XML", text: "Text", txt: "Text",
  markdown: "Markdown", md: "Markdown",
};

const C_LIKE = new Set(["java", "c", "cpp", "c++", "cs", "csharp", "js", "javascript", "jsx", "ts", "typescript", "tsx", "go", "php", "kotlin", "kt", "swift", "dart"]);
const HASH_COMMENT = new Set(["python", "py", "bash", "sh", "shell", "zsh", "powershell", "ps1", "ruby", "rb", "yaml", "yml", "r", "perl"]);

const KEYWORDS = new Set((
  "abstract as assert async await boolean break byte case catch char class const continue def default defer del do double " +
  "elif else enum except export extends false final finally float fn for from func function go goto if implements import in " +
  "instanceof int interface is lambda let long match mod namespace new nil none null package pass private protected pub public " +
  "raise range return select self short static struct super switch synchronized this throw throws true try type typeof union " +
  "unsigned use using var virtual void volatile while with yield string bool and or not"
).split(/\s+/));

// only coloured as keywords inside ```sql blocks (elsewhere they are ordinary names like "order" or "values")
const SQL_KEYWORDS = new Set((
  "select from where insert into update delete create table values order group by join on limit set having distinct union " +
  "inner left right outer and or not as primary key foreign references null default alter drop index"
).split(/\s+/));

// ---------------------------------------------------------------- parsing
function parseFence(raw) {
  // "java\nint a;"            language on its own line
  let m = raw.match(/^([A-Za-z0-9_+#.-]{1,20})[ \t]*\r?\n([\s\S]*)$/);
  if (m) return { lang: m[1].toLowerCase(), code: m[2].replace(/\s+$/, "") };
  // "java int a = 5;"         everything on one line (as some models write it)
  m = raw.match(/^([A-Za-z0-9_+#.-]{1,20})[ \t]+([\s\S]*)$/);
  if (m && KNOWN_LANGS.has(m[1].toLowerCase())) return { lang: m[1].toLowerCase(), code: m[2].replace(/\s+$/, "") };
  return { lang: "", code: raw.replace(/^\r?\n/, "").replace(/\s+$/, "") };
}

/** text -> [{type:"text", text} | {type:"code", lang, code}] */
export function splitMessage(text) {
  const src = String(text || "");
  const parts = [];
  let pos = 0;
  for (;;) {
    const open = src.indexOf("```", pos);
    if (open === -1) {
      if (pos < src.length) parts.push({ type: "text", text: src.slice(pos) });
      break;
    }
    if (open > pos) parts.push({ type: "text", text: src.slice(pos, open) });
    const close = src.indexOf("```", open + 3);
    const raw = close === -1 ? src.slice(open + 3) : src.slice(open + 3, close); // unfinished block: treat the rest as code
    const { lang, code } = parseFence(raw);
    parts.push({ type: "code", lang, code });
    if (close === -1) break;
    pos = close + 3;
  }
  return parts;
}

export function hasCode(text) {
  return String(text || "").includes("```");
}

// ---------------------------------------------------------------- one-line code -> readable lines
/** Some models squeeze code onto one line. Re-flow simple C-style code (never touches strings/comments). */
export function beautifyOneLine(code, lang) {
  if (!C_LIKE.has(lang) || code.includes("\n") || code.length < 40) return code;
  const out = [];
  let line = "";
  let indent = 0;
  let paren = 0;
  let quote = null;
  const flush = () => {
    const t = line.trim();
    if (t) out.push("    ".repeat(Math.max(0, indent)) + t);
    line = "";
  };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      line += ch;
      if (ch === "\\") line += code[++i] || "";
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; line += ch; continue; }
    if (ch === "/" && code[i + 1] === "/") { line += code.slice(i); break; }
    if (ch === "(") paren++;
    if (ch === ")") paren = Math.max(0, paren - 1);
    if (ch === "{") { line += ch; flush(); indent++; continue; }
    if (ch === "}") { flush(); indent--; line = "}"; if (/^\s*(else|catch|finally|while)\b/.test(code.slice(i + 1))) { continue; } flush(); continue; }
    if (ch === ";" && paren === 0) { line += ch; flush(); continue; }
    line += ch;
  }
  flush();
  return out.join("\n");
}

// ---------------------------------------------------------------- highlighting
const STRING_RE = String.raw`"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|` + "`(?:\\\\.|[^`\\\\])*`?";
const NUMBER_RE = String.raw`\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLdD]?\b`;
const WORD_RE = String.raw`\b[A-Za-z_$][\w$]*\b`;

export function highlight(code, lang) {
  let comment = String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`;
  if (HASH_COMMENT.has(lang)) comment = String.raw`#[^\n]*`;
  else if (lang === "sql") comment = String.raw`--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`;
  else if (lang === "html" || lang === "xml") comment = String.raw`<!--[\s\S]*?(?:-->|$)`;

  const re = new RegExp(`(${comment})|(${STRING_RE})|(${NUMBER_RE})|(${WORD_RE})`, "g");
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) tokens.push({ v: code.slice(last, m.index) });
    const v = m[0];
    if (m[1]) tokens.push({ c: "com", v });
    else if (m[2]) tokens.push({ c: "str", v });
    else if (m[3]) tokens.push({ c: "num", v });
    else if (lang === "sql" ? SQL_KEYWORDS.has(v.toLowerCase()) : KEYWORDS.has(v)) tokens.push({ c: "kw", v });
    else if (/^\s*\(/.test(code.slice(re.lastIndex))) tokens.push({ c: "fn", v });
    else if (/^[A-Z][a-z]/.test(v)) tokens.push({ c: "type", v });
    else tokens.push({ v });
    last = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < code.length) tokens.push({ v: code.slice(last) });
  return tokens;
}

// ---------------------------------------------------------------- pieces
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = beautifyOneLine(code, lang);
  const tokens = highlight(shown, lang);

  const onCopy = async () => {
    if (await copyToClipboard(shown)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{LANG_LABEL[lang] || (lang ? lang.toUpperCase() : "Code")}</span>
        <button type="button" className={`code-copy${copied ? " copied" : ""}`} onClick={onCopy} aria-label="Copy code">
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="code-pre">
        <code>
          {tokens.map((t, i) => (t.c ? <span key={i} className={`tok-${t.c}`}>{t.v}</span> : t.v))}
        </code>
      </pre>
    </div>
  );
}

/** `inline code` and **bold** inside normal text */
function InlineText({ text }) {
  const pieces = String(text).split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return pieces.map((p, i) => {
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={i} className="inline-code">{p.slice(1, -1)}</code>;
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return p;
  });
}

export default function MessageContent({ text, role }) {
  if (role === "user") return <p>{text}</p>;
  const parts = splitMessage(text);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") return <CodeBlock key={i} lang={part.lang} code={part.code} />;
        const t = part.text.replace(/^\s*\n/, "").replace(/\s+$/, "");
        if (!t.trim()) return null;
        return <p key={i}><InlineText text={t} /></p>;
      })}
    </>
  );
}
