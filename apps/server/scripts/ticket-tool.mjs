// 工具定义：告诉模型何时使用、应提供哪些参数；不是实际查询实现。
export const getTicketDefinition = {
  name: 'getTicket',
  description: '根据用户提供的工单编号查询单张工单的状态。不用于搜索列表；缺少编号时先询问用户，不编造编号。',
  parameters: {
    type: 'object',
    properties: {
      ticketId: {
        type: 'string',
        pattern: '^T[0-9]+$',
        description: '工单编号，由T和数字组成，例如T1001。',
      },
    },
    required: ['ticketId'],
    additionalProperties: false,
  },
};

// 自编教学数据，未连接公司系统。
const tickets = [
  { ticketId: 'T1001', ownerId: 'demo-user-1', title: 'VPN连接失败', state: '处理中' },
  { ticketId: 'T1002', ownerId: 'demo-user-1', title: '电脑无法开机', state: '已解决' },
  { ticketId: 'T2001', ownerId: 'demo-user-2', title: '其他用户的设备问题', state: '待处理' },
  { ticketId: 'T1003', ownerId: 'demo-user-1', title: '打印机无法打印', state: '待处理' },
];

// 真正执行工具的程序。context由服务端提供，不能从模型arguments中获取身份。
export function getTicket(args, context = {}) {
  // 即使Schema已告诉模型规则，程序仍须自己检查。
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('工具参数必须是对象。');
  }
  if (Object.keys(args).length !== 1 || !Object.hasOwn(args, 'ticketId')) {
    throw new Error('必须且只能提供ticketId。');
  }
  if (typeof args.ticketId !== 'string') throw new Error('ticketId必须是字符串。');
  if (!/^T[0-9]+$/.test(args.ticketId)) throw new Error('ticketId必须由T和数字组成。');

  // 先检查操作权限，再在当前用户可见范围内查找。
  if (context.canReadTickets !== true || typeof context.userId !== 'string' || !context.userId) {
    return { status: 'forbidden' };
  }
  const ticket = tickets.find((item) => item.ticketId === args.ticketId && item.ownerId === context.userId);
  if (!ticket) {
    // 不存在或不属于当前用户，都返回未找到，避免暴露其他人的工单信息。
    return { status: 'not_found', ticketId: args.ticketId };
  }
  return {
    status: 'found',
    ticket: { ticketId: ticket.ticketId, title: ticket.title, state: ticket.state },
  };
}
