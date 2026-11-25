const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const dialogBody = document.getElementById('dialog-body');
const notice = document.getElementById('notice');
const manager = location.pathname.replace(/\/$/, '') === '/manage';
const taskId = new URL(location.href).searchParams.get('task');
const states = {draft:'草稿', open:'已发布', paused:'已暂停', closed:'已关闭'};
let tasks = [];
let publicTask;
let claim;
let visit;
let videoReviewed = false;
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
  let result;
  try { result = await fetch(path,{cache:'no-store',...options}); }
  catch { throw new Error('请确认本地启动窗口仍在运行，然后刷新。'); }
  let data;
  try { data = await result.json(); }
  catch { throw new Error(`无法读取本地服务响应（${result.status}）。`); }
  if (!result.ok) {
    const error = new Error(data.error || `操作未完成（${result.status}）。`);
    error.status = result.status;
    throw error;
  }
  return data;
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
  const url = new URL('/',location.origin);
  url.searchParams.set('task',id);
  return url.href;
}
function targetLink(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (['http:','https:'].includes(url.protocol)) return `<a class="secondary" data-open-video href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">打开视频 ↗</a>`;
  } catch { /* Invalid links have no navigation action. */ }
  return '';
}
function messageCard(title, text, actions='') {
  return `<section class="card"><h1>${esc(title)}</h1><p>${esc(text)}</p>${actions ? `<div class="actions">${actions}</div>` : ''}</section>`;
}
function managerAccessMessage() {
  app.innerHTML = messageCard('打开本机管理入口','请从启动窗口打开完整的管理链接。只有发布者需要这个入口；给领取者分享任务时，请复制任务卡上的领取链接。');
}
function managerCard(task) {
  const id = task.id;
  const controls = [];
  if (task.status === 'draft') controls.push(button('edit-task','编辑草稿','secondary',id),button('publish','发布任务','primary',id));
  if (task.status === 'open') controls.push(button('pause','暂停领取','secondary',id));
  if (task.status === 'paused') controls.push(button('resume','恢复发布','primary',id));
  if (task.status !== 'draft') {
    controls.push(button('visitors','领取明细','secondary',id),button('share','复制领取链接','secondary',id),
      `<a data-action="open-public" class="secondary" href="${esc(publicLink(id))}" target="_blank" rel="noopener">打开领取页 ↗</a>`);
  }
  if (task.status !== 'closed') controls.push(button('close-task','关闭任务','subtle',id));
  return `<article class="record" data-task-id="${esc(id)}"><div class="title-row"><h3>${esc(task.title)}</h3>${badge(task.status)}</div>
    <p class="description">${esc(task.instructions)}</p>
    <div class="counts"><span>共 ${esc(task.total)} 条</span><span>已领 ${esc(task.claimed)} 条</span><span>剩余 ${esc(task.remaining)} 条</span></div>
    <div class="actions">${controls.join('')}</div></article>`;
}
function renderManager() {
  const total = tasks.reduce((sum,t) => sum+t.total,0);
  const claimed = tasks.reduce((sum,t) => sum+t.claimed,0);
  app.innerHTML = `<section class="intro"><div><h1>评论任务管理</h1><p>准备视频链接和评论，发布后复制领取链接。</p></div>${button('new-task','新建任务','primary')}</section>
    <dl class="metrics"><div><dt>已发布任务</dt><dd>${tasks.filter(t=>t.status==='open').length}</dd></div><div><dt>评论总数</dt><dd>${total}</dd></div><div><dt>已被领取</dt><dd>${claimed}</dd></div></dl>
    <section class="panel"><div class="toolbar"><h2>任务列表</h2>${button('refresh','刷新','subtle')}</div>${tasks.length ? tasks.map(managerCard).join('') :
        '<div class="empty"><h3>还没有任务</h3><p>新建任务，填写执行要求、视频链接和可领取的评论。</p></div>'}</section>`;
}
function progressKey() {
  return 'kh:guest:video-reviewed:' + taskId;
}
function restoreVideoReview() {
  try { return localStorage.getItem(progressKey()) === 'yes'; }
  catch { return false; }
}
function setVideoReview(reviewed) {
  videoReviewed = reviewed;
  try {
    if (reviewed) localStorage.setItem(progressKey(), 'yes');
    else localStorage.removeItem(progressKey());
  } catch { /* The steps still work in this page if storage is unavailable. */ }
}
function videoGuideButton(label='查看视频链接') {
  return button('video-guide',label,'secondary');
}
function renderPublic() {
  const task = publicTask;
  const available = task.status === 'open' && task.remaining > 0;
  const closedText = task.status === 'paused' ? '发布者已暂停领取。' : task.status === 'closed' ? '这个任务已关闭。' : '此任务的评论已全部领完。';
  const identity = visit ? `<p class="guest-person">领取人 <strong>${esc(visit.name)}</strong></p>` : '';
  const unavailable = `<p class="guest-hint">${closedText}</p><div class="guest-actions">${button('refresh','刷新状态','secondary')}${visit ? videoGuideButton() : ''}</div>`;
  let heading, content;
  if (claim) {
    heading = '已领取评论';
    content = `${identity}<blockquote class="guest-comment" data-claim-text>${esc(claim.comment)}</blockquote>
      <div class="guest-actions">${button('comment-guide','查看并复制评论','primary')}${videoGuideButton()}</div>`;
  } else if (!visit) {
    heading = '第一步 · 领取视频链接';
    content = available ? `<form class="guest-form" data-form="video">
      <label>访客名称<input name="name" maxlength="32" required autocomplete="off" placeholder="输入你的名称或昵称"></label>
      <div class="form-error" role="alert"></div>
      <div class="guest-actions"><button data-action-id="video" type="submit" class="primary">领取视频链接</button></div></form>` : unavailable;
  } else if (!videoReviewed && available) {
    heading = '第一步 · 查看视频';
    content = `${identity}<p class="guest-hint">视频链接已领取。查看作品后，回来领取评论。</p>
      <div class="guest-actions">${button('video-guide','查看视频链接','primary')}</div>`;
  } else {
    heading = '第二步 · 领取评论';
    content = `${identity}${available ? `<p class="guest-hint">点下方按钮领取一条评论，领取后可随时回来复制。</p>
      <div class="guest-actions">${button('claim','领取一条评论','primary')}${videoGuideButton('重新查看视频')}</div>` : unavailable}`;
  }
  app.innerHTML = `<div class="guest-shell"><article class="guest-task-card">
    <div class="guest-task-meta"><span class="guest-tag">评论任务</span><span class="guest-capacity">剩余 ${esc(task.remaining)} / ${esc(task.total)} 条</span></div>
    <h1>${esc(task.title)}</h1>${task.instructions ? `<p class="description">${esc(task.instructions)}</p>` : ''}
    </article><section class="guest-step-card" aria-labelledby="guest-step-heading">
    <h2 id="guest-step-heading" class="guest-step-title" tabindex="-1">${heading}</h2>${content}</section></div>`;
}
function guideArt(kind) {
  const source = guideImages?.[kind];
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const image = source?.[ios ? 'ios' : 'android'];
  if (typeof image === 'string' && /^\/static\/task-guides\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp)$/.test(image) && !failedImages.has(image)) {
    return `<img class="guest-platform-guide" data-guide-image="${kind}" src="${esc(image)}" alt="${kind === 'video' ? '打开作品' : '复制评论'}操作示意">`;
  }
  return document.getElementById('guide-' + kind).innerHTML;
}
function openGuide(kind) {
  const video = kind === 'video';
  const copyValue = video ? visit.video_url : claim.comment;
  const title = video ? '打开视频作品' : '复制领取的评论';
  const steps = video ? '<li>打开视频，或先复制链接。</li><li>查看作品后，返回这里领取评论。</li>' :
    '<li>复制下方属于你的评论。</li><li>返回作品页面，在需要时粘贴。</li>';
  const field = video ? `<input readonly data-copy-value value="${esc(copyValue)}">` :
    `<textarea readonly rows="3" data-copy-value>${esc(copyValue)}</textarea>`;
  const actions = video ?
    `${targetLink(copyValue)}${button('copy-video','复制视频链接','secondary')}${button('video-next',claim || videoReviewed ? '返回领取页' : '已查看视频，下一步','primary')}` :
    `${button('copy-comment','一键复制评论','primary')}${button('dismiss','收起','secondary')}`;
  dialog.dataset.guide = kind;
  dialog.classList.add('guest-dialog');
  modal(title,`<div class="guest-dialog-content">
    <ol class="guest-guide-list">${steps}</ol>
    <button class="guest-guide-preview" type="button" data-action="zoom-${kind}" aria-label="放大${video ? '打开作品' : '复制评论'}操作示意">${guideArt(kind)}</button>
    <label class="guest-copy-field">${video ? '视频链接' : '你领取的评论'}${field}</label>
    <p class="guest-copy-feedback" role="status" aria-live="polite"></p>
    <div class="guest-dialog-actions">${actions}</div></div>`);
  const heading = document.getElementById('dialog-title');
  heading.tabIndex = -1;
  heading.focus({preventScroll:true});
}
async function copyGuestValue(kind) {
  const text = kind === 'video' ? visit.video_url : claim.comment;
  try { await navigator.clipboard.writeText(text); }
  catch {
    if (!dialog.open) openGuide(kind);
    const field = dialogBody.querySelector('[data-copy-value]');
    field.focus();
    field.select();
    dialogBody.querySelector('.guest-copy-feedback').textContent = '已选中，请长按或使用系统复制。';
    return;
  }
  const message = kind === 'video' ? '已复制视频链接。' : '已复制评论。';
  if (dialog.open) dialogBody.querySelector('.guest-copy-feedback').textContent = message;
  else flash(message);
}
function openZoom(kind) {
  document.getElementById('guide-zoom-art').innerHTML = guideArt(kind);
  document.getElementById('guide-zoom').showModal();
}
function visitorDialog(task) {
  const rows = task.visitors.map(item => `<li><strong>${esc(item.name)}</strong><span>${item.has_comment ? '已领取评论' : '已领取视频链接'}</span>${item.has_comment ? `<p>${esc(item.comment)}</p>` : ''}</li>`).join('');
  modal('领取明细',`<p class="hint">${esc(task.title)}</p>${rows ? `<ul class="visitors">${rows}</ul>` : '<p class="hint">这条任务还没有访客领取。</p>'}`);
}
function updatePublicState(data) {
  publicTask = data.task;
  claim = data.claim;
  visit = data.visit;
  guideImages = data.guide_images ?? data.visit?.guide_images;
  videoReviewed = !!visit && (videoReviewed || restoreVideoReview());
}

async function syncVisibleGuest() {
  if (manager || !publicTask || document.hidden || busy) return;
  const sequence = ++syncSequence;
  try {
    const data = await api(`/api/public/${taskId}`);
    if (sequence !== syncSequence || busy || document.hidden) return;
    updatePublicState(data);
    if (!visit && publicTask.status === 'open' && publicTask.remaining > 0 && app.querySelector('form[data-form="video"]')) {
      // Preserve the visitor's draft and any active input-method composition.
      app.querySelector('.guest-capacity').textContent = `剩余 ${publicTask.remaining} / ${publicTask.total} 条`;
    } else {
      renderPublic();
    }
  } catch { /* The next manual action can retry if the server is unavailable. */ }
}

async function refresh() {
  if (manager) {
    tasks = (await api('/api/tasks')).tasks;
    renderManager();
  } else if (taskId && /^[1-9]\d{0,17}$/.test(taskId)) {
    const data = await api(`/api/public/${taskId}`);
    updatePublicState(data);
    renderPublic();
  } else {
    app.innerHTML = messageCard(taskId ? '任务链接无效' : '从任务链接领取评论','请打开发布者分享的完整任务链接。发布者可使用启动窗口里显示的管理入口创建任务。');
  }
}
async function load() {
  document.body.classList.toggle('guest-page', !manager);
  if (!manager) document.querySelector('meta[name="theme-color"]').content = '#f6f7f9';
  document.getElementById('view-label').textContent = manager ? '发布者管理' : '免登录领取';
  try {
    if (manager && location.hash) {
      const key = new URLSearchParams(location.hash.slice(1)).get('key');
      // Once captured, the management key should never appear in a copied address.
      history.replaceState(null,'',location.pathname + location.search);
      if (key) await api('/api/manage-session',{key});
    }
    await refresh();
  } catch (error) {
    if (manager && [401,403].includes(error.status)) managerAccessMessage();
    else app.innerHTML = messageCard(manager ? '管理页面暂时无法打开' : '暂时无法打开任务',error.message,button('refresh','重试','secondary'));
  }
}
function taskForm(task={}) {
  modal(task.id ? '编辑草稿' : '新建评论任务',`<form data-form="task" data-id="${esc(task.id || '')}">
    <label>任务标题<input name="title" autofocus required maxlength="120" value="${esc(task.title)}" placeholder="例如：样例评论领取练习"></label>
    <label>执行要求<textarea name="instructions" required maxlength="5000" placeholder="写明领取评论后如何使用">${esc(task.instructions)}</textarea></label>
    <div><label>视频链接<input name="target_url" type="url" maxlength="2048" value="${esc(task.target_url)}" placeholder="https://"><small>发布时必填，访客填写名称并领取后才能看到。</small></label>${button('example-video','填入本地示例视频','subtle')}</div>
    <label>评论池<textarea name="comments" rows="5" placeholder="每行一条，按行分发">${esc(task.comments?.join('\n'))}</textarea><small>每行是一份可领取的评论，空行会自动忽略。</small></label>
    ${formEnd('保存草稿')}`);
}
async function copy(text, title) {
  try { await navigator.clipboard.writeText(text); flash('已复制到剪贴板。'); }
  catch {
    modal(title,`<label>请手动复制<textarea id="copy-value" readonly>${esc(text)}</textarea></label>`);
    document.getElementById('copy-value').select();
  }
}
async function click(action,id) {
  switch(action) {
    case 'refresh': await refresh(); return flash('已刷新。');
    case 'dismiss': return dialog.close();
    case 'new-task': return taskForm();
    case 'example-video': {
      const input = dialogBody.querySelector('[name="target_url"]');
      input.value = new URL('/static/example-video.mp4',location.origin).href;
      input.focus();
      return;
    }
    case 'edit-task': return taskForm((await api(`/api/tasks/${id}`)).task);
    case 'share': return copy(publicLink(id),'复制领取链接');
    case 'video-guide': return openGuide('video');
    case 'comment-guide': return openGuide('comment');
    case 'video-next':
      setVideoReview(true);
      renderPublic();
      return dialog.close();
    case 'zoom-video': return openZoom('video');
    case 'zoom-comment': return openZoom('comment');
    case 'copy-video': return copyGuestValue('video');
    case 'copy-comment': return copyGuestValue('comment');
    case 'visitors': return visitorDialog((await api(`/api/tasks/${id}`)).task);
    case 'close-task':
      return modal('关闭任务',`<form data-form="close" data-id="${esc(id)}"><p class="hint">关闭后将停止新的领取，无法再次开放。</p>${formEnd('确认关闭')}`);
    case 'publish': case 'pause': case 'resume':
      await api(`/api/tasks/${id}/${action}`,{});
      await refresh();
      return flash({publish:'任务已发布，可以复制领取链接。',pause:'已暂停领取。',resume:'已恢复发布。'}[action]);
    case 'claim': {
      const result = await api(`/api/public/${taskId}/claim`,{});
      claim = {comment:result.comment};
      // Show the assignment even if the follow-up count refresh fails.
      try { await refresh(); } catch { renderPublic(); }
      return openGuide('comment');
    }
  }
}
async function save(form) {
  const action = form.dataset.form;
  const id = form.dataset.id;
  if (action === 'video') {
    const fields = new FormData(form);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) throw new Error('请输入访客名称。');
    visit = await api(`/api/public/${taskId}/video`,{name});
    guideImages = visit.guide_images;
    setVideoReview(false);
    renderPublic();
    return openGuide('video');
  }
  if (action === 'task') {
    const fields = new FormData(form);
    const get = key => String(fields.get(key) ?? '').trim();
    await api(id ? `/api/tasks/${id}/edit` : '/api/tasks',{
      title:get('title'),instructions:get('instructions'),target_url:get('target_url'),
      comments:get('comments').split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
    });
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
    if (manager && [401,403].includes(error.status)) {
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
  work(event.submitter,()=>save(form),form);
});
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => {
  if (!manager && !dialog.open) {
    delete dialog.dataset.guide;
    document.getElementById('guest-step-heading')?.focus({preventScroll:true});
  }
});
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.dataset.guideImage) {
    failedImages.add(image.getAttribute('src'));
    const kind = image.dataset.guideImage;
    // Restore both the visible guide and its enlarged view, if already open.
    for (const picture of document.querySelectorAll('img[data-guide-image]')) {
      if (picture.dataset.guideImage === kind) picture.outerHTML = guideArt(kind);
    }
  }
}, true);
document.addEventListener('visibilitychange', syncVisibleGuest);
window.addEventListener('pageshow', event => { if (event.persisted) syncVisibleGuest(); });
window.addEventListener('storage', event => { if (event.key === progressKey()) syncVisibleGuest(); });
load();
