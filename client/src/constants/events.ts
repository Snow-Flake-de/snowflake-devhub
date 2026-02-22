export const EVENTS = {
  AUTH_ERROR: 'bytestash:auth_error',
  SNIPPET_UPDATED: 'bytestash:snippet_updated',
  SNIPPET_DELETED: 'bytestash:snippet_deleted',
  SHARE_CREATED: 'bytestash:share_created',
  SHARE_DELETED: 'bytestash:share_deleted',
} as const;

export const createCustomEvent = (eventName: string) => new CustomEvent(eventName);