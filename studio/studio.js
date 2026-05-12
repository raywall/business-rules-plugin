'use strict';

/* ================================================================
   CONSTANTS
   ================================================================ */
const EXAMPLE_YAML = `id: "00000000-0000-4000-a000-000000000001"
name: Revisao de Pedido
description: Avalia cliente, estoque e valor final antes de aprovar o pedido.

input:
  customer_id:
    type: string
    label: "Cliente"
    description: "Identificador usado para buscar status e risco do cliente."
    example: "CUS-1001"
  order_id:
    type: string
    label: "Pedido"
    description: "Identificador usado para consultar estoque e rastrear a decisao."
    example: "ORD-9001"
  order_total:
    type: number
    label: "Valor do Pedido"
    description: "Valor bruto do pedido antes de taxas e descontos."
    example: 849.90

mocks:
  customer:
    source: "GET /customers/{input.customer_id}"
    data:
      id: "CUS-1001"
      status: "ACTIVE"
      risk_score: 18.0

  inventory:
    source: "GET /inventory/{input.order_id}"
    data:
      available: true
      warehouse: "SP-01"

steps:
  - name: Validar Entrada
    condition: "input.customer_id != '' && input.order_id != '' && input.order_total > 0.0"
    on_fail:
      action: ABORT
      message: "Pedido sem dados obrigatorios"

  - name: Buscar Cliente
    use_mock: customer
    assign: customer

  - name: Avaliar Cliente
    condition: "customer.status == 'ACTIVE' && customer.risk_score <= 70.0"
    on_fail:
      action: ABORT
      message: "Cliente bloqueado para aprovacao automatica"

  - name: Verificar Estoque
    use_mock: inventory
    assign: inventory
    condition: "inventory.available == true"
    on_fail:
      action: ABORT
      message: "Estoque indisponivel"

  - name: Calcular Totais
    assign: totals
    compute:
      - name: fee
        expr: "input.order_total * 0.05"
      - name: final_total
        expr: "input.order_total + (input.order_total * 0.05)"

  - name: Resultado Final
    result:
      - name: status
        expr: "'APPROVED'"
      - name: order_id
        expr: "input.order_id"
      - name: warehouse
        expr: "inventory.warehouse"
      - name: final_total
        expr: "totals.final_total"
`;

const NEW_USECASE_TEMPLATE = (id) => `id: "${id}"
name: Novo Usecase
description: Descreva o objetivo deste usecase.

input:
  campo:
    type: string
    label: "Campo"
    example: "valor"

steps:
  - name: Resultado
    result:
      - name: status
        expr: "'OK'"
`;

/* ================================================================
   ID MANAGEMENT
   ================================================================ */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function ensureFileId(text, handle) {
  try {
    const doc = jsyaml.load(text);
    if (doc && typeof doc === 'object' && doc.id) return text;
  } catch (_) { return text; }

  const updated = `id: "${generateId()}"\n` + text;
  if (handle) {
    try { await FS.writeFile(handle, updated); } catch (_) { /* silencioso */ }
  }
  return updated;
}

/* ================================================================
   DOM REFS
   ================================================================ */
const $ = id => document.getElementById(id);

const el = {
  source: $('rulesSource'),
  lineNumbers: $('editorLineNumbers'),
  lint: $('editorLint'),
  stats: $('editorStats'),
  fileInput: $('scriptFileInput'),
  importBtn: $('importScript'),
  exportBtn: $('exportScript'),
  exampleBtn: $('restoreExample'),
  renderBtn: $('renderRules'),
  saveBtn: $('saveFileBtn'),
  viewer: $('viewer'),
  rulesTitle: $('rulesTitle'),
  toggleTheme: $('toggleTheme'),
  setSerial: $('setSerial'),
  setEngine: $('setEngine'),
  workspacePanel: $('workspacePanel'),
  workspaceName: $('workspaceName'),
  workspaceTree: $('workspaceTree'),
  openWorkspaceBtn: $('openWorkspaceBtn'),
  newServiceBtn: $('newServiceBtn'),
  newUsecaseBtn: $('newUsecaseBtn'),
  collapseWorkspaceBtn: $('collapseWorkspaceBtn'),
  refreshWorkspaceBtn: $('refreshWorkspaceBtn'),
  breadcrumb: $('editorBreadcrumb'),
};

/* ================================================================
   STATE
   ================================================================ */
const state = {
  workspace: {
    rootHandle: null,
    name: null,
    tree: []
  },
  current: {
    fileHandle: null,
    serviceName: null,
    fileName: null
  },
  dirty: false,
  collapsed: false,
  theme: localStorage.getItem('STUDIO_THEME') || 'dark'
};

/* ================================================================
   UTILITIES
   ================================================================ */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================
   CONTEXT MENU
   ================================================================ */
const ContextMenu = {
  el: null,

  show(x, y, items) {
    this.dismiss();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';

    items.forEach(item => {
      if (item.sep) {
        menu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'ctx-item' + (item.danger ? ' ctx-item--danger' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', () => { item.action(); this.dismiss(); });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    this.el = menu;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = (x - r.width) + 'px';
      if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + 'px';
    });

    setTimeout(() => {
      document.addEventListener('click', () => this.dismiss(), { once: true });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.dismiss(); }, { once: true });
    }, 0);
  },

  dismiss() { this.el?.remove(); this.el = null; }
};

/* ================================================================
   ACTIONS — shell (augmentado pelos arquivos de domínio)
   ================================================================ */
const Actions = {};

/* ================================================================
   INIT
   ================================================================ */
function init() {
  document.body.dataset.theme = state.theme;
  el.toggleTheme.textContent = state.theme === 'light' ? 'Dark' : 'Light';

  if (el.newServiceBtn) el.newServiceBtn.disabled = true;
  if (el.newUsecaseBtn) el.newUsecaseBtn.disabled = true;
  if (el.refreshWorkspaceBtn) el.refreshWorkspaceBtn.disabled = true;

  Editor.init();
  WorkspaceUI.render();

  el.openWorkspaceBtn?.addEventListener('click', () => Actions.openWorkspace());
  el.newServiceBtn?.addEventListener('click', () => Actions.newService());
  el.newUsecaseBtn?.addEventListener('click', () => Actions.newUsecaseInActiveOrFirst());
  el.collapseWorkspaceBtn?.addEventListener('click', () => Actions.toggleWorkspacePanel());
  el.refreshWorkspaceBtn?.addEventListener('click', () => Actions.refreshWorkspace());

  el.importBtn.addEventListener('click', () => Actions.importFile());
  el.exportBtn.addEventListener('click', () => Actions.exportFile());
  el.exampleBtn.addEventListener('click', () => Actions.loadExample());
  el.renderBtn.addEventListener('click', () => Actions.render());
  el.saveBtn?.addEventListener('click', () => Actions.saveFile());

  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = e => { Editor.set(e.target.result); state.dirty = false; };
    r.readAsText(file);
    el.fileInput.value = '';
  });

  el.toggleTheme.addEventListener('click', () => Actions.toggleTheme());
  el.setSerial.addEventListener('click', () => Actions.configureSerial());
  el.setEngine.addEventListener('click', () => Actions.configureEngine());

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Actions.saveFile();
    }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  initSidebarResize();
  initWsDividerResize();
}

/* ================================================================
   RESIZE — sidebar horizontal
   ================================================================ */
function initSidebarResize() {
  const sidebar = document.querySelector('.studio-sidebar');
  const rail = document.querySelector('.sidebar-rail');
  if (!sidebar || !rail) return;

  let dragging = false, startX = 0, startW = 0;

  rail.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true; startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    rail.classList.add('sidebar-rail--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const minW = parseInt(getComputedStyle(sidebar).minWidth) || 220;
    const maxW = Math.round(window.innerWidth * 0.70);
    sidebar.style.width = Math.max(minW, Math.min(maxW, startW + (e.clientX - startX))) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('sidebar-rail--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

/* ================================================================
   RESIZE — workspace ↔ editor (vertical)
   ================================================================ */
function initWsDividerResize() {
  const divider = document.getElementById('wsDivider');
  const wsPanel = document.getElementById('workspacePanel');
  if (!divider || !wsPanel) return;

  let dragging = false, startY = 0, startH = 0;

  divider.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true; startY = e.clientY;
    startH = wsPanel.getBoundingClientRect().height;
    divider.classList.add('ws-divider--dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging || wsPanel.classList.contains('ws-panel--collapsed')) return;
    const sidebar = document.querySelector('.studio-sidebar');
    const headerH = document.querySelector('.sidebar-header')?.getBoundingClientRect().height || 0;
    const footerH = document.querySelector('.sidebar-footer')?.getBoundingClientRect().height || 0;
    const available = sidebar.getBoundingClientRect().height - headerH - footerH - 5;
    wsPanel.style.height = Math.max(36, Math.min(available - 120, startH + (e.clientY - startY))) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('ws-divider--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

document.addEventListener('DOMContentLoaded', init);