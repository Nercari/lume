// Native Messaging host: origin check -> framing -> strict command validation -> fixed handlers.
import { FrameDecoder, encodeMessage, FramingError, assertLittleEndian } from './framing.js';
import { checkOrigin, validateRequest, CommandError } from './commands.js';
import { createLogger } from './redact.js';

const errorReply = (id, code, message) => ({ id: typeof id === 'string' ? id : null, ok: false, error: { code, message } });

// handlers: { [cmd]: async (args) => result }. Results must not contain tokens; replies are
// still passed through JSON with Secret.toJSON redaction as a backstop.
export function createHost({ allowedOrigin, handlers, logger = createLogger() }) {
  return async function handle(callerOrigin, msg) {
    try {
      checkOrigin(callerOrigin, allowedOrigin);
      const req = validateRequest(msg);
      const fn = handlers[req.cmd];
      if (typeof fn !== 'function') throw new CommandError('unknown_command', 'command is not supported');
      return { id: req.id, ok: true, result: await fn(req.args) };
    } catch (e) {
      const code = e instanceof CommandError || e?.code ? e.code : 'internal';
      logger.warn('request rejected', code);
      return errorReply(msg?.id, code, e instanceof CommandError ? e.message : 'request failed');
    }
  };
}

// Run over stdio. Chrome passes the caller origin as argv[2] (first host argument).
export function runStdio({ handle, origin = process.argv[2], input = process.stdin, output = process.stdout, logger = createLogger() }) {
  assertLittleEndian();
  const decoder = new FrameDecoder();
  let queue = Promise.resolve(); // process frames strictly in order, one reply per request
  input.on('data', (chunk) => {
    queue = queue.then(async () => {
      if (input.destroyed) return;
      let msgs;
      try {
        msgs = decoder.push(chunk);
      } catch (e) {
        logger.error('framing error', e instanceof FramingError ? e.code : 'internal');
        output.write(encodeMessage(errorReply(null, e.code ?? 'internal', 'invalid frame')));
        process.exitCode = 1;
        input.destroy(); // a broken stream cannot be resynchronised
        return;
      }
      for (const m of msgs) {
        const reply = await handle(origin, m);
        let frame;
        try {
          frame = encodeMessage(reply);
        } catch {
          frame = encodeMessage(errorReply(reply.id, 'message_too_large', 'reply exceeds the Native Messaging limit'));
        }
        output.write(frame);
      }
    });
  });
}
