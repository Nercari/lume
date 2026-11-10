// Synthetic Responses SSE bodies. No account, no case text, no token.

function frame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const completedSse = [
  frame('response.output_text.delta', { type: 'response.output_text.delta', delta: 'Olá' }),
  frame('response.completed', {
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Olá' }] }],
    },
  }),
].join('');

export const incompleteSse = [
  frame('response.output_text.delta', { type: 'response.output_text.delta', delta: 'cortado' }),
  frame('response.incomplete', { type: 'response.incomplete', response: { status: 'incomplete' } }),
].join('');

export const failedSse = frame('response.failed', {
  type: 'response.failed',
  response: { error: { code: 'server_error', message: 'falha sintética' } },
});

export const cutSse = frame('response.output_text.delta', {
  type: 'response.output_text.delta',
  delta: 'sem fim',
});

export const quotaSse = [
  frame('response.output_text.delta', { type: 'response.output_text.delta', delta: 'parcial' }),
  frame('response.failed', {
    type: 'response.failed',
    response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limite' } },
  }),
].join('');
