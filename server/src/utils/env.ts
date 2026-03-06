function requireEnv(name: string, message?: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(message || `Missing required environment variable: ${name}`);
  }
  return value;
}

function validateJwtSecret(): string {
  const secret = requireEnv('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return secret;
}

function validateAiKeys(): { anthropicKey?: string; deepseekKey?: string } {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || undefined;
  const deepseekKey = process.env.DEEPSEEK_API_KEY || undefined;

  if (process.env.NODE_ENV === 'production' && !anthropicKey && !deepseekKey) {
    throw new Error(
      'At least one AI API key required in production: ANTHROPIC_API_KEY or DEEPSEEK_API_KEY'
    );
  }

  return { anthropicKey, deepseekKey };
}

export interface EnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  clientUrl: string;
  anthropicApiKey?: string;
  deepseekApiKey?: string;
  aiProvider: string;
  anthropicModel: string;
  sentryDsn?: string;
  databasePath?: string;
  backupDir?: string;
}

let _config: EnvConfig | undefined;

export function loadEnvConfig(): EnvConfig {
  const jwtSecret = validateJwtSecret();
  const { anthropicKey, deepseekKey } = validateAiKeys();

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  _config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction,
    port,
    jwtSecret,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    anthropicApiKey: anthropicKey,
    deepseekApiKey: deepseekKey,
    aiProvider: process.env.AI_PROVIDER || 'anthropic',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    sentryDsn: process.env.SENTRY_DSN || undefined,
    databasePath: process.env.DATABASE_PATH || undefined,
    backupDir: process.env.BACKUP_DIR || undefined,
  };

  return _config;
}

export function getEnvConfig(): EnvConfig {
  if (!_config) {
    return loadEnvConfig();
  }
  return _config;
}

/** Reset cached config — for testing only */
export function _resetEnvConfig(): void {
  _config = undefined;
}
