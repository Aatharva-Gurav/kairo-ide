import React from "react";
import { IconRenderProps } from "../types";

export function SvgBase({
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
// DEFAULT FILE FALLBACK (NEUTRAL DOCUMENT ICON)
// ---------------------------------------------------------------------------

export function DefaultFileIcon(props: IconRenderProps) {
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
// FOLDERS (CLOSED & EXPANDED - macOS STYLE)
// ---------------------------------------------------------------------------

export function FolderClosedIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <defs>
        <linearGradient id="macos-closed-tab" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#53b5ff" />
          <stop offset="100%" stopColor="#1d89f3" />
        </linearGradient>
        <linearGradient id="macos-closed-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#44a7f8" />
          <stop offset="100%" stopColor="#0d72eb" />
        </linearGradient>
      </defs>
      {/* Back tab and plate */}
      <path
        d="M 1.75 2.5 C 1.75 2.08 2.08 1.75 2.5 1.75 L 5.75 1.75 C 6.2 1.75 6.6 2.05 6.75 2.45 L 7.35 3.9 C 7.5 4.25 7.85 4.5 8.25 4.5 L 13.5 4.5 C 13.92 4.5 14.25 4.83 14.25 5.25 L 14.25 12.5 C 14.25 13.19 13.69 13.75 13 13.75 L 3 13.75 C 2.31 13.75 1.75 13.19 1.75 12.5 Z"
        fill="url(#macos-closed-tab)"
      />
      {/* Front flap body */}
      <rect
        x="1.75"
        y="4.5"
        width="12.5"
        height="9.25"
        rx="1.5"
        fill="url(#macos-closed-body)"
      />
      {/* Top highlight line on front flap */}
      <path
        d="M 2.75 4.75 L 13.25 4.75"
        stroke="#a2dcff"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      {/* Debossed horizontal crease line */}
      <rect
        x="5.5"
        y="8.75"
        width="5"
        height="0.75"
        rx="0.375"
        fill="#0852b5"
        opacity="0.45"
      />
    </SvgBase>
  );
}

export function FolderOpenIcon(props: IconRenderProps) {
  return (
    <SvgBase {...props}>
      <defs>
        <linearGradient id="macos-open-tab" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#53b5ff" />
          <stop offset="100%" stopColor="#1d89f3" />
        </linearGradient>
        <linearGradient id="macos-open-interior" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0a4d9e" />
          <stop offset="100%" stopColor="#1564c0" />
        </linearGradient>
        <linearGradient id="macos-open-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#58b4fb" />
          <stop offset="100%" stopColor="#1278ee" />
        </linearGradient>
      </defs>
      {/* Back tab and plate */}
      <path
        d="M 1.75 2.5 C 1.75 2.08 2.08 1.75 2.5 1.75 L 5.75 1.75 C 6.2 1.75 6.6 2.05 6.75 2.45 L 7.35 3.9 C 7.5 4.25 7.85 4.5 8.25 4.5 L 13.5 4.5 C 13.92 4.5 14.25 4.83 14.25 5.25 L 14.25 12.5 C 14.25 13.19 13.69 13.75 13 13.75 L 3 13.75 C 2.31 13.75 1.75 13.19 1.75 12.5 Z"
        fill="url(#macos-open-tab)"
      />
      {/* Dark interior folder pocket */}
      <rect
        x="2.5"
        y="4.5"
        width="11"
        height="6"
        rx="1"
        fill="url(#macos-open-interior)"
      />
      {/* White sheet of document peeking out */}
      <rect
        x="4"
        y="3"
        width="8"
        height="5.5"
        rx="0.75"
        fill="#f8fafc"
      />
      <line x1="5.5" y1="4.5" x2="9.5" y2="4.5" stroke="#cbd5e1" strokeWidth="0.65" strokeLinecap="round" />
      <line x1="5.5" y1="6" x2="8" y2="6" stroke="#cbd5e1" strokeWidth="0.65" strokeLinecap="round" />
      {/* Open front flap angled forward */}
      <path
        d="M 1.25 7.25 C 1.25 6.8 1.6 6.45 2.05 6.45 L 13.95 6.45 C 14.4 6.45 14.75 6.8 14.75 7.25 L 13.95 13.25 C 13.85 13.8 13.4 14.2 12.85 14.2 L 3.15 14.2 C 2.6 14.2 2.15 13.8 2.05 13.25 Z"
        fill="url(#macos-open-body)"
      />
      {/* Top rim highlight on open front flap */}
      <path
        d="M 2.2 6.65 L 13.8 6.65"
        stroke="#bde5ff"
        strokeWidth="0.75"
        strokeLinecap="round"
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
            <defs>
              <linearGradient id="macos-badge-tab-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#53b5ff" />
                <stop offset="100%" stopColor="#1d89f3" />
              </linearGradient>
              <linearGradient id="macos-badge-int-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0a4d9e" />
                <stop offset="100%" stopColor="#1564c0" />
              </linearGradient>
              <linearGradient id="macos-badge-body-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#58b4fb" />
                <stop offset="100%" stopColor="#1278ee" />
              </linearGradient>
            </defs>
            <path
              d="M 1.75 2.5 C 1.75 2.08 2.08 1.75 2.5 1.75 L 5.75 1.75 C 6.2 1.75 6.6 2.05 6.75 2.45 L 7.35 3.9 C 7.5 4.25 7.85 4.5 8.25 4.5 L 13.5 4.5 C 13.92 4.5 14.25 4.83 14.25 5.25 L 14.25 12.5 C 14.25 13.19 13.69 13.75 13 13.75 L 3 13.75 C 2.31 13.75 1.75 13.19 1.75 12.5 Z"
              fill="url(#macos-badge-tab-open)"
            />
            <rect x="2.5" y="4.5" width="11" height="6" rx="1" fill="url(#macos-badge-int-open)" />
            <path
              d="M 1.25 7.25 C 1.25 6.8 1.6 6.45 2.05 6.45 L 13.95 6.45 C 14.4 6.45 14.75 6.8 14.75 7.25 L 13.95 13.25 C 13.85 13.8 13.4 14.2 12.85 14.2 L 3.15 14.2 C 2.6 14.2 2.15 13.8 2.05 13.25 Z"
              fill="url(#macos-badge-body-open)"
            />
            <path d="M 2.2 6.65 L 13.8 6.65" stroke="#bde5ff" strokeWidth="0.75" strokeLinecap="round" />
          </>
        ) : (
          <>
            <defs>
              <linearGradient id="macos-badge-tab-closed" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#53b5ff" />
                <stop offset="100%" stopColor="#1d89f3" />
              </linearGradient>
              <linearGradient id="macos-badge-body-closed" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#44a7f8" />
                <stop offset="100%" stopColor="#0d72eb" />
              </linearGradient>
            </defs>
            <path
              d="M 1.75 2.5 C 1.75 2.08 2.08 1.75 2.5 1.75 L 5.75 1.75 C 6.2 1.75 6.6 2.05 6.75 2.45 L 7.35 3.9 C 7.5 4.25 7.85 4.5 8.25 4.5 L 13.5 4.5 C 13.92 4.5 14.25 4.83 14.25 5.25 L 14.25 12.5 C 14.25 13.19 13.69 13.75 13 13.75 L 3 13.75 C 2.31 13.75 1.75 13.19 1.75 12.5 Z"
              fill="url(#macos-badge-tab-closed)"
            />
            <rect x="1.75" y="4.5" width="12.5" height="9.25" rx="1.5" fill="url(#macos-badge-body-closed)" />
            <path d="M 2.75 4.75 L 13.25 4.75" stroke="#a2dcff" strokeWidth="0.65" strokeLinecap="round" />
          </>
        )}
        <g fill={badgeColor} transform="translate(5, 7.5) scale(0.65)">
          {badgeContent}
        </g>
      </SvgBase>
    );
  };
}

export const SrcFolderClosed = createBadgeFolder("#FFFFFF", <path d="M2 5l3-3v2h4V2l3 3-3 3V6H5v2L2 5z" />);
export const SrcFolderOpen = createBadgeFolder("#FFFFFF", <path d="M2 5l3-3v2h4V2l3 3-3 3V6H5v2L2 5z" />, true);

export const ComponentsFolderClosed = createBadgeFolder("#00D8FF", <circle cx="5" cy="5" r="3" />);
export const ComponentsFolderOpen = createBadgeFolder("#00D8FF", <circle cx="5" cy="5" r="3" />, true);

export const AppFolderClosed = createBadgeFolder("#38BDF8", <rect x="1" y="1" width="8" height="8" rx="2" />);
export const AppFolderOpen = createBadgeFolder("#38BDF8", <rect x="1" y="1" width="8" height="8" rx="2" />, true);

export const PublicFolderClosed = createBadgeFolder("#42A5F5", <circle cx="5" cy="4" r="4" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />);
export const PublicFolderOpen = createBadgeFolder("#42A5F5", <circle cx="5" cy="4" r="4" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />, true);

export const AssetsFolderClosed = createBadgeFolder("#A074C4", <polygon points="1,8 4,3 7,7 9,5 11,8" />);
export const AssetsFolderOpen = createBadgeFolder("#A074C4", <polygon points="1,8 4,3 7,7 9,5 11,8" />, true);

export const TestFolderClosed = createBadgeFolder("#A3BE8C", <path d="M4 1h4v2H7v4l2.5 3h-7L5 7V3H4V1z" />);
export const TestFolderOpen = createBadgeFolder("#A3BE8C", <path d="M4 1h4v2H7v4l2.5 3h-7L5 7V3H4V1z" />, true);

export const NodeModulesFolderClosed = createBadgeFolder("#CB3837", <rect x="2" y="2" width="6" height="6" />);
export const NodeModulesFolderOpen = createBadgeFolder("#CB3837", <rect x="2" y="2" width="6" height="6" />, true);

export const GitFolderClosed = createBadgeFolder("#F14E32", <circle cx="3" cy="7" r="2" />);
export const GitFolderOpen = createBadgeFolder("#F14E32", <circle cx="3" cy="7" r="2" />, true);

export const VscodeFolderClosed = createBadgeFolder("#007ACC", <rect x="2" y="2" width="6" height="6" rx="1" />);
export const VscodeFolderOpen = createBadgeFolder("#007ACC", <rect x="2" y="2" width="6" height="6" rx="1" />, true);

