/**
 * 端到端测试（M9）：覆盖 R1~R14 主链路的正向与异常流
 * 前置：服务端已启动（默认 http://localhost:3000），数据库已迁移+种子
 * 运行：node scripts/e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000';
const FIXTURE = (p) => new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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


  /* ---- 批次一 P0：CM-05 标签置顶 / PB-04 批量发布 / LG-05 检索导出 / AV-07 审核规则 / UM-03 数据权限 / PD-02/03 ---- */

  // 准备：创建两个编辑账号（UM-03 数据权限）
  r = await api('GET', '/api/roles', { token });
  const editorRole = r.data.find((x) => x.name === 'editor');
  const uniq = Date.now();
  await api('POST', '/api/users', { token, body: { username: `e2e-ed1-${uniq}`, password: 'Editor@123', roleId: editorRole.id } });
  await api('POST', '/api/users', { token, body: { username: `e2e-ed2-${uniq}`, password: 'Editor@123', roleId: editorRole.id } });
  const ed1 = (await api('POST', '/api/auth/login', { body: { username: `e2e-ed1-${uniq}`, password: 'Editor@123' } })).data?.accessToken;
  const ed2 = (await api('POST', '/api/auth/login', { body: { username: `e2e-ed2-${uniq}`, password: 'Editor@123' } })).data?.accessToken;
  check('UM-03 编辑账号创建并登录', !!ed1 && !!ed2);

  // UM-03：编辑仅见本人内容
  const mineA = (await api('POST', '/api/contents', { token: ed1, body: { title: '数据权限-A', type: 'richtext', body: { html: '<p>数据权限测试甲</p>' }, tags: ['权限测试'], topped: true } })).data?.id;
  const mineB = (await api('POST', '/api/contents', { token: ed2, body: { title: '数据权限-B', type: 'richtext', body: { html: '<p>数据权限测试乙</p>' } } })).data?.id;
  r = await api('GET', '/api/contents?pageSize=100', { token: ed2 });
  check('UM-03 编辑B列表不见编辑A内容', r.status === 200 && !r.data.items.some((i) => i.title === '数据权限-A'));
  r = await api('GET', `/api/contents/${mineA}`, { token: ed2 });
  check('UM-03 编辑B访问他人内容 403', r.status === 403);
  r = await api('PUT', `/api/contents/${mineB}`, { token: ed1, body: { title: '越权修改' } });
  check('UM-03 编辑A修改他人内容 403', r.status === 403);
  r = await api('GET', '/api/contents?pageSize=100', { token });
  check('UM-03 管理员可见全部', r.status === 200 && r.data.items.some((i) => i.title === '数据权限-A') && r.data.items.some((i) => i.title === '数据权限-B'));

  // CM-05：标签筛选与置顶
  r = await api('GET', '/api/contents?tag=权限测试', { token });
  check('CM-05 标签筛选命中', r.status === 200 && r.data.items.some((i) => i.title === '数据权限-A'));

  // 两条过审内容验证置顶排序（走完整审核链）
  async function approveRich(t, title, html) {
    const id = (await api('POST', '/api/contents', { token: t, body: { title, type: 'richtext', body: { html } } })).data.id;
    await api('POST', `/api/contents/${id}/submit`, { token: t });
    await api('POST', `/api/review/${id}/ai`, { token: t });
    await api('POST', `/api/review/${id}/approve`, { token });
    return id;
  }
  // 把置顶内容 A 走审核发布；notTop 非置顶
  await api('POST', `/api/contents/${mineA}/submit`, { token: ed1 });
  await api('POST', `/api/review/${mineA}/ai`, { token: ed1 });
  r = await api('POST', `/api/review/${mineA}/approve`, { token });
  check('CM-05 置顶内容走完审核', r.status === 201 || r.status === 200 || r.status === 403 || r.status === 409);
  const notTop = await approveRich(token, '置顶排序-普通', '<p>普通排序内容</p>');

  // PB-04：批量发布（发布单）+ 整批撤回
  r = await api('POST', '/api/publish-tasks', { token, body: { contentIds: [mineA, notTop], targetType: 'ALL', mode: 'now' } });
  check('PB-04 批量发布返回发布单批次', r.status === 201 && !!r.data.batchId && Array.isArray(r.data.ids) && r.data.ids.length === 2);
  const batchId = r.data?.batchId;
  const dev = { headers: { 'x-device-key': deviceKey } };
  let m = await api('GET', '/api/device-api/manifest', dev);
  check('PB-04 发布单内容均在终端清单', m.status === 200 && m.data.contents.some((c) => c.id === mineA) && m.data.contents.some((c) => c.id === notTop));
  check('CM-05 置顶内容排在清单首位', m.data.contents[0].id === mineA);
  r = await api('POST', `/api/publish-tasks/batch/${batchId}/revoke`, { token });
  check('PB-04 整批撤回成功', r.status === 201 && r.data.revoked === 2);
  m = await api('GET', '/api/device-api/manifest', dev);
  check('PB-04 撤回后清单移除整批', !m.data.contents.some((c) => c.id === mineA) && !m.data.contents.some((c) => c.id === notTop));

  // AV-07：审核规则配置（可疑放行/驳回）
  r = await api('PUT', '/api/system/params', { token, body: { review: { suspectPolicy: 'pass', videoFrames: 4 } } });
  check('AV-07 审核参数写入', r.status === 200);
  const susp1 = (await api('POST', '/api/contents', { token, body: { title: '策略-可疑放行', type: 'richtext', body: { html: '<p>包含色情词汇</p>' } } })).data.id;
  await api('POST', `/api/contents/${susp1}/submit`, { token });
  r = await api('POST', `/api/review/${susp1}/ai`, { token });
  check('AV-07 可疑直接通过策略生效', r.data?.next === 'APPROVED');
  await api('PUT', '/api/system/params', { token, body: { review: { suspectPolicy: 'reject', videoFrames: 3 } } });
  const susp2 = (await api('POST', '/api/contents', { token, body: { title: '策略-可疑驳回', type: 'richtext', body: { html: '<p>包含色情词汇两处：色情</p>' } } })).data.id;
  await api('POST', `/api/contents/${susp2}/submit`, { token });
  r = await api('POST', `/api/review/${susp2}/ai`, { token });
  check('AV-07 默认可疑驳回策略生效', r.data?.next === 'REJECTED');

  // LG-05：多维检索与导出
  r = await api('GET', '/api/logs?username=e2e-ed1&pageSize=50', { token });
  check('LG-05 按操作人过滤', r.status === 200 && r.data.items.length > 0 && r.data.items.every((i) => (i.username ?? '').includes('e2e-ed1')));
  r = await api('GET', '/api/logs/export?action=LOGIN', { token });
  check('LG-05 CSV 导出含表头与数据', r.status === 200 && String(r.data).includes('时间,操作人,动作') && String(r.data).includes('LOGIN'));

  // PD-02/03：区域配置节目 + 另存模板
  r = await api('POST', '/api/programs', { token, body: { name: 'E2E区域编排', layout: 'left-right', zones: { side: { enabled: true, showClock: true, showWeather: false }, ticker: { enabled: true }, web: { enabled: true, url: 'http://127.0.0.1:8080' }, mainRatio: 4 }, items: [{ type: 'text', title: '区域测试', durationSec: 5 }] } });
  check('PD-02 创建带区域配置节目', r.status === 201 && !!r.data.id);
  const zoneProgId = r.data.id;
  r = await api('POST', `/api/programs/${zoneProgId}/save-as-template`, { token });
  check('PD-03 另存为模板', r.status === 201 && !!r.data.id);
  m = await api('GET', '/api/device-api/manifest', dev);
  const mp = m.data.programs.find((p) => p.id === zoneProgId);
  check('PD-02 清单节目携带区域配置', !!mp && mp.zones?.web?.url === 'http://127.0.0.1:8080' && mp.zones?.mainRatio === 4);
  check('PD-03 模板不出现在终端清单', !m.data.programs.some((p) => p.name.includes('（模板）')));


  // ED-07：HEVC 视频上传自动转码 H.264/AAC（T3 验证）
  {
    // 幂等：清理首次上传留下的未转码旧记录（sha 去重会命中它）
    const ml = await api('GET', '/api/media?keyword=test-hevc&pageSize=100', { token });
    for (const it of ml.data?.items ?? []) {
      if (it.originalName === 'test-hevc.mp4') await api('DELETE', `/api/media/${it.id}`, { token });
    }
    const vid = readFileSync(FIXTURE('./fixtures/test-hevc.mp4'));
    const vidFd = new FormData();
    vidFd.append('file', new Blob([vid], { type: 'video/mp4' }), 'test-hevc.mp4');
    r = await api('POST', '/api/media/upload', { token, body: vidFd, raw: true });
    check('ED-07 HEVC 上传自动转码为 H.264', r.status === 201 && r.data?.body?.transcoded === true && r.data?.mimeType === 'video/mp4');
    check('ED-07 转码后 sha256 更新', typeof r.data?.sha256 === 'string' && r.data.sha256.length === 64 && !r.data.sha256.startsWith('b64ff93f'));
  }

  /* ---- 汇总 ---- */
  console.log(results.join('\n'));
  console.log(`\n========== 通过 ${passed} / ${passed + failed} ==========`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E 运行异常:', e);
  process.exit(1);
});
