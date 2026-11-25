import {setupCommentCollection, getTaskComments, openPublishedComments} from './comments.js';

const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const dialogBody = document.getElementById('dialog-body');
const notice = document.getElementById('notice');
const params = new URL(location.href).searchParams;
const taskId = params.get('task');
// The same bundle runs at / on the public host and under a mount on the
// unified workbench. Resolve endpoints from the module, not from user input.
const mount = new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const atManage = location.pathname.replace(/\/$/, '') === mount + '/manage';
const embedded = atManage && params.get('embed') === '1' && parent !== window;
let recipientOrigin = mount ? '' : location.origin;
let manageOrigin;
let manager = taskId === null;
let accountsEnabled = false;
let account = null;
let workspaceView = 'mine';
let accountList = [];
let ownerFilter = '';
const accountChangeKey = 'kh:publisher:session-changed';
const platformNames = {douyin:'抖音', wechat_channels:'微信视频号', xiaohongshu:'小红书', kuaishou:'快手', other:'其他平台'};
const states = {draft:'草稿', open:'已发布', paused:'已暂停', closed:'已关闭'};
let tasks = [];
let publicTask;
let claim;
let visit;
let videoCopyConfirmed = false;
let commentCopyConfirmed = false;
let guestReceipt = null;
let syncSequence = 0;
let guideImages;
const failedImages = new Set();
let busy = false;
let noticeTimer;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function button(action, label, style='secondary', id) {
  const data = id === undefined ? '' : ` data-id="${esc(id)}"`;
  return `<button type="button" class="${style}" data-action="${action}"${data}>${esc(label)}</button>`;
}
function flash(message, error=false) {
  clearTimeout(noticeTimer);
  notice.className = error ? 'error' : '';
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent=''; }, error ? 8500 : 3400);
}
async function api(path, payload) {
  const options = payload === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  };
  if (account && (path === '/api/tasks' || path.startsWith('/api/tasks/') || path.startsWith('/api/admin/') ||
      path === '/api/account/register' || path === '/api/account/logout')) {
    options.headers = {...options.headers, 'X-KH-Owner':String(account.id)};
  }
  let result;
  try { result = await fetch(mount+path,{cache:'no-store',...options}); }
  catch { throw new Error('暂时连不上服务，请检查网络后重试。'); }
  let data;
  try { data = await result.json(); }
  catch { throw new Error(`无法读取服务响应（${result.status}）。`); }
  if (!result.ok) {
    const error = new Error(data.error || `操作未完成（${result.status}）。`);
    error.status = result.status;
    throw error;
  }
  if (payload !== undefined && /^\/api\/(?:admin\/)?tasks(?:\/|$)/.test(path)) notifyParent('kh:dispatch-updated');
  return data;
}
function notifyParent(type) {
  if (embedded) parent.postMessage({type},location.origin);
}
function configuredOrigin(raw) {
  if (!raw) return '';
  const url = new URL(raw);
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.origin !== raw.replace(/\/$/,'') || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('管理端或领取端地址配置有误。');
  }
  return url.origin;
}
function modal(title, markup) {
  document.getElementById('dialog-title').textContent = title;
  dialogBody.innerHTML = markup;
  dialog.showModal();
}
function formEnd(label) {
  return `<div class="form-error" role="alert"></div><div class="form-actions">${button('dismiss','取消')}<button type="submit" class="primary">${label}</button></div></form>`;
}
function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(states[status] || status)}</span>`;
}
function publicLink(id) {
  const url = new URL('/',recipientOrigin);
  url.searchParams.set('task',id);
  return url.href;
}
function targetLink(platform, raw, label='打开视频号作品') {
  if (platform !== 'wechat_channels' || !/^https?:\/\//i.test(raw) || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (!url.username && !url.password && url.hostname) return `<a class="primary" data-open-video href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  } catch { /* Invalid links have no navigation action. */ }
  return '';
}
function messageCard(title, text, actions='') {
  return `<section class="card"><h1>${esc(title)}</h1><p>${esc(text)}</p>${actions ? `<div class="actions">${actions}</div>` : ''}</section>`;
}
function managerAccessMessage() {
  app.innerHTML = messageCard('打开本机管理入口','请从启动窗口打开完整的管理链接。只有发布者需要这个入口；给领取者分享任务时，请复制任务卡上的领取链接。');
}
function updateHeader() {
  document.body.classList.toggle('embedded-manager', embedded);
  document.body.classList.toggle('guest-page', !manager);
  document.querySelector('meta[name="theme-color"]').content = manager ? '#184c3f' : '#fcfdfa';
  let label = manager ? '发布者工作台' : '免登录领取';
  if (account) {
    label = account.role === 'guest' ? '游客' :
      (account.role === 'admin' ? '管理员 · ' : '') + account.username;
  }
  document.getElementById('view-label').textContent = label;
  document.getElementById('sign-out').hidden = !account;
}
function accountFields(register) {
  const hint = register ? '<small>3–32 个字符，可用中英文、数字、点、横线和下划线。</small>' : '';
  return `<label>账号<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"${register ? ' minlength="3" maxlength="32"' : ''}>${hint}</label>
    <label>密码<input type="password" name="password" required autocomplete="${register ? 'new-password' : 'current-password'}"${register ? ' minlength="8" maxlength="128"' : ''}>${register ? '<small>8–128 个字符。</small>' : ''}</label>`;
}
function renderLogin(register=false) {
  if (embedded) {
    app.innerHTML = messageCard('请重新登录','登录后即可继续管理热启动任务。');
    notifyParent('kh:session-changed');
    return;
  }
  const action = register ? 'register' : 'login';
  app.innerHTML = `<section class="card auth-card" aria-labelledby="auth-title">
    <h1 id="auth-title">${register ? '注册发布者账号' : '登录发布工作台'}</h1>
    <p>${register ? '设置账号和密码，以后可以在不同设备上管理自己的任务。' : '登录后可以创建任务、复制领取链接和查看领取记录。'}</p>
    <form data-form="${action}">${accountFields(register)}
      <div class="form-error" role="alert"></div>
      <button class="primary" type="submit">${register ? '注册并进入工作台' : '登录'}</button>
    </form>
    <p class="switch-account">${register ? '已有账号？' : '还没有账号？'} ${button(register ? 'show-login' : 'show-register',register ? '去登录' : '注册账号','subtle')}</p>
    <div class="guest-entry">${button('guest-login','游客直接试用','secondary')}
      <p>试用中也可以注册，保留已创建的任务。</p>
    </div></section>`;
}
function registerGuest() {
  if (dialog.open) dialog.close();
  modal('注册并保留任务',`<form data-form="register"><p class="hint">设置账号和密码后，当前游客任务和领取链接会保留在你的账号里。</p>
    ${accountFields(true)}${formEnd('注册并保留任务')}`);
}
function setAccount(user) {
  account = user;
  tasks = [];
  workspaceView = 'mine';
  accountList = [];
  ownerFilter = '';
  if (dialog.open) dialog.close();
  app.innerHTML = '<p class="hint">正在加载…</p>';
  updateHeader();
}
async function changeAccount(user) {
  setAccount(user);
  notifyParent('kh:session-changed');
  try { localStorage.setItem(accountChangeKey, String(Date.now())); } catch { /* Restricted storage. */ }
  if (redirectOldManager()) return;
  await refresh();
}
async function syncAccount() {
  if (!accountsEnabled || document.hidden || busy) return;
  const previous = account;
  try {
    const {user} = await api('/api/account');
    if (account !== previous || busy) return;
    if (user?.id === account?.id && user?.role === account?.role) return;
    setAccount(user);
    notifyParent('kh:session-changed');
    if (redirectOldManager()) return;
    await refresh();
  } catch { /* The next direct interaction also verifies its owner on the server. */ }
}
function managerCard(task) {
  const id = task.id;
  const controls = [];
  if (task.status === 'draft') controls.push(button('edit-task','编辑草稿','secondary',id),button('publish','发布任务','primary',id));
  if (task.status === 'open') controls.push(button('pause','暂停领取','secondary',id));
  if (task.status === 'paused') controls.push(button('resume','恢复发布','primary',id));
  if (task.status === 'open' || task.status === 'paused') controls.push(button('task-comments','评论配置','secondary',id));
  if (task.status !== 'draft') {
    controls.push(button('visitors','领取明细','secondary',id),button('share','复制领取链接','secondary',id),
      `<a data-action="open-public" class="secondary" href="${esc(publicLink(id))}" target="_blank" rel="noopener">打开领取页 ↗</a>`);
  }
  if (task.status !== 'closed') controls.push(button('close-task','关闭任务','subtle',id));
  return `<article class="record" data-task-id="${esc(id)}"><div class="title-row"><h3>${esc(task.title)}</h3>${badge(task.status)}${platformBadge(task)}</div>
    ${taskSource(task)}
    ${task.instructions ? `<p class="description">${esc(task.instructions)}</p>` : ''}
    <div class="counts"><span>共 ${esc(task.total)} 条</span><span>已领 ${esc(task.claimed)} 条</span><span>剩余 ${esc(task.remaining)} 条</span></div>
    <div class="actions">${controls.join('')}</div></article>`;
}
function platformBadge(task) {
  return task.platform_enabled === false ? '<span class="badge paused">平台已下架</span>' : '';
}
function taskSource(task) {
  const parts = [platformNames[task.target_platform], task.origin?.videoAccountName, task.origin ? '来自评论生成' : '独立创建'];
  return `<p class="description">${parts.filter(Boolean).map(esc).join(' · ')}</p>`;
}
function publisherName(name, role, id) {
  return role === 'guest' ? '游客 #' + id : name;
}
function workspaceNav() {
  if (account?.role !== 'admin') return '';
  const views = {mine:'我的任务', all:'全部任务', accounts:'账号管理'};
  return `<nav class="workspace-nav" aria-label="管理视图">${Object.entries(views).map(([key,label]) =>
    `<button type="button" data-action="workspace" data-id="${key}" ${key === workspaceView ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
}
function renderAllTasks() {
  const publishers = new Map(tasks.map(t => [String(t.owner_id), publisherName(t.owner_username,t.owner_role,t.owner_id)]));
  // A new account may legitimately have no tasks when reached from the account list.
  const selected = accountList.find(item => String(item.id) === ownerFilter);
  if (selected) publishers.set(ownerFilter,publisherName(selected.username,selected.role,selected.id));
  if (!publishers.has(ownerFilter)) ownerFilter = '';
  const filtered = tasks.filter(t => !ownerFilter || String(t.owner_id) === ownerFilter);
  const records = filtered.map(t => {
    const name = publisherName(t.owner_username,t.owner_role,t.owner_id);
    return `<article class="record" data-task-id="${esc(t.id)}"><div class="title-row"><h3>${esc(t.title)}</h3>${badge(t.status)}${platformBadge(t)}</div>
      ${taskSource(t)}
      <p class="description">发布者 · ${esc(name)}${t.owner_disabled ? '（账号已停用）' : ''}</p>
      <div class="counts"><span>共 ${esc(t.total)} 条</span><span>已领 ${esc(t.claimed)} 条</span><span>剩余 ${esc(t.remaining)} 条</span></div>
      <div class="actions">${button('audit-task','查看内容与领取明细','secondary',t.id)}
        ${['open','paused'].includes(t.status) ? button('admin-comments','评论配置','secondary',t.id) : ''}
        ${button(t.platform_enabled === false ? 'admin-enable' : 'admin-disable',t.platform_enabled === false ? '平台上架' : '平台下架','subtle',t.id)}</div></article>`;
  }).join('');
  app.innerHTML = `${workspaceNav()}<section class="intro"><h1>全部任务</h1>${button('refresh','刷新','subtle')}</section>
    <section class="panel"><div class="toolbar"><label class="owner-filter">发布者<select data-owner-filter><option value="">全部发布者</option>
    ${Array.from(publishers,([id,name])=>`<option value="${esc(id)}" ${id===ownerFilter?'selected':''}>${esc(name)}</option>`).join('')}</select></label>
    <span class="hint">${filtered.length} 个任务</span></div>${records || '<div class="empty"><p>暂无任务。</p></div>'}</section>`;
}
function renderAccounts() {
  const rows = accountList.map(person => {
    const name = publisherName(person.username,person.role,person.id);
    return `<article class="record"><div class="title-row"><h3>${esc(name)}</h3><span class="badge">${({admin:'管理员',user:'注册账号',guest:'游客'})[person.role]}</span>
      ${person.disabled ? '<span class="badge paused">已停用</span>' : ''}</div><div class="actions">
      ${button('account-tasks','查看任务（'+person.task_count+'）','secondary',person.id)}
      ${person.role === 'admin' ? '' : button(person.disabled ? 'account-enable':'account-disable',person.disabled?'启用账号':'停用账号','subtle',person.id)}
      ${person.role === 'user' ? button('account-password','重置密码','subtle',person.id) : ''}</div></article>`;
  }).join('');
  app.innerHTML = `${workspaceNav()}<section class="intro"><h1>账号管理</h1>${button('refresh','刷新','subtle')}</section>
    <section class="panel"><div class="toolbar"><h2>账号列表</h2><span class="hint">${accountList.length} 个账号</span></div>${rows}</section>`;
}
function renderManager() {
  const total = tasks.reduce((sum,t) => sum+t.total,0);
  const claimed = tasks.reduce((sum,t) => sum+t.claimed,0);
  const guestNotice = account?.role === 'guest' ? `<aside class="guest-account-note"><p>${manageOrigin ? '请先注册以保留游客任务，再用同一个账号登录统一工作台。' : '游客任务只能在当前浏览器继续管理。注册后可在其他设备登录。'}</p>${button('claim-account','注册并保留任务','secondary')}</aside>` : '';
  app.innerHTML = `${workspaceNav()}<section class="intro"><div><h1>${accountsEnabled ? '我的任务' : '评论任务管理'}</h1><p>准备作品分享链接和评论，发布后复制领取链接。</p></div>${button('new-task','新建任务','primary')}</section>
    ${guestNotice}
    <dl class="metrics"><div><dt>已发布任务</dt><dd>${tasks.filter(t=>t.status==='open').length}</dd></div><div><dt>评论总数</dt><dd>${total}</dd></div><div><dt>已被领取</dt><dd>${claimed}</dd></div></dl>
    <section class="panel"><div class="toolbar"><h2>任务列表</h2>${button('refresh','刷新','subtle')}</div>${tasks.length ? tasks.map(managerCard).join('') :
        '<div class="empty"><h3>还没有任务</h3></div>'}</section>`;
}
function progressKey(kind) {
  return `kh:guest:${kind === 'comment' ? 'comment-copied' : 'video-reviewed'}:${taskId}`;
}
function restoreCopy(kind) {
  try { return ['copied', 'yes'].includes(localStorage.getItem(progressKey(kind))); }
  catch { return false; }
}
function setCopyConfirmed(kind, confirmed) {
  if (kind === 'video') videoCopyConfirmed = confirmed;
  else commentCopyConfirmed = confirmed;
  try {
    if (confirmed) localStorage.setItem(progressKey(kind), 'copied');
    else localStorage.removeItem(progressKey(kind));
  } catch { /* The steps still work in this page if storage is unavailable. */ }
}
function guestPlatformLabel() {
  return ({douyin:'抖音 App', xiaohongshu:'小红书 App', kuaishou:'快手 App', wechat_channels:'微信视频号'})[publicTask.target_platform] || '对应的 App';
}
function canReceiveComment() {
  return !publicTask.owner_disabled && publicTask.platform_enabled !== false
    && publicTask.status === 'open' && publicTask.remaining > 0;
}
function guideFigure(kind) {
  const source = guideImages?.[kind];
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const image = source?.[ios ? 'ios' : 'android'];
  if (typeof image !== 'string' || !/^\/static\/task-guides\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp)$/.test(image) || failedImages.has(image)) return '';
  return `<figure class="guest-guide-figure"><img class="guest-platform-guide" data-guide-image="${kind}" src="${esc(image)}" alt="${esc(guestPlatformLabel())}${kind === 'video' ? '打开作品' : '粘贴评论'}操作示意"></figure>`;
}
function guestGuide(channels, step) {
  const platform = publicTask.target_platform;
  const openApp = {
    douyin:'切换到抖音 App，看到链接识别提示后点「打开看看」。',
    kuaishou:'切换到快手 App，根据分享链接提示打开作品。',
    xiaohongshu:'切换到小红书 App，看到链接识别提示后点「查看笔记」。'
  }[platform] || '切换到对应的 App，按提示打开作品。';
  const fallback = platform === 'xiaohongshu' && /Android/i.test(navigator.userAgent)
    ? '<details class="guest-guide-note"><summary>小红书没有弹出笔记？</summary><p>如果左上角有「点点」入口，点进去粘贴链接，点「发送」，再打开返回的笔记。</p></details>' : '';
  const steps = channels ? [
    ['领取评论','填写访客名称，领取这条任务分配给你的评论。'],
    ['复制评论','点「复制评论」，看到复制成功提示后点「确认」。'],
    ['打开视频并评论','点「打开视频」进入微信视频号作品，在评论区粘贴并发送。']
  ] : [
    ['填写昵称','填写访客名称，点「领取作品分享链接」。'],
    ['打开作品',`复制作品分享链接后点「确认」。${openApp}`],
    ['领取并发送评论',`看完切回本页，点「完成」领取评论。复制评论并确认，再回到作品评论区粘贴、发送。`]
  ];
  return `<aside class="guest-guide" aria-labelledby="guest-guide-heading"><h2 class="guest-guide-title" id="guest-guide-heading">操作指引</h2>
    <ol class="guest-timeline">${steps.map(([title,description],index)=>{
      const number = index + 1;
      const state = number < step ? 'done' : number === step ? 'current' : 'upcoming';
      return `<li data-state="${state}"${state === 'current' ? ' aria-current="step"' : ''}><span class="guest-marker" aria-hidden="true">${state === 'done' ? '✓' : number}</span>
        <div class="guest-guide-step"><h3>${esc(title)}</h3><p>${esc(description)}</p>${number === 2 ? fallback : ''}</div></li>`;
    }).join('')}</ol>${guideFigure(claim ? 'comment' : 'video')}</aside>`;
}
function receiptMarkup() {
  if (!guestReceipt) return '';
  const {kind,copied} = guestReceipt;
  const video = kind === 'video';
  const description = copied ? (video ? '作品分享链接已复制。' : '评论已复制。') : video ?
    '请重试，或用系统浏览器打开当前任务，再复制作品分享链接。' :
    '可以重试，也可以选中或长按上方评论手动复制。';
  const actions = copied ? button('confirm-copy','确认') : button('retry-copy','重试复制') +
    (video ? button('dismiss-copy','返回','subtle') : button('manual-comment','已手动复制','subtle'));
  return `<div class="guest-receipt" data-state="${copied ? 'success' : 'error'}" role="group" aria-labelledby="guest-receipt-title" aria-describedby="guest-receipt-description">
    <div class="guest-receipt-copy" role="status"><strong id="guest-receipt-title">${copied ? '复制成功' : '复制失败'}</strong><p id="guest-receipt-description">${description}</p></div>
    <div class="guest-receipt-actions">${actions}</div></div>`;
}
function renderPublic() {
  const task = publicTask;
  const channels = task.target_platform === 'wechat_channels';
  const available = canReceiveComment();
  const step = channels ? (!claim ? 1 : commentCopyConfirmed ? 3 : 2) : (claim ? 3 : visit ? 2 : 1);
  let heading, hint = '', content = '', actions = '';
  if (claim) {
    heading = channels && commentCopyConfirmed ? '打开视频并评论' : '已领取评论';
    hint = channels && commentCopyConfirmed ? '打开视频号作品，在评论区粘贴并发送。' : '';
    content = `<blockquote class="guest-comment" data-claim-text>${esc(claim.comment)}</blockquote>`;
    const openVideo = channels && commentCopyConfirmed && visit?.video_url ? targetLink('wechat_channels',visit.video_url,'打开视频') : '';
    actions = openVideo + button('copy-comment','复制评论',openVideo ? 'secondary' : 'primary');
    if (!channels) actions += button('copy-video','复制作品分享链接','secondary');
  } else if (!available) {
    const blocked = task.platform_enabled === false || task.owner_disabled;
    heading = blocked || task.status === 'paused' ? '任务已暂停' : task.status === 'closed' ? '任务已关闭' : '评论已领完';
    hint = blocked || task.status !== 'open' ? '当前任务已停止领取。' : '这条任务的评论已全部领完。';
    actions = button('refresh','刷新状态','secondary');
    if (visit && !channels) actions += button('copy-video','复制作品分享链接','secondary');
  } else if (!visit) {
    heading = channels ? '领取评论' : '领取作品分享链接';
    const action = channels ? 'claim-comment' : 'video';
    content = `<form class="guest-form" data-form="${action}">
      <label>访客名称<input name="name" maxlength="32" required autocomplete="nickname" placeholder="输入你的名称或昵称"></label>
      <div class="form-error" role="alert"></div>
      <div class="guest-actions"><button data-action-id="${action}" type="submit" class="primary">${channels ? '立即领取' : '领取作品分享链接'}</button></div></form>`;
  } else if (channels) {
    // Older tasks can have registered visitors without an assigned comment.
    heading = '领取评论';
    actions = button('claim','立即领取','primary');
  } else if (videoCopyConfirmed) {
    heading = '看完作品，领取评论';
    hint = `切换到${guestPlatformLabel()}打开作品，看完再回到这里。点「完成」即可领取评论。`;
    actions = button('video-next','完成','primary') + button('copy-video','复制作品分享链接','secondary');
  } else {
    heading = '查看作品';
    hint = `复制作品分享链接，再切换到${guestPlatformLabel()}。`;
    actions = button('copy-video','复制作品分享链接','primary');
  }
  const identity = visit ? `<span class="guest-person">领取人 <strong>${esc(visit.name)}</strong></span>` : '';
  const actionArea = guestReceipt ? receiptMarkup() : actions ? `<div class="guest-actions">${actions}</div>` : '';
  app.innerHTML = `<div class="guest-shell"><div class="guest-workspace"><header class="guest-task-card">
    <div class="guest-task-meta"><span class="guest-platform" data-platform="${esc(task.target_platform)}">${esc(platformNames[task.target_platform] || '其他平台')}</span>
    <span class="guest-capacity">剩余 ${esc(task.remaining)} / ${esc(task.total)} 条</span></div>
    <h1>${esc(task.title)}</h1>${task.instructions ? `<p class="description">${esc(task.instructions)}</p>` : ''}
    </header><section class="guest-step-card" aria-labelledby="guest-step-heading">
    <div class="guest-step-meta"><span class="guest-stage">步骤 ${step} / 3</span>${identity}</div>
    <h2 id="guest-step-heading" class="guest-step-title" tabindex="-1">${heading}</h2>
    ${hint ? `<p class="guest-hint">${esc(hint)}</p>` : ''}${content}${actionArea}</section></div>${guestGuide(channels,step)}</div>`;
}
function focusGuestAction(selector = '#guest-step-heading') {
  const target = app.querySelector(selector) || document.getElementById('guest-step-heading');
  target?.focus({preventScroll:true});
}
function finishGuestCopy(manual = false) {
  if (!guestReceipt || (manual ? guestReceipt.copied || guestReceipt.kind !== 'comment' : !guestReceipt.copied)) return;
  setCopyConfirmed(guestReceipt.kind,true);
  guestReceipt = null;
  renderPublic();
  focusGuestAction('.guest-actions .primary');
}
function copyWithSelection(text) {
  const field = document.createElement('textarea');
  field.className = 'clipboard-selection';
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden','true');
  field.value = text;
  // Some older in-app browsers only support copying from a focused selection.
  (dialog.open ? dialog : document.body).append(field);
  try {
    field.focus({preventScroll:true});
    field.select();
    field.setSelectionRange(0,field.value.length);
    field.addEventListener('copy', event => {
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain',text);
        event.preventDefault();
      }
    }, {once:true});
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
async function copyGuestValue(kind, explicitText) {
  const video = kind === 'video';
  const text = explicitText ?? (video ? visit?.video_url : claim?.comment);
  if (!text) throw new Error('没有可以复制的内容。');
  let copied;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithSelection(text);
  }

  if (explicitText === undefined) {
    guestReceipt = {kind,copied};
    renderPublic();
    focusGuestAction(copied ? '[data-action="confirm-copy"]' : '[data-action="retry-copy"]');
    return;
  }
  // The publisher audit is already a dialog; keep its existing confirmation.
  const result = document.getElementById('copy-result');
  const confirm = result.querySelector('button');
  result.querySelector('h2').textContent = copied ? '复制成功' : '复制失败';
  result.querySelector('p').textContent = copied ? '作品分享链接已复制。' : '请点「确认」后重试，或用系统浏览器打开本页再复制。';
  confirm.addEventListener('click', () => {
    result.close();
    dialogBody.querySelector('[data-action="copy-task-target"]')?.focus({preventScroll:true});
  }, {once:true});
  result.showModal();
  confirm.focus({preventScroll:true});
}
function visitorDialog(task) {
  modal('领取明细',`<p class="hint">${esc(task.title)}</p>${visitorList(task)}`);
}
function visitorList(task) {
  const rows = task.visitors.map(item => `<li><strong>${esc(item.name)}</strong><span>${item.has_comment ? '已领取评论' : '已领取作品'}</span>${item.has_comment ? `<p>${esc(item.comment)}</p>` : ''}</li>`).join('');
  return rows ? `<ul class="visitors">${rows}</ul>` : '<p class="hint">这条任务还没有访客领取。</p>';
}
const moderationLabels = {publish:'发布任务',pause:'暂停领取',resume:'恢复发布',close:'关闭任务',enable:'平台上架',disable:'平台下架'};
function auditTask(task) {
  const transitions = {draft:['publish'],open:['pause','close'],paused:['resume','close'],closed:[]};
  modal('任务详情',`<h3>${esc(task.title)}</h3><p class="description">发布者 · ${esc(publisherName(task.owner_username,task.owner_role,task.owner_id))}</p>
    <div class="actions">${badge(task.status)}${platformBadge(task)}${task.owner_disabled ? '<span class="badge paused">账号已停用</span>' : ''}</div>
    ${task.instructions ? `<p class="description">${esc(task.instructions)}</p>` : ''}
    ${task.target_url ? `<p class="description">${esc(platformNames[task.target_platform] || '其他平台')} · 作品分享链接</p>
    ${task.target_platform === 'wechat_channels' ? targetLink(task.target_platform, task.target_url) :
      button('copy-task-target','复制作品分享链接')}` : ''}
    <details class="review-section"><summary>评论池（${task.comments.length}）</summary>
    ${task.comments.length ? `<ol class="review-comments">${task.comments.map(c=>`<li>${esc(c)}</li>`).join('')}</ol>` : '<p class="hint">暂无评论。</p>'}</details>
    <details class="review-section"><summary>领取明细（${task.visitors.length}）</summary>${visitorList(task)}</details>
    <div class="actions">${transitions[task.status].map(op=>button('admin-'+op,moderationLabels[op],'secondary',task.id)).join('')}
    ${button(task.platform_enabled === false ? 'admin-enable':'admin-disable',task.platform_enabled === false ? '平台上架':'平台下架','subtle',task.id)}</div>`);
  const copyTarget = dialogBody.querySelector('[data-action="copy-task-target"]');
  copyTarget?.addEventListener('click', event => {
    event.stopPropagation();
    work(copyTarget, () => copyGuestValue('video', task.target_url));
  });
}
function confirmModeration(op,id) {
  const task = tasks.find(t=>String(t.id)===String(id));
  if (!task) return;
  if (dialog.open) dialog.close();
  const notes = {publish:'发布后，持有任务链接的访客可按任务及平台状态领取。',
    pause:'暂停后停止新的领取，稍后可恢复。',resume:'恢复后，访客可按平台及发布者账号状态继续领取。',
    close:'关闭后将停止新的领取，任务无法再次开放。',disable:'下架后停止新的领取，发布者无法自行上架。',
    enable:'上架后，将按发布者账号及任务原有状态开放领取。'};
  modal(moderationLabels[op],`<form data-form="moderate" data-op="${esc(op)}" data-id="${esc(id)}">
    <p><strong>${esc(task.title)}</strong> · ${esc(publisherName(task.owner_username,task.owner_role,task.owner_id))}</p>
    <p class="hint">${notes[op]}</p>${formEnd('确认'+moderationLabels[op])}`);
}
function confirmAccount(op,id) {
  const user = accountList.find(person=>String(person.id)===String(id));
  if (!user || user.role === 'admin' || (op === 'password' && user.role !== 'user')) return;
  const label = {disable:'停用账号',enable:'启用账号',password:'重置密码'}[op];
  const note = {disable:'该账号的登录状态将失效，其名下任务停止新的领取。',enable:'账号启用后，可以按各任务原有状态继续使用。',
    password:'保存新密码后，此账号需要重新登录。'}[op];
  modal(label,`<form data-form="account-admin" data-op="${esc(op)}" data-id="${esc(id)}">
    <p><strong>${esc(publisherName(user.username,user.role,user.id))}</strong></p><p class="hint">${note}</p>
    ${op === 'password' ? '<label>新密码<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><small>8–128 个字符。</small></label>' : ''}
    ${formEnd(op === 'password' ? '保存新密码' : '确认'+label)}`);
}
function updatePublicState(data) {
  publicTask = data.task;
  claim = data.claim;
  visit = data.visit;
  guideImages = data.guide_images ?? data.visit?.guide_images;
  videoCopyConfirmed = !!visit && (videoCopyConfirmed || restoreCopy('video'));
  commentCopyConfirmed = !!claim && (commentCopyConfirmed || restoreCopy('comment'));
}

async function syncVisibleGuest() {
  if (manager || !publicTask || document.hidden || busy) return;
  const sequence = ++syncSequence;
  try {
    const data = await api(`/api/public/${taskId}`);
    if (sequence !== syncSequence || busy || document.hidden) return;
    updatePublicState(data);
    if (!visit && publicTask.platform_enabled !== false && !publicTask.owner_disabled && publicTask.status === 'open' && publicTask.remaining > 0 && app.querySelector('form.guest-form')) {
      // Preserve the visitor's draft and any active input-method composition.
      app.querySelector('.guest-capacity').textContent = `剩余 ${publicTask.remaining} / ${publicTask.total} 条`;
    } else {
      renderPublic();
    }
  } catch { /* The next manual action can retry if the server is unavailable. */ }
}

async function refresh() {
  if (manager) {
    if (accountsEnabled && !account) return renderLogin();
    const owner = account;
    const view = workspaceView;
    const admin = account?.role === 'admin';
    if (admin && view === 'accounts') {
      const response = await api('/api/admin/accounts');
      if (account !== owner || view !== workspaceView) return;
      accountList = response.accounts;
      return renderAccounts();
    }
    const response = await api(admin && view === 'all' ? '/api/admin/tasks' : '/api/tasks');
    if (account !== owner || view !== workspaceView) return;
    tasks = response.tasks;
    if (admin && view === 'all') renderAllTasks();
    else renderManager();
  } else if (taskId && /^[1-9]\d{0,17}$/.test(taskId)) {
    const data = await api(`/api/public/${taskId}`);
    updatePublicState(data);
    renderPublic();
  } else {
    app.innerHTML = messageCard(taskId !== null ? '任务链接无效' : '从任务链接领取评论','请打开发布者分享的完整任务链接。');
  }
}
function redirectOldManager() {
  if (manager && !mount && manageOrigin && manageOrigin !== location.origin && account?.role !== 'guest') {
    location.replace(new URL('/manage',manageOrigin));
    return true;
  }
  return false;
}

async function openEmbeddedView() {
  const id = params.get('draft') || params.get('detail');
  if (params.get('new') === '1') return taskForm();
  if (!id || !/^[1-9]\d{0,17}$/.test(id)) return;
  const audit = account.role === 'admin' && workspaceView === 'all';
  const path = (audit ? '/api/admin/tasks/' : '/api/tasks/') + id;
  const {task} = await api(path);
  if (task.status === 'draft') return taskForm(task,audit);
  if (audit) return auditTask(task);
  if (dialog.open) dialog.close();
  modal('热启动详情',`<h3>${esc(task.title)}</h3><div class="actions">${badge(task.status)}${platformBadge(task)}</div>
    <p class="description">${esc(platformNames[task.target_platform])} · 已领 ${esc(task.claimed)} / ${esc(task.total)} 条</p>
    <div class="actions">${['open','paused'].includes(task.status) ? button('detail-comments','管理评论','secondary',id) : ''}
    ${button('share','复制领取链接','primary',id)}</div>
    <details class="review-section"><summary>领取明细（${task.visitors.length}）</summary>${visitorList(task)}</details>`);
}
async function load() {
  updateHeader();
  let localKey;
  if (manager && location.hash) {
    localKey = new URLSearchParams(location.hash.slice(1)).get('key');
    history.replaceState(null,'',location.pathname + location.search);
  }
  try {
    if (manager) {
      let info;
      try { info = await api('/api/account'); }
      catch (error) { if (error.status !== 404) throw error; }
      accountsEnabled = !!info && !info.local;
      manageOrigin = configuredOrigin(info?.manageOrigin);
      if (mount) {
        recipientOrigin = configuredOrigin(info?.publicOrigin);
        if (!recipientOrigin) throw new Error('领取页面地址尚未配置。');
      }
      if (accountsEnabled) setAccount(info.user);
      else {
        manager = atManage;
        updateHeader();
        if (manager && localKey) await api('/api/manage-session',{key:localKey});
      }
    }
    if (redirectOldManager()) return;
    if (embedded && account?.role === 'admin' && ['accounts','all'].includes(params.get('view'))) workspaceView = params.get('view');
    await refresh();
    if (embedded && account) {
      try { await openEmbeddedView(); }
      catch (error) { flash(error.message,true); }
    }
  } catch (error) {
    if (accountsEnabled && error.status === 401) { setAccount(null); renderLogin(); }
    else if (manager && !accountsEnabled && [401,403].includes(error.status)) managerAccessMessage();
    else app.innerHTML = messageCard(manager ? '工作台暂时无法打开' : '暂时无法打开任务',error.message,button('reload-page','重试','secondary'));
  }
}
function taskForm(task={},audit=false) {
  modal(task.id ? '编辑每日任务' : '新增每日任务',`<form data-form="task" data-id="${esc(task.id || '')}">
    <label>平台<select name="target_platform">${Object.entries(platformNames).map(([key,name])=>
      `<option value="${key}"${key === (task.target_platform || 'douyin') ? ' selected' : ''}>${name}</option>`).join('')}</select></label>
    <label>任务标题<input name="title" autofocus required maxlength="120" value="${esc(task.title)}" placeholder="请输入任务标题"></label>
    <div><label><span id="task-target-label">主视频链接</span><textarea name="target_url" spellcheck="false" placeholder="请输入视频链接" aria-labelledby="task-target-label" aria-describedby="task-target-hint"></textarea>
      <small id="task-target-hint"></small></label>${button('example-video','填入示例','subtle')}</div>
    <div data-comment-collection></div>
    <div class="form-error" role="alert"></div><div class="form-actions">${button('dismiss','取消')}
      <button type="submit" class="secondary">保存草稿</button>
      <button type="submit" name="intent" value="publish" class="primary">发布并复制领取链接</button></div></form>`);
  const form = dialogBody.querySelector('form');
  if (audit) form.dataset.audit = '1';
  if (task.comments_version) form.dataset.version = task.comments_version;
  form.elements.target_url.value = task.target_url || '';
  updateTargetField(form);
  setupCommentCollection(form, task.comments || []);
}
function updateTargetField(form) {
  const direct = form.elements.target_platform.value === 'wechat_channels';
  const input = form.elements.target_url;
  input.rows = direct ? 2 : 4;
  input.inputMode = direct ? 'url' : 'text';
  form.querySelector('#task-target-hint').textContent = direct ?
    '填写视频号作品的 HTTP 或 HTTPS 地址，领取评论后可打开作品。' :
    '请粘贴平台复制出的完整作品分享链接，包括中文、口令、换行和网址。';
}
async function copy(text, title) {
  try { await navigator.clipboard.writeText(text); flash('已复制到剪贴板。'); }
  catch {
    modal(title,`<label>请手动复制<textarea id="copy-value" readonly>${esc(text)}</textarea></label>`);
    document.getElementById('copy-value').select();
  }
}
async function openWorkspace(view, filter='') {
  if (account?.role !== 'admin' || !['mine','all','accounts'].includes(view)) return;
  const previous = workspaceView;
  const previousFilter = ownerFilter;
  workspaceView = view;
  ownerFilter = filter;
  try { await refresh(); }
  catch (error) {
    workspaceView = previous;
    ownerFilter = previousFilter;
    throw error;
  }
}
async function click(action,id) {
  if (account?.role === 'admin') {
    if (action === 'workspace') return openWorkspace(id);
    if (action === 'account-tasks') return openWorkspace('all',String(id));
    if (action === 'audit-task') return auditTask((await api('/api/admin/tasks/'+id)).task);
    if (action.startsWith('admin-') && Object.hasOwn(moderationLabels,action.slice(6))) {
      return confirmModeration(action.slice(6),id);
    }
    if (['account-disable','account-enable','account-password'].includes(action)) return confirmAccount(action.slice(8),id);
  }
  switch(action) {
    case 'reload-page': return location.reload();
    case 'show-login': return renderLogin();
    case 'show-register': return renderLogin(true);
    case 'guest-login': return changeAccount((await api('/api/account/guest',{})).user);
    case 'claim-account': return registerGuest();
    case 'logout':
      if (account?.role === 'guest' && tasks.length) {
        return modal('退出游客试用',`<p class="hint">退出后将无法再管理当前游客任务。你可以先注册，把这些任务保存在自己的账号里。</p>
          <div class="actions">${button('claim-account','注册并保留任务','primary')}${button('logout-now','退出游客试用','secondary')}</div>`);
      }
      return changeAccount((await api('/api/account/logout',{})).user);
    case 'logout-now': return changeAccount((await api('/api/account/logout',{})).user);
    case 'refresh': await refresh(); return flash('已刷新。');
    case 'dismiss': return dialog.close();
    case 'new-task': return taskForm();
    case 'example-video': {
      const input = dialogBody.querySelector('[name="target_url"]');
      const sample = new URL('/static/example-video.mp4',recipientOrigin).href;
      input.value = input.form.elements.target_platform.value === 'wechat_channels' ? sample : '示例作品：评论领取练习\n' + sample;
      input.focus();
      return;
    }
    case 'edit-task': return taskForm((await api(`/api/tasks/${id}`)).task);
    case 'detail-comments':
      dialog.close();
      return click('task-comments',id);
    case 'task-comments':
    case 'admin-comments': {
      const path = action === 'admin-comments' ? `/api/admin/tasks/${id}` : `/api/tasks/${id}`;
      const reload = async () => (await api(path)).task;
      const task = await reload();
      return openPublishedComments(app, task, async (version, comments) => {
        await api(path + '/comments', {version, comments});
        try { await refresh(); }
        catch { flash('评论已保存，请刷新任务列表。'); }
      }, reload);
    }
    case 'share': return copy(publicLink(id),'复制领取链接');
    case 'confirm-copy': return finishGuestCopy();
    case 'manual-comment': return finishGuestCopy(true);
    case 'retry-copy':
      if (guestReceipt && !guestReceipt.copied) return copyGuestValue(guestReceipt.kind);
      return;
    case 'dismiss-copy':
      if (guestReceipt && !guestReceipt.copied) {
        guestReceipt = null;
        renderPublic();
        focusGuestAction('[data-action="copy-video"]');
      }
      return;
    case 'video-next':
      if (guestReceipt || claim || !videoCopyConfirmed || !visit || !canReceiveComment()) return;
      return claimComment({});
    case 'copy-video': return copyGuestValue('video');
    case 'copy-comment': return copyGuestValue('comment');
    case 'visitors': return visitorDialog((await api(`/api/tasks/${id}`)).task);
    case 'close-task':
      return modal('关闭任务',`<form data-form="close" data-id="${esc(id)}"><p class="hint">关闭后将停止新的领取，无法再次开放。</p>${formEnd('确认关闭')}`);
    case 'publish': case 'pause': case 'resume':
      await api(`/api/tasks/${id}/${action}`,{});
      await refresh();
      return flash({publish:'任务已发布，可以复制领取链接。',pause:'已暂停领取。',resume:'已恢复发布。'}[action]);
    case 'claim': return claimComment({});
  }
}
async function claimComment(body) {
  const result = await api(`/api/public/${taskId}/claim`,body);
  claim = {comment:result.comment};
  if (result.visit) visit = result.visit;
  setCopyConfirmed('comment',false);
  // Show the assignment even if the follow-up count refresh fails.
  try { await refresh(); } catch { renderPublic(); }
  focusGuestAction();
}
async function save(form,submitter) {
  const action = form.dataset.form;
  const id = form.dataset.id;
  if (action === 'moderate' || action === 'account-admin') {
    if (account?.role !== 'admin') return;
    const op = form.dataset.op;
    const kind = action === 'moderate' ? 'tasks' : 'accounts';
    const payload = op === 'password' ? {password:new FormData(form).get('password')} : {};
    await api(`/api/admin/${kind}/${id}/${op}`,payload);
    dialog.close();
    await refresh();
    return flash(action === 'moderate' ? '任务状态已更新。' : op === 'password' ? '新密码已保存。' : '账号状态已更新。');
  }
  if (action === 'login' || action === 'register') {
    const fields = new FormData(form);
    const result = await api('/api/account/' + action,{username:fields.get('username').trim(),password:fields.get('password')});
    return changeAccount(result.user);
  }
  if (action === 'video' || action === 'claim-comment') {
    const fields = new FormData(form);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) throw new Error('请输入访客名称。');
    if (action === 'claim-comment') return claimComment({name});
    visit = await api(`/api/public/${taskId}/video`,{name});
    guideImages = visit.guide_images;
    setCopyConfirmed('video',false);
    setCopyConfirmed('comment',false);
    renderPublic();
    focusGuestAction();
    return;
  }
  if (action === 'task') {
    const fields = new FormData(form);
    const get = key => String(fields.get(key) ?? '').trim();
    const publish = submitter?.value === 'publish';
    const comments = getTaskComments(form);
    if (publish && !get('target_url')) throw new Error('请先填写作品分享链接。');
    if (publish && !comments.length) throw new Error('请至少添加一条评论。');
    const prefix = form.dataset.audit === '1' ? '/api/admin/tasks' : '/api/tasks';
    const payload = {
      title:get('title'),target_platform:get('target_platform'),
      target_url:String(fields.get('target_url') ?? ''),
      comments, ...(form.dataset.version ? {comments_version:form.dataset.version} : {})
    };
    if (!id) {
      // Keep one nonce for a new draft, including retries after a lost reply.
      form.dataset.requestId ||= crypto.randomUUID();
      payload.clientRequestId = form.dataset.requestId;
    }
    const {task} = await api(id ? `${prefix}/${id}/edit` : prefix,payload);
    form.dataset.id = task.id;
    form.dataset.version = task.comments_version;
    if (publish) {
      try { await api(`${prefix}/${task.id}/publish`,{}); }
      catch (error) {
        // If the transport broke after commit, recover the existing receipt.
        if (error.status && error.status !== 409) throw error;
        const current = await api(`${prefix}/${task.id}`);
        if (current.task.status !== 'open') throw error;
      }
      dialog.close();
      try { await refresh(); }
      catch { flash('任务已发布，请稍后刷新列表。'); }
      await copy(publicLink(task.id),'领取链接');
      return;
    }
  } else if (action === 'close') {
    await api(`/api/tasks/${id}/close`,{});
  }
  dialog.close();
  await refresh();
  flash(action === 'close' ? '任务已关闭。' : '草稿已保存。');
}
async function work(trigger,callback,form=null) {
  if (busy) return;
  syncSequence++;
  busy = true;
  trigger?.setAttribute('disabled','');
  try {
    if (form) form.querySelector('.form-error').textContent = '';
    await callback();
  } catch (error) {
    if (form?.isConnected && ['login','register'].includes(form.dataset.form)) {
      form.querySelector('.form-error').textContent = error.message;
    } else if (accountsEnabled && error.status === 401) {
      setAccount(null);
      renderLogin();
      flash('登录已过期，请重新登录。',true);
    } else if (manager && !accountsEnabled && [401,403].includes(error.status)) {
      if (dialog.open) dialog.close();
      managerAccessMessage();
    } else if (!manager && error.status === 409) {
      flash(error.message,true);
      try { await refresh(); } catch { /* Keep the original message visible. */ }
    } else if (form?.isConnected) form.querySelector('.form-error').textContent = error.message;
    else flash(error.message,true);
  } finally {
    trigger?.removeAttribute('disabled');
    busy = false;
  }
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('button[data-action]');
  if (trigger) work(trigger,()=>click(trigger.dataset.action,trigger.dataset.id));
});
document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  work(event.submitter,()=>save(form,event.submitter),form);
});
document.addEventListener('change', event => {
  if (event.target.matches('select[name="target_platform"]')) updateTargetField(event.target.form);
  if (account?.role === 'admin' && workspaceView === 'all' && event.target.matches('select[data-owner-filter]')) {
    ownerFilter = event.target.value;
    renderAllTasks();
    app.querySelector('select[data-owner-filter]').focus();
  }
});
document.getElementById('copy-result').addEventListener('cancel', event => event.preventDefault());
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.dataset.guideImage) {
    failedImages.add(image.getAttribute('src'));
    image.closest('.guest-guide-figure')?.remove();
  }
}, true);
document.addEventListener('visibilitychange', syncVisibleGuest);
document.addEventListener('visibilitychange', syncAccount);
window.addEventListener('pageshow', event => {
  if (event.persisted) { syncVisibleGuest(); syncAccount(); }
});
window.addEventListener('storage', event => {
  if (event.key === progressKey('video') || event.key === progressKey('comment')) syncVisibleGuest();
  if (event.key === accountChangeKey) syncAccount();
});
load();
