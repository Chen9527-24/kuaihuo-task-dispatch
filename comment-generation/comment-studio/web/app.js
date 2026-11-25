'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const pages = {
    work: ['生成评论', '从视频链接或已有文案，生成适合各个平台的评论草稿。'],
    history: ['任务管理', '查看生成结果、热启动任务和领取进度。'],
    heat: ['热启动', '管理分发任务、领取链接和评论。'],
    users: ['用户管理', '管理工作台登录账号及使用权限。'],
    accounts: ['视频账号', '保存每个内容账号的受众、业务和说话特色。'],
    guides: ['写作指南', '查看评论生成方法，以及可复制使用的提示词。'],
    services: ['服务状态', '查看当前工作台已启用的服务。']
  };
  const stages = {queued:'等待处理', fetch:'获取视频', transcribe:'语音转写', generate:'生成评论', done:'已完成'};
  const statuses = {queued:'排队中',running:'处理中',ready:'已完成',failed:'待重试',needs_input:'待补充素材'};
  const quantities = {'抖音':20,'小红书':10,'快手':20};
  const fieldIds = {industry:'industry',business:'business',videoPurpose:'videoPurpose',purpose:'purpose',focus:'focus',title:'videoTitle',visuals:'visuals',context:'context',required:'required',optional:'optional',forbidden:'forbidden',notes:'notes',provider:'provider',compareProvider:'compareProvider'};
  const accountKeys = ['name','platform','handle','industry','business','audience','voice','boundaries'];
  const accountLine = document.querySelector('.account-line');
  const state = {view:'work',mode:'link',task:null,accounts:[],services:null,guides:[],editAccount:'',epoch:0,poll:null,pending:false,platformEdited:false,scriptDirty:false,batch:null,newDraft:null,guideReady:false,historyAccount:''};
  const platformControls = new Map();
  const heatStates = {draft:'热启动草稿',open:'领取中',paused:'已暂停',closed:'已关闭'};
  const heatPlatforms = {douyin:'抖音',xiaohongshu:'小红书',kuaishou:'快手',wechat_channels:'微信视频号',other:'其他平台'};
  const dispatchBase = '/studio-dispatch';
  const publisherChanged = 'kh:publisher:session-changed';
  let unified = false, actor = null, registering = false, syncingSession = false;
  let resultsEpoch = 0;
  const groupCache = new Map();

  function el(tag, cls, value) {
    const n = document.createElement(tag);
    if(cls) n.className=cls;
    if(value!=null) n.textContent=value;
    return n;
  }
  function option(value,label,disabled=false) { const n=new Option(label,value); n.disabled=disabled; return n; }
  function date(value) {const d=new Date(typeof value==='number'&&value<1e12?value*1000:value);return value&&!isNaN(d)?d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'';}
  let toastTimer;
  function toast(message, error=false) { $('toast').textContent=String(message);$('toast').dataset.error=String(error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;}, error?6500:2200);}
  async function api(url, method='GET', body) {
    const init={method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}};
    if(actor && !url.endsWith('/api/account')) init.headers['X-KH-Owner']=String(actor.id);
    if(body instanceof File){init.body=body;init.headers['Content-Type']=body.type||'application/octet-stream';}
    else if(body!==undefined){init.body=JSON.stringify(body);init.headers['Content-Type']='application/json';}
    let response; try{response=await fetch(url,init);}catch{throw new Error('无法连接工作台，请检查网络后重试。');}
    let data;try{data=await response.json();}catch{throw new Error('服务器返回了无法读取的响应。');}
    if(!response.ok) {const ex=new Error(data.error||data.message||'请求失败，请重试。');ex.httpStatus=ex.status=response.status;if(unified && actor && [401,409].includes(response.status) && !url.endsWith('/api/account')) void verifySession();throw ex;}
    return data;
  }
  function busyTask(){return state.task&&['queued','running'].includes(state.task.status);}
  function setText(id,text){$(id).textContent=text||'';}
  function platformCount(name) {const cap=Number(state.services?.maxComments)||100;return Math.min(quantities[name]||20,cap);}
  function buildPlatforms() {
    Object.keys(quantities).forEach((name,i)=>{
      const root=el('div','platform'), label=el('label'), box=el('input'), qty=el('label','qty'), n=el('input');
      box.type='checkbox';box.checked=i===0;box.id='enable-platform-'+i;
      n.type='number';n.min='1';n.step='1';n.value=platformCount(name);n.setAttribute('aria-label',name+'主评论数');
      label.append(box,document.createTextNode(name));qty.append(n,document.createTextNode('条'));root.append(label,qty);
      platformControls.set(name,{box,n,root});$('platforms').append(root);
      root.addEventListener('input',()=>{state.platformEdited=true;summary();});
    });
  }
  function selectPlatforms(counts) {
    platformControls.forEach(({box,n},name)=>{box.checked=Object.hasOwn(counts||{},name);n.value=counts?.[name]??platformCount(name);});
  }
  function platformFromSource(s) {
    const matches=String(s).match(/https?:\/\/[^\s<>"，。；]+/ig)||[];
    if(matches.length!==1) return '';
    try {const h=new URL(matches[0]).hostname.toLowerCase();for(const [p,suffix] of [['抖音','douyin.com'],['快手','kuaishou.com'],['小红书','xiaohongshu.com'],['小红书','xhslink.com'],['小红书','xhslink.cn']])if(h===suffix||h.endsWith('.'+suffix))return p;}catch{}
    return '';
  }
  function inferPlatform() {
    if(state.task||state.platformEdited)return;
    const p=(state.mode==='link'&&platformFromSource($('source').value)) || selectedAccount()?.platform || '抖音';
    if(Object.hasOwn(quantities,p)) selectPlatforms({[p]:platformCount(p)});
  }
  function options() {
    const o=Object.fromEntries(Object.entries(fieldIds).map(([k,id])=>[k,$(id).value.trim()]));
    o.platforms={};platformControls.forEach(({box,n},k)=>{if(box.checked)o.platforms[k]=Number(n.value);});
    o.replies=$('replies').checked;o.replyCount=o.replies&&$('replyCount').value!==''?Number($('replyCount').value):null;return o;
  }
  function fillOptions(o={}) {
    for(const [k,id] of Object.entries(fieldIds)) $(id).value=Array.isArray(o[k])?o[k].join('、'):(o[k]??'');
    $('replies').checked=Boolean(o.replies);$('replyCount').value=o.replyCount??'';
    selectPlatforms(o.platforms||{'抖音':platformCount('抖音')});summary();
  }
  function usesOriginalAccount(task=state.task){
    return Boolean(unified && actor?.role==='admin' && task && Object.hasOwn(task,'ownerId') && String(task.ownerId)!==String(actor.id));
  }
  function originalAccount(task){
    if(!task.accountId)return null;
    const snapshot=(task.batches||[]).slice().reverse().find(b=>b.account?.id===task.accountId)?.account;
    return {id:task.accountId,name:task.accountName||snapshot?.name||'原任务视频账号'};
  }
  function displayAccounts(preferred){
    const select=$('accountSelect'), locked=usesOriginalAccount();
    const choices=locked?(state.task.accountId?[originalAccount(state.task)]:[]):state.accounts;
    select.replaceChildren(option('','通用设置'),...choices.map(a=>option(a.id,a.name)));
    select.value=choices.some(a=>a.id===preferred)?preferred:'';
    select.disabled=locked;$('manageAccounts').hidden=locked;
  }
  function selectedAccount(){
    return usesOriginalAccount()?originalAccount(state.task):state.accounts.find(a=>a.id===$('accountSelect').value);
  }
  function nameOf(id){return state.services?.providers?.find(p=>p.id===id)?.name||id||'平台默认';}
  function activeDefault(){return nameOf(state.services?.defaultProvider);}
  function currentData(){
    return {mode:state.task?.mode||state.mode,source:state.task?.source||$('source').value.trim(),script:state.task?$('revisedScript').value.trim():(state.mode==='manual'?$('manualScript').value.trim():''),accountId:usesOriginalAccount()?state.task.accountId:$('accountSelect').value,options:options()};
  }
  function setMode(mode){state.mode=mode;$('modeLink').setAttribute('aria-pressed',String(mode==='link'));$('modeManual').setAttribute('aria-pressed',String(mode==='manual'));$('inputLink').hidden=mode!=='link';$('inputManual').hidden=mode!=='manual';inferPlatform();summary();}
  function labelPrimary(label){const b=$('generate');if(b.firstChild?.nodeType===3)b.firstChild.nodeValue=label;else b.prepend(document.createTextNode(label));}
  function summary(){
    const o=options(), total=Object.values(o.platforms).reduce((a,b)=>a+(b||0),0), task=state.task, busy=!!busyTask();
    platformControls.forEach(({box,n,root})=>{root.classList.toggle('is-on',box.checked);n.disabled=!box.checked;});
    $('replyCount').disabled=!o.replies;
    $('summaryPlatforms').replaceChildren(...Object.entries(o.platforms).map(([p,n])=>el('span','pill',p+' '+(n||0))));
    setText('totalCount',String(total));setText('summaryAccount',selectedAccount()?.name||'通用设置');
    setText('summaryReply',o.replies?(o.replyCount==null?'自动分配':o.replyCount+' 条'):'关闭');
    setText('summaryModel',o.provider?nameOf(o.provider):activeDefault());setText('manualCount',$('manualScript').value.length+' 字');
    const anyModel=state.services?.providers?.some(p=>p.enabled);
    const cap=Number(state.services?.maxComments)||100;
    const warning=total>cap?'每批最多 '+cap+' 条主评论。':!total?'请至少选择一个目标平台。':state.services&&!anyModel?'文本模型尚未配置。有文案时可先预览并复制提示词。':'';
    $('summaryNotice').hidden=!warning;setText('summaryNotice',warning);
    labelPrimary(busy?'任务处理中':task?(task.batches?.length?'按当前设置再生成':'按文案生成评论'):(state.mode==='link'?'提取并生成评论':'生成评论'));
    $('generate').disabled=state.pending||busy;
    const compareReady=o.compareProvider&&o.compareProvider!==(o.provider||state.services?.defaultProvider)&&state.services?.providers?.filter(p=>p.enabled).length>=2;
    $('compareBtn').hidden=!compareReady;$('compareBtn').disabled=state.pending||busy;
    $('retry').disabled=state.pending||busy;$('upload').disabled=state.pending||busy;
  }
  function showPage(view){
    state.view=view;
    Object.keys(pages).forEach(p=>{$('view-'+p).hidden=view!==p;});
    document.querySelectorAll('#sidebar [data-route]').forEach(a=>{if(a.dataset.route===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const [title,desc]=pages[view];setText('crumb',view==='work'&&state.task?'任务详情':title);setText('pageTitle',view==='work'&&state.task?'任务详情':title);setText('pageDesc',view==='work'&&state.task?'查看素材、修订逐字稿，或使用当前设置再生成一批。':desc);
    document.title=$('pageTitle').textContent+' · 评论工坊';
    $('newTask').hidden=view==='work'&&!state.task || ['users','heat'].includes(view);
    $('newHeat').hidden=!unified||!['history','heat'].includes(view);
    if(view!=='heat') $('heatFrameHost').replaceChildren();
    if(view!=='users') $('usersFrameHost').replaceChildren();
    closeMenu();
  }
  function closeMenu(){$('sidebar').classList.remove('open');$('menu').setAttribute('aria-expanded','false');}
  function stopPolling(){clearTimeout(state.poll);state.poll=null;}
  function resetTask(reset){
    const ownSelection=usesOriginalAccount()?'':$('accountSelect').value;
    stopPolling();state.task=null;displayAccounts(ownSelection);state.batch=null;state.scriptDirty=false;$('sourceCard').hidden=false;$('detailCard').hidden=true;$('resultsCard').hidden=true;
    $('sourceCard').append(accountLine);$('video').removeAttribute('src');$('video').load();
    if(reset){
      const a=$('accountSelect').value;const old=options();$('source').value='';$('manualScript').value='';$('revisedScript').value='';
      state.platformEdited=false;fillOptions({provider:old.provider||'',replies:old.replies,replyCount:old.replyCount});$('accountSelect').value=a;applyAccount(true);setMode(state.mode);
    }
  }
  function cacheNewForm(){
    if(!state.task&&state.view==='work') state.newDraft={mode:state.mode,source:$('source').value,script:$('manualScript').value,accountId:$('accountSelect').value,options:options(),edited:state.platformEdited};
  }
  function restoreNewForm(){
    const d=state.newDraft;if(!d)return;state.platformEdited=true;setMode(d.mode);$('source').value=d.source;$('manualScript').value=d.script;$('accountSelect').value=d.accountId;fillOptions(d.options);state.platformEdited=d.edited;summary();
  }
  async function navigate(view='work',id='',push=true,reset=false,frameParams={}){
    if(!Object.hasOwn(pages,view) || ((!unified || !actor) && ['heat','users'].includes(view)))view='work';
    if(view==='users' && actor?.role!=='admin') view='history';
    if(!id&&!reset)cacheNewForm();
    const epoch=++state.epoch;stopPolling();const url=new URL(location.href);url.search='';url.hash='';
    if(id)url.searchParams.set('task',id);else if(view!=='work')url.searchParams.set('view',view);
    if(view==='heat') for(const key of ['draft','detail','new','all']) if(frameParams[key])url.searchParams.set(key,frameParams[key]);
    if(push&&url.href!==location.href)history.pushState(null,'',url);
    if(view==='work'&&id){state.task={id,status:'queued',options:{},batches:[]};state.batch=null;state.scriptDirty=false;showPage('work');$('sourceCard').hidden=true;$('detailCard').hidden=false;$('detailCard').append(accountLine);$('resultsCard').hidden=true;$('mediaArea').hidden=true;$('taskMessage').hidden=true;$('detailSource').hidden=true;setText('detailMeta','读取任务中…');setText('taskState','读取中');$('revisedScript').value='';$('retry').hidden=true;$('uploadLabel').hidden=true;summary();
      try{const t=await api('/api/tasks/'+encodeURIComponent(id));if(state.epoch!==epoch)return;applyTask(t,true);poll(t.id,epoch);}
      catch(e){if(state.epoch!==epoch)return;await navigate('history','',false);history.replaceState(null,'','?view=history');toast(e.message,true);}
    }else{
      resetTask(reset);showPage(view);
      try{
        if(view==='work'&&!reset){if(!state.newDraft)resetTask(true);else restoreNewForm();summary();}
        if(view==='history')await loadHistory(epoch);
        if(view==='accounts')await loadAccounts();
        if(view==='guides')await loadGuides(epoch);
        if(view==='services'){await loadServices();document.dispatchEvent(new Event('studio:usage'));}
        if(view==='users'||view==='heat') showDispatch(view,frameParams);
      }catch(e){if(state.epoch===epoch)toast(e.message,true);}
    }
  }
  function showDispatch(view,params={}) {
    const url=new URL(dispatchBase+'/manage',location.origin);
    url.searchParams.set('embed','1');
    if(view==='users')url.searchParams.set('view','accounts');
    else{
      if(params.all && actor?.role==='admin')url.searchParams.set('view','all');
      for(const key of ['detail','draft']) if(/^[1-9]\d*$/.test(String(params[key]||'')))url.searchParams.set(key,params[key]);
      if(params.new==='1')url.searchParams.set('new','1');
    }
    const host=$(view==='users'?'usersFrameHost':'heatFrameHost');
    const frame=el('iframe','dispatch-frame');
    frame.title=view==='users'?'工作台用户管理':'热启动任务管理';
    frame.src=url.pathname+url.search;
    host.replaceChildren(frame);
  }
  function openHeat(heat,ownerId){
    const other=actor?.role==='admin' && ownerId!=null && String(ownerId)!==String(actor.id);
    const query=other?{all:'1',detail:heat.id}:heat.status==='draft'?{draft:heat.id}:{detail:heat.id};
    return navigate('heat','',true,false,query);
  }
  function applyTask(t,first=false){
    const prev=state.task;
    if(prev?.id===t.id && !Object.hasOwn(t,'ownerId') && Object.hasOwn(prev,'ownerId')){
      t={...t,ownerId:prev.ownerId,accountName:t.accountName||prev.accountName};
    }
    state.task=t;const running=!!busyTask();
    if(first){displayAccounts(t.accountId||'');fillOptions(t.options);state.scriptDirty=false;}
    else if(prev?.accountId!==t.accountId&&($('accountSelect').value===(prev?.accountId||'')||usesOriginalAccount())){displayAccounts(t.accountId||'');}
    if(first||!state.scriptDirty)$('revisedScript').value=t.script||'';
    const subtitles=t.subtitlesUrl?new URL(t.subtitlesUrl,location.origin):null;
    $('downloadSrt').hidden=!subtitles||subtitles.origin!==location.origin;
    if(!$('downloadSrt').hidden)$('downloadSrt').href=subtitles.href;else $('downloadSrt').removeAttribute('href');
    $('downloadText').disabled=!$('revisedScript').value.trim();
    setText('detailMeta',[t.title||t.platform||'手动文案',t.author,date(t.createdAt)].filter(Boolean).join(' · '));
    setText('taskState',statuses[t.status]||t.status);$('taskState').dataset.state=running?'running':t.error?'attention':'';
    $('detailSource').hidden=!t.source;setText('detailSource',t.source);
    const note=t.error||(running?(stages[t.stage]||'处理中')+'…':'');
    setText('taskMessage',note);$('taskMessage').hidden=!note;$('taskMessage').dataset.state=t.error?'attention':'info';
    setText('revisionHint',t.originalScript&&t.originalScript!==t.script?'当前显示已修订稿。继续生成会保存为新批次。':'可以校正术语、数字和专名；重新生成仅使用当前文案。');
    $('retry').hidden=!['failed','needs_input'].includes(t.status);
    $('uploadLabel').hidden=t.mode!=='link'||running||!['failed','needs_input'].includes(t.status);
    $('mediaArea').hidden=!t.mediaUrl;if(t.mediaUrl){
      const mediaUrl=new URL(t.mediaUrl,location.origin);if(mediaUrl.origin===location.origin){
        if($('video').getAttribute('src')!==mediaUrl.pathname)$('video').src=mediaUrl.pathname;
        mediaUrl.searchParams.set('download','1');$('download').href=mediaUrl.href;
        setText('expiry',t.expiresAt?'可下载至 '+date(t.expiresAt):'');
      }else $('mediaArea').hidden=true;
    }
    if(first||prev?.batches?.length!==t.batches?.length){ groupCache.clear();renderBatches(true); }
    summary();
  }
  function poll(id,epoch){
    stopPolling();if(!busyTask())return;
    state.poll=setTimeout(async()=>{if(state.epoch!==epoch)return;try{
      const t=await api('/api/tasks/'+encodeURIComponent(id));if(state.epoch!==epoch)return;applyTask(t);
    }catch(e){if(state.epoch!==epoch)return;if(e.httpStatus===404){toast(e.message,true);return;}setText('taskMessage','暂时无法读取任务进度，正在重新连接。');$('taskMessage').hidden=false;}
    if(state.epoch===epoch)poll(id,epoch);},1800);
  }
  function currentBatch(){return state.task?.batches?.find(b=>b.id===$('batchSelect').value);}
  function renderBatches(latest=false){
    const b=state.task?.batches||[];$('resultsCard').hidden=!b.length;if(!b.length)return;
    const prev=$('batchSelect').value;$('batchSelect').replaceChildren(...b.map((item,i)=>option(item.id,(item.kind==='compare'?'对比样稿':'正式评论')+' '+(i+1)+' · '+nameOf(item.provider)+' · '+date(item.createdAt))).reverse());
    $('batchSelect').value=!latest&&b.some(x=>x.id===prev)?prev:b[b.length-1].id;renderRows();
  }
  function groupPath(taskId,batchId,platform){
    return '/api/tasks/'+[taskId,'batches',batchId,'platforms',platform].map(encodeURIComponent).join('/');
  }
  function groupNames(batch){
    const listed=Array.isArray(batch.platforms)?batch.platforms:Object.keys(batch.platforms||{});
    return [...new Set([...(batch.rows||[]).map(r=>r.platform||'评论'),...listed,
      ...Object.keys(batch.options?.platforms||{}),...Object.keys(batch.collections||{})])];
  }
  function groupRows(batch,platform){
    const cached=groupCache.get(groupPath(state.task.id,batch.id,platform));
    return cached?.rows || (batch.rows||[]).filter(r=>(r.platform||'评论')===platform);
  }
  function countBatch(batch,groups){
    const rows=groups.flatMap(p=>groupRows(batch,p));
    const replies=rows.filter(r=>r.reply&&r.reply!=='—').length;
    setText('resultMeta',rows.length+' 条主评论 · '+replies+' 条作者回复'+(Number.isFinite(batch.durationMs)?' · '+(batch.durationMs/1000).toFixed(1)+' 秒':''));
  }
  function drawRows(host,rows){
    host.replaceChildren();
    if(!rows.length){host.append(el('p','empty','本组还没有主评论。点「管理评论」可以添加。'));return;}
    rows.forEach((r,i)=>{
      const row=el('div','result-row'), text=el('div');
      if(r.type)text.append(el('span','type',r.type));
      text.append(el('p','',r.text));
      if(r.reply&&r.reply!=='—')text.append(el('p','reply','作者回复 · '+r.reply));
      if(r.advice&&r.advice!=='—')text.append(el('p','advice','发布建议 · '+r.advice));
      const button=el('button','text-button','复制');button.type='button';button.setAttribute('aria-label','复制第 '+(i+1)+' 条评论');
      button.addEventListener('click',()=>copy(r.text));
      row.append(el('span','row-number',String(i+1)),text,button);host.append(row);
    });
  }
  function renderRows(){
    const batch=currentBatch();if(!batch)return;
    const names=groupNames(batch), epoch=++resultsEpoch, task=state.task;
    const container=$('resultRows');container.replaceChildren(); countBatch(batch,names);
    for(const platform of names){
      const section=el('section','result-group'), header=el('div','group-head'), heading=el('h3');
      const toolBar=el('div','group-actions'), list=el('div');
      header.append(heading,toolBar);section.append(header,list);container.append(section);
      const path=groupPath(task.id,batch.id,platform);
      const active=()=>state.task?.id===task.id&&currentBatch()?.id===batch.id&&resultsEpoch===epoch;
      function display(rows){heading.textContent=platform+' · '+rows.length+' 条';drawRows(list,rows);}
      display(groupRows(batch,platform));if(!unified)continue;
      const edit=el('button','button outline small','管理评论'), heat=el('button','button primary small','创建热启动');
      const progress=el('span','group-progress'); edit.type=heat.type='button';
      toolBar.append(progress,edit,heat);let snapshot=null;
      function update(data){
        if(!active())return;
        snapshot=data;groupCache.set(path,data);display(data.rows);countBatch(batch,names);
        edit.hidden=Boolean(data.heatstart);edit.disabled=false;
        heat.textContent=data.heatstart?'查看热启动':'创建热启动';
        heat.disabled=!data.heatstart&&!data.rows.length;
        progress.textContent=data.heatstart?heatStates[data.heatstart.status]+' · 已领 '+data.heatstart.claimed+'/'+data.heatstart.total:'';
      }
      async function read(){const data=await api(path);update(data);return {title:platform+' · 评论集',...data};}
      const reload=el('button','text-button','重试');reload.type='button';reload.hidden=true;toolBar.append(reload);
      async function restore(){
        edit.disabled=heat.disabled=true;reload.hidden=true;
        try{await read();}catch(e){if(active()){progress.textContent=e.message;reload.hidden=false;}}
      }
      reload.onclick=restore;
      edit.onclick=guarded(async()=>{
        edit.disabled=true;
        try{
          const [editor,current]=await Promise.all([import('/studio-dispatch/static/comments.js'),read()]);
          if(!active()||current.heatstart)return;
          editor.openGeneratedComments(document.body,current,async(version,rows)=>{
            const data=await api(path,'PUT',{version,rows});update(data);toast('评论集已保存');
          },read);
        }finally{if(active())edit.disabled=false;}
      });
      heat.onclick=guarded(async()=>{
        if(snapshot?.heatstart)return openHeat(snapshot.heatstart,task.ownerId);
        heat.disabled=edit.disabled=true;
        try{
          const data=await api(path+'/heatstart','POST',{version:snapshot.version});
          if(!active())return;update(data);
          if(data.heatstart){toast('热启动草稿已就绪');await openHeat(data.heatstart,task.ownerId);}
        }catch(error){
          if(active() && (error.status===409||error.status>=500))await restore();
          throw error;
        }finally{if(active()&&snapshot)update(snapshot);}
      });
      restore();
    }
  }
  function batchText(){
    const batch=currentBatch();if(!batch)return '';
    return groupNames(batch).flatMap(p=>groupRows(batch,p)).map(r=>[r.platform+' · '+(r.type||'主评论'),r.text,r.reply&&r.reply!=='—'?'作者回复：'+r.reply:'',r.advice&&r.advice!=='—'?'发布建议：'+r.advice:''].filter(Boolean).join('\n')).join('\n\n');
  }
  async function copy(s){if(!s){toast('没有可复制的内容。');return;}
    try{await navigator.clipboard.writeText(s);toast('已复制');}catch{
      const t=el('textarea');t.value=s;t.style.position='fixed';t.style.left='-9999px';const container=$('promptDialog').open?$('promptDialog'):document.body;container.append(t);t.select();
      let ok=false;try{ok=document.execCommand('copy');}finally{t.remove();}toast(ok?'已复制':'浏览器未授权复制，可选中文字后复制。',!ok);
    }
  }
  function selectList(id,list,emptyLabel,previous){const s=$(id);s.replaceChildren(option('',emptyLabel),...list.map(p=>option(p.id,p.name+(p.enabled?'':'（未配置）'),!p.enabled)));if([...s.options].some(o=>o.value===previous))s.value=previous;}
  async function loadServices(initial){
    const data=initial?.providers?initial:await api('/api/status');state.services=data;const ps=data.providers||[];const enabled=ps.filter(p=>p.enabled);
    selectList('provider',ps,'平台默认 · '+nameOf(data.defaultProvider),$('provider').value);
    selectList('compareProvider',ps,'不对比',$('compareProvider').value);
    $('serviceChip').dataset.state=enabled.length?'ok':'warning';setText('serviceText',enabled.length?'生成服务已就绪':'生成模型待配置');
    const content=[];function add(label,desc,flag){
      const line=el('div','service-row'),text=el('div','entry-text');text.append(el('strong','',label));if(desc)text.append(el('small','',desc));line.append(text,el('span','tag',flag));content.push(line);
    }
    for(const p of ps)add(p.name,'文本生成'+(p.id===data.defaultProvider?' · 默认模型':''),p.enabled?'已配置':'未配置');
    for(const [k,label] of [['parser','链接解析'],['asr','语音转写'],['storage','视频存储']]){
      const val=data[k];if(val==null)continue;
      let flag=typeof val==='string'?val:typeof val==='boolean'?(val?'已配置':'未配置'):(val.enabled??val.ready??val.configured)?'已配置':'待配置';
      let desc=typeof val==='object'?(val.name||val.detail||val.mode||''):'';
      if(k==='storage'&&flag==='local')flag='本机存储';if(k==='storage'&&flag==='oss')flag='私有对象存储';
      add(label,desc,flag);
    }
    if(data.maxComments)add('每批主评论上限','所有目标平台合计',data.maxComments+' 条');
    if(data.maxMinutes)add('视频时长上限','获取与转写',data.maxMinutes+' 分钟');
    $('serviceList').replaceChildren(...content);summary();
    document.dispatchEvent(new CustomEvent('studio:status',{detail:data}));
  }
  async function loadAccounts(){
    const data=await api('/api/accounts');state.accounts=data.accounts||[];
    displayAccounts(usesOriginalAccount()?state.task.accountId:$('accountSelect').value);
    renderAccountList();summary();
  }
  function renderAccountList(){
    const rows=state.accounts.map(a=>{const b=el('button','entry'+(state.editAccount===a.id?' selected':''));b.type='button';const txt=el('div','entry-text');txt.append(el('strong','',a.name),el('small','',[a.platform,a.industry,a.business].filter(Boolean).join(' · ')||'通用资料'));b.append(txt);b.addEventListener('click',()=>showAccount(a));return b;});
    $('accountList').replaceChildren(...(rows.length?rows:[el('p','empty','还没有账号资料。填写右侧表单即可新建。')]));
  }
  function showAccount(a={}){state.editAccount=a.id||'';$('accountTasks').hidden=!state.editAccount;setText('accountFormTitle',a.id?'编辑账号':'新建账号');accountKeys.forEach(k=>{$('a-'+k).value=a[k]||'';});renderAccountList();}
  function applyAccount(force=false){
    const a=selectedAccount();for(const k of ['industry','business']){const field=$(fieldIds[k]);if(force||!field.value||field.value===field.dataset.inherited){field.value=a?.[k]||'';}field.dataset.inherited=a?.[k]||'';}inferPlatform();summary();
  }
  async function loadHistory(epoch=state.epoch){
    const list=$('taskList');
    const pending=[api('/api/tasks')];
    if(unified)pending.push(api(dispatchBase+(actor.role==='admin'?'/api/admin/tasks':'/api/tasks')));
    const [generated,distributed]=await Promise.allSettled(pending);
    if(state.epoch!==epoch)return;
    list.replaceChildren();
    for(const result of [generated,distributed])if(result?.status==='rejected')list.append(el('p','notice',result.reason.message));
    const videos=generated.status==='fulfilled'?generated.value.tasks||[]:[];
    const heat=distributed?.status==='fulfilled'?distributed.value.tasks||[]:[];
    $('historyAccount').replaceChildren(option('','全部视频账号'),...state.accounts.map(a=>option(a.id,a.name)));
    $('historyAccount').value=state.historyAccount;
    const visible=videos.filter(t=>!state.historyAccount||t.accountId===state.historyAccount);
    const known=new Set(videos.map(t=>t.id));
    const independent=heat.filter(t=>!known.has(t.origin?.generationId)&&(!state.historyAccount||t.origin?.videoAccountId===state.historyAccount));
    if(!visible.length&&!independent.length){
      if(generated.status==='fulfilled'&&(!distributed||distributed.status==='fulfilled')){
        list.append(el('p','empty',state.historyAccount?'这个视频账号还没有任务。':'还没有任务，可先生成评论或直接导入。'));
      }
      return;
    }
    const table=el('table','task-table'), thead=table.createTHead(), tr=thead.insertRow();
    for(const label of ['作品 / 来源','平台','主评论','状态','操作'])tr.append(el('th','',label));
    const tbody=table.createTBody();
    function linkButton(label,handler,cls='text-button'){
      const button=el('button',cls,label);button.type='button';button.addEventListener('click',guarded(handler));return button;
    }
    function addRecord(title,meta,platform,total,status){
      const row=tbody.insertRow(),work=row.insertCell();
      work.append(el('strong','work-title',title||'未命名作品'),el('small','work-meta',meta));
      row.insertCell().textContent=platform||'—';row.insertCell().textContent=total??'—';
      const phase=row.insertCell();
      if(status)phase.append(el('span','tag',status));
      return {phase,actions:row.insertCell()};
    }
    function addHeat(record,h,ownerId,platform,multi=false){
      record.phase.append(el('span','heat-progress',(multi?platform+' · ':'')+(heatStates[h.status]||h.status)+' · 已领 '+h.claimed+'/'+h.total));
      record.actions.append(linkButton((multi?platform+' · ':'')+'查看热启动',()=>openHeat(h,ownerId)));
    }
    const bySource=new Map();
    for(const h of heat){
      if(!h.origin?.generationId)continue;
      const list=bySource.get(h.origin.generationId)||[];list.push(h);bySource.set(h.origin.generationId,list);
    }
    for(const t of visible){
      const linked=bySource.get(t.id)||t.heatstarts||[];
      const account=state.accounts.find(a=>a.id===t.accountId)?.name||t.accountName;
      const row=addRecord(t.title||t.source||'手动文案',['评论生成',account,actor?.role==='admin'?t.ownerLabel:'',date(t.createdAt)].filter(Boolean).join(' · '),t.platform||'手动文案',t.commentCount,linked.length?'':statuses[t.status]||t.status);
      row.actions.append(linkButton('查看生成',()=>navigate('work',t.id)));
      for(const h of linked)addHeat(row,h,t.ownerId,heatPlatforms[h.target_platform]||h.platform||'',linked.length>1);
    }
    for(const h of independent){
      const row=addRecord(h.title,[h.origin?'评论生成':'独立导入',actor?.role==='admin'?h.owner_username:''].filter(Boolean).join(' · '),heatPlatforms[h.target_platform]||h.target_platform,h.total);
      addHeat(row,h,h.owner_id);
    }
    list.append(table);
  }
  async function loadGuides(epoch){
    if(!state.guideReady){const d=await api('/api/guides');if(state.epoch!==epoch)return;state.guides=d.guides||[];state.guideReady=true;$('guideSelect').replaceChildren(...state.guides.map((g,i)=>option(String(i),g.title)));}
    setText('guideText',state.guides[Number($('guideSelect').value)]?.text||'没有可用文档。');
  }
  function validateOptions(o){
    if(!Object.keys(o.platforms).length)throw new Error('请至少选择一个目标平台。');
    const counts=Object.values(o.platforms);const max=Number(state.services?.maxComments)||100;
    if(counts.some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('每个平台的条数须为正整数。');
    const total=counts.reduce((a,b)=>a+b,0);if(total>max)throw new Error('每批主评论合计最多 '+max+' 条。');
    if(o.replies&&o.replyCount!==null&&(!Number.isSafeInteger(o.replyCount)||o.replyCount<0||o.replyCount>total))throw new Error('作者回复须为 0 至 '+total+' 的整数，或留空自动分配。');
  }
  const requests=new Map();
  function requestKey(url,body){const key=JSON.stringify([url,body]);if(!requests.has(key))requests.set(key,globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));return key;}
  async function postOnce(url,body){
    const k=requestKey(url,body);
    try{const t=await api(url,'POST',{...body,requestId:requests.get(k)});requests.delete(k);return t;}
    catch(e){if(e.httpStatus&&e.httpStatus<500)requests.delete(k);throw e;}
  }
  async function action(kind){
    if(state.pending||busyTask())return;const d=currentData(),id=state.task?.id,epoch=state.epoch;
    try{
      validateOptions(d.options);
      if(!id&&d.mode==='link'&&!d.source){$('source').focus();throw new Error('请粘贴视频链接或分享内容。');}
      if((id||d.mode==='manual')&&!d.script){$(id?'revisedScript':'manualScript').focus();throw new Error('请先填写文案，或重试获取逐字稿。');}
      if(kind==='compare'&&(!d.options.compareProvider||d.options.compareProvider===(d.options.provider||state.services?.defaultProvider)))throw new Error('请选择两个不同的已配置模型。');
      state.pending=true;summary();
      const next={script:d.script,options:d.options,kind};
      if(!usesOriginalAccount())next.accountId=d.accountId;
      const t=id?await postOnce('/api/tasks/'+encodeURIComponent(id)+'/generate',next):await postOnce('/api/tasks',{...d,kind});
      if(state.epoch!==epoch)return;
      if(!id){state.newDraft=null;await navigate('work',t.id);}else{state.scriptDirty=false;applyTask(t,true);poll(t.id,epoch);}
    }catch(e){toast(e.message,true);}finally{state.pending=false;summary();}
  }
  async function recover(file=null){
    if(!state.task||state.pending||busyTask())return;const id=state.task.id,epoch=state.epoch;
    try{state.pending=true;summary();
      const path='/api/tasks/'+encodeURIComponent(id);const t=file?await api(path+'/upload','POST',file):await postOnce(path+'/retry',{});
      if(state.epoch!==epoch)return;applyTask(t,true);poll(id,epoch);
    }catch(e){toast(e.message,true);}finally{$('upload').value='';state.pending=false;summary();}
  }
  function guarded(fn){return (...args)=>Promise.resolve(fn(...args)).catch(e=>toast(e.message,true));}
  function startNew(){
    state.newDraft=null;navigate('work','',true,true);
  }
  document.querySelectorAll('[data-route]').forEach(a=>a.addEventListener('click',e=>{
    if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();if(a.dataset.route==='work'&&state.task)startNew();else navigate(a.dataset.route);
  }));
  $('menu').onclick=()=>{const on=$('sidebar').classList.toggle('open');$('menu').setAttribute('aria-expanded',String(on));};
  $('modeLink').onclick=()=>setMode('link');$('modeManual').onclick=()=>setMode('manual');
  $('newHeat').onclick=()=>navigate('heat','',true,false,{new:'1'});$('newTask').onclick=startNew;$('manageAccounts').onclick=()=>navigate('accounts');$('serviceChip').onclick=()=>navigate('services');
  $('source').oninput=()=>{inferPlatform();summary();};$('manualScript').oninput=summary;
  $('accountSelect').onchange=()=>applyAccount(true);$('revisedScript').oninput=()=>{state.scriptDirty=true;$('downloadText').disabled=!$('revisedScript').value.trim();summary();};
  $('taskForm').addEventListener('input',summary);$('taskForm').addEventListener('change',summary);
  $('taskForm').addEventListener('submit',e=>{e.preventDefault();action('normal');});$('compareBtn').onclick=()=>action('compare');
  $('previewPrompt').onclick=guarded(async()=>{const d=currentData();if(!d.script)throw new Error('请先填写文案，或等视频转写完成后预览。');validateOptions(d.options);const url=unified&&state.task?'/api/tasks/'+encodeURIComponent(state.task.id)+'/prompt':'/api/prompt';const p=await api(url,'POST',d);setText('promptText',p.prompt);$('promptDialog').showModal();});
  $('closeDialog').onclick=()=>$('promptDialog').close();$('copyPrompt').onclick=()=>copy($('promptText').textContent);
  $('retry').onclick=()=>recover();$('upload').onchange=()=>{const f=$('upload').files?.[0];if(f)recover(f);};
  $('batchSelect').onchange=renderRows;$('copyBatch').onclick=()=>copy(batchText());$('copyScript').onclick=()=>copy($('revisedScript').value);
  $('refreshHistory').onclick=guarded(()=>loadHistory());$('refreshServices').onclick=guarded(loadServices);
  $('historyAccount').onchange=guarded(async()=>{state.historyAccount=$('historyAccount').value;await loadHistory();});
  $('accountTasks').onclick=()=>{state.historyAccount=state.editAccount;navigate('history');};
  $('addAccount').onclick=()=>{showAccount();$('a-name').focus();};
  $('accountForm').onsubmit=guarded(async e=>{e.preventDefault();const id=state.editAccount,body=Object.fromEntries(accountKeys.map(k=>[k,$('a-'+k).value.trim()]));const button=$('accountForm').querySelector('button[type=submit]');button.disabled=true;
    try{const a=await api(id?'/api/accounts/'+encodeURIComponent(id):'/api/accounts',id?'PUT':'POST',body);await loadAccounts();showAccount(a);toast('账号资料已保存');}finally{button.disabled=false;}
  });
  $('downloadText').onclick=()=>{const text=$('revisedScript').value.trim();if(!text)return;const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),link=el('a');link.href=URL.createObjectURL(blob);link.download='视频文案-'+(state.task?.id||'草稿')+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),2000);};
  $('guideSelect').onchange=()=>loadGuides(state.epoch);$('copyGuide').onclick=()=>copy($('guideText').textContent);
  document.addEventListener('studio:settings-saved',guarded(loadServices));
  function route(push=false){
    const params=new URLSearchParams(location.search);
    return navigate(params.has('task')?'work':params.get('view')||(unified?'history':'work'),params.get('task')||'',push,false,Object.fromEntries(params));
  }
  window.addEventListener('popstate',()=>{if(!unified||actor)route();});
  function showAuth(register=false,message=''){
    registering=register;
    const form=$('loginForm');
    $('authScreen').hidden=false;document.body.dataset.shell='auth';
    setText('authTitle',register?'注册工作台账号':'登录工作台');document.title=$('authTitle').textContent+' · 评论工坊';
    setText('authSubmit',register?'注册并登录':'登录');
    const secret=form.elements.password;secret.autocomplete=register?'new-password':'current-password';
    secret.minLength=register?8:1;secret.value='';
    form.elements.username.minLength=register?3:1;
    $('toggleRegister').textContent=register?'已有账号，去登录':'注册账号';
    setText('authError',message);$('authError').hidden=!message;
  }
  async function verifySession(){
    if(!unified||syncingSession||document.hidden)return;
    syncingSession=true;
    try{
      const {user}=await api(dispatchBase+'/api/account');
      if(String(user?.id||'')!==String(actor?.id||'')||user?.role!==actor?.role)location.reload();
    }catch{/* The next request verifies credentials again. */}finally{syncingSession=false;}
  }
  function announceActor(){
    try{localStorage.setItem(publisherChanged,String(Date.now()));}catch{}
  }
  function setupSession(){
    $('toggleRegister').onclick=()=>showAuth(!registering);
    $('loginForm').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget, submit=$('authSubmit');
      submit.disabled=true;$('authError').hidden=true;
      try{
        await api(dispatchBase+'/api/account/'+(registering?'register':'login'),'POST',
          {username:form.elements.username.value.trim(),password:form.elements.password.value});
        announceActor();location.reload();
      }catch(e){setText('authError',e.message);$('authError').hidden=false;}
      finally{submit.disabled=false;}
    };
    $('signOut').onclick=guarded(async()=>{
      $('signOut').disabled=true;
      try{await api(dispatchBase+'/api/account/logout','POST',{});announceActor();location.reload();}
      finally{$('signOut').disabled=false;}
    });
    document.addEventListener('visibilitychange',verifySession);
    window.addEventListener('focus',verifySession);
    window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
    window.addEventListener('storage',e=>{if(e.key===publisherChanged)verifySession();});
    window.addEventListener('message',e=>{
      if(e.origin!==location.origin||![...document.querySelectorAll('.dispatch-frame')].some(frame=>frame.contentWindow===e.source))return;
      if(e.data?.type==='kh:session-changed')verifySession();
      if(e.data?.type==='kh:dispatch-updated')groupCache.clear();
    });
  }
  async function legacyOffer(){
    const owned=await api('/api/legacy');
    const count=Number(owned.tasks||0),accounts=Number(owned.accounts||0),usage=Number(owned.usage||0);
    if(owned.claimed||!(count||accounts||usage))return;
    setText('legacyInfo','此浏览器原有 '+count+' 条生成任务、'+accounts+' 个视频账号。归入「'+(actor.username||'当前游客')+'」后可在任务管理中查看。');
    $('legacyBanner').hidden=false;
    $('claimLegacy').onclick=guarded(async()=>{
      const button=$('claimLegacy');button.disabled=true;
      try{await api('/api/legacy','POST',{});$('legacyBanner').hidden=true;await loadAccounts();await route();toast('原有记录已归入当前账号');}
      finally{button.disabled=false;}
    });
  }
  async function init(){
    buildPlatforms();summary();
    let status;
    try{status=await api('/api/status');}catch(e){$('bootState').textContent=e.message;const btn=el('button','text-button','重试');btn.type='button';btn.onclick=()=>location.reload();$('bootState').append(btn);return;}
    unified=Boolean(status.unifiedAccounts);
    if(unified){
      setupSession();let identity;
      try{identity=await api(dispatchBase+'/api/account');}catch(e){showAuth(false,e.message);return;}
      actor=identity.user||null;
      if(!actor){showAuth(false);return;}
      const css=document.createElement('link');css.rel='stylesheet';css.href=dispatchBase+'/static/collection.css';document.head.append(css);
      document.querySelectorAll('[data-unified]').forEach(node=>node.hidden=false);
      for(const brand of document.querySelectorAll('.brand[data-route]')){brand.dataset.route='history';brand.href='/manage';}
      $('sessionMenu').hidden=false;
      setText('signedInName',actor.role==='admin'?'管理员 · '+actor.username:actor.username||'游客');
      $('usersNav').hidden=actor.role!=='admin';
      document.dispatchEvent(new CustomEvent('studio:actor',{detail:actor}));
    }
    document.body.dataset.shell='workspace';
    try{await loadServices(status);await loadAccounts();}catch(e){setText('serviceText','服务未连接');toast(e.message,true);}
    await route();
    if(unified)await legacyOffer();
  }
  init().catch(e=>toast(e.message,true));
})();
