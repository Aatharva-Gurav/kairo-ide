"use client";

import React, { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, openExternalUrl } from "@/lib/tauri-ipc";
import { useEditor } from "@/features/editor/store";
import {
  BlockNode,
  InlineToken,
  parseMarkdown,
} from "../services/markdown-parser";
import { Check, Copy } from "lucide-react";

interface MarkdownPreviewProps {
  content: string;
  documentPath: string;
  previewRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

const colorizeCache = new Map<string, string>();
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;
const UNSAFE_URI_SCHEME_RE = /^(?:javascript|vbscript|data):/i;

function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  if (UNSAFE_URI_SCHEME_RE.test(trimmed)) return false;
  return true;
}

function renderMonacoColorizedNodes(html: string): React.ReactNode {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let keyCounter = 0;

  const walk = (node: ChildNode): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    const key = keyCounter++;
    if (tag === "BR") {
      return <br key={key} />;
    }
    const children = Array.from(el.childNodes).map(walk);
    if (tag === "SPAN") {
      const cls = el.getAttribute("class") || "";
      const safeClass = /^[\w\s-]+$/.test(cls) ? cls : undefined;
      return (
        <span key={key} className={safeClass}>
          {children}
        </span>
      );
    }
    return <React.Fragment key={key}>{children}</React.Fragment>;
  };

  return Array.from(doc.body.childNodes).map(walk);
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const cacheKey = lang ? `${lang}:${code}` : "";
  const cachedHtml = cacheKey ? (colorizeCache.get(cacheKey) ?? null) : null;
  const [asyncHtml, setAsyncHtml] = useState<string | null>(null);
  const highlightedHtml = cachedHtml ?? asyncHtml;
  const highlightedNodes = useMemo(
    () => (highlightedHtml ? renderMonacoColorizedNodes(highlightedHtml) : null),
    [highlightedHtml]
  );

  useEffect(() => {
    if (!cacheKey || colorizeCache.has(cacheKey)) return;
    let cancelled = false;
    import("monaco-editor")
      .then((monaco) => monaco.editor.colorize(code, lang, { tabSize: 2 }))
      .then((html) => {
        if (!cancelled && html) {
          if (colorizeCache.size > 200) colorizeCache.clear();
          colorizeCache.set(cacheKey, html);
          setAsyncHtml(html);
        }
      })
      .catch(() => {
        // Fallback to plain monospace code
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, lang, code]);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="group relative my-3 rounded-lg border border-border/70 bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 bg-muted/60 text-[10px] font-mono text-muted-foreground">
        <span className="uppercase tracking-wider">{lang || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {highlightedNodes ? (
        <div className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
          {highlightedNodes}
        </div>
      ) : (
        <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed text-foreground">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

export const MarkdownPreview = React.memo(function MarkdownPreview({
  content,
  documentPath,
  previewRef,
  onScroll,
}: MarkdownPreviewProps) {
  const { openDocument } = useEditor();
  const baseDir = useMemo(() => dirname(documentPath), [documentPath]);

  const blocks = useMemo(() => parseMarkdown(content), [content]);

  const resolveRelativeWorkspacePath = (rel: string): string => {
    const cleaned = decodeURIComponent(rel.split(/[?#]/)[0] || "").replace(/\\/g, "/");
    if (/^[a-zA-Z]:\//.test(cleaned) || cleaned.startsWith("/")) {
      return cleaned;
    }
    const baseParts = baseDir.replace(/\\/g, "/").split("/").filter(Boolean);
    const isUnixRoot = baseDir.startsWith("/");
    for (const seg of cleaned.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") {
        if (baseParts.length > (isUnixRoot ? 0 : 1)) {
          baseParts.pop();
        }
      } else {
        baseParts.push(seg);
      }
    }
    return isUnixRoot ? `/${baseParts.join("/")}` : baseParts.join("/");
  };

  const resolveAssetSrc = (src: string): string => {
    if (!src) return "";
    const trimmed = src.trim();
    if (/^(https?:|asset:|blob:)/i.test(trimmed)) return trimmed;
    if (/^data:/i.test(trimmed)) {
      return SAFE_DATA_IMAGE_RE.test(trimmed) ? trimmed : "";
    }
    if (UNSAFE_URI_SCHEME_RE.test(trimmed)) return "";
    const resolved = resolveRelativeWorkspacePath(trimmed);
    try {
      return convertFileSrc(resolved);
    } catch {
      return resolved;
    }
  };

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (!isSafeLinkHref(href)) return;

    if (href.startsWith("#")) {
      const targetId = href.slice(1).toLowerCase();
      const el = previewRef?.current?.querySelector(`[data-heading-id="${CSS.escape(targetId)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (/^https?:\/\//i.test(href)) {
      openExternalUrl(href).catch(() => {});
      return;
    }

    // Relative workspace file link (resolves ./ and ../ segments cleanly)
    const targetPath = resolveRelativeWorkspacePath(href);
    if (targetPath) {
      openDocument(targetPath).catch(() => {});
    }
  };

  const renderInline = (tokens: InlineToken[], keyPrefix: string): React.ReactNode =>
    tokens.map((tok, idx) => {
      const key = `${keyPrefix}-${idx}`;
      switch (tok.type) {
        case "text":
          return <React.Fragment key={key}>{tok.value}</React.Fragment>;
        case "bold":
          return (
            <strong key={key} className="font-semibold text-foreground">
              {renderInline(tok.children, key)}
            </strong>
          );
        case "italic":
          return (
            <em key={key} className="italic">
              {renderInline(tok.children, key)}
            </em>
          );
        case "strike":
          return (
            <del key={key} className="line-through text-muted-foreground">
              {renderInline(tok.children, key)}
            </del>
          );
        case "code":
          return (
            <code
              key={key}
              className="rounded bg-muted/70 border border-border/50 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
            >
              {tok.value}
            </code>
          );
        case "link": {
          const safeHref = isSafeLinkHref(tok.href) ? tok.href : "#";
          return (
            <a
              key={key}
              href={safeHref}
              onClick={(e) => handleLinkClick(e, safeHref)}
              className="text-primary underline underline-offset-3 hover:opacity-80 cursor-pointer"
              title={safeHref}
            >
              {renderInline(tok.children, key)}
            </a>
          );
        }
        case "image":
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={key}
              src={resolveAssetSrc(tok.src)}
              alt={tok.alt}
              className="inline-block max-w-full rounded-md border border-border/60 my-1.5 shadow-xs"
            />
          );
      }
    });

  const renderBlock = (block: BlockNode, idx: number): React.ReactNode => {
    const key = `b-${idx}`;
    switch (block.type) {
      case "heading": {
        const sizes: Record<number, string> = {
          1: "text-2xl font-bold border-b border-border/60 pb-2 mt-5 mb-3",
          2: "text-xl font-semibold border-b border-border/40 pb-1.5 mt-4 mb-2.5",
          3: "text-lg font-semibold mt-4 mb-2",
          4: "text-base font-semibold mt-3 mb-1.5",
          5: "text-sm font-semibold mt-3 mb-1",
          6: "text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1",
        };
        const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        return (
          <Tag
            key={key}
            data-heading-id={block.id}
            className={`${sizes[block.level]} text-foreground tracking-tight`}
          >
            {renderInline(block.children, key)}
          </Tag>
        );
      }
      case "paragraph":
        return (
          <p key={key} className="my-2.5 text-sm leading-7 text-foreground/90">
            {renderInline(block.children, key)}
          </p>
        );
      case "code":
        return <CodeBlock key={key} lang={block.lang} code={block.code} />;
      case "hr":
        return <hr key={key} className="my-5 border-border/70" />;
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="my-3 border-l-3 border-primary/60 bg-muted/30 pl-4 pr-3 py-1.5 rounded-r-md text-muted-foreground italic"
          >
            {block.children.map((child, ci) => renderBlock(child, idx * 100 + ci))}
          </blockquote>
        );
      case "list": {
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={key}
            start={block.ordered ? block.start : undefined}
            className={`my-2.5 pl-6 space-y-1 text-sm text-foreground/90 ${
              block.ordered ? "list-decimal" : "list-disc"
            }`}
          >
            {block.items.map((item, li) => (
              <li
                key={`${key}-li-${li}`}
                className={item.checked !== undefined ? "list-none -ml-5 flex items-start gap-2" : ""}
              >
                {item.checked !== undefined && (
                  <input
                    type="checkbox"
                    checked={item.checked}
                    readOnly
                    className="mt-1.5 size-3.5 accent-primary rounded border-border cursor-default"
                  />
                )}
                <span className={item.checked ? "line-through text-muted-foreground" : ""}>
                  {renderInline(item.children, `${key}-li-${li}`)}
                </span>
              </li>
            ))}
          </ListTag>
        );
      }
      case "table":
        return (
          <div key={key} className="my-3 overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/50 border-b border-border/70">
                <tr>
                  {block.headers.map((cell, ci) => (
                    <th
                      key={`${key}-th-${ci}`}
                      style={{ textAlign: block.alignments[ci] ?? "left" }}
                      className="px-3 py-2 font-semibold text-foreground border-r last:border-r-0 border-border/50"
                    >
                      {renderInline(cell, `${key}-th-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr
                    key={`${key}-tr-${ri}`}
                    className="border-b last:border-b-0 border-border/50 even:bg-muted/20"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={`${key}-td-${ri}-${ci}`}
                        style={{ textAlign: block.alignments[ci] ?? "left" }}
                        className="px-3 py-1.5 text-foreground/90 border-r last:border-r-0 border-border/40"
                      >
                        {renderInline(cell, `${key}-td-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return (
    <div
      ref={previewRef}
      onScroll={onScroll}
      className="flex-1 h-full overflow-y-auto bg-background px-6 py-5"
    >
      <div className="max-w-3xl mx-auto pb-12">
        {blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Empty Markdown document</p>
        ) : (
          blocks.map((block, idx) => renderBlock(block, idx))
        )}
      </div>
    </div>
  );
});
