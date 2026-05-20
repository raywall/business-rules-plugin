'use strict';

/* ================================================================
   EDITOR
   ================================================================ */
const Editor = {
  _lintTimer: null,
  _stepBlocks: [],
  _activeStepKey: null,

  init() {
    el.source.addEventListener('input', () => {
      this.syncLineNumbers();
      this.updateStepMarkers();
      this.updateStats();
      this.scheduleLint();
      if (state.workspace.rootHandle && state.current.fileHandle) {
        this.markDirty();
      }
    });

    el.source.addEventListener('scroll', () => {
      el.lineNumbers.scrollTop = el.source.scrollTop;
      this.positionStepMarkers();
    });

    window.addEventListener('resize', () => this.positionStepMarkers());

    el.source.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = el.source.selectionStart;
        const v = el.source.value;
        el.source.value = v.slice(0, s) + '  ' + v.slice(el.source.selectionEnd);
        el.source.selectionStart = el.source.selectionEnd = s + 2;
        this.syncLineNumbers();
        this.updateStepMarkers();
      }
    });

    this.syncLineNumbers();
    this.updateStepMarkers();
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
    this.updateStepMarkers();
    this.updateStats();
    this.lint();
  },

  get() { return el.source.value; },

  updateStepMarkers() {
    this._stepBlocks = this.findStepBlocks(el.source.value);
    this.renderStepMarkers();
  },

  findStepBlocks(text) {
    const lines = text.split('\n');
    const stepsLine = lines.findIndex(line => /^steps\s*:\s*(?:#.*)?$/.test(line.trim()));
    if (stepsLine < 0) return [];

    const blocks = [];
    let inSteps = false;
    let stepsIndent = 0;
    let current = null;

    for (let index = stepsLine; index < lines.length; index++) {
      const raw = lines[index];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = raw.match(/^\s*/)[0].length;

      if (!inSteps) {
        stepsIndent = indent;
        inSteps = true;
        continue;
      }

      if (indent <= stepsIndent && !trimmed.startsWith('- ')) break;

      const stepMatch = raw.match(/^(\s*)-\s+name\s*:\s*(.+?)\s*(?:#.*)?$/);
      if (stepMatch) {
        if (current) {
          current.endLine = index;
          blocks.push(current);
        }
        const name = this.cleanYamlScalar(stepMatch[2]);
        current = {
          index: blocks.length,
          key: this.stepKey(blocks.length, name),
          name,
          startLine: index + 1,
          endLine: index + 1,
        };
      }
    }

    if (current) {
      current.endLine = lines.length;
      blocks.push(current);
    }
    return blocks;
  },

  cleanYamlScalar(value) {
    const trimmed = String(value || '').trim();
    return trimmed.replace(/^['"]|['"]$/g, '');
  },

  stepKey(index, name) {
    return `${index}:${String(name || '').trim().toLowerCase()}`;
  },

  renderStepMarkers() {
    if (!el.stepOverlay) return;
    el.stepOverlay.innerHTML = '';
    this._stepBlocks.forEach(block => {
      const marker = document.createElement('div');
      marker.className = 'editor-step-marker';
      marker.dataset.stepKey = block.key;
      marker.innerHTML = `<span>${block.index + 1}</span>`;
      el.stepOverlay.appendChild(marker);
    });
    this.positionStepMarkers();
  },

  positionStepMarkers() {
    if (!el.stepOverlay) return;
    const sourceStyle = window.getComputedStyle(el.source);
    const lineHeight = Number.parseFloat(sourceStyle.lineHeight) || 19.2;
    const paddingTop = Number.parseFloat(sourceStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(sourceStyle.paddingBottom) || 0;
    const lineNumbersWidth = el.lineNumbers?.getBoundingClientRect().width || 0;

    el.stepOverlay.style.left = `${lineNumbersWidth}px`;
    el.stepOverlay.style.top = '0px';
    el.stepOverlay.style.bottom = '0px';

    el.stepOverlay.querySelectorAll('.editor-step-marker').forEach(marker => {
      const block = this._stepBlocks.find(item => item.key === marker.dataset.stepKey);
      if (!block) return;
      const top = paddingTop + ((block.startLine - 1) * lineHeight) - el.source.scrollTop;
      const height = Math.max(lineHeight, ((block.endLine - block.startLine + 1) * lineHeight) - paddingBottom);
      marker.style.top = `${top}px`;
      marker.style.height = `${height}px`;
      marker.classList.toggle('editor-step-marker--active', block.key === this._activeStepKey);
    });
  },

  scrollToStep(step) {
    const block = this.resolveStepBlock(step);
    if (!block) return false;

    this._activeStepKey = block.key;
    this.positionStepMarkers();

    const sourceStyle = window.getComputedStyle(el.source);
    const lineHeight = Number.parseFloat(sourceStyle.lineHeight) || 19.2;
    const paddingTop = Number.parseFloat(sourceStyle.paddingTop) || 0;
    const targetTop = Math.max(0, ((block.startLine - 1) * lineHeight) - (el.source.clientHeight * 0.25) + paddingTop);

    el.source.focus({ preventScroll: true });
    el.source.scrollTo({ top: targetTop, behavior: 'smooth' });
    this.setSelectionForLine(block.startLine);
    return true;
  },

  resolveStepBlock(step) {
    if (!this._stepBlocks.length) this.updateStepMarkers();
    const service = String(step?.service || '').trim();
    const usecase = String(step?.usecase || '').trim();
    if (service && state.current.serviceName && service !== state.current.serviceName) return null;
    if (usecase && state.current.fileName && usecase !== state.current.fileName) return null;

    const name = String(step?.name || '').trim().toLowerCase();
    const absoluteIndex = Number.parseInt(step?.index ?? '', 10);
    const localIndex = Number.parseInt(step?.localIndex ?? '', 10);

    if (Number.isFinite(localIndex)) return this._stepBlocks[localIndex] || null;
    if (Number.isFinite(absoluteIndex) && this._stepBlocks[absoluteIndex]) return this._stepBlocks[absoluteIndex];
    return this._stepBlocks.find(block => block.name.trim().toLowerCase() === name) || null;
  },

  setSelectionForLine(lineNumber) {
    const lines = el.source.value.split('\n');
    const offset = lines.slice(0, Math.max(0, lineNumber - 1)).reduce((sum, line) => sum + line.length + 1, 0);
    el.source.setSelectionRange(offset, Math.min(el.source.value.length, offset + (lines[lineNumber - 1] || '').length));
  },

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

  async openFile(serviceName, fileName, options = {}) {
    if (state.dirty && !options.skipDirtyCheck) {
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
      StudioPersistence.saveCurrentFile();
      WorkspaceUI.render();
      if (typeof Actions.render === 'function') {
        await Actions.render();
      }
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
