import type { CoreSessionEvent } from "@cline/core";
import type { EventEnvelope } from "../../lib/ai-agent/types";
import { EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import { AgentErrorHandler } from "./error-handler";
import { redactObject } from "../utils/redaction";

export class EventAdapter {
  private seq = 0;
  private readonly turnAccumulatedText = new Map<string, string>();

  public transform(coreEvent: CoreSessionEvent): EventEnvelope | null {
    const timestamp = Date.now();
    const currentSeq = this.seq++;

    switch (coreEvent.type) {
      case "status": {
        return {
          type: "event",
          event: EVENT_NAMES.SESSION_STATUS,
          sessionId: coreEvent.payload.sessionId,
          seq: currentSeq,
          timestamp,
          payload: {
            status: coreEvent.payload.status,
          },
        };
      }

      case "ended": {
        this.turnAccumulatedText.delete(coreEvent.payload.sessionId);
        return {
          type: "event",
          event: EVENT_NAMES.SESSION_STATUS,
          sessionId: coreEvent.payload.sessionId,
          seq: currentSeq,
          timestamp,
          payload: {
            status: "ended",
            reason: coreEvent.payload.reason,
          },
        };
      }

      case "agent_event": {
        const { sessionId, event } = coreEvent.payload;

        switch (event.type) {
          case "iteration_start": {
            this.turnAccumulatedText.set(sessionId, "");
            return {
              type: "event",
              event: EVENT_NAMES.TURN_START,
              sessionId,
              seq: currentSeq,
              timestamp,
              payload: {
                iteration: event.iteration,
              },
            };
          }

          case "iteration_end": {
            return {
              type: "event",
              event: EVENT_NAMES.TURN_COMPLETE,
              sessionId,
              seq: currentSeq,
              timestamp,
              payload: {
                iteration: event.iteration,
                hadToolCalls: event.hadToolCalls,
                toolCallCount: event.toolCallCount,
              },
            };
          }

          case "content_start": {
            // STRICT REASONING REDACTION: Do not emit raw chain-of-thought tokens
            if (event.contentType === "reasoning" || event.reasoning) {
              return {
                type: "event",
                event: EVENT_NAMES.SESSION_STATUS,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  status: "thinking",
                  activity: "Model reasoning...",
                },
              };
            }

            if (event.contentType === "text" && event.text) {
              const current = this.turnAccumulatedText.get(sessionId) || "";
              this.turnAccumulatedText.set(sessionId, current + event.text);

              return {
                type: "event",
                event: EVENT_NAMES.TOKEN_DELTA,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  delta: event.text,
                },
              };
            }

            if (event.contentType === "tool") {
              return {
                type: "event",
                event: EVENT_NAMES.TOOL_STARTED,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  toolCallId: event.toolCallId || "unknown",
                  toolName: event.toolName || "unknown",
                  input: redactObject(event.input),
                },
              };
            }

            return null;
          }

          case "content_update": {
            if (event.contentType === "tool") {
              return {
                type: "event",
                event: EVENT_NAMES.TOOL_PROGRESS,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  toolCallId: event.toolCallId || "unknown",
                  toolName: event.toolName || "unknown",
                  update: redactObject(event.update),
                },
              };
            }
            return null;
          }

          case "content_end": {
            if (event.contentType === "tool") {
              if (event.error) {
                return {
                  type: "event",
                  event: EVENT_NAMES.TOOL_FAILED,
                  sessionId,
                  seq: currentSeq,
                  timestamp,
                  payload: {
                    toolCallId: event.toolCallId || "unknown",
                    toolName: event.toolName || "unknown",
                    error: event.error,
                    durationMs: event.durationMs ?? 0,
                  },
                };
              }

              return {
                type: "event",
                event: EVENT_NAMES.TOOL_COMPLETED,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  toolCallId: event.toolCallId || "unknown",
                  toolName: event.toolName || "unknown",
                  output: redactObject(event.output),
                  durationMs: event.durationMs ?? 0,
                },
              };
            }

            if (event.contentType === "text") {
              const fullText = event.text || this.turnAccumulatedText.get(sessionId) || "";
              // Emit final assistant message representation
              return {
                type: "event",
                event: EVENT_NAMES.ASSISTANT_MESSAGE,
                sessionId,
                seq: currentSeq,
                timestamp,
                payload: {
                  content: fullText,
                  role: "assistant",
                },
              };
            }

            return null;
          }

          case "usage": {
            return {
              type: "event",
              event: EVENT_NAMES.USAGE_UPDATE,
              sessionId,
              seq: currentSeq,
              timestamp,
              payload: {
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cost: event.cost,
                totalInputTokens: event.totalInputTokens,
                totalOutputTokens: event.totalOutputTokens,
                totalCost: event.totalCost,
              },
            };
          }

          case "done": {
            this.turnAccumulatedText.delete(sessionId);
            return {
              type: "event",
              event: EVENT_NAMES.TASK_COMPLETE,
              sessionId,
              seq: currentSeq,
              timestamp,
              payload: {
                reason: event.reason,
                iterations: event.iterations,
                text: event.text,
              },
            };
          }

          case "error": {
            const sanitized = AgentErrorHandler.handle(event.error);
            return {
              type: "event",
              event: EVENT_NAMES.AGENT_ERROR,
              sessionId,
              seq: currentSeq,
              timestamp,
              payload: {
                ...sanitized,
                recoverable: event.recoverable,
                iteration: event.iteration,
              },
            };
          }

          default:
            return null;
        }
      }

      default:
        return null;
    }
  }

  public reset(): void {
    this.seq = 0;
    this.turnAccumulatedText.clear();
  }
}
