/**
 * Session persistence store stub for Kairo AI Agent sidecar.
 * Will be fully implemented in Stage 04 (storing transcripts and metadata in ~/.kairo/sessions/).
 */

export interface SessionMetadata {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ISessionStore {
  listSessions(): Promise<SessionMetadata[]>;
  loadSession(sessionId: string): Promise<unknown>;
  saveSession(sessionId: string, data: unknown): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}
