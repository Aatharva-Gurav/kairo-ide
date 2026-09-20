import React from "react";
import { IconRenderProps } from "../types";

function SvgBase({
  className = "size-4 shrink-0",
  children,
  viewBox = "0 0 16 16",
  title,
  style,
}: IconRenderProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden={!title}
      role={title ? "img" : "presentation"}
      shapeRendering="geometricPrecision"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PROGRAMMING LANGUAGES
// ---------------------------------------------------------------------------

export function SetiTypeScriptIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#3178C6" />
      <path
        fill="#FFFFFF"
        d="M2.5 5.2h5.6v1.4H6v5.8H4.6V6.6H2.5V5.2zm6.2 5.5c.5.5 1.1.8 1.8.8.7 0 1.2-.3 1.2-.8 0-.5-.4-.7-1.3-1-1.3-.4-2-.9-2-2 0-1.1.9-1.9 2.2-1.9.8 0 1.5.3 2 .7l-.6 1.1c-.4-.3-.9-.5-1.4-.5-.6 0-1 .3-1 .7 0 .4.4.6 1.2.9 1.4.5 2.1 1 2.1 2.1 0 1.3-1 2-2.4 2-1 0-1.8-.4-2.3-.9l.5-1.1z"
      />
    </SvgBase>
  );
}

export function SetiReactTsIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#2b5b84" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(30 8 8)" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(90 8 8)" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(150 8 8)" />
      <circle cx="8" cy="8" r="1.3" fill="#00D8FF" />
    </SvgBase>
  );
}

export function SetiJavaScriptIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#F7DF1E" />
      <path
        fill="#000000"
        d="M4.5 6.2h1.4v4.5c0 1.1-.5 1.7-1.6 1.7-.5 0-.9-.1-1.3-.3l.3-1.1c.3.1.6.2.9.2.5 0 .7-.3.7-.8V6.2zm4.3 4.5c.5.5 1.2.8 1.9.8.7 0 1.2-.3 1.2-.8 0-.5-.4-.7-1.3-1-1.3-.4-2-.9-2-2 0-1.1.9-1.9 2.2-1.9.8 0 1.6.3 2.1.8l-.6 1.1c-.4-.3-1-.5-1.5-.5-.6 0-1 .3-1 .7 0 .4.4.6 1.2.9 1.4.5 2.1 1 2.1 2.1 0 1.3-1 2-2.4 2-1 0-1.9-.4-2.4-.9l.5-1.2z"
      />
    </SvgBase>
  );
}

export function SetiReactJsIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#222222" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(30 8 8)" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(90 8 8)" />
      <ellipse cx="8" cy="8" rx="6" ry="2.3" fill="none" stroke="#00D8FF" strokeWidth="0.9" transform="rotate(150 8 8)" />
      <circle cx="8" cy="8" r="1.3" fill="#00D8FF" />
    </SvgBase>
  );
}

export function SetiPythonIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#3572A5"
        d="M7.9 2c-3.1 0-2.9 1.3-2.9 1.3l.1 1.4h2.9v.4H4c-1.8 0-3 1.1-3 3.1 0 2 1.6 3 1.6 3s1.4.1 2.4.1v-1.4s-.1-1.4 1.4-1.4h2.8c1.3 0 1.4-1.2 1.4-1.2V4.4S11 2 7.9 2zM6.5 3.3c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z"
      />
      <path
        fill="#FFD43B"
        d="M8.1 14c3.1 0 2.9-1.3 2.9-1.3l-.1-1.4H8v-.4h3.9c1.8 0 3-1.1 3-3.1 0-2-1.6-3-1.6-3s-1.4-.1-2.4-.1v1.4s.1 1.4-1.4 1.4H7.6c-1.3 0-1.4 1.2-1.4 1.2v2.9S5 14 8.1 14zm1.4-1.3c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z"
      />
    </SvgBase>
  );
}

export function SetiRustIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <circle cx="8" cy="8" r="6.8" fill="#CE412B" />
      <circle cx="8" cy="8" r="4.5" fill="#1C1C1C" />
      <path
        fill="#FFFFFF"
        d="M6 5.2h2.5c1.1 0 1.8.6 1.8 1.5 0 .8-.5 1.3-1.2 1.4l1.4 2.7H9l-1.2-2.4H7.2v2.4H6V5.2zm1.2 2.2h1.1c.5 0 .8-.2.8-.6s-.3-.6-.8-.6H7.2v1.2z"
      />
    </SvgBase>
  );
}

export function SetiGoIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#00ADD8" />
      <path
        fill="#FFFFFF"
        d="M2.8 8c0-2.2 1.5-3.6 3.5-3.6 1.4 0 2.4.6 2.9 1.6l-1.3.8c-.3-.6-.9-.9-1.6-.9-1.2 0-2.1.9-2.1 2.1 0 1.2.9 2.1 2.1 2.1.8 0 1.4-.4 1.7-1h-1.8V7.9h3.2v3.3H9.2v-.8c-.6.6-1.5 1-2.5 1-2 0-3.9-1.4-3.9-3.4zm8 3.5c-2 0-3.5-1.5-3.5-3.5 0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5c0 2-1.5 3.5-3.5 3.5zm0-1.4c1.2 0 2.1-.9 2.1-2.1 0-1.2-.9-2.1-2.1-2.1-1.2 0-2.1.9-2.1 2.1 0 1.2.9 2.1 2.1 2.1z"
      />
    </SvgBase>
  );
}

export function SetiJavaIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path fill="#5382A1" d="M6 13.5c2.5.6 5.5.6 7.5-.2-2-.3-4.5-.4-7.5.2z" />
      <path fill="#E76F00" d="M7 2.2c.5 1-.2 1.8-.7 2.6-.5.9-.6 1.8.2 2.7.4-1 .8-1.7 1-2.4.3-.8-.1-2-.5-2.9zm3.2.6c.3.9-.1 1.7-.5 2.5-.4.8-.5 1.7.3 2.5.3-.9.7-1.6.8-2.3.2-.8 0-1.8-.6-2.7z" />
      <path fill="#E76F00" d="M3.5 8.8c0 2.4 2 3.8 4.5 3.8 2.2 0 4.2-1.2 4.2-3.1h-1.3c0 1.4-1.3 2-2.9 2-1.9 0-3.2-1-3.2-2.7H3.5z" />
      <path fill="#5382A1" d="M12.2 8.5c.8 0 1.8.3 1.8 1.4 0 1.1-1 1.6-1.8 1.6v-1c.4 0 .7-.2.7-.6 0-.4-.3-.5-.7-.5v-.9z" />
    </SvgBase>
  );
}

export function SetiCppIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#00599C" />
      <path
        fill="#FFFFFF"
        d="M2.5 8c0-2.2 1.5-3.6 3.5-3.6 1.3 0 2.3.6 2.8 1.5l-1.3.8c-.3-.5-.8-.8-1.5-.8-1.2 0-2.1.9-2.1 2.1 0 1.2.9 2.1 2.1 2.1.7 0 1.2-.3 1.5-.8l1.3.8c-.5.9-1.5 1.5-2.8 1.5-2 0-3.5-1.4-3.5-3.6zm7.2-.6h.9v-.9h.8v.9h.9v.8h-.9v.9h-.8v-.9h-.9v-.8zm3 0h.9v-.9h.8v.9h.9v.8h-.9v.9h-.8v-.9h-.9v-.8z"
      />
    </SvgBase>
  );
}

export function SetiCIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#555555" />
      <path
        fill="#A8B9CC"
        d="M4.5 8c0-2.6 1.8-4.2 4.2-4.2 1.6 0 2.8.7 3.4 1.8l-1.6 1c-.4-.6-1-1-1.8-1-1.5 0-2.5 1.1-2.5 2.4 0 1.3 1 2.4 2.5 2.4.8 0 1.4-.4 1.8-1l1.6 1c-.6 1.1-1.8 1.8-3.4 1.8-2.4 0-4.2-1.6-4.2-4.2z"
      />
    </SvgBase>
  );
}

export function SetiCSharpIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#68217A" />
      <path
        fill="#FFFFFF"
        d="M3 8c0-2.2 1.5-3.6 3.5-3.6 1.3 0 2.3.6 2.8 1.5l-1.3.8c-.3-.5-.8-.8-1.5-.8-1.2 0-2.1.9-2.1 2.1 0 1.2.9 2.1 2.1 2.1.7 0 1.2-.3 1.5-.8l1.3.8c-.5.9-1.5 1.5-2.8 1.5-2 0-3.5-1.4-3.5-3.6zm7.2-2h.8l-.2 1.4h1.1l.2-1.4h.8l-.2 1.4h.8v.8h-.9l-.2 1.2h.9v.8h-.9l-.2 1.4h-.8l.2-1.4h-1.1l-.2 1.4h-.8l.2-1.4h-.8v-.8h.9l.2-1.2h-.9v-.8h.9l.2-1.4zm1.8 2.2l-.2 1.2h1.1l.2-1.2H12z"
      />
    </SvgBase>
  );
}

export function SetiPhpIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#777BB4" />
      <path
        fill="#FFFFFF"
        d="M2.5 5.5h2.5c1.1 0 1.8.6 1.8 1.6 0 1.2-.8 1.8-1.8 1.8H3.7v2.6H2.5V5.5zm1.2 2.4h1.2c.5 0 .8-.2.8-.7 0-.4-.3-.7-.8-.7H3.7v1.4zm4.1-2.4h1.2v2.2h1.8V5.5H12v6H10.8V8.7H8.9v2.8H7.8V5.5zm5.5 0h2.4c1.1 0 1.8.6 1.8 1.6 0 1.2-.8 1.8-1.8 1.8h-1.2v2.6h-1.2V5.5zm1.2 2.4h1.1c.5 0 .8-.2.8-.7 0-.4-.3-.7-.8-.7h-1.1v1.4z"
      />
    </SvgBase>
  );
}

export function SetiRubyIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#CC342D"
        d="M4.2 3.5l3.8-1.7 3.8 1.7 2.2 4.1-6 6.6-6-6.6 2.2-4.1zm3.8 7.9l4.5-4.9-1.6-3-2.9 7.9zm-3.1-7.9l-1.6 3 4.5 4.9-2.9-7.9zm1-1l2.1 6.5 2.1-6.5-4.2 0z"
      />
    </SvgBase>
  );
}

export function SetiSwiftIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#F05138" />
      <path
        fill="#FFFFFF"
        d="M13.2 12.3c-2.4 1.8-5.6 1.5-5.6 1.5 3.5-1.7 4.1-4.8 4.1-4.8-1.4 1-3.2 1.3-4.5 1.1 3-2.1 3.5-5.4 3.5-5.4C9.2 6.5 7.1 8 5.6 9.4 4.5 8.1 4.5 6.4 4.5 6.4c-.1 2.3 1.3 4.5 2.6 5.5-2.2-.1-3.9-1.6-3.9-1.6.4 2.2 2.6 3.6 4.6 3.7-2.6.4-5.2-.8-5.2-.8 2.5 2.1 6.2 1.6 8.5.5.7-.3 1.5-.8 2.1-1.4z"
      />
    </SvgBase>
  );
}

export function SetiKotlinIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path fill="#7F52FF" d="M14 14H2V2h12L8 8l6 6z" />
      <path fill="#F18E33" d="M2 2l6 6-6 6V2z" />
    </SvgBase>
  );
}

export function SetiDartIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path fill="#00B4AB" d="M3 3l5 1.5L13 3l-2.5 5 2.5 5-5-1.5L3 13l2.5-5L3 3z" />
      <path fill="#00796B" d="M8 4.5L11 8l-3 3.5L5 8l3-3.5z" />
    </SvgBase>
  );
}

// ---------------------------------------------------------------------------
// WEB & MARKUP & DATA
// ---------------------------------------------------------------------------

export function SetiHtmlIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#E34F26"
        d="M2.5 2l1.1 11.2L8 14.5l4.4-1.3L13.5 2H2.5zm8.9 3.5H5.8l.2 1.7h5.2l-.4 4.4L8 12.3l-2.8-.7-.2-2.1h1.5l.1 1.1 1.4.4 1.4-.4.2-1.9H5.2L4.7 4h6.9l-.2 1.5z"
      />
    </SvgBase>
  );
}

export function SetiCssIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#1572B6"
        d="M2.5 2l1.1 11.2L8 14.5l4.4-1.3L13.5 2H2.5zm8.9 3.5H5.8l.2 1.7h5.2l-.4 4.4L8 12.3l-2.8-.7-.2-2.1h1.5l.1 1.1 1.4.4 1.4-.4.2-1.9H5.2L4.7 4h6.9l-.2 1.5z"
      />
    </SvgBase>
  );
}

export function SetiSassIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#CC6699" />
      <path
        fill="#FFFFFF"
        d="M8.2 5.5c-1.5 0-2.4.7-2.4 1.7 0 1.9 2.8 1.4 2.8 2.5 0 .5-.4.8-1 .8-.8 0-1.5-.4-1.9-.9l-.8.8c.6.8 1.6 1.3 2.7 1.3 1.6 0 2.5-.8 2.5-1.9 0-2-2.8-1.5-2.8-2.6 0-.4.4-.7.9-.7.6 0 1.2.3 1.6.7l.8-.8c-.6-.7-1.4-1-2.4-1z"
      />
    </SvgBase>
  );
}

export function SetiJsonIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fill="#CBCB41"
        fontFamily="monospace"
        fontWeight="bold"
        fontSize="12"
      >
        &#123;&#125;
      </text>
    </SvgBase>
  );
}

export function SetiYamlIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#CB171E" />
      <path
        fill="#FFFFFF"
        d="M4 4.5l2.2 3.6v3.4h1.6V8.1L10 4.5H8.3L7.1 6.8 5.8 4.5H4zm7.5 5.5h1.2v1.5h-1.2V10zm0-5.5h1.2v4.3h-1.2V4.5z"
      />
    </SvgBase>
  );
}

export function SetiMarkdownIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#519ABA" />
      <path
        fill="#FFFFFF"
        d="M2.5 5h1.5l1.5 2 1.5-2h1.5v6H7V7.5L5.5 9.5 4 7.5V11H2.5V5zm8.5 0h1.5v3.5h1.5L12.2 11l-1.8-2.5h1.6V5z"
      />
    </SvgBase>
  );
}

export function SetiShellIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#2E3440" />
      <path
        fill="#A3BE8C"
        d="M3.5 4.5l3.5 3-3.5 3v-1.5L5.5 7.5 3.5 6V4.5zm4.5 5.5h4.5v1.5H8V10z"
      />
    </SvgBase>
  );
}

export function SetiSqlIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <ellipse cx="8" cy="4" rx="5" ry="2" fill="#E38C00" />
      <path
        fill="#E38C00"
        d="M3 4v3.5c0 1.1 2.2 2 5 2s5-.9 5-2V4c-.8.8-2.6 1.4-5 1.4S3.8 4.8 3 4z"
      />
      <path
        fill="#E38C00"
        d="M3 8v3.5c0 1.1 2.2 2 5 2s5-.9 5-2V8c-.8.8-2.6 1.4-5 1.4S3.8 8.8 3 8z"
      />
    </SvgBase>
  );
}

// ---------------------------------------------------------------------------
// CONFIGURATION & BUILD TOOLS
// ---------------------------------------------------------------------------

export function SetiGitIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#F14E32"
        d="M14.4 7.2L8.8 1.6c-.4-.4-1-.4-1.4 0L6.1 3c-.3-.1-.7-.1-1-.1C4 2.9 3.1 3.7 3 4.8l-1.4.7c-.4.4-.4 1 0 1.4l5.6 5.6c.4.4 1 .4 1.4 0l1.9-1.9c.4.1.8.1 1.2 0 .9-.3 1.5-1.1 1.6-2l1.1-1.1c.4-.5.4-1.1 0-1.3zm-6 4.7c-.6 0-1.1-.5-1.1-1.1 0-.4.2-.8.6-1V7.7c-.4-.2-.6-.6-.6-1 0-.6.5-1.1 1.1-1.1s1.1.5 1.1 1.1c0 .4-.2.8-.6 1v2.1c.4.2.6.6.6 1 0 .6-.5 1.1-1.1 1.1zm3.8-3.8c-.6 0-1.1-.5-1.1-1.1s.5-1.1 1.1-1.1 1.1.5 1.1 1.1-.5 1.1-1.1 1.1z"
      />
    </SvgBase>
  );
}

export function SetiDockerIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect x="2" y="6" width="2" height="1.6" fill="#0DB7ED" />
      <rect x="4.5" y="6" width="2" height="1.6" fill="#0DB7ED" />
      <rect x="7" y="6" width="2" height="1.6" fill="#0DB7ED" />
      <rect x="4.5" y="4" width="2" height="1.6" fill="#0DB7ED" />
      <rect x="7" y="4" width="2" height="1.6" fill="#0DB7ED" />
      <rect x="9.5" y="6" width="2" height="1.6" fill="#0DB7ED" />
      <path
        fill="#0DB7ED"
        d="M14.5 8c-.4 0-1 .2-1.3.5C12.5 7.5 11 7.6 11 7.6H1c-.3 1.2 0 3.9 3.2 4.4 3.2.5 7.3.3 9.3-2.5.6.2 1.3.1 1.7-.3.2-.2.3-.5.3-.8 0 0-.4-.4-2-.4z"
      />
    </SvgBase>
  );
}

export function SetiNpmIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#CB3837" />
      <path fill="#FFFFFF" d="M3 4h10v8H8V6H6v6H3V4z" />
    </SvgBase>
  );
}

export function SetiYarnIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <circle cx="8" cy="8" r="6" fill="#2C8EBB" />
      <path
        fill="#FFFFFF"
        d="M5 6c1.5 0 2.5.8 3 1.8C8.5 6.8 9.5 6 11 6c1.1 0 2 .9 2 2 0 2.2-2.5 3.5-5 5-2.5-1.5-5-2.8-5-5 0-1.1.9-2 2-2z"
      />
    </SvgBase>
  );
}

export function SetiPnpmIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect x="2" y="2" width="3.5" height="3.5" fill="#F9AD00" />
      <rect x="6.2" y="2" width="3.5" height="3.5" fill="#F9AD00" />
      <rect x="10.5" y="2" width="3.5" height="3.5" fill="#F9AD00" />
      <rect x="2" y="6.2" width="3.5" height="3.5" fill="#F9AD00" />
      <rect x="6.2" y="6.2" width="3.5" height="3.5" fill="#F9AD00" />
      <rect x="10.5" y="6.2" width="3.5" height="3.5" fill="#4B32C3" />
      <rect x="6.2" y="10.5" width="3.5" height="3.5" fill="#4B32C3" />
      <rect x="10.5" y="10.5" width="3.5" height="3.5" fill="#4B32C3" />
    </SvgBase>
  );
}

export function SetiViteIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#646CFF"
        d="M14.5 3.2L8.5 14.8c-.2.4-.8.4-1 0L1.5 3.2c-.3-.5.1-1 .7-.9l6 1.2 5.6-1.2c.6-.1 1 .4.7.9z"
      />
      <path
        fill="#FFD43B"
        d="M10.8 2.5L5.5 9h2.2l-1.2 4.5 5.5-6.5h-2.2l1-4.5z"
      />
    </SvgBase>
  );
}

export function SetiNextJsIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <circle cx="8" cy="8" r="7" fill="#000000" stroke="#333333" strokeWidth="0.8" />
      <path
        fill="#FFFFFF"
        d="M5 4.5h1.5v7H5v-7zm5 0h1.5v7H10v-7zm-4 0l5.8 7.3h-1.6L5 5.3v-.8z"
      />
    </SvgBase>
  );
}

export function SetiTailwindIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#38BDF8"
        d="M4.5 7.5c.7-1.3 1.8-2 3.3-2 2.2 0 2.8 1.6 3.9 1.6.8 0 1.4-.4 1.8-1.1-.7 1.3-1.8 2-3.3 2-2.2 0-2.8-1.6-3.9-1.6-.8 0-1.4.4-1.8 1.1zm-3 4c.7-1.3 1.8-2 3.3-2 2.2 0 2.8 1.6 3.9 1.6.8 0 1.4-.4 1.8-1.1-.7 1.3-1.8 2-3.3 2-2.2 0-2.8-1.6-3.9-1.6-.8 0-1.4.4-1.8 1.1z"
      />
    </SvgBase>
  );
}

export function SetiEslintIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#4B32C3"
        d="M8 1.5l5.5 3.2v6.4L8 14.3l-5.5-3.2V4.7L8 1.5zm0 1.6L3.9 5.5v5l4.1 2.4 4.1-2.4v-5L8 3.1z"
      />
      <circle cx="8" cy="8" r="2.2" fill="#8080F2" />
    </SvgBase>
  );
}

export function SetiEnvIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#ECD53F" />
      <path
        fill="#000000"
        d="M7 3.5h2v2H7v-2zm-3 3h8v1.5H4V6.5zm1.5 3h5v1.5h-5V9.5zm1.5 3h2V14H7v-1.5z"
      />
    </SvgBase>
  );
}

export function SetiSettingsIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#8C8C8C"
        d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5.7-1.3l-1-.8c.1-.3.1-.6.1-.9s0-.6-.1-.9l1-.8c.2-.2.3-.5.1-.7l-1-1.7c-.1-.2-.4-.3-.7-.2l-1.2.5c-.3-.2-.6-.4-1-.5l-.2-1.3c0-.3-.3-.5-.6-.5h-2c-.3 0-.5.2-.6.5l-.2 1.3c-.3.1-.7.3-1 .5l-1.2-.5c-.3-.1-.6 0-.7.2l-1 1.7c-.1.2-.1.5.1.7l1 .8c-.1.3-.1.6-.1.9s0 .6.1.9l-1 .8c-.2.2-.3.5-.1.7l1 1.7c.1.2.4.3.7.2l1.2-.5c.3.2.7.4 1 .5l.2 1.3c0 .3.3.5.6.5h2c.3 0 .5-.2.6-.5l.2-1.3c.3-.1.7-.3 1-.5l1.2.5c.3.1.6 0 .7-.2l1-1.7c.1-.2.1-.5-.1-.7z"
      />
    </SvgBase>
  );
}

export function SetiLicenseIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#E38C00" />
      <path
        fill="#FFFFFF"
        d="M4 4h8v1.5H4V4zm0 3h8v1.5H4V7zm0 3h5v1.5H4V10z"
      />
    </SvgBase>
  );
}

// ---------------------------------------------------------------------------
// MEDIA & ASSETS
// ---------------------------------------------------------------------------

export function SetiImageIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#A074C4" />
      <circle cx="5" cy="5" r="1.5" fill="#FFFFFF" />
      <path fill="#FFFFFF" d="M2.5 12.5l3.5-4.5 2.5 3 3-4 2 5.5h-11z" />
    </SvgBase>
  );
}

export function SetiVideoIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#8A63D2" />
      <polygon points="6,4.5 12,8 6,11.5" fill="#FFFFFF" />
    </SvgBase>
  );
}

export function SetiAudioIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#E06C75" />
      <path
        fill="#FFFFFF"
        d="M7 4H5v5.5C4.6 9.2 4 9 3.5 9 2.1 9 1 10.1 1 11.5S2.1 14 3.5 14 6 12.9 6 11.5V6.5h5V9.5c-.4-.3-1-.5-1.5-.5-1.4 0-2.5 1.1-2.5 2.5S8.1 14 9.5 14s2.5-1.1 2.5-2.5V4H7z"
      />
    </SvgBase>
  );
}

export function SetiArchiveIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <rect width="16" height="16" rx="2" fill="#CCA152" />
      <path
        fill="#1C1C1C"
        d="M7 2h2v1H7V2zm0 2h2v1H7V4zm0 2h2v1H7V6zm0 2h2v1H7V8zm-1 3h4v3H6v-3z"
      />
    </SvgBase>
  );
}

// ---------------------------------------------------------------------------
// DEFAULT FALLBACKS
// ---------------------------------------------------------------------------

export function SetiDefaultFileIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#8A8A8A"
        d="M3.5 2C2.7 2 2 2.7 2 3.5v9c0 .8.7 1.5 1.5 1.5h9c.8 0 1.5-.7 1.5-1.5V6.5L9.5 2h-6zm5.5 1.2L12.3 6H9V3.2z"
      />
    </SvgBase>
  );
}

// ---------------------------------------------------------------------------
// FOLDERS (CLOSED & EXPANDED)
// ---------------------------------------------------------------------------

export function SetiFolderClosedIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#DCB67A"
        d="M1.5 3C1.2 3 1 3.2 1 3.5v9c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5v-7c0-.3-.2-.5-.5-.5H7.7L6.2 3.2c-.1-.1-.3-.2-.5-.2H1.5z"
      />
    </SvgBase>
  );
}

export function SetiFolderOpenIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <path
        fill="#C9A265"
        d="M1.5 3C1.2 3 1 3.2 1 3.5V6h14V5.5c0-.3-.2-.5-.5-.5H7.7L6.2 3.2c-.1-.1-.3-.2-.5-.2H1.5z"
      />
      <path
        fill="#DCB67A"
        d="M1.2 6.5l1.6 6c.1.3.3.5.6.5h11.2c.3 0 .5-.2.6-.5l1.2-6H1.2z"
      />
    </SvgBase>
  );
}

// Specialized folder creators with badge
function createBadgeFolder(
  badgeColor: string,
  badgeContent: React.ReactNode,
  isOpen = false
) {
  return function BadgeFolder(props: IconRenderProps) {
    return (
      <SvgBase {...props}>
        {isOpen ? (
          <>
            <path
              fill="#C9A265"
              d="M1.5 3C1.2 3 1 3.2 1 3.5V6h14V5.5c0-.3-.2-.5-.5-.5H7.7L6.2 3.2c-.1-.1-.3-.2-.5-.2H1.5z"
            />
            <path
              fill="#DCB67A"
              d="M1.2 6.5l1.6 6c.1.3.3.5.6.5h11.2c.3 0 .5-.2.6-.5l1.2-6H1.2z"
            />
          </>
        ) : (
          <path
            fill="#DCB67A"
            d="M1.5 3C1.2 3 1 3.2 1 3.5v9c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5v-7c0-.3-.2-.5-.5-.5H7.7L6.2 3.2c-.1-.1-.3-.2-.5-.2H1.5z"
          />
        )}
        <g fill={badgeColor} transform="translate(5, 7.5) scale(0.65)">
          {badgeContent}
        </g>
      </SvgBase>
    );
  };
}

export const SetiSrcFolderClosed = createBadgeFolder("#FFFFFF", <path d="M2 5l3-3v2h4V2l3 3-3 3V6H5v2L2 5z" />);
export const SetiSrcFolderOpen = createBadgeFolder("#FFFFFF", <path d="M2 5l3-3v2h4V2l3 3-3 3V6H5v2L2 5z" />, true);

export const SetiComponentsFolderClosed = createBadgeFolder("#00D8FF", <circle cx="5" cy="5" r="3" />);
export const SetiComponentsFolderOpen = createBadgeFolder("#00D8FF", <circle cx="5" cy="5" r="3" />, true);

export const SetiAppFolderClosed = createBadgeFolder("#38BDF8", <rect x="1" y="1" width="8" height="8" rx="2" />);
export const SetiAppFolderOpen = createBadgeFolder("#38BDF8", <rect x="1" y="1" width="8" height="8" rx="2" />, true);

export const SetiPublicFolderClosed = createBadgeFolder("#42A5F5", <circle cx="5" cy="5" r="4" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />);
export const SetiPublicFolderOpen = createBadgeFolder("#42A5F5", <circle cx="5" cy="5" r="4" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />, true);

export const SetiAssetsFolderClosed = createBadgeFolder("#A074C4", <polygon points="1,8 4,3 7,7 9,5 11,8" />);
export const SetiAssetsFolderOpen = createBadgeFolder("#A074C4", <polygon points="1,8 4,3 7,7 9,5 11,8" />, true);

export const SetiTestFolderClosed = createBadgeFolder("#A3BE8C", <path d="M4 1h4v2H7v4l2.5 3h-7L5 7V3H4V1z" />);
export const SetiTestFolderOpen = createBadgeFolder("#A3BE8C", <path d="M4 1h4v2H7v4l2.5 3h-7L5 7V3H4V1z" />, true);

export const SetiNodeModulesFolderClosed = createBadgeFolder("#CB3837", <rect x="2" y="2" width="6" height="6" />);
export const SetiNodeModulesFolderOpen = createBadgeFolder("#CB3837", <rect x="2" y="2" width="6" height="6" />, true);

export const SetiGitFolderClosed = createBadgeFolder("#F14E32", <circle cx="3" cy="7" r="2" />);
export const SetiGitFolderOpen = createBadgeFolder("#F14E32", <circle cx="3" cy="7" r="2" />, true);

export const SetiVscodeFolderClosed = createBadgeFolder("#007ACC", <rect x="2" y="2" width="6" height="6" rx="1" />);
export const SetiVscodeFolderOpen = createBadgeFolder("#007ACC", <rect x="2" y="2" width="6" height="6" rx="1" />, true);

