type Receiver = { type: string; value: unknown };
type Handler = { resolve: (value: unknown) => void; reject: (error: Error) => void; event?: (event: Receiver) => void };
type PhoneWindow = Window & { dairyosPhone?: boolean; webkit?: { messageHandlers?: { dairyos?: { postMessage: (message: unknown) => void } } }; dairyosReceive?: (message: Receiver & { id: string }) => void };
export const phoneShell = typeof window !== 'undefined' && !!(window as PhoneWindow).dairyosPhone;
const pending = new Map<string, Handler>();
let sequence = 0;

export function phoneRequest<T>(command: string, value: unknown = {}, event?: (message: Receiver) => void): Promise<T> {
  const host = typeof window !== 'undefined' ? window as PhoneWindow : undefined;
  if (!host?.webkit?.messageHandlers?.dairyos) return Promise.reject(new Error('The local iPhone runtime is unavailable.'));
  host.dairyosReceive ??= message => {
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === 'result' || message.type === 'error') {
      pending.delete(message.id);
      if (message.type === 'error') request.reject(new Error(String(message.value)));
      else request.resolve(message.value);
    } else request.event?.(message);
  };
  const id = String(++sequence);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: value => resolve(value as T), reject, event });
    host.webkit!.messageHandlers!.dairyos!.postMessage({ id, command, value });
  });
}
