// Kept out of actions.ts: a 'use server' file may only export async functions, so an
// exported object there is a build error.
export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; code?: string; fieldErrors?: Record<string, string> }
  | { status: 'success' };

export const IDLE: ActionState = { status: 'idle' };
