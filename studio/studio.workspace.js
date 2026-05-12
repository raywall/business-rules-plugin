'use strict';

/* ================================================================
   FILE SYSTEM (File System Access API)
   ================================================================ */
const FS = {
  supported: typeof window.showDirectoryPicker === 'function',

  async openWorkspace() {
    if (!this.supported) {
      alert(
        'Workspace requer a File System Access API.\n' +
        'Use Chrome 86+ ou Edge 86+ para usar esta funcionalidade.'
      );
      return false;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.workspace.rootHandle = handle;
      state.workspace.name = handle.name;
      state.workspace.tree = await this.buildTree(handle);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Workspace error:', e);
      return false;
    }
  },

  async buildTree(dirHandle) {
    const nodes = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      if (handle.kind === 'directory') {
        const children = [];
        for await (const [fname, fhandle] of handle.entries()) {
          if (fhandle.kind === 'file' && /\.(yaml|yml)$/i.test(fname)) {
            children.push({ name: fname, handle: fhandle, type: 'file' });
          }
        }
        children.sort((a, b) => a.name.localeCompare(b.name));
        nodes.push({ name, handle, type: 'dir', expanded: false, children });
      }
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  },

  async readFile(handle) {
    const file = await handle.getFile();
    return file.text();
  },

  async writeFile(handle, text) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  },

  async createDir(parentHandle, name) {
    return parentHandle.getDirectoryHandle(name, { create: true });
  },

  async createFile(dirHandle, fileName, content) {
    const handle = await dirHandle.getFileHandle(fileName, { create: true });
    await this.writeFile(handle, content);
    return handle;
  }
};

/* ================================================================
   WORKSPACE UI
   ================================================================ */
const WorkspaceUI = {

  render() {
    const panel = el.workspaceTree;

    if (!state.workspace.rootHandle) {
      panel.innerHTML = `
        <div class="ws-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 7a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293L10.414 6.4A1 1 0 0 0 11.121 6.7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
          </svg>
          <p>Nenhum workspace aberto</p>
          <button class="text-button text-button--primary ws-open-hint">Abrir pasta</button>
        </div>`;
      panel.querySelector('.ws-open-hint')?.addEventListener('click', () => Actions.openWorkspace());
      this.updateBreadcrumb();
      return;
    }

    const tree = state.workspace.tree;
    if (tree.length === 0) {
      panel.innerHTML = `
        <div class="ws-placeholder">
          <p>Workspace vazio</p>
          <small>Clique em "+ Serviço" para criar um microserviço</small>
        </div>`;
      this.updateBreadcrumb();
      return;
    }

    panel.innerHTML = tree.map(s => this._renderService(s)).join('');
    this._bindTreeEvents(panel, tree);
    this.updateBreadcrumb();
  },

  _renderService(node) {
    const isActive = state.current.serviceName === node.name;
    const chevron = node.expanded ? '▾' : '▸';
    const filesHtml = node.expanded ? node.children.map(f => this._renderFile(node.name, f)).join('') : '';

    return `
      <div class="ws-service${isActive ? ' ws-service--active' : ''}">
        <div class="ws-service-header" data-service="${esc(node.name)}">
          <span class="ws-chevron">${chevron}</span>
          <span class="ws-service-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 7a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293L10.414 6.4A1 1 0 0 0 11.121 6.7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
            </svg>
          </span>
          <span class="ws-service-name">${esc(node.name)}</span>
          <span class="ws-badge">${node.children.length}</span>
        </div>
        <div class="ws-files">${filesHtml}</div>
      </div>`;
  },

  _renderFile(serviceName, node) {
    const isActive = state.current.serviceName === serviceName && state.current.fileName === node.name;
    const displayName = node.name.replace(/\.(yaml|yml)$/i, '');
    const dirtyMark = isActive && state.dirty ? '<span class="ws-dirty">●</span>' : '';

    return `
      <div class="ws-file${isActive ? ' ws-file--active' : ''}" data-service="${esc(serviceName)}" data-file="${esc(node.name)}">
        <span class="ws-file-icon">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </span>
        <span class="ws-file-name">${esc(displayName)}</span>
        ${dirtyMark}
      </div>`;
  },

  _bindTreeEvents(panel, tree) {
    panel.querySelectorAll('.ws-service-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const node = tree.find(n => n.name === hdr.dataset.service);
        if (node) { node.expanded = !node.expanded; this.render(); }
      });
      hdr.addEventListener('contextmenu', e => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: '＋  Novo usecase', action: () => Actions.newUsecase(hdr.dataset.service) },
          { sep: true },
          { label: '✕  Remover do workspace', action: () => Actions.removeService(hdr.dataset.service), danger: true }
        ]);
      });
    });

    panel.querySelectorAll('.ws-file').forEach(item => {
      item.addEventListener('click', () => Actions.openFile(item.dataset.service, item.dataset.file));
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: '✕  Remover do workspace', action: () => Actions.removeUsecase(item.dataset.service, item.dataset.file), danger: true }
        ]);
      });
    });
  },

  updateBreadcrumb() {
    if (!el.breadcrumb) return;
    const { serviceName, fileName } = state.current;
    const ws = state.workspace.name;
    if (!ws) { el.breadcrumb.innerHTML = ''; return; }
    const displayFile = fileName ? fileName.replace(/\.(yaml|yml)$/i, '') : null;
    el.breadcrumb.innerHTML = [
      `<span class="crumb ws-crumb">${esc(ws)}</span>`,
      serviceName ? `<span class="crumb-sep">›</span><span class="crumb">${esc(serviceName)}</span>` : '',
      displayFile ? `<span class="crumb-sep">›</span><span class="crumb crumb--active">${esc(displayFile)}</span>` : ''
    ].join('');
  }
};

/* ================================================================
   ACTIONS — workspace domain
   ================================================================ */
Object.assign(Actions, {

  async openWorkspace() {
    const ok = await FS.openWorkspace();
    if (!ok) return;
    el.workspaceName.textContent = state.workspace.name;
    el.newServiceBtn.disabled = false;
    el.newUsecaseBtn.disabled = false;
    el.refreshWorkspaceBtn.disabled = false;
    WorkspaceUI.render();
  },

  async refreshWorkspace() {
    if (!state.workspace.rootHandle) return;
    const expanded = {};
    state.workspace.tree.forEach(s => { expanded[s.name] = s.expanded; });
    state.workspace.tree = await FS.buildTree(state.workspace.rootHandle);
    state.workspace.tree.forEach(s => { s.expanded = expanded[s.name] || false; });
    WorkspaceUI.render();
  },

  async newService() {
    if (!state.workspace.rootHandle) return;
    const raw = prompt('Nome do microserviço:');
    if (!raw?.trim()) return;
    const name = raw.trim().toLowerCase().replace(/[\s/\\]+/g, '-');

    if (state.workspace.tree.find(s => s.name === name)) {
      alert(`O microserviço "${name}" já existe neste workspace.`);
      return;
    }
    try {
      const handle = await FS.createDir(state.workspace.rootHandle, name);
      state.workspace.tree.push({ name, handle, type: 'dir', expanded: true, children: [] });
      state.workspace.tree.sort((a, b) => a.name.localeCompare(b.name));
      WorkspaceUI.render();
    } catch (e) { alert('Erro ao criar serviço: ' + e.message); }
  },

  async newUsecase(serviceName) {
    const service = state.workspace.tree.find(s => s.name === serviceName);
    if (!service) return;

    const raw = prompt(`Novo usecase em "${serviceName}":`);
    if (!raw?.trim()) return;
    const base = raw.trim().toLowerCase().replace(/[\s/\\]+/g, '-').replace(/\.(yaml|yml)$/i, '');
    const fileName = base + '.yaml';

    if (service.children.find(f => f.name === fileName)) {
      alert(`O usecase "${fileName}" já existe em "${serviceName}".`);
      return;
    }
    const content = NEW_USECASE_TEMPLATE(generateId());
    try {
      const handle = await FS.createFile(service.handle, fileName, content);
      service.children.push({ name: fileName, handle, type: 'file' });
      service.children.sort((a, b) => a.name.localeCompare(b.name));
      service.expanded = true;
      WorkspaceUI.render();
      await Actions.openFile(serviceName, fileName);
    } catch (e) { alert('Erro ao criar usecase: ' + e.message); }
  },

  async newUsecaseInActiveOrFirst() {
    const tree = state.workspace.tree;
    if (!tree.length) { alert('Crie um microserviço primeiro.'); return; }
    if (state.current.serviceName) { await this.newUsecase(state.current.serviceName); return; }
    if (tree.length === 1) { await this.newUsecase(tree[0].name); return; }
    const names = tree.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const raw = prompt(`Escolha o microserviço (número ou nome):\n${names}`);
    if (!raw) return;
    const num = parseInt(raw, 10);
    const target = Number.isFinite(num) ? tree[num - 1]?.name : raw.trim();
    if (target) await this.newUsecase(target);
  },

  removeService(serviceName) {
    if (!confirm(`Remover "${serviceName}" do workspace?\n(A pasta não será excluída do disco.)`)) return;
    state.workspace.tree = state.workspace.tree.filter(s => s.name !== serviceName);
    if (state.current.serviceName === serviceName) {
      state.current = { fileHandle: null, serviceName: null, fileName: null };
      state.dirty = false;
    }
    WorkspaceUI.render();
  },

  removeUsecase(serviceName, fileName) {
    if (!confirm(`Remover "${fileName}" do workspace?\n(O arquivo não será excluído do disco.)`)) return;
    const service = state.workspace.tree.find(s => s.name === serviceName);
    if (service) service.children = service.children.filter(f => f.name !== fileName);
    if (state.current.fileName === fileName && state.current.serviceName === serviceName) {
      state.current = { fileHandle: null, serviceName: null, fileName: null };
      state.dirty = false;
      Editor.set('');
    }
    WorkspaceUI.render();
  }
});