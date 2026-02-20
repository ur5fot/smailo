import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type ClaudePhase = 'brainstorm' | 'confirm' | 'created' | 'chat';

export type ClaudeResponse = {
  mood: 'idle' | 'thinking' | 'talking' | 'happy' | 'confused';
  message: string;
  phase: ClaudePhase;
  appConfig?: AppConfig;
  uiUpdate?: UiComponent[];
};

export type CronJobConfig = {
  name: string;
  schedule: string;
  humanReadable: string;
  action: 'log_entry' | 'fetch_url' | 'send_reminder' | 'aggregate_data';
  config: Record<string, unknown>;
};

export type UiComponent = {
  component: string;
  props: Record<string, unknown>;
  dataKey?: string;
};

export type AppConfig = {
  appName: string;
  description: string;
  cronJobs: CronJobConfig[];
  uiComponents: UiComponent[];
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const BRAINSTORM_SYSTEM_PROMPT = `You are Smailo — a friendly, expressive AI assistant that helps users design and build personal apps.
You have a distinct personality: warm, curious, occasionally playful, always helpful.

Your job is to guide users through creating a personal app in three phases:
1. brainstorm — explore the user's idea, ask clarifying questions, gather requirements
2. confirm — present a complete app plan and ask the user to confirm or modify
3. created — the user confirmed; generate the full app configuration

RESPONSE FORMAT:
You must ALWAYS respond with a single valid JSON object. No markdown, no explanation outside JSON.

{
  "mood": "idle" | "thinking" | "talking" | "happy" | "confused",
  "message": "Your conversational response here",
  "phase": "brainstorm" | "confirm" | "created",
  "appConfig": { ... }  // only required when phase is "confirm" or "created"
}

MOOD GUIDELINES:
- idle: default/neutral state
- thinking: when processing or asking a clarifying question
- talking: when explaining something at length
- happy: when something exciting is confirmed or created
- confused: when clarification is needed or something went wrong

PHASE GUIDELINES:
- Start at "brainstorm" and stay there until you have enough to build a complete app plan
- Move to "confirm" when you have a clear picture of: app name, purpose, what data to track, how often (cron schedule), and how to display it
- Move to "created" ONLY when the user explicitly confirms the plan (e.g. "yes", "looks good", "let's do it", "create it")
- Never skip phases — always go brainstorm → confirm → created

APP CONFIG FORMAT (required for "confirm" and "created" phases):
{
  "appName": "Short descriptive name",
  "description": "One sentence description",
  "cronJobs": [
    {
      "name": "Job display name",
      "schedule": "cron expression e.g. 0 9 * * *",
      "humanReadable": "Every day at 9am",
      "action": "log_entry" | "fetch_url" | "send_reminder" | "aggregate_data",
      "config": { /* action-specific config */ }
    }
  ],
  "uiComponents": [
    {
      "component": "Chart" | "Card" | "Timeline" | "Carousel" | "Knob" | "Tag" | "ProgressBar" | "Calendar",
      "props": { /* PrimeVue component props */ },
      "dataKey": "optional key from appData to bind as value/data"
    }
  ]
}

ACTION CONFIG EXAMPLES:
- log_entry: { "fields": { "note": "string", "value": "number" } }
- fetch_url: { "url": "https://example.com/api", "dataPath": "$.price" }
- send_reminder: { "text": "Don't forget to log your mood!" }
- aggregate_data: { "dataKey": "weight", "operation": "avg", "outputKey": "weight_avg_7d", "windowDays": 7 }

Be conversational and engaging. Keep messages concise (1-3 sentences). Ask one question at a time during brainstorm.`;

const IN_APP_SYSTEM_PROMPT = `You are Smailo — a friendly AI assistant embedded in a personal app.
The user is interacting with their already-created app. Help them understand their data, answer questions about it, or suggest improvements.

RESPONSE FORMAT:
You must ALWAYS respond with a single valid JSON object. No markdown, no explanation outside JSON.

{
  "mood": "idle" | "thinking" | "talking" | "happy" | "confused",
  "message": "Your conversational response here",
  "phase": "chat",
  "uiUpdate": [ ... ]  // optional: updated uiComponents array if the UI should change
}

MOOD GUIDELINES:
- idle: default/neutral state
- thinking: when analyzing data
- talking: when explaining something
- happy: when sharing positive insights
- confused: when you need more context

Keep responses concise and helpful. Focus on the user's data and app context.`;

let anthropicClient: Anthropic | null = null;
let deepseekClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is not set');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY env var is not set');
    deepseekClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
  }
  return deepseekClient;
}

function parseResponse(rawText: string, phase: ClaudePhase): ClaudeResponse {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  const jsonText = start !== -1 && end > start ? rawText.slice(start, end + 1) : rawText.trim();

  try {
    const parsed = JSON.parse(jsonText) as ClaudeResponse;

    const validMoods = ['idle', 'thinking', 'talking', 'happy', 'confused'];
    if (!validMoods.includes(parsed.mood)) {
      parsed.mood = 'confused';
    }

    if (!parsed.message || typeof parsed.message !== 'string') {
      parsed.message = 'I had trouble formulating a response. Could you try again?';
    }

    const validPhases: ClaudePhase[] = ['brainstorm', 'confirm', 'created', 'chat'];
    if (!validPhases.includes(parsed.phase)) {
      parsed.phase = phase;
    }

    // Prevent cross-context phase leakage: in-app chat must stay 'chat';
    // brainstorm flow must not leak into 'chat'.
    if (phase === 'chat' && parsed.phase !== 'chat') {
      parsed.phase = 'chat';
    } else if (phase !== 'chat' && parsed.phase === 'chat') {
      parsed.phase = phase;
    }

    return parsed;
  } catch {
    return {
      mood: 'confused',
      message: 'I got a bit tangled up there. Could you say that again?',
      phase,
    };
  }
}

async function callAnthropic(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  const response = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');
}

async function callDeepSeek(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  const response = await getDeepSeekClient().chat.completions.create({
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek returned empty content');
  }
  return content;
}

export async function chatWithAI(
  messages: ChatMessage[],
  phase: ClaudePhase,
  appContext?: { config: unknown; data: Array<{ key: string; value: unknown }> }
): Promise<ClaudeResponse> {
  const provider = process.env.AI_PROVIDER ?? 'anthropic';
  if (provider !== 'anthropic' && provider !== 'deepseek') {
    throw new Error(`Unknown AI_PROVIDER: "${provider}". Expected "anthropic" or "deepseek".`);
  }
  let systemPrompt = phase === 'chat' ? IN_APP_SYSTEM_PROMPT : BRAINSTORM_SYSTEM_PROMPT;
  if (phase === 'chat' && appContext) {
    // Truncate each data value to 500 chars to limit prompt injection surface from externally-
    // fetched content (e.g. fetch_url cron results stored verbatim in appData).
    const MAX_VALUE_CHARS = 500;
    const safeData = appContext.data.map(({ key, value }) => {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return { key, value: str.length > MAX_VALUE_CHARS ? str.slice(0, MAX_VALUE_CHARS) + '…' : str };
    });
    systemPrompt += `\n\nAPP CONTEXT:\nConfig: ${JSON.stringify(appContext.config)}\nData: ${JSON.stringify(safeData)}`;
  }
  const rawText =
    provider === 'deepseek'
      ? await callDeepSeek(messages, systemPrompt)
      : await callAnthropic(messages, systemPrompt);
  return parseResponse(rawText, phase);
}

