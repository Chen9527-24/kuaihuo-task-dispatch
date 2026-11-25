(() => {
  const byId = id => document.getElementById(id);
  let loaded = false;
  const prefix = location.pathname.startsWith('/manage/') && !document.getElementById('taskForm') ? '/manage' : '';
  let actor=null;document.addEventListener('studio:actor',event=>{actor=event.detail;});
  function element(tag, value) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    return node;
  }
  async function load(status) {
    const host = byId('admin-settings');
    if (!host || !status.localAdmin || loaded) return;
    loaded = true;
    try {
      const response = await fetch(prefix + '/api/admin/settings',{cache:'no-store',headers:actor?{'X-KH-Owner':String(actor.id)}:{}});
      if (!response.ok) throw Error('无法打开服务配置。');
      const {groups} = await response.json();
      const form = element('form');
      const inputs = new Map();
      form.append(element('h3','服务配置'), element('p','凭据仅保存在这台服务主机。密钥框留空会保留已有值。'));
      for (const group of groups) {
        const section = element('details');
        section.append(element('summary',group.title));
        const grid = element('div');
        grid.className = 'admin-grid';
        for (const f of group.fields) {
          const label = element('label',f.label);
          const select = f.type.includes('|');
          const input = element(select?'select':'input');
          if (select) {
            for (const val of f.type.split('|')) input.add(new Option(({on:'启用',off:'关闭',qwen:'千问',ark:'豆包',deepseek:'DeepSeek',local:'本地',oss:'私有 OSS',paraformer:'百炼 Paraformer'})[val] || val || '关闭',val));
            if (!f.value && f.key==='COMMENT_DEFAULT_PROVIDER') input.add(new Option('自动选用已配置模型',''),0);
          } else {
            input.type = f.type==='secret'?'password':f.type==='int'||f.type==='number'?'number':'text';
            if (input.type==='number') {input.min='0';input.step=f.type==='int'?'1':'any';}
            input.autocomplete='off';
            if (f.type==='secret') input.placeholder=f.configured?'已配置 · 输入新值可替换':'尚未配置';
          }
          input.value=f.value;
          inputs.set(f.key,{input,initial:input.value});
          label.append(input);
          grid.append(label);
        }
        section.append(grid); form.append(section);
      }
      const button=element('button','保存配置');
      button.type='submit'; button.className='primary';
      const msg=element('span'); msg.setAttribute('role','status');
      form.append(button,msg); host.replaceChildren(form);
      form.addEventListener('submit',async e=>{
        e.preventDefault(); button.disabled=true;
        try {
          const values={};
          for(const [key,{input,initial}] of inputs) if(input.value!==initial) values[key]=input.value;
          const reply=await fetch(prefix + '/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json',...(actor?{'X-KH-Owner':String(actor.id)}:{})},body:JSON.stringify({values})});
          const data=await reply.json();
          if(!reply.ok) throw Error(data.error || '保存失败');
          for(const record of inputs.values()){
            if(record.input.type==='password' && record.input.value){
              record.input.value='';record.input.placeholder='已配置 · 输入新值可替换';
            }
            record.initial=record.input.value;
          }
          msg.textContent=' 设置已保存，下一次请求生效。';
          document.dispatchEvent(new CustomEvent('studio:settings-saved'));
        } catch(err){msg.textContent=' '+err.message;} finally {button.disabled=false;}
      });
    } catch(err) {loaded=false;host.textContent=err.message;}
  }
  document.addEventListener('studio:status', e=>load(e.detail || {}));
  if(!byId('taskForm'))document.addEventListener('DOMContentLoaded',()=>fetch(prefix + '/api/status').then(r=>r.json()).then(load).catch(()=>{}));
})();

(() => {
  const el = (tag, text) => {const n = document.createElement(tag); if(text)n.textContent=text;return n;};
  let actor=null;document.addEventListener('studio:actor',event=>{actor=event.detail;});
  async function usage() {
    const host = document.getElementById('usage-summary');
    if(!host) return;
    const title=el('h3',actor?.role==='admin'?'全站调用记录':'我的调用记录');
    const refresh=el('button','刷新用量'); refresh.type='button';refresh.className='text-button';refresh.addEventListener('click',usage);
    const bar=el('div');bar.className='admin-bar';bar.append(title,refresh);
    try {
      const r=await fetch('/api/usage',{cache:'no-store',headers:actor?{'X-KH-Owner':String(actor.id)}:{}});if(!r.ok)throw Error();
      const data=await r.json();
      const rows=data.filter(x=>x.status!=='rejected');
      const metrics=el('div');metrics.className='usage-metrics';
      const cards=[['模型请求',String(rows.filter(x=>x.stage==='generation').length)+' 次'],
                   ['转写时长',String(rows.filter(x=>x.stage==='asr').reduce((n,x)=>n+x.units,0))+' 秒'],
                   ['已配置单价的估算', '¥ '+rows.filter(x=>x.priced).reduce((n,x)=>n+x.estimatedCny,0).toFixed(4)]];
      for(const [label,value] of cards){const card=el('div');card.append(el('span',label),el('strong',value));metrics.append(card);}
      const message=el('p',rows.length?'按最近 200 条调用统计，含尚待核对的预留用量。未配置单价的模型只统计用量。':'暂无调用。预览和复制提示词不会产生模型用量。');
      host.replaceChildren(bar,metrics,message);
      if(rows.length){
        const list=el('div');list.className='usage-lines';
        const desc={reserved:'待核对',measured:'已计量',estimated:'估算'};
        for(const row of rows.slice(0,12)){
          const a=el('a');a.href='?task='+encodeURIComponent(row.task);
          a.append(el('span',row.model||row.provider||'模型'),el('span',row.stage==='asr'?row.units+' 秒':
            row.inputTokens!=null?row.inputTokens+' 输入 / '+row.outputTokens+' 输出':'模型请求'),el('span',desc[row.status]||row.status));
          list.append(a);
        }
        host.append(list);
      }
    }catch{host.replaceChildren(bar,el('p','暂时无法读取用量。'));}
  }
  document.addEventListener('studio:usage',usage);
  document.addEventListener('click',e=>{if(e.target.closest('#refreshServices'))usage();});
})();
