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
  action?: { key: string; value?: unknown };
  fields?: Array<{ name: string; type: string; label: string }>;
  outputKey?: string;
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
- User identity (userId) is managed externally — do NOT ask for, generate, or include userId in your responses

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
      "component": "Card" | "DataTable" | "Chart" | "Timeline" | "Knob" | "Tag" | "ProgressBar" | "Calendar" | "Button" | "InputText" | "Form",
      "props": { /* component-specific props — see component guide below */ },
      "dataKey": "key from appData to bind as value prop",
      "action": { "key": "appDataKey", "value": "optional fixed value" },  // for Button
      "fields": [ { "name": "field_name", "type": "text|number", "label": "Display label" } ],  // for Form
      "outputKey": "appDataKey"  // for Form
    }
  ]
}

COMPONENT GUIDE (always follow this — wrong props render blank):
- Card: use "title" prop for the heading. Use "dataKey" to bind the data as "value". No "content" prop.
  Example: { "component": "Card", "props": { "title": "My Notes" }, "dataKey": "notes" }
- DataTable: use "dataKey" to bind an array as "value". Use "columns" prop for column definitions.
  Example: { "component": "DataTable", "props": { "columns": [{ "field": "date", "header": "Date" }, { "field": "note", "header": "Note" }] }, "dataKey": "entries" }
- Chart: requires "type" prop ("bar", "line", "pie", "doughnut") and "dataKey" for chart data object.
  Example: { "component": "Chart", "props": { "type": "line" }, "dataKey": "weightData" }
- Knob: use "value" prop (number 0-100). Use "dataKey" to bind numeric data.
  Example: { "component": "Knob", "props": { "min": 0, "max": 10 }, "dataKey": "moodScore" }
- Tag: use "value" prop (string). Use "dataKey" to bind string data.
- ProgressBar: use "value" prop (number 0-100). Use "dataKey" for numeric data.
- Calendar: displays a date picker, no dataKey needed.
- Timeline: use "dataKey" to bind array of { date, content } objects.
- Button: use "label" prop and optional "severity" ("success", "danger", "warning", "info"). Use "action" with { key, value } to write a fixed value on click.
  Example: { "component": "Button", "props": { "label": "Хорошо", "severity": "success" }, "action": { "key": "mood", "value": 3 } }
- InputText: use "label", "type" ("text" or "number"), "placeholder" props. Use "action" with { key } — value comes from user input.
  Example: { "component": "InputText", "props": { "label": "Вес (кг)", "type": "number", "placeholder": "70" }, "action": { "key": "weight" } }
- Form: use "fields" array with { name, type, label } objects and "outputKey" for the appData key. Use "props.submitLabel" to customize button text.
  Example: { "component": "Form", "props": { "submitLabel": "Сохранить" }, "fields": [{ "name": "weight", "type": "number", "label": "Вес (кг)" }, { "name": "note", "type": "text", "label": "Заметка" }], "outputKey": "weight_entry" }

NEVER use any component not listed above.

CRON SCHEDULE RULES (strictly enforced):
- Use 5-field format only: "minute hour dom month dow" — NO seconds field
- Minimum frequency: every 5 minutes ("*/5 * * * *") — faster schedules are rejected
- Examples: "*/5 * * * *" (every 5 min), "*/30 * * * *" (every 30 min), "0 * * * *" (hourly), "0 9 * * *" (daily 9am)
- NEVER use 6-field expressions like "*/30 * * * * *" (they will be rejected)

ACTION CONFIG EXAMPLES:
- log_entry: { "fields": { "note": "string", "value": "number" } }
- fetch_url: { "url": "https://example.com/api", "dataPath": "$.price", "outputKey": "myDataKey" }
- fetch_url with API key from user input: { "url": "https://api.example.com/v1/{api_key}/data", "dataPath": "$.rate", "outputKey": "rate", "triggerOnKey": "refresh_trigger" }
- send_reminder: { "text": "Don't forget to log your mood!", "outputKey": "reminder" }
- aggregate_data: { "dataKey": "weight", "operation": "avg", "outputKey": "weight_avg_7d", "windowDays": 7 }

CRITICAL fetch_url rules:
- Always set "outputKey" in the config — this is the key under which data is stored
- "outputKey" MUST match the "dataKey" of the UI component that displays this data
- "dataPath" uses dot notation to extract a value from the JSON response (e.g. "$.bitcoin.usd")
- Example: UI has { "component": "Card", "dataKey": "btc_price" } → job config must have "outputKey": "btc_price"
- AUTO TIMESTAMP: after every successful fetch_url, the system AUTOMATICALLY stores "{outputKey}_updated_at" with an ISO timestamp.
  Use this key for "last updated" Cards/Tags. NEVER invent other keys for this purpose.
  Example: outputKey "usd_uah_rate" → auto key "usd_uah_rate_updated_at". Card with dataKey "usd_uah_rate_updated_at" shows last fetch time.
- NEVER add separate cron jobs just to log timestamps — the auto timestamp handles that.
- NEVER use dataKeys that are not actually populated. Only valid dataKeys are: the outputKey, {outputKey}_updated_at, and keys written by InputText/Button/Form components.
- URL TEMPLATE VARIABLES: use {dataKey} in the URL to substitute values from appData at fetch time.
  Example: url "https://api.example.com/v1/{user_api_key}/rates" will replace {user_api_key} with the value stored under the "user_api_key" appData key.
  Use this when the user needs to enter their own API key via an InputText component.
- TRIGGER ON BUTTON: add "triggerOnKey": "<key>" to run the job immediately when that appData key is written.
  Pair with a Button whose action.key matches triggerOnKey so pressing the button fires the fetch instantly.
  Example: Button action { "key": "refresh_trigger", "value": 1 } + job config { "triggerOnKey": "refresh_trigger" }

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

UIUPDATE COMPONENT GUIDE (if you include uiUpdate, follow these rules):
- Card: { "component": "Card", "props": { "title": "Title" }, "dataKey": "key" }
- DataTable: { "component": "DataTable", "props": { "columns": [{"field":"f","header":"H"}] }, "dataKey": "key" }
- Chart: { "component": "Chart", "props": { "type": "line" }, "dataKey": "key" }
- Knob: { "component": "Knob", "props": { "min": 0, "max": 100 }, "dataKey": "key" }
- Tag, ProgressBar, Timeline, Calendar — supported.
- Button: { "component": "Button", "props": { "label": "Хорошо", "severity": "success" }, "action": { "key": "mood", "value": 3 } }
- InputText: { "component": "InputText", "props": { "label": "Вес (кг)", "type": "number", "placeholder": "70" }, "action": { "key": "weight" } }
- Form: { "component": "Form", "props": { "submitLabel": "Сохранить" }, "fields": [{ "name": "weight", "type": "number", "label": "Вес (кг)" }], "outputKey": "weight_entry" }
- NEVER use components not listed above.

Keep responses concise and helpful. Focus on the user's data and app context.`;

const UI_KEY_REGEX = /^[a-zA-Z0-9_]{1,100}$/;
const ALLOWED_UI_COMPONENTS = [
  'Card', 'Chart', 'Timeline', 'Knob', 'Tag', 'ProgressBar',
  'Calendar', 'DataTable', 'Button', 'InputText', 'Form',
];

/**
 * Filter an array of AI-generated UI component configs against the allowed whitelist.
 * Shared by the home-chat and in-app-chat routes to avoid duplicating validation logic.
 */
export function validateUiComponents(items: unknown[]): UiComponent[] {
  return (items as any[])
    .filter((item: any) =>
      item &&
      typeof item.component === 'string' &&
      ALLOWED_UI_COMPONENTS.includes(item.component) &&
      (item.props == null || (typeof item.props === 'object' && !Array.isArray(item.props))) &&
      // Button and InputText require action with a valid key — without it they silently vanish in the renderer
      ((['Button', 'InputText'].includes(item.component))
        ? (typeof item.action?.key === 'string' && UI_KEY_REGEX.test(item.action.key))
        : (item.action == null || (typeof item.action?.key === 'string' && UI_KEY_REGEX.test(item.action.key)))) &&
      // Form requires outputKey and a non-empty fields array — without them it silently vanishes in the renderer
      // 'timestamp' is reserved: AppForm always injects it as the submission time
      (item.component === 'Form'
        ? (typeof item.outputKey === 'string' && UI_KEY_REGEX.test(item.outputKey) &&
           Array.isArray(item.fields) && item.fields.length > 0 &&
           item.fields.every((f: any) => typeof f?.name === 'string' && UI_KEY_REGEX.test(f.name) && f.name !== 'timestamp'))
        : (item.outputKey == null || (typeof item.outputKey === 'string' && UI_KEY_REGEX.test(item.outputKey))) &&
          (!Array.isArray(item.fields) || item.fields.every((f: any) => typeof f?.name === 'string' && UI_KEY_REGEX.test(f.name) && f.name !== 'timestamp')))
    )
    .slice(0, 20) as UiComponent[];
}

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
    } else {
      // Cap message length before it reaches the DB to prevent unbounded storage
      // and context inflation on subsequent AI calls.
      parsed.message = parsed.message.slice(0, 4000);
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
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
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

