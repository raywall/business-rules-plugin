'use strict';

/* ================================================================
   EDITOR
   ================================================================ */
const Editor = {
  _lintTimer: null,

  init() {
    el.source.addEventListener('input', () => {
      this.syncLineNumbers();
      this.updateStats();
      this.scheduleLint();
      if (state.workspace.rootHandle && state.current.fileHandle) {
        this.markDirty();
      }
    });

    el.source.addEventListener('scroll', () => {
      el.lineNumbers.scrollTop = el.source.scrollTop;
    });

    el.source.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = el.source.selectionStart;
        const v = el.source.value;
        el.source.value = v.slice(0, s) + '  ' + v.slice(el.source.selectionEnd);
        el.source.selectionStart = el.source.selectionEnd = s + 2;
        this.syncLineNumbers();
      }
    });

    this.syncLineNumbers();
    this.updateStats();
    this.lint();
  },

  syncLineNumbers() {
    const count = (el.source.value.match(/\n/g) || []).length + 1;
    if (parseInt(el.lineNumbers.dataset.count || 0) !== count) {
      el.lineNumbers.dataset.count = count;
      el.lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
    }
    el.lineNumbers.scrollTop = el.source.scrollTop;
  },

  scheduleLint() {
    clearTimeout(this._lintTimer);
    this._lintTimer = setTimeout(() => this.lint(), 420);
  },

  lint() {
    const v = el.source.value.trim();
    if (!v) { this.setLint('info', 'Editor vazio'); return; }
    try {
      const doc = jsyaml.load(v);
      if (!doc || typeof doc !== 'object') { this.setLint('warn', 'YAML válido, mas não é um objeto'); return; }
      if (!doc.name) { this.setLint('warn', 'Campo name ausente'); return; }
      if (!doc.steps || !Array.isArray(doc.steps) || !doc.steps.length) {
        this.setLint('warn', 'Campo steps ausente ou vazio'); return;
      }
      const idFragment = doc.id
        ? `  ·  id: ${String(doc.id).slice(0, 8)}…`
        : '  ·  ⚠ sem id';
      this.setLint('ok', `✓ YAML válido — ${doc.steps.length} step(s)${idFragment}`);
    } catch (e) {
      this.setLint('error', 'Erro: ' + e.message.split('\n')[0]);
    }
  },

  setLint(type, msg) {
    el.lint.textContent = msg;
    el.lint.dataset.state = type;
  },

  updateStats() {
    const n = (el.source.value.match(/\n/g) || []).length + 1;
    el.stats.textContent = `${n} linha${n !== 1 ? 's' : ''}`;
  },

  set(text) {
    el.source.value = text;
    el.source.scrollTop = 0;
    this.syncLineNumbers();
    this.updateStats();
    this.lint();
  },

  get() { return el.source.value; },

  markDirty() {
    if (!state.dirty) { state.dirty = true; WorkspaceUI.render(); }
  },

  markClean() {
    state.dirty = false;
    WorkspaceUI.render();
  }
};

/* ================================================================
   ACTIONS — script-editor domain
   ================================================================ */
Object.assign(Actions, {

  async openFile(serviceName, fileName) {
    if (state.dirty) {
      const save = confirm(`"${state.current.fileName}" tem alterações não salvas.\nSalvar antes de continuar?`);
      if (save) await this.saveFile();
    }
    const service = state.workspace.tree.find(s => s.name === serviceName);
    const file = service?.children.find(f => f.name === fileName);
    if (!file) return;

    service.expanded = true;
    try {
      let text = await FS.readFile(file.handle);
      text = await ensureFileId(text, file.handle);
      state.current = { fileHandle: file.handle, serviceName, fileName };
      state.dirty = false;
      Editor.set(text);
      WorkspaceUI.render();
    } catch (e) { alert('Erro ao abrir arquivo: ' + e.message); }
  },

  async saveFile() {
    if (!state.current.fileHandle) return;
    try {
      await FS.writeFile(state.current.fileHandle, Editor.get());
      Editor.markClean();
      this._showSaveFeedback();
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
  },

  _showSaveFeedback() {
    const btn = el.saveBtn;
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Salvo';
    btn.classList.add('text-button--saved');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('text-button--saved'); }, 1500);
  },

  importFile() { el.fileInput.click(); },

  exportFile() {
    const yaml = Editor.get();
    const name = state.current.fileName || 'script.yaml';
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: name
    });
    a.click();
    URL.revokeObjectURL(a.href);
  },

  loadExample() {
    if (state.dirty && !confirm('Descartar alterações não salvas?')) return;
    Editor.set(EXAMPLE_YAML);
    state.dirty = false;
    WorkspaceUI.render();
  }
});