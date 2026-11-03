import { getTicket } from './ticket-tool.mjs';

// D04先只支持每轮一个只读工具。requestModel由调用方传入，本模块不读Key。
// 轮数指模型请求次数；最后一轮若仍要工具，停止且不执行，避免结果无预算总结。
export async function runToolLoop({
  requestModel, messages, context,
  maxRounds = 3, maxToolExecutions = 2,
}) {
  if (typeof requestModel !== 'function') throw new Error('需要提供requestModel函数。');
  if (!Array.isArray(messages)) throw new Error('messages必须是数组。');
  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 10) {
    throw new Error('maxRounds必须是1—10的整数。');
  }
  if (!Number.isSafeInteger(maxToolExecutions) || maxToolExecutions < 0 || maxToolExecutions > 10) {
    throw new Error('maxToolExecutions必须是0—10的整数。');
  }
  const history = structuredClone(messages);
  const trustedContext = structuredClone(context ?? {});
  const trace = [];
  const previousCalls = new Set();
  const previousIds = new Set();
  let modelRequests = 0;
  let toolExecutions = 0;
  let argumentFailures = 0;

  function stop(status, message, extra = {}) {
    return { status, message, modelRequests, toolExecutions, trace, messages: history, ...extra };
  }

  for (let round = 1; round <= maxRounds; round++) {
    modelRequests++;
    trace.push({ round, phase: 'model_request' });
    let reply;
    try {
      // 使用副本，避免请求适配器直接篡改历史。
      reply = await requestModel(structuredClone(history));
    } catch {
      return stop('model_error', '模型请求失败，本次停止，不自动重试。');
    }
    if (!reply || !Array.isArray(reply.toolCalls) || reply.finishReason === 'length') {
      return stop('invalid_model_response', '模型响应缺失、格式错误或已截断，未执行工具。');
    }

    // 出口一：没有工具请求且有有效文本，按最终回答结束。
    if (reply.toolCalls.length === 0) {
      if (typeof reply.content !== 'string' || !reply.content.trim()) {
        return stop('invalid_model_response', '模型没有返回工具请求或有效答案。');
      }
      history.push({ role: 'assistant', content: reply.content });
      trace.push({ round, phase: 'final_answer' });
      return stop('completed', reply.content);
    }

    // 出口二：模型/工具预算不足，不偷偷追加总结请求。
    if (round === maxRounds || toolExecutions >= maxToolExecutions) {
      trace.push({ round, phase: 'budget_stop' });
      return stop('budget_exceeded', '达到本次执行上限，任务尚未完成；程序已停止。');
    }
    if (reply.toolCalls.length !== 1) {
      return stop('unsupported_tool_batch', '当前练习每轮只支持一个工具调用。');
    }
    const call = reply.toolCalls[0];
    if (call?.type !== 'function' || call.function?.name !== 'getTicket') {
      return stop('unknown_tool', '工具不在允许列表中，未执行。');
    }
    if (typeof call.id !== 'string' || !call.id.trim() || previousIds.has(call.id)) {
      return stop('invalid_model_response', '工具调用ID缺失或重复，未执行。');
    }
    previousIds.add(call.id);

    let args;
    let result;
    try {
      if (typeof call.function.arguments !== 'string') throw new Error();
      args = JSON.parse(call.function.arguments);
    } catch {
      result = { status: 'invalid_arguments', message: '工具参数必须是合法JSON字符串。' };
    }
    // 排序对象键，避免仅调整字段顺序就绕过重复检测。
    function canonical(value) {
      if (Array.isArray(value)) return value.map(canonical);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
      }
      return value;
    }
    const signature = JSON.stringify(['getTicket', result
      ? call.function.arguments : canonical(args)]);
    if (previousCalls.has(signature)) {
      trace.push({ round, phase: 'repeated_call_stop' });
      return stop('repeated_call', '相同工具和参数再次出现，停止重复执行。');
    }
    previousCalls.add(signature);

    if (!result) {
      toolExecutions++;
      try {
        // 唯一真实查询入口；身份来自程序context，不从模型参数提取。
        result = getTicket(args, trustedContext);
      } catch (error) {
        // 当前getTicket抛出的都是参数校验错误；新工具需另行分类系统故障。
        result = { status: 'invalid_arguments', message: error.message };
      }
    }
    trace.push({ round, phase: 'tool_result', callId: call.id, result });
    history.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.toolCalls });
    history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });

    if (result.status === 'forbidden') {
      return stop('forbidden', '当前身份没有查询权限，停止该操作。');
    }
    if (result.status === 'invalid_arguments') {
      argumentFailures++;
      if (argumentFailures > 1) return stop('repair_failed', '参数修正后仍不合规，本次停止。');
      // 最多给一次修正机会；仍受模型总轮数、工具执行次数约束。
    }
    // found/not_found回传模型，由模型总结；程序不自动重试未找到。
  }
}
