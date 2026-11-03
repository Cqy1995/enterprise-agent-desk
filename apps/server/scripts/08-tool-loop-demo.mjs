import { runToolLoop } from './tool-loop.mjs';

// 预设响应仅演示程序控制，不证明真实模型会选择同样动作。
function call(id, ticketId) {
  return {
    content: null,
    toolCalls: [{ id, type: 'function', function: {
      name: 'getTicket', arguments: JSON.stringify({ ticketId }),
    } }],
  };
}
function answer(content) { return { content, toolCalls: [] }; }

const scenarios = {
  normal: {
    input: '查询T1001',
    replies: [call('call_1', 'T1001'), answer('T1001当前状态为处理中。')],
  },
  repair: {
    input: '查询T1001',
    replies: [call('call_1', 1001), call('call_2', 'T1001'), answer('T1001当前状态为处理中。')],
  },
  repeated: {
    input: '查询T1001',
    replies: [call('call_1', 1001), call('call_2', 1001)],
  },
  budget: {
    input: '查询T1001、T1002和T1003',
    replies: [call('call_1', 'T1001'), call('call_2', 'T1002'), call('call_3', 'T1003')],
  },
  not_found: {
    input: '查询T9999',
    replies: [call('call_1', 'T9999'), answer('当前可见范围内未找到T9999，请核对编号。')],
  },
};

const name = process.argv[2] || 'normal';
if (!Object.hasOwn(scenarios, name) || process.argv.length > 3) {
  console.error('用法：npm run learn:loop -- normal|repair|repeated|budget|not_found');
  process.exitCode = 1;
} else {
  const scenario = scenarios[name];
  let index = 0;
  console.info('本地模拟：不读取Key、不联网、不消耗Token；最多3次模拟模型请求。');
  console.info(`场景：${name}`);
  const result = await runToolLoop({
    messages: [{ role: 'user', content: scenario.input }],
    context: { userId: 'demo-user-1', canReadTickets: true },
    requestModel: async () => {
      if (index >= scenario.replies.length) throw new Error('模拟响应已用完。');
      return structuredClone(scenario.replies[index++]);
    },
  });
  for (const item of result.trace) console.info(JSON.stringify(item));
  console.info('程序最终结果：', JSON.stringify({
    status: result.status,
    message: result.message,
    modelRequests: result.modelRequests,
    toolExecutions: result.toolExecutions,
  }, null, 2));
  // 故意触发停止也是演示预期，不作为脚本崩溃。
}
