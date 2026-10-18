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
    <SvgBase viewBox="0 0 20 16" {...props}>
      <defs>
        <linearGradient id="macos-closed-tab" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#97ddff" />
          <stop offset="100%" stopColor="#7cd0fd" />
        </linearGradient>
        <linearGradient id="macos-closed-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6ecff9" />
          <stop offset="50%" stopColor="#63c8f8" />
          <stop offset="100%" stopColor="#4eb8f5" />
        </linearGradient>
      </defs>
      {/* Drop shadow underneath */}
      <rect x="1.5" y="15.0" width="17" height="0.8" rx="0.4" fill="#000000" opacity="0.16" />
      {/* Back tab and plate */}
      <path
        d="M 1 2.2 C 1 1.4 1.5 0.8 2.3 0.8 L 6.0 0.8 C 6.5 0.8 7.0 1.0 7.3 1.4 L 8.1 2.4 C 8.4 2.7 8.8 2.85 9.2 2.85 L 17.7 2.85 C 18.5 2.85 19 3.35 19 4.15 L 19 14.2 C 19 14.9 18.5 15.4 17.7 15.4 L 2.3 15.4 C 1.5 15.4 1 14.9 1 14.2 Z"
        fill="url(#macos-closed-tab)"
      />
      {/* Front flap body matching reference image */}
      <rect
        x="0.8"
        y="3.4"
        width="18.4"
        height="11.8"
        rx="1.5"
        fill="url(#macos-closed-body)"
      />
      {/* Subtle top edge highlight */}
      <path
        d="M 2.2 3.8 L 17.8 3.8"
        stroke="#bce8fe"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

export function FolderOpenIcon(props: IconRenderProps) {
  return (
    <SvgBase viewBox="0 0 20 16" {...props}>
      <defs>
        <linearGradient id="macos-open-tab" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#97ddff" />
          <stop offset="100%" stopColor="#7cd0fd" />
        </linearGradient>
        <linearGradient id="macos-open-interior" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e88e5" />
          <stop offset="100%" stopColor="#1565c0" />
        </linearGradient>
        <linearGradient id="macos-open-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#72d3fb" />
          <stop offset="100%" stopColor="#4eb8f5" />
        </linearGradient>
      </defs>
      {/* Drop shadow */}
      <rect x="1.5" y="15.0" width="17" height="0.8" rx="0.4" fill="#000000" opacity="0.16" />
      {/* Back tab and plate */}
      <path
        d="M 1 2.2 C 1 1.4 1.5 0.8 2.3 0.8 L 6.0 0.8 C 6.5 0.8 7.0 1.0 7.3 1.4 L 8.1 2.4 C 8.4 2.7 8.8 2.85 9.2 2.85 L 17.7 2.85 C 18.5 2.85 19 3.35 19 4.15 L 19 14.2 C 19 14.9 18.5 15.4 17.7 15.4 L 2.3 15.4 C 1.5 15.4 1 14.9 1 14.2 Z"
        fill="url(#macos-open-tab)"
      />
      {/* Interior document pocket */}
      <rect
        x="2.5"
        y="2.6"
        width="15"
        height="8.2"
        rx="1"
        fill="url(#macos-open-interior)"
      />
      {/* Paper sheet peeking out */}
      <rect
        x="3.8"
        y="1.8"
        width="12.4"
        height="6.8"
        rx="0.8"
        fill="#f8fafc"
      />
      <line x1="5.5" y1="3.6" x2="11.5" y2="3.6" stroke="#94a3b8" strokeWidth="0.65" strokeLinecap="round" />
      <line x1="5.5" y1="5.2" x2="13.5" y2="5.2" stroke="#cbd5e1" strokeWidth="0.65" strokeLinecap="round" />
      {/* Open front flap angled forward */}
      <path
        d="M 0.6 6.4 C 0.6 5.8 1.1 5.3 1.7 5.3 L 18.3 5.3 C 18.9 5.3 19.4 5.8 19.4 6.4 L 18.5 14.8 C 18.4 15.4 17.8 15.8 17.2 15.8 L 2.8 15.8 C 2.2 15.8 1.6 15.4 1.5 14.8 Z"
        fill="url(#macos-open-body)"
      />
      {/* Highlight on rim */}
      <path
        d="M 2 5.7 L 18 5.7"
        stroke="#c2ebfe"
        strokeWidth="0.65"
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
      <SvgBase viewBox="0 0 20 16" {...props}>
        {isOpen ? (
          <>
            <defs>
              <linearGradient id="macos-badge-tab-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#97ddff" />
                <stop offset="100%" stopColor="#7cd0fd" />
              </linearGradient>
              <linearGradient id="macos-badge-int-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1e88e5" />
                <stop offset="100%" stopColor="#1565c0" />
              </linearGradient>
              <linearGradient id="macos-badge-body-open" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#72d3fb" />
                <stop offset="100%" stopColor="#4eb8f5" />
              </linearGradient>
            </defs>
            <rect x="1.5" y="15.0" width="17" height="0.8" rx="0.4" fill="#000000" opacity="0.16" />
            <path
              d="M 1 2.2 C 1 1.4 1.5 0.8 2.3 0.8 L 6.0 0.8 C 6.5 0.8 7.0 1.0 7.3 1.4 L 8.1 2.4 C 8.4 2.7 8.8 2.85 9.2 2.85 L 17.7 2.85 C 18.5 2.85 19 3.35 19 4.15 L 19 14.2 C 19 14.9 18.5 15.4 17.7 15.4 L 2.3 15.4 C 1.5 15.4 1 14.9 1 14.2 Z"
              fill="url(#macos-badge-tab-open)"
            />
            <rect x="2.5" y="2.6" width="15" height="8.2" rx="1" fill="url(#macos-badge-int-open)" />
            <path
              d="M 0.6 6.4 C 0.6 5.8 1.1 5.3 1.7 5.3 L 18.3 5.3 C 18.9 5.3 19.4 5.8 19.4 6.4 L 18.5 14.8 C 18.4 15.4 17.8 15.8 17.2 15.8 L 2.8 15.8 C 2.2 15.8 1.6 15.4 1.5 14.8 Z"
              fill="url(#macos-badge-body-open)"
            />
            <path d="M 2 5.7 L 18 5.7" stroke="#c2ebfe" strokeWidth="0.65" strokeLinecap="round" />
          </>
        ) : (
          <>
            <defs>
              <linearGradient id="macos-badge-tab-closed" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#97ddff" />
                <stop offset="100%" stopColor="#7cd0fd" />
              </linearGradient>
              <linearGradient id="macos-badge-body-closed" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6ecff9" />
                <stop offset="50%" stopColor="#63c8f8" />
                <stop offset="100%" stopColor="#4eb8f5" />
              </linearGradient>
            </defs>
            <rect x="1.5" y="15.0" width="17" height="0.8" rx="0.4" fill="#000000" opacity="0.16" />
            <path
              d="M 1 2.2 C 1 1.4 1.5 0.8 2.3 0.8 L 6.0 0.8 C 6.5 0.8 7.0 1.0 7.3 1.4 L 8.1 2.4 C 8.4 2.7 8.8 2.85 9.2 2.85 L 17.7 2.85 C 18.5 2.85 19 3.35 19 4.15 L 19 14.2 C 19 14.9 18.5 15.4 17.7 15.4 L 2.3 15.4 C 1.5 15.4 1 14.9 1 14.2 Z"
              fill="url(#macos-badge-tab-closed)"
            />
            <rect x="0.8" y="3.4" width="18.4" height="11.8" rx="1.5" fill="url(#macos-badge-body-closed)" />
            <path d="M 2.2 3.8 L 17.8 3.8" stroke="#bce8fe" strokeWidth="0.6" strokeLinecap="round" />
          </>
        )}
        <g fill={badgeColor} transform={isOpen ? "translate(6.5, 7.5) scale(0.65)" : "translate(6.5, 6) scale(0.65)"}>
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

