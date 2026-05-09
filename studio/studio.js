(function () {
  'use strict';

  const editor = document.getElementById('rulesSource');
  const lineNumbers = document.getElementById('editorLineNumbers');
  const lint = document.getElementById('editorLint');
  const stats = document.getElementById('editorStats');
  const viewer = document.getElementById('viewer');
  const title = document.getElementById('rulesTitle');
  const fileInput = document.getElementById('scriptFileInput');
  const themeButton = document.getElementById('toggleTheme');

  const samplePath = './examples/ecommerce-order-review.yaml';

  applyTheme(localStorage.getItem('BUSINESS_RULES_STUDIO_THEME') || 'dark');

  document.getElementById('renderRules').addEventListener('click', renderRules);
  document.getElementById('restoreExample').addEventListener('click', loadExample);
  document.getElementById('importScript').addEventListener('click', () => fileInput.click());
  document.getElementById('exportScript').addEventListener('click', exportScript);
  document.getElementById('setSerial').addEventListener('click', configureSerial);
  document.getElementById('setEngine').addEventListener('click', configureEngine);
  themeButton.addEventListener('click', toggleTheme);
  fileInput.addEventListener('change', importScript);

  editor.addEventListener('input', () => {
    updateEditorMeta();
    lintYaml();
  });
  editor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = editor.scrollTop;
  });
  editor.addEventListener('keydown', handleEditorKeydown);

  loadExample();

  async function loadExample() {
    const res = await fetch(samplePath);
    editor.value = await res.text();
    updateEditorMeta();
    lintYaml();
    renderRules();
  }

  function renderRules() {
    const parsed = lintYaml();
    if (!parsed.ok) return;
    if (!window.ProcessPlugin || typeof window.ProcessPlugin.init !== 'function') {
      lint.textContent = 'Plugin web nao carregado. Verifique se /plugin/process-plugin.js esta publicado.';
      lint.className = 'editor-lint is-error';
      return;
    }

    title.textContent = parsed.data.name || 'Simulador';
    viewer.innerHTML = [
      '<div class="language-process highlighter-rouge">',
      '<div class="highlight">',
      '<pre class="highlight"><code></code></pre>',
      '</div>',
      '</div>',
    ].join('');
    viewer.querySelector('code').textContent = editor.value;
    window.ProcessPlugin.init();
  }

  function lintYaml() {
    try {
      const data = window.jsyaml.load(editor.value) || {};
      const validation = validateRules(data);
      if (!validation.ok) {
        lint.textContent = validation.message;
        lint.className = 'editor-lint is-error';
        return { ok: false, data };
      }

      lint.textContent = `Script valido · ${data.steps.length} steps`;
      lint.className = 'editor-lint is-ok';
      return { ok: true, data };
    } catch (error) {
      lint.textContent = error.message;
      lint.className = 'editor-lint is-error';
      return { ok: false, data: null };
    }
  }

  function validateRules(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, message: 'Script invalido: o YAML raiz precisa ser um objeto.' };
    }
    if (!data.name || typeof data.name !== 'string') {
      return { ok: false, message: 'Script invalido: informe o campo name.' };
    }
    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      return { ok: false, message: 'Script invalido: informe steps com pelo menos um item.' };
    }

    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        return { ok: false, message: `Script invalido: step ${i + 1} precisa ser um objeto.` };
      }
      if (!step.name || typeof step.name !== 'string') {
        return { ok: false, message: `Script invalido: step ${i + 1} precisa de name.` };
      }
      const hasAction = Boolean(step.use_mock || step.condition || step.compute || step.result);
      if (!hasAction) {
        return { ok: false, message: `Script invalido: step ${i + 1} precisa de use_mock, condition, compute ou result.` };
      }
    }

    return { ok: true, message: '' };
  }

  function updateEditorMeta() {
    const lines = editor.value.split('\n').length;
    lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    stats.textContent = `${lines} linhas`;
  }

  function handleEditorKeydown(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const indent = '  ';

    if (start !== end && value.slice(start, end).includes('\n')) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const selected = value.slice(lineStart, end);
      const replacement = selected.split('\n').map(line => indent + line).join('\n');
      editor.value = value.slice(0, lineStart) + replacement + value.slice(end);
      editor.selectionStart = lineStart;
      editor.selectionEnd = lineStart + replacement.length;
    } else {
      editor.value = value.slice(0, start) + indent + value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + indent.length;
    }

    updateEditorMeta();
    lintYaml();
  }

  function configureSerial() {
    const current = sessionStorage.getItem('PROCESS_ENGINE_SERIAL') || window.PROCESS_ENGINE_SERIAL || '';
    const next = window.prompt('Número de série', current);
    if (!next) return;
    window.PROCESS_ENGINE_SERIAL = next.trim();
    sessionStorage.setItem('PROCESS_ENGINE_SERIAL', window.PROCESS_ENGINE_SERIAL);
  }

  function configureEngine() {
    const current = window.PROCESS_ENGINE_URL || 'https://rules.raysouz.studio';
    const next = window.prompt('Backend URL', current);
    if (!next) return;
    window.PROCESS_ENGINE_URL = next.trim();
    localStorage.setItem('PROCESS_ENGINE_URL', window.PROCESS_ENGINE_URL);
    window.location.reload();
  }

  function importScript() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      editor.value = String(reader.result || '');
      updateEditorMeta();
      lintYaml();
      renderRules();
      fileInput.value = '';
    };
    reader.readAsText(file);
  }

  function exportScript() {
    const blob = new Blob([editor.value], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rules.yaml';
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'clear' ? 'dark' : 'clear';
    applyTheme(next);
    renderRules();
  }

  function applyTheme(theme) {
    const normalized = theme === 'clear' || theme === 'light' ? 'clear' : 'dark';
    document.documentElement.dataset.theme = normalized;
    localStorage.setItem('BUSINESS_RULES_STUDIO_THEME', normalized);
    themeButton.textContent = normalized === 'clear' ? 'Dark' : 'Light';
  }
}());
