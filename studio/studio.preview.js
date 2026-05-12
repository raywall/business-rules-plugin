'use strict';

/* ================================================================
   PLUGIN BRIDGE
   Detecta a API exposta pelo process-plugin.js e fornece uma função
   única `pluginRender(container, yamlText)` para o Studio usar.

   O process-plugin.js pode expor a função de render com qualquer
   destes nomes. O Studio tenta todos em ordem até encontrar um
   que funcione. Quando nenhum é encontrado, exibe diagnóstico.
   ================================================================ */
const PluginBridge = {

  /**
   * Tenta renderizar o YAML dentro do container usando a API
   * do process-plugin.js. Retorna true se bem-sucedido.
   *
   * Estratégias tentadas:
   *  1. Funções globais diretas (nomes mais prováveis)
   *  2. Namespace window.ProcessPlugin / window.processPlugin
   *  3. Injetar bloco DOM e chamar re-scan do plugin
   *  4. Injetar bloco DOM e disparar CustomEvent de re-scan
   */
  async render(container, yamlText) {
    // ── Estratégia 1: função global direta ──
    const globalFns = [
      'renderProcess',
      'renderProcessBlock',
      'renderBusinessRule',
      'initProcessBlock',
    ];
    for (const fn of globalFns) {
      if (typeof window[fn] === 'function') {
        await window[fn](container, yamlText);
        return true;
      }
    }

    // ── Estratégia 2: namespace de objeto ──
    const namespaces = [
      window.ProcessPlugin,
      window.processPlugin,
      window.BusinessRulesPlugin,
      window.businessRulesPlugin,
    ];
    for (const ns of namespaces) {
      if (!ns) continue;
      const directMethod = ns.render || ns.renderProcess || ns.renderBlock;
      if (typeof directMethod === 'function') {
        await directMethod.call(ns, container, yamlText);
        return true;
      }
      if (typeof ns.init === 'function') {
        container.appendChild(this._createProcessBlock(yamlText));
        await ns.init();
        return true;
      }
    }

    // ── Estratégia 3: injetar bloco e chamar re-scan ──
    const block = this._createProcessBlock(yamlText);
    container.appendChild(block);

    const scanFns = [
      'initProcessBlocks',
      'scanProcessBlocks',
      'renderProcessBlocks',
      'processAllBlocks',
    ];
    for (const fn of scanFns) {
      if (typeof window[fn] === 'function') {
        await window[fn](container);
        return true;
      }
    }

    // ── Estratégia 4: CustomEvent de re-scan ──
    const events = ['process-init', 'rules-init', 'plugin-init'];
    for (const evt of events) {
      container.dispatchEvent(new CustomEvent(evt, { bubbles: true, detail: { container } }));
    }

    // Se o bloco foi processado pelo plugin via evento, o conteúdo
    // terá sido substituído. Verifica se ainda é um <pre> cru.
    if (container.querySelector('pre') && !container.querySelector('.process-block, .rule-block, [data-processed]')) {
      // Nenhuma estratégia funcionou — mostra diagnóstico
      container.innerHTML = '';
      container.appendChild(this._createDiagnostic());
      return false;
    }

    return true;
  },

  /** Cria o bloco DOM que o plugin espera para blocos `process` */
  _createProcessBlock(yamlText) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-process';
    code.textContent = yamlText;
    pre.appendChild(code);
    return pre;
  },

  /** UI de diagnóstico quando nenhuma API é encontrada */
  _createDiagnostic() {
    const div = document.createElement('div');
    div.className = 'preview-diagnostic';

    // Lista as APIs encontradas no window para ajudar no debug
    const found = Object.keys(window).filter(k =>
      /process|plugin|rules|render|block/i.test(k) &&
      typeof window[k] === 'function'
    ).slice(0, 12);

    div.innerHTML = `
      <div class="preview-diagnostic-icon">⚠</div>
      <h3>Plugin não conectado</h3>
      <p>
        O <code>process-plugin.js</code> está carregado, mas não expõe
        uma função de render reconhecida pelo Studio.
      </p>
      <p>
        Abra o console do navegador e execute <code>Object.keys(window)</code>
        para localizar a função correta, depois adicione-a à lista em
        <code>studio.preview.js → PluginBridge.render()</code>.
      </p>
      ${found.length ? `<p class="preview-diagnostic-hint">Possíveis candidatos encontrados: <code>${found.join(', ')}</code></p>` : ''}
    `;
    return div;
  }
};

/* ================================================================
   ACTIONS — preview domain
   ================================================================ */
Object.assign(Actions, {

  async render() {
    const yaml = Editor.get().trim();
    if (!yaml) return;

    let doc;
    try {
      doc = jsyaml.load(yaml);
    } catch (e) {
      alert('YAML inválido:\n' + e.message);
      return;
    }

    el.rulesTitle.textContent = doc?.name || 'Simulador';
    el.viewer.innerHTML = '';

    await PluginBridge.render(el.viewer, yaml);
    this.applyPreviewTheme();
  },

  toggleTheme() {
    const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = next;
    localStorage.setItem(STORAGE_KEYS.theme, next);
    el.toggleTheme.textContent = next === 'light' ? 'Dark' : 'Light';
    this.applyPreviewTheme();
  },

  applyPreviewTheme() {
    const isLight = document.body.dataset.theme === 'light';
    el.viewer.querySelectorAll('.pe-widget').forEach(widget => {
      widget.classList.toggle('pe-theme-clear', isLight);
    });
  },

  configureSerial() {
    const val = prompt('Serial de autenticação (UUID):', window.PROCESS_ENGINE_SERIAL || '');
    if (val === null) return;
    window.PROCESS_ENGINE_SERIAL = val;
    sessionStorage.setItem('PROCESS_ENGINE_SERIAL', val);
  },

  configureEngine() {
    const val = prompt('URL do backend:', window.PROCESS_ENGINE_URL || '');
    if (val === null) return;
    window.PROCESS_ENGINE_URL = val;
    localStorage.setItem('PROCESS_ENGINE_URL', val);
  },

  toggleWorkspacePanel() {
    const panel = el.workspacePanel;
    const nextCollapsed = !state.collapsed;
    if (nextCollapsed) {
      const currentHeight = panel.getBoundingClientRect().height;
      if (currentHeight > 36) {
        panel._savedHeight = currentHeight;
        localStorage.setItem(STORAGE_KEYS.workspaceHeight, String(Math.round(currentHeight)));
      }
    }

    state.collapsed = nextCollapsed;
    panel.classList.toggle('ws-panel--collapsed', state.collapsed);
    el.collapseWorkspaceBtn.textContent = state.collapsed ? '▸' : '▾';
    el.collapseWorkspaceBtn.title = state.collapsed ? 'Expandir workspace' : 'Recolher workspace';
    localStorage.setItem(STORAGE_KEYS.workspaceCollapsed, String(state.collapsed));
    if (!state.collapsed) {
      const savedHeight = Number.parseInt(localStorage.getItem(STORAGE_KEYS.workspaceHeight) || '', 10);
      const memoryHeight = Number.isFinite(panel._savedHeight) && panel._savedHeight > 36 ? panel._savedHeight : null;
      const persistedHeight = Number.isFinite(savedHeight) && savedHeight > 36 ? savedHeight : null;
      const restoreHeight = memoryHeight || persistedHeight || 260;
      panel.style.height = restoreHeight + 'px';
    }
  }
});

window.PROCESS_ENGINE_RESOLVE_LINKS = async function resolveWorkspaceLinks(proc) {
  const resolved = [];
  const seen = new Set();

  async function visit(processDoc) {
    if (!processDoc || !Array.isArray(processDoc.links)) return;

    for (const link of processDoc.links) {
      if (!link || !link.service || !link.usecase) continue;

      const serviceName = String(link.service);
      const usecaseName = normalizeUsecaseName(link.usecase);
      const key = `${serviceName}/${usecaseName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const file = findWorkspaceFile(serviceName, usecaseName);
      if (!file) {
        throw new Error(`Usecase interligado nao encontrado no workspace: ${key}`);
      }

      const yaml = await FS.readFile(file.handle);
      resolved.push({ service: serviceName, usecase: usecaseName, yaml });

      try {
        await visit(jsyaml.load(yaml));
      } catch (error) {
        throw new Error(`Erro lendo links de ${key}: ${error.message}`);
      }
    }
  }

  await visit(proc);
  return resolved;
};

function normalizeUsecaseName(usecase) {
  const name = String(usecase).trim();
  return /\.(yaml|yml)$/i.test(name) ? name : `${name}.yaml`;
}

function findWorkspaceFile(serviceName, usecaseName) {
  const service = state.workspace.tree.find(item => item.name === serviceName);
  if (!service) return null;
  return service.children.find(file => file.name === usecaseName) || null;
}
