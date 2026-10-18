"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useWorkspace } from "@/features/workspace/store";
import { useEditor } from "@/features/editor/store";
import { FloatingCreationButton } from "./floating-creation-button";
import { CreationOptionsPopup } from "./creation-options-popup";
import { WorkspaceDestinationPicker } from "./workspace-destination-picker";
import { CreationType } from "./types";

interface FloatingCreationFeatureProps {
  hasStatusBar?: boolean;
}

export function FloatingCreationFeature({
  hasStatusBar = false,
}: FloatingCreationFeatureProps) {
  const { open: isSidebarOpen } = useSidebar();
  const { activeWorkspace } = useWorkspace();
  const [mounted, setMounted] = useState(false);

  // Interaction states
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [creationType, setCreationType] = useState<CreationType>("file");

  const buttonRef = useRef<HTMLButtonElement>(null);

  // Prevent flash on initial render before client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // When sidebar opens, smoothly close any open menus and hide the button
  useEffect(() => {
    if (isSidebarOpen) {
      setIsOptionsOpen(false);
      setIsPickerOpen(false);
    }
  }, [isSidebarOpen]);

  // When active workspace changes or closes, reset menus
  useEffect(() => {
    setIsOptionsOpen(false);
    setIsPickerOpen(false);
  }, [activeWorkspace?.rootPath]);

  // Handle FAB click
  const handleFabClick = () => {
    if (isPickerOpen) {
      setIsPickerOpen(false);
      setIsOptionsOpen(false);
      return;
    }

    if (isOptionsOpen) {
      setIsOptionsOpen(false);
      return;
    }

    setIsOptionsOpen(true);
  };

  // Handle option selection ("file" or "folder")
  const handleSelectType = (type: CreationType) => {
    setCreationType(type);
    setIsOptionsOpen(false);
    setIsPickerOpen(true);
  };

  // Button visibility is strictly governed by sidebar state (visible when sidebar is closed)
  const isButtonVisible = mounted && !isSidebarOpen && Boolean(activeWorkspace);

  if (!mounted || !activeWorkspace) {
    return null;
  }

  const isAnyMenuOpen = isOptionsOpen || isPickerOpen;

  return (
    <div
      style={{
        bottom: hasStatusBar ? "calc(1.5rem + 16px)" : "16px",
        right: "20px",
      }}
      className="absolute z-40 pointer-events-none"
    >
      <div className="relative pointer-events-auto">
        {/* The 2-Option Popup (New File / New Folder) */}
        <CreationOptionsPopup
          isOpen={isOptionsOpen && isButtonVisible}
          onClose={() => setIsOptionsOpen(false)}
          onSelectType={handleSelectType}
        />

        {/* Notion-Inspired Workspace Destination Picker */}
        <WorkspaceDestinationPicker
          isOpen={isPickerOpen && isButtonVisible}
          initialType={creationType}
          onClose={() => setIsPickerOpen(false)}
        />

        {/* 3D Circular Floating Action Button */}
        <FloatingCreationButton
          ref={buttonRef}
          isVisible={isButtonVisible}
          isOpen={isAnyMenuOpen}
          onClick={handleFabClick}
        />
      </div>
    </div>
  );
}

