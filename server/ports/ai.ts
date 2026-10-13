import type {
  AiConnection,
  AiMessage,
  AiModel,
  AiRouter,
  AiSource,
} from "@/lib/ai";

/** Application operations; no Gateway clients, SDK messages or provider options. */
export interface AiProvider {
  readonly id: string;
  readonly name: string;
  /** Whether Fieldbook may select a separate fallback alongside the target. */
  readonly supportsFallback: boolean;
  readonly routerSelection?: AiRouter["routerSelection"];
  connection(): AiConnection;
  models(signal: AbortSignal): Promise<AiModel[]>;
  validateModel(model: string, signal: AbortSignal): Promise<void>;
  planSearch(input: {
    model: string;
    fallbackModel?: string;
    messages: AiMessage[];
    instructions: string;
    signal: AbortSignal;
  }): Promise<string[]>;
  streamAnswer(input: {
    model: string;
    fallbackModel?: string;
    messages: AiMessage[];
    sources: AiSource[];
    instructions: string;
    signal: AbortSignal;
  }): AsyncIterable<string>;
}
