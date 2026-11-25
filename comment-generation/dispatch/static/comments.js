const MAX_COMMENTS = 1000;
const MAX_LENGTH = 2000;
const columns = ['类型', '评论内容', '配套回复序号', '配套回复', '发布建议'];
const savedCollections = new WeakMap();
let excelLoading;

function loadExcel() {
  if (!excelLoading) {
    excelLoading = import('./exceljs.min.js').then(() => {
      if (!globalThis.ExcelJS?.Workbook) throw new Error('Excel 组件未加载，请重试。');
      return globalThis.ExcelJS;
    }).catch(error => {
      excelLoading = undefined;
      throw error;
    });
  }
  return excelLoading;
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map(run => run.text || '').join('').trim();
  if (typeof value.text === 'string') return value.text.trim();
  return value.result == null ? '' : cellText(value.result);
}

function readCommentSheet(sheet) {
  if (!sheet) return [];
  let header = 0, column = 1, fallback;
  for (let n = 1; n <= Math.min(20, sheet.rowCount); n++) {
    sheet.getRow(n).eachCell((cell, index) => {
      const title = cellText(cell.value).replace(/\s+/g, '');
      if (!header && title.includes('评论内容')) {
        header = n;
        column = index;
      } else if (!fallback && n <= 10 && ['评论','评论文本','评论文案'].includes(title)) {
        fallback = [n, index];
      }
    });
    if (header) break;
  }
  if (!header && fallback) [header, column] = fallback;
  const result = [];
  sheet.eachRow((row, number) => {
    if (number > header) {
      const text = cellText(row.getCell(column).value);
      if (text) result.push(text);
    }
  });
  return result;
}

function uniqueTexts(values) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function checkComments(values) {
  if (values.length > MAX_COMMENTS) throw new Error('每份任务可保存最多 1000 条评论');
  const long = values.findIndex(value => [...value].length > MAX_LENGTH);
  if (long >= 0) throw new Error(`第 ${long + 1} 条评论超过 2000 个字符，请先缩短内容。`);
}

async function downloadWorkbook(values, template) {
  const {Workbook} = await loadExcel();
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('评论', {views:[{state:'frozen', ySplit:1}]});
  sheet.columns = columns.map((header, i) => ({header, width:[18,60,18,48,36][i]}));
  sheet.getRow(1).font = {bold:true};
  values.forEach(value => sheet.addRow([null, value]));
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('');
  const time = [now.getHours(), now.getMinutes()].map(n => String(n).padStart(2, '0')).join('');
  link.download = template ? '评论导入模板.xlsx' : `评论导出_${date}_${time}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getTaskComments(form) {
  return [...savedCollections.get(form)];
}

export function setupCommentCollection(form, comments) {
  savedCollections.set(form, [...comments]);
  const host = form.querySelector('[data-comment-collection]');
  host.innerHTML = '<span class="collection-label">评论内容</span><button type="button" class="secondary" data-open-collection></button>';
  const open = host.querySelector('button');
  function updateButton() {
    open.textContent = `评论集（${savedCollections.get(form).length} 条）`;
  }
  updateButton();
  open.addEventListener('click', () => {
    openCollection(host, savedCollections.get(form), values => {
      savedCollections.set(form, values);
      updateButton();
    });
  });
}

export function openPublishedComments(host, initialTask, persist, reload) {
  let version = initialTask.comments_version;
  function apply(values) {
    return persist(version, values);
  }
  async function latest() {
    const task = await reload();
    if (!['open','paused'].includes(task.status)) throw new Error('任务已关闭，可先导出当前编辑内容。');
    version = task.comments_version;
    return task;
  }
  openCollection(host, initialTask.comments, apply, {locked:initialTask.locked_comments, latest, title:initialTask.title});
}

// Keep the original row identity when editing generated text so its associated
// author reply, category and publishing notes remain attached to that row.
export function openGeneratedComments(host, collection, persist, reload) {
  let version = collection.version;
  async function latest() {
    const updated = await reload();
    version = updated.version;
    return {comments: updated.rows};
  }
  return openCollection(host, collection.rows, rows => persist(version, rows), {
    generated: true, latest, title: collection.title
  });
}

function openCollection(host, saved, onSave, live=null) {
  const editor = document.createElement('dialog');
  editor.className = 'collection-dialog';
  const title = live && !live.generated ? '任务评论配置' : '评论集';
  editor.setAttribute('aria-label', title);
  editor.innerHTML = `<div class="dialog-inner">
    <header class="dialog-head"><h2>${title}</h2><button type="button" class="icon-button" data-cmd="cancel" aria-label="关闭评论集">×</button></header>
    ${live ? '<p class="collection-task-name"></p>' : ''}
    <div class="collection-tools">
      <button type="button" class="secondary" data-cmd="import">导入</button>
      <button type="button" class="secondary" data-cmd="export">导出</button>
      <button type="button" class="secondary" data-cmd="template">模板下载</button>
      <button type="button" class="secondary" data-cmd="select">全选</button>
      <button type="button" class="secondary collection-remove" data-cmd="remove-selected">批量删除</button>
      <button type="button" class="secondary" data-cmd="add">新增一条</button>
      <span class="hint" data-count></span>
    </div>
    <input type="file" accept=".xlsx" hidden aria-label="导入评论 Excel 文件">
    <details class="collection-paste"><summary>按行粘贴</summary><label>每行一条评论<textarea rows="3" placeholder="粘贴评论，每行一条"></textarea></label>
      <button type="button" class="secondary" data-cmd="paste">添加到评论集</button></details>
    <div class="collection-list" tabindex="0" aria-label="评论列表"><table><thead><tr><th scope="col" aria-label="选择"></th><th scope="col">#</th><th scope="col">评论文本</th><th scope="col">操作</th></tr></thead>
      <tbody></tbody></table><p class="hint collection-empty">暂无评论</p></div>
    <p class="collection-feedback" role="status" aria-live="polite"></p>
    ${live ? '<div data-conflict hidden><button type="button" class="secondary" data-cmd="reload">放弃本次修改并重新加载</button></div>' : ''}
    <div class="form-actions"><button type="button" class="secondary" data-cmd="cancel">取消</button><button type="button" class="primary" data-cmd="save">保存</button></div>
  </div>`;
  host.append(editor);
  const parent = host.closest('dialog');
  const closeWithParent = () => editor.close();
  parent?.addEventListener('close', closeWithParent);
  editor.addEventListener('close', () => {
    parent?.removeEventListener('close', closeWithParent);
    editor.remove();
  }, {once:true});
  const table = editor.querySelector('tbody');
  const fileInput = editor.querySelector('input[type=file]');
  const feedback = editor.querySelector('[role=status]');
  const paste = editor.querySelector('details textarea');
  const control = cmd => editor.querySelector(`[data-cmd="${cmd}"]`);
  const values = () => [...table.querySelectorAll('textarea')].map(input => input.value);
  let reading = false;
  let saving = false;
  let locked = new Set(live?.locked || []);
  if (live) editor.querySelector('.collection-task-name').textContent = live.title;
  editor.addEventListener('cancel', event => { if (saving) event.preventDefault(); });

  function report(message, error=false) {
    feedback.textContent = message;
    feedback.classList.toggle('collection-error', error);
  }

  function updateControls() {
    const count = table.rows.length;
    const selectable = table.querySelectorAll('input:not(:disabled)').length;
    const selected = table.querySelectorAll('input:checked').length;
    editor.querySelector('[data-count]').textContent = `共 ${count} 条`;
    editor.querySelector('.collection-empty').hidden = count > 0;
    control('select').disabled = !selectable;
    control('select').textContent = selectable && selected === selectable ? '取消全选' : '全选';
    control('remove-selected').disabled = !selected;
    control('export').disabled = !count || reading;
    control('import').disabled = reading;
    control('save').disabled = reading;
    control('add').disabled = count >= MAX_COMMENTS;
  }

  function renumber() {
    [...table.rows].forEach((row, index) => {
      const number = index + 1;
      row.cells[1].textContent = String(number);
      row.querySelector('input').setAttribute('aria-label', `选择第 ${number} 条评论`);
      row.querySelector('textarea').setAttribute('aria-label', `第 ${number} 条评论`);
    });
    updateControls();
  }

  const rowIds = new WeakMap();
  function addRow(value, isLocked=false) {
    const row = table.insertRow();
    row.innerHTML = '<td><input type="checkbox"></td><td></td><td><textarea rows="2" placeholder="请输入评论内容"></textarea></td><td><button type="button" data-cmd="remove" class="subtle collection-remove">删除</button></td>';
    const input = row.querySelector('textarea');
    if (typeof value === 'string') input.value = value;
    else {
      input.value = value.text;
      if (value.id != null) rowIds.set(row,value.id);
    }
    if (isLocked) {
      input.readOnly = true;
      row.querySelector('input').disabled = true;
      row.cells[3].textContent = '已领取';
    }
    return row;
  }

  function editedRows() {
    const rows = [];
    const seen = new Set();
    for (const row of table.rows) {
      const text = row.querySelector('textarea').value.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      rows.push(rowIds.has(row) ? {id:rowIds.get(row),text} : {text});
    }
    return rows;
  }

  function merge(incoming) {
    const existing = new Set(uniqueTexts(values()));
    const additions = uniqueTexts(incoming).filter(text => !existing.has(text));
    if (table.rows.length + additions.length > MAX_COMMENTS) throw new Error('每份任务可保存最多 1000 条评论');
    checkComments(additions);
    additions.forEach(value => addRow(value));
    renumber();
    return additions.length;
  }

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    if (!file || reading) return;
    reading = true;
    updateControls();
    report('正在导入…');
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('请选择 .xlsx 文件，或使用「按行粘贴」。');
      if (file.size > 16 * 1024 * 1024) throw new Error('Excel 文件超过 16 MB，请拆分后导入。');
      const {Workbook} = await loadExcel();
      const workbook = new Workbook();
      try { await workbook.xlsx.load(await file.arrayBuffer()); }
      catch { throw new Error('导入失败，请检查文件是否为有效的 .xlsx 工作簿。'); }
      if (!editor.open) return;
      const texts = readCommentSheet(workbook.worksheets[0]);
      if (!texts.length) throw new Error('未读取到可用评论内容');
      const added = merge(texts);
      report(`导入成功，新增 ${added} 条，跳过重复 ${texts.length - added} 条。`);
    } catch (error) {
      report(error.message, true);
    } finally {
      reading = false;
      updateControls();
    }
  });

  table.addEventListener('change', updateControls);
  editor.addEventListener('click', async event => {
    const button = event.target.closest('button[data-cmd]');
    if (!button || saving) return;
    const cmd = button.dataset.cmd;
    try {
      if (cmd === 'cancel') return editor.close();
      if (cmd === 'import') {
        fileInput.value = '';
        return fileInput.click();
      }
      if (cmd === 'template' || cmd === 'export') {
        await downloadWorkbook(cmd === 'template' ? [] : uniqueTexts(values()), cmd === 'template');
        return report(cmd === 'template' ? '模板下载已开始' : '导出成功');
      }
      if (cmd === 'reload') {
        const task = await live.latest();
        if (!editor.open) return;
        locked = new Set(task.locked_comments);
        table.replaceChildren();
        task.comments.forEach(value => addRow(value, locked.has(value)));
        editor.querySelector('[data-conflict]').hidden = true;
        report(live.generated ? '已载入最新的评论。' : '已载入最新的评论和领取状态。');
        return renumber();
      }
      if (cmd === 'save') {
        const result = uniqueTexts(values());
        checkComments(result);
        saving = true;
        editor.querySelector('.dialog-inner').inert = true;
        try {
          await onSave(live?.generated ? editedRows() : result);
          editor.close();
        } catch (error) {
          if (live && error.status === 409) {
            editor.querySelector('[data-conflict]').hidden = false;
            report(`${error.message} 当前修改已保留，可导出后重新加载。`, true);
          } else report(error.message, true);
        } finally {
          saving = false;
          editor.querySelector('.dialog-inner').inert = false;
        }
        return;
      }
      if (cmd === 'paste') {
        const added = merge(paste.value.split(/\r\n?|\n/));
        paste.value = '';
        return report(`已添加 ${added} 条评论。`);
      }
      if (cmd === 'select') {
        const boxes = table.querySelectorAll('input:not(:disabled)');
        const select = table.querySelectorAll('input:checked').length !== boxes.length;
        for (const box of boxes) box.checked = select;
      } else if (cmd === 'remove-selected') {
        table.querySelectorAll('input:checked').forEach(box => box.closest('tr').remove());
      } else if (cmd === 'remove') {
        button.closest('tr').remove();
      } else if (cmd === 'add') {
        addRow('').querySelector('textarea').focus();
      }
      report('');
      renumber();
    } catch (error) {
      report(error.message, true);
    }
  });
  saved.forEach(value => addRow(value, locked.has(value)));
  renumber();
  editor.showModal();
}
