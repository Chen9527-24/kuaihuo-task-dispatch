export type CozeDiagnosticMeta = {
  httpStatus?: number;
  httpStatusText?: string;
  workflowId?: string;
  botId?: string;
  logId?: string;
  retryAttempts?: number;
};

export type CozeSafeDiagnostic = {
  provider: 'coze';
  failure: boolean;
  failureEvent?: string;
  code?: string | number;
  message?: string;
  status?: string;
  logId?: string;
  debugUrl?: string;
  conversationId?: string;
  chatId?: string;
  requiresAction?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  workflowId?: string;
  botId?: string;
  retryAttempts?: number;
  eventNames?: string[];
  completedMessageTypes?: string[];
  completedContentPreview?: string;
};

type PlainRecord = Record<string, unknown>;
type CozeEvent = { event: string; data: unknown };

const FAILURE_EVENTS = new Set([
  'conversation.chat.failed',
  'conversation.chat.requires_action',
  'error',
]);

const SENSITIVE_KEY_PATTERN = /(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key|password|cookie|session)/i;
const GENERIC_ERROR_MESSAGES = new Set(['error', 'failed', 'failure', 'request failed', 'unknown error']);


export function readCozeLogIdFromHeaders(headers: { get(name: string): string | null }): string {
  for (const name of ['x-tt-logid', 'x-log-id', 'x-request-id', 'logid']) {
    const value = sanitizeText(headers.get(name));
    if (value) return value;
  }
  return '';
}

export function createCozeTransportDiagnostic(error: unknown, meta: CozeDiagnosticMeta = {}): CozeSafeDiagnostic {
  const errorName = error instanceof Error ? error.name : '';
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const isTimeout = ['AbortError', 'TimeoutError'].includes(errorName)
    || /timeout|timed out|aborted/i.test(rawMessage);
  const message = isTimeout
    ? 'Coze 请求超时'
    : sanitizeText(rawMessage) || 'Coze 网络请求失败';
  return compactObject({
    provider: 'coze' as const,
    failure: true,
    failureEvent: isTimeout ? 'transport.timeout' : 'transport.error',
    code: sanitizeText(errorName) || undefined,
    message,
    status: isTimeout ? 'timeout' : 'network_error',
    logId: sanitizeText(meta.logId),
    httpStatus: meta.httpStatus,
    httpStatusText: sanitizeText(meta.httpStatusText),
    workflowId: sanitizeIdentifier(meta.workflowId),
    botId: sanitizeIdentifier(meta.botId),
    retryAttempts: meta.retryAttempts,
  });
}

export function extractCozeSafeDiagnostic(responseJson: unknown, meta: CozeDiagnosticMeta = {}): CozeSafeDiagnostic {
  const normalized = normalizeJsonValue(responseJson);
  const events = collectEvents(normalized);
  const eventNames = unique(events.map((item) => item.event).filter(Boolean));
  const completedMessages = events
    .filter((item) => item.event === 'conversation.message.completed')
    .map((item) => asRecord(item.data))
    .filter((item): item is PlainRecord => Boolean(item));

  let failureEvent: CozeEvent | undefined;
  for (const event of events) {
    if (FAILURE_EVENTS.has(event.event)) {
      failureEvent = event;
      break;
    }
    const data = asRecord(event.data);
    const status = readText(data, ['status']).toLowerCase();
    const code = readCode(data);
    if (status === 'failed' || status === 'requires_action' || isNonZeroCode(code)) {
      failureEvent = event;
      break;
    }
  }

  const rootRecord = asRecord(normalized);
  const rootCode = readCode(rootRecord);
  const rootStatus = readText(rootRecord, ['status']).toLowerCase();
  const rootFailure = isNonZeroCode(rootCode) || rootStatus === 'failed' || rootStatus === 'requires_action';
  const failureData = normalizeJsonValue(failureEvent?.data);
  const failureRecord = asRecord(failureData);
  const failureCode = readCode(failureRecord) ?? rootCode;
  const status = readText(failureRecord, ['status']) || readText(rootRecord, ['status']);
  const message = pickUsefulMessage(failureData) || pickUsefulMessage(normalized);

  const doneEvent = events.find((item) => item.event === 'done');
  const debugUrl = readFirstText([
    readText(asRecord(normalizeJsonValue(doneEvent?.data)), ['debug_url', 'debugUrl']),
    readText(rootRecord, ['debug_url', 'debugUrl']),
    ...events.map((item) => readText(asRecord(normalizeJsonValue(item.data)), ['debug_url', 'debugUrl'])),
  ]);
  const logId = readFirstText([
    sanitizeText(meta.logId),
    readLogId(rootRecord),
    ...events.map((item) => readLogId(asRecord(normalizeJsonValue(item.data)))),
  ]);
  const conversationId = readFirstText([
    readText(failureRecord, ['conversation_id', 'conversationId']),
    ...completedMessages.map((item) => readText(item, ['conversation_id', 'conversationId'])),
    readText(rootRecord, ['conversation_id', 'conversationId']),
  ]);
  const chatId = readFirstText([
    readText(failureRecord, ['chat_id', 'chatId', 'id']),
    ...completedMessages.map((item) => readText(item, ['chat_id', 'chatId'])),
  ]);
  const completedMessageTypes = unique(
    completedMessages
      .map((item) => readText(item, ['type']))
      .filter(Boolean),
  );
  const completedContentPreview = readFirstText(
    completedMessages
      .filter((item) => ['answer', 'verbose', ''].includes(readText(item, ['type']).toLowerCase()))
      .map((item) => previewValue(item.content)),
  );

  const requiresAction = failureEvent?.event === 'conversation.chat.requires_action'
    || status.toLowerCase() === 'requires_action';
  const failure = Boolean(failureEvent) || rootFailure;

  return compactObject({
    provider: 'coze' as const,
    failure,
    failureEvent: failureEvent?.event,
    code: failureCode,
    message,
    status,
    logId,
    debugUrl,
    conversationId,
    chatId,
    requiresAction: requiresAction || undefined,
    httpStatus: meta.httpStatus,
    httpStatusText: sanitizeText(meta.httpStatusText),
    workflowId: sanitizeIdentifier(meta.workflowId),
    botId: sanitizeIdentifier(meta.botId),
    retryAttempts: meta.retryAttempts,
    eventNames: eventNames.length ? eventNames : undefined,
    completedMessageTypes: completedMessageTypes.length ? completedMessageTypes : undefined,
    completedContentPreview,
  });
}

export function formatCozeErrorMessage(diagnostic: CozeSafeDiagnostic, fallback: string): string {
  const primary = sanitizeText(diagnostic.message) || fallback;
  const details: string[] = [];
  if (diagnostic.code !== undefined && diagnostic.code !== null && String(diagnostic.code).trim()) {
    details.push(`code=${String(diagnostic.code).trim()}`);
  }
  if (diagnostic.failureEvent) details.push(`event=${diagnostic.failureEvent}`);
  if (diagnostic.logId) details.push(`logId=${diagnostic.logId}`);
  if (diagnostic.requiresAction) details.push('requiresAction=true');
  return details.length ? `${primary}（${details.join('，')}）` : primary;
}

export function cozeErrorResponse(message: string, diagnostic: CozeSafeDiagnostic) {
  return {
    message,
    data: {
      coze: diagnostic,
    },
  };
}

function collectEvents(value: unknown): CozeEvent[] {
  const record = asRecord(value);
  const rawEvents = record?.events;
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .map((item) => {
      const eventRecord = asRecord(item);
      if (!eventRecord) return null;
      return {
        event: readText(eventRecord, ['event']),
        data: normalizeJsonValue(eventRecord.data),
      };
    })
    .filter((item): item is CozeEvent => Boolean(item));
}

function pickUsefulMessage(value: unknown, depth = 0): string {
  if (depth > 7 || value === undefined || value === null) return '';
  const normalized = normalizeJsonValue(value, depth);
  if (typeof normalized === 'string') {
    const text = sanitizeText(normalized);
    return isUsefulMessage(text) ? text : '';
  }
  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      const message = pickUsefulMessage(item, depth + 1);
      if (message) return message;
    }
    return '';
  }
  const record = asRecord(normalized);
  if (!record) return '';

  const priorityKeys = [
    'last_error',
    'lastError',
    'error',
    'error_info',
    'errorInfo',
    'detail',
    'details',
  ];
  for (const key of priorityKeys) {
    if (record[key] === undefined) continue;
    const message = pickUsefulMessage(record[key], depth + 1);
    if (message) return message;
  }

  const directKeys = ['msg', 'message', 'error_message', 'errorMessage', 'reason', 'description'];
  for (const key of directKeys) {
    const text = sanitizeText(record[key]);
    if (isUsefulMessage(text)) return text;
  }

  const structuralKeys = new Set([
    'event', 'events', 'status', 'type', 'role', 'id', 'chat_id', 'chatId',
    'conversation_id', 'conversationId', 'bot_id', 'botId', 'code',
    'error_code', 'errorCode', 'created_at', 'updated_at', 'completed_at',
    'usage', 'meta_data', 'metadata', 'section_id', 'required_action',
  ]);
  for (const [key, nested] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key) || priorityKeys.includes(key) || directKeys.includes(key) || structuralKeys.has(key)) continue;
    const message = pickUsefulMessage(nested, depth + 1);
    if (message) return message;
  }
  return '';
}

function readCode(record: PlainRecord | null): string | number | undefined {
  if (!record) return undefined;
  const nestedCandidates = [record.last_error, record.lastError, record.error, record.detail]
    .map((item) => asRecord(normalizeJsonValue(item)))
    .filter((item): item is PlainRecord => Boolean(item));
  for (const candidate of nestedCandidates) {
    const code = readDirectCode(candidate);
    if (code !== undefined) return code;
  }
  return readDirectCode(record);
}

function readDirectCode(record: PlainRecord): string | number | undefined {
  for (const key of ['code', 'error_code', 'errorCode']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readLogId(record: PlainRecord | null): string {
  if (!record) return '';
  const direct = readText(record, ['log_id', 'logId', 'logid']);
  if (direct) return direct;
  for (const key of ['detail', 'meta', 'metadata', 'last_error', 'lastError']) {
    const nested = asRecord(normalizeJsonValue(record[key]));
    const value = readText(nested, ['log_id', 'logId', 'logid']);
    if (value) return value;
  }
  return '';
}

function normalizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 7) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[DONE]') return value;
    try {
      return normalizeJsonValue(JSON.parse(trimmed), depth + 1);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item, depth + 1));
  const record = asRecord(value);
  if (!record) return value;
  const next: PlainRecord = {};
  for (const [key, item] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    next[key] = normalizeJsonValue(item, depth + 1);
  }
  return next;
}

function readText(record: PlainRecord | null, keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    const text = sanitizeText(value);
    if (text) return text;
  }
  return '';
}

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/("?(?:access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|private[_-]?key|password|cookie|session)"?\s*[:=]\s*)["']?[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function sanitizeIdentifier(value: unknown): string | undefined {
  const text = sanitizeText(value);
  return text ? text.slice(0, 128) : undefined;
}

function isUsefulMessage(value: string): boolean {
  if (!value) return false;
  return !GENERIC_ERROR_MESSAGES.has(value.toLowerCase());
}

function isNonZeroCode(code: string | number | undefined): boolean {
  if (code === undefined || code === null || String(code).trim() === '') return false;
  const numeric = Number(code);
  if (Number.isFinite(numeric)) return numeric !== 0;
  return !['0', 'ok', 'success'].includes(String(code).trim().toLowerCase());
}

function previewValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return sanitizeText(value).slice(0, 300);
  try {
    return sanitizeText(JSON.stringify(normalizeJsonValue(value))).slice(0, 300);
  } catch {
    return '';
  }
}

function readFirstText(values: Array<string | undefined>): string {
  return values.map((item) => sanitizeText(item)).find(Boolean) || '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function asRecord(value: unknown): PlainRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as PlainRecord) : null;
}

function compactObject<T extends PlainRecord>(value: T): T {
  const next: PlainRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === '' || (Array.isArray(item) && item.length === 0)) continue;
    next[key] = item;
  }
  return next as T;
}
