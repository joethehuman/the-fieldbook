import type { AiConnection, AiMessage, AiModel, AiSource } from "@/lib/ai";

/** Application operations; no Gateway clients, SDK messages or provider options. */
export interface AiProvider {
  readonly name: string;
  connection(): AiConnection;
  models(signal: AbortSignal): Promise<AiModel[]>;
  validateModel(model: string, signal: AbortSignal): Promise<void>;
  planSearch(input: {
    model: string;
    messages: AiMessage[];
    instructions: string;
    signal: AbortSignal;
  }): Promise<string[]>;
  streamAnswer(input: {
    model: string;
    messages: AiMessage[];
    sources: AiSource[];
    instructions: string;
    signal: AbortSignal;
  }): AsyncIterable<string>;
}
