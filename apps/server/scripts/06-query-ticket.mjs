import { getTicket } from './ticket-tool.mjs';

// 教学阶段模拟一个已登录用户；正式服务应从经过验证的会话取得身份。
// 当前没有登录系统，不把这个常量当成生产认证实现。
const currentUser = { userId: 'demo-user-1', canReadTickets: true };
const args = { ticketId: process.argv[2] || 'T1001' };

console.info('本地模拟工具执行，不调用模型、不读取Key。');
try {
  const result = getTicket(args, currentUser);
  console.info(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`参数或工具执行错误：${error.message}`);
  process.exitCode = 1;
}
