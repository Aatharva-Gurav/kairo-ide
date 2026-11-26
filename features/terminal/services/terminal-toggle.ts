export interface TerminalToggleRefs {
  isOpenRef: { current: boolean };
  isCreatingInitialRef: { current: boolean };
  sessionsCount: number;
}

/**
 * Pure imperative toggle helper executed outside React state updaters to avoid
 * StrictMode double-invocations triggering duplicate PTY session creation.
 */
export function performTerminalToggle(
  refs: TerminalToggleRefs,
  setIsOpen: (open: boolean) => void,
  createInitialTerminal: () => Promise<unknown>
): boolean {
  const next = !refs.isOpenRef.current;
  refs.isOpenRef.current = next;
  setIsOpen(next);

  if (next && refs.sessionsCount === 0 && !refs.isCreatingInitialRef.current) {
    refs.isCreatingInitialRef.current = true;
    Promise.resolve(createInitialTerminal())
      .catch(() => {})
      .finally(() => {
        refs.isCreatingInitialRef.current = false;
      });
  }

  return next;
}
