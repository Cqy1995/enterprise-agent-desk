import test from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop } from './tool-loop.mjs';

const context = { userId: 'demo-user-1', canReadTickets: true };
const messages = [{ role: 'user', content: '查询T1001' }];
const tool = (id, args, name = 'getTicket') => ({ content: null, toolCalls: [
  { id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
] });
const text = content => ({ content, toolCalls: [] });
function run(replies, options = {}, inspect = () => {}) {
  let used = 0;
  return runToolLoop({ messages, context, ...options, requestModel: async history => {
    inspect(history, used);
    assert.ok(used < replies.length, '不允许偷偷追加模型请求');
    return structuredClone(replies[used++]);
  } });
}

test('正常两轮提前结束，工具事实、身份和调用ID按顺序回传', async () => {
  const result = await run([tool('c1', { ticketId: 'T1001' }), text('处理中')], {}, (history, index) => {
    if (index === 1) {
      assert.equal(history.at(-2).role, 'assistant');
      assert.equal(history.at(-2).tool_calls[0].id, 'c1');
      assert.equal(history.at(-1).tool_call_id, 'c1');
      assert.equal(JSON.parse(history.at(-1).content).ticket.state, '处理中');
    }
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.modelRequests, 2);
  assert.equal(result.toolExecutions, 1);
  assert.equal(messages.length, 1, '不污染调用方消息');
});

test('一次参数修正后完成', async () => {
  const result = await run([tool('c1', { ticketId: 1001 }), tool('c2', { ticketId: 'T1001' }), text('处理中')]);
  assert.equal(result.status, 'completed');
  assert.equal(result.modelRequests, 3);
  assert.equal(result.trace.filter(x => x.result?.status === 'invalid_arguments').length, 1);
});

test('重复错误参数停止，不再次调用工具', async () => {
  const result = await run([tool('c1', { ticketId: 1001 }), tool('c2', { ticketId: 1001 })]);
  assert.equal(result.status, 'repeated_call');
  assert.equal(result.toolExecutions, 1);
});

test('修正后换成另一组错误参数，第二次失败仍停止', async () => {
  const result = await run([tool('c1', { ticketId: 1001 }), tool('c2', { ticketId: 'wrong' })]);
  assert.equal(result.status, 'repair_failed');
  assert.equal(result.modelRequests, 2);
});

test('三轮耗尽，不执行第三轮工具，也不请求第四轮', async () => {
  const result = await run([
    tool('c1', { ticketId: 'T1001' }), tool('c2', { ticketId: 'T1002' }), tool('c3', { ticketId: 'T1003' }),
  ]);
  assert.equal(result.status, 'budget_exceeded');
  assert.equal(result.modelRequests, 3);
  assert.equal(result.toolExecutions, 2);
  assert.equal(result.trace.some(x => x.callId === 'c3'), false);
});

test('不存在与其他人记录均作为not_found回传，不自动重查', async () => {
  for (const ticketId of ['T9999', 'T2001']) {
    const result = await run([tool('c1', { ticketId }), text('未找到')]);
    assert.equal(result.status, 'completed');
    assert.equal(result.trace.find(x => x.phase === 'tool_result').result.status, 'not_found');
    assert.equal(result.toolExecutions, 1);
  }
});

test('模型夹带身份参数被拒绝，不覆盖可信身份', async () => {
  const result = await run([
    tool('c1', { ticketId: 'T2001', userId: 'demo-user-2' }), text('参数有误'),
  ]);
  const record = result.trace.find(x => x.phase === 'tool_result');
  assert.equal(record.result.status, 'invalid_arguments');
  assert.equal(record.result.ticket, undefined);
});

test('无权限立即停止，不请求总结或重试', async () => {
  const result = await run([tool('c1', { ticketId: 'T1001' })], {
    context: { userId: 'demo-user-1', canReadTickets: false },
  });
  assert.equal(result.status, 'forbidden');
  assert.equal(result.modelRequests, 1);
});

test('未知工具与重复调用ID不会执行', async () => {
  const unknown = await run([tool('c1', {}, 'closeTicket')]);
  assert.equal(unknown.status, 'unknown_tool');
  assert.equal(unknown.toolExecutions, 0);
  const repeatedId = await run([tool('c1', { ticketId: 'T1001' }), tool('c1', { ticketId: 'T1002' })]);
  assert.equal(repeatedId.status, 'invalid_model_response');
  assert.equal(repeatedId.toolExecutions, 1);
});

test('工具次数预算与模型轮数分别限制，最后一轮文本仍可完成', async () => {
  const blocked = await run([tool('c1', { ticketId: 'T1001' })], { maxToolExecutions: 0 });
  assert.equal(blocked.status, 'budget_exceeded');
  assert.equal(blocked.toolExecutions, 0);
  const final = await run([text('请提供工单编号')], { maxRounds: 1 });
  assert.equal(final.status, 'completed');
});

test('模型异常和截断停止，不自动重试', async () => {
  const failed = await runToolLoop({ messages, context, requestModel: async () => { throw new Error('网络错误'); } });
  assert.equal(failed.status, 'model_error');
  const truncated = await run([{ ...tool('c1', { ticketId: 'T1001' }), finishReason: 'length' }]);
  assert.equal(truncated.status, 'invalid_model_response');
  assert.equal(truncated.toolExecutions, 0);
});
