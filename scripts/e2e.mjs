/**
 * 端到端测试（M9）：覆盖 R1~R14 主链路的正向与异常流
 * 前置：服务端已启动（默认 http://localhost:3000），数据库已迁移+种子
 * 运行：node scripts/e2e.mjs
 */
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    results.push(`✅ ${name}`);
  } else {
    failed++;
    results.push(`❌ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: raw ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log(`E2E against ${BASE}\n`);

  /* ---- 登录与权限（R6/M1） ---- */
  let r = await api('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
  check('R6 错误密码返回 401', r.status === 401);

  r = await api('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
  check('admin 登录签发 JWT', r.status === 200 && !!r.data.accessToken);
  const token = r.data?.accessToken;

  r = await api('GET', '/api/users');
  check('R7 无 token 访问被拦截 401', r.status === 401);
  r = await api('GET', '/api/users', { token });
  check('M1 用户列表', r.status === 200 && Array.isArray(r.data) && r.data.length >= 1);

  r = await api('GET', '/api/roles', { token });
  check('M1 角色列表含四内置角色', r.status === 200 && r.data.length >= 4);

  /* ---- 栏目与内容（R1/M2） ---- */
  r = await api('POST', '/api/columns', { token, body: { name: 'E2E测试栏目' } });
  check('M2 创建栏目', r.status === 201 && !!r.data.id);
  const columnId = r.data?.id;

  r = await api('GET', '/api/columns', { token });
  check('M2 栏目树返回', r.status === 200 && Array.isArray(r.data) && r.data.length >= 1);

  /* ---- txt 导入（R9/M3） ---- */
  const fd = new FormData();
  fd.append('file', new Blob(['第一段\n内容A\n\n第二段\n内容B'], { type: 'text/plain' }), 'e2e.txt');
  r = await api('POST', '/api/contents/import/txt', { token, body: fd, raw: true });
  check('R9 txt 导入生成内容', r.status === 201 && !!r.data?.id);
  const txtContentId = r.data?.id;

  /* ---- html 导入（R9 + XSS 防护） ---- */
  r = await api('POST', '/api/contents/import/html', {
    token,
    body: { title: 'E2E网页', html: '<p>正常文字</p><script>alert(1)</script><img src=x onerror=alert(2)>' },
  });
  check('R9 HTML 导入剥离脚本', r.status === 201 && !String(r.data?.html).includes('<script'));
  const htmlContentId = r.data?.id;

  /* ---- 审核工作流（R6/R8/M6） ---- */
  r = await api('POST', `/api/contents/${txtContentId}/submit`, { token });
  check('AV-02 提交进入 AI_REVIEW', r.status === 201 && r.data?.status === 'AI_REVIEW');

  r = await api('POST', `/api/review/${txtContentId}/ai`, { token });
  check('R8 AI 初审通过进入人工复审', r.status === 201 && r.data?.next === 'MANUAL_REVIEW');

  // 敏感词内容应被 AI 驳回
  const fd2 = new FormData();
  fd2.append('file', new Blob(['这段包含色情词汇的内容应被拦截'], { type: 'text/plain' }), 'bad.txt');
  r = await api('POST', '/api/contents/import/txt', { token, body: fd2, raw: true });
  const badId = r.data?.id;
  await api('POST', `/api/contents/${badId}/submit`, { token });
  r = await api('POST', `/api/review/${badId}/ai`, { token });
  check('R8 敏感词内容被 AI 驳回（异常流）', r.data?.verdict?.pass === false && r.data?.next === 'REJECTED');

  r = await api('POST', `/api/review/${txtContentId}/approve`, { token });
  check('AV-03 人工复审通过', r.status === 201 && r.data?.status === 'APPROVED');

  /* ---- 未审核内容不可发布（R6 强约束，异常流） ---- */
  r = await api('POST', '/api/contents/import/html', { token, body: { title: '未审核', html: '<p>draft</p>' } });
  const draftId = r.data?.id;
  r = await api('POST', '/api/publish-tasks', { token, body: { contentId: draftId, targetType: 'ALL' } });
  check('R6 未审核内容发布被拒绝（异常流）', r.status === 400);

  // html 内容同样过审，供定时发布使用
  await api('POST', `/api/contents/${htmlContentId}/submit`, { token });
  await api('POST', `/api/review/${htmlContentId}/ai`, { token });
  r = await api('POST', `/api/review/${htmlContentId}/approve`, { token });
  check('html 内容过审', r.status === 201 && r.data?.status === 'APPROVED');

  /* ---- 设备与发布（R1/R3/M4） ---- */
  r = await api('POST', '/api/devices', { token, body: { name: 'E2E终端' } });
  check('DV-01 创建设备并生成激活码', r.status === 201 && !!r.data?.activateCode);
  const activateCode = r.data?.activateCode;

  r = await api('POST', '/api/device-api/activate', { body: { activateCode } });
  check('DV-01 激活换取 deviceKey', r.status === 201 && !!r.data?.deviceKey);
  const deviceKey = r.data?.deviceKey;

  r = await api('GET', '/api/devices', { token });
  check('R3 设备列表（含在线状态字段）', r.status === 200 && r.data.length >= 1 && 'online' in r.data[0]);

  /* ---- 发布：分组/定时/立即（R1/M4） ---- */
  r = await api('POST', '/api/device-groups', { token, body: { name: 'E2E大厅组-' + Date.now() } });
  const groupId = r.data?.id;
  r = await api('POST', '/api/publish-tasks', {
    token,
    body: { contentId: txtContentId, targetType: 'ALL', mode: 'now' },
  });
  check('PB-02 立即发布任务创建并执行', r.status === 201 && !!r.data?.id);

  r = await api('POST', '/api/publish-tasks', {
    token,
    body: { contentId: htmlContentId, targetType: 'GROUP', targetIds: [groupId], mode: 'scheduled', startAt: new Date(Date.now() + 60_000).toISOString() },
  });
  check('PB-03 定时发布任务进入 PENDING', r.status === 201 && !!r.data?.id);

  r = await api('GET', '/api/publish-tasks?status=PENDING', { token });
  check('PB-06 任务跟踪（PENDING 列表）', r.status === 200 && r.data.total >= 1);

  /* ---- 终端清单与断点续传（R2/M4） ---- */
  r = await api('GET', '/api/device-api/manifest', { headers: { 'x-device-key': deviceKey } });
  check('R2 终端拉取内容清单', r.status === 200 && Array.isArray(r.data?.contents));
  check('清单含已发布 txt 内容', r.data?.contents?.some((c) => c.id === txtContentId));
  check('R12 清单含排期数组', Array.isArray(r.data?.schedules));

  /* ---- 节目与排期（R11/R12/M7） ---- */
  r = await api('POST', '/api/programs', {
    token,
    body: { name: 'E2E节目', layout: 'video-ticker', items: [{ type: 'text', title: '欢迎', durationSec: 10 }] },
  });
  check('PD-01 创建分屏节目（模板版式）', r.status === 201 && !!r.data?.id);
  const programId = r.data?.id;

  r = await api('POST', '/api/schedules', {
    token,
    body: { name: 'E2E排期', programId, targetGroupIds: [], priority: 5, daysOfWeek: [], startMinute: 0, endMinute: 1440 },
  });
  check('PD-04 创建排期', r.status === 201 && !!r.data?.id);

  r = await api('GET', '/api/device-api/manifest', { headers: { 'x-device-key': deviceKey } });
  check('R12 清单含节目与排期', r.data?.programs?.some((p) => p.id === programId) && r.data?.schedules?.length >= 1);

  /* ---- 日志审计（R7/M1） ---- */
  r = await api('GET', '/api/logs?pageSize=50', { token });
  const actions = (r.data?.items ?? []).map((i) => i.action);
  check('R7 登录日志留痕', actions.includes('LOGIN_OK') || actions.includes('LOGIN_FAIL'));
  check('R7 内容操作日志留痕', actions.some((a) => a.startsWith('CONTENT_') || a.startsWith('IMPORT_')));
  check('R7 AI 审核留痕', actions.includes('AI_REVIEW'));

  /* ---- 撤回（PB-08） ---- */
  r = await api('GET', '/api/publish-tasks?status=DONE', { token });
  const doneTask = r.data?.items?.[0];
  if (doneTask) {
    r = await api('POST', `/api/publish-tasks/${doneTask.id}/revoke`, { token });
    check('PB-08 发布撤回', r.status === 201);
    r = await api('GET', '/api/device-api/manifest', { headers: { 'x-device-key': deviceKey } });
    check('撤回后清单移除内容', !r.data?.contents?.some((c) => c.id === doneTask.contentId));
  } else {
    check('PB-08 发布撤回', false, '无已完成任务');
  }

  /* ---- 版本接口（TC-09） ---- */
  r = await api('GET', '/api/device-api/version', { headers: { 'x-app-version': '0.0.1' } });
  check('TC-09 版本检查接口', r.status === 200 && 'latest' in r.data && r.data.upToDate === false);

  /* ---- VLM 图片审核（AV-05，走自建 qwen3.8-flash 网关） ---- */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAy0lEQVR4nO3SQQ0AIAADMUAmctCEQFRwr9bAksvmPnfw3wo2ELrj0RGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IPRoP/7MCMCSkbwgAAAAASUVORK5CYII=',
    'base64',
  );
  const imgFd = new FormData();
  imgFd.append('file', new Blob([png], { type: 'image/png' }), 'e2e.png');
  r = await api('POST', '/api/media/upload', { token, body: imgFd, raw: true });
  const mediaId = r.data?.id;
  check('AV-05 图片素材上传', !!mediaId);

  r = await api('POST', '/api/contents', { token, body: { title: 'E2E图片内容', type: 'image', mediaId } });
  const imgContentId = r.data?.id;
  await api('POST', `/api/contents/${imgContentId}/submit`, { token });
  r = await api('POST', `/api/review/${imgContentId}/ai`, { token });
  check('AV-05 图片经 VLM 审核进入人工复审', r.data?.next === 'MANUAL_REVIEW', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`);
  check('AV-08 VLM 审核留痕含判定', r.data?.verdict && typeof r.data.verdict.pass === 'boolean');

  /* ---- 内容版本快照与恢复（CM-06） ---- */
  r = await api('PUT', `/api/contents/${txtContentId}`, { token, body: { title: 'E2E测试内容-改名后' } });
  r = await api('GET', `/api/contents/${txtContentId}/versions`, { token });
  check('CM-06 修改自动留存版本快照', Array.isArray(r.data) && r.data.length >= 1);
  const verId = r.data?.[0]?.id;
  r = await api('POST', `/api/contents/${txtContentId}/versions/${verId}/restore`, { token });
  check('CM-06 恢复历史版本回到草稿', r.data?.ok === true);

  /* ---- 栏目-终端分组关联（CM-02） ---- */
  r = await api('POST', '/api/columns', { token, body: { name: 'E2E受限栏目', groupIds: [groupId] } });
  const restrictedCol = r.data?.id;
  r = await api('GET', '/api/columns', { token });
  const colNode = (r.data ?? []).flat().find?.((c) => c.id === restrictedCol) ?? (await findCol(r.data, restrictedCol));
  async function findCol(nodes, id) { for (const n of nodes ?? []) { if (n.id === id) return n; const c = await findCol(n.children, id); if (c) return c; } return null; }
  check('CM-02 栏目携带可见分组', Array.isArray(colNode?.groupIds) && colNode.groupIds.includes(groupId));

  /* ---- 系统参数 + 灰度版本（SY-01/TC-11） ---- */
  r = await api('PUT', '/api/system/params', { token, body: { latestVersion: '9.9.9', stableVersion: '0.1.0', grayGroupIds: [] } });
  check('SY-01 参数写入', r.data?.ok === true);
  r = await api('GET', '/api/device-api/version', { headers: { 'x-device-key': deviceKey, 'x-app-version': '0.1.0' } });
  check('TC-09 版本接口返回最新版', r.data?.latest === '9.9.9' && r.data?.upToDate === false);

  const fd3 = new FormData();
  fd3.append('name', 'G3-' + Date.now());
  r = await api('POST', '/api/device-groups', { token, body: fd3, raw: true });
  const otherGroup = r.data?.id;
  await api('PUT', '/api/system/params', { token, body: { grayGroupIds: [otherGroup] } });
  r = await api('GET', '/api/device-api/version', { headers: { 'x-device-key': deviceKey } });
  check('TC-11 非灰度分组拿到稳定版', r.data?.latest === '0.1.0');

  /* ---- 运营统计（SY-04） ---- */
  r = await api('GET', '/api/stats/overview', { token });
  check('SY-04 统计概览', typeof r.data?.users === 'number' && typeof r.data?.devices === 'number' && !!r.data?.contentsByStatus);

  /* ---- 汇总 ---- */
  console.log(results.join('\n'));
  console.log(`\n========== 通过 ${passed} / ${passed + failed} ==========`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E 运行异常:', e);
  process.exit(1);
});
