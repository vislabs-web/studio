/* ═══════════════════════════════════════════════════════
   BRUTAL STUDIO v2.0 — script.js
   State Management, Canvas Logic, Tool Engines
═══════════════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────
   GLOBAL STATE
──────────────────────────────────────── */
const STATE = {
  currentTool:    'pen',
  activeCanvas:   null,    // DOM canvas element
  activeCtx:      null,    // 2D context
  activePageIdx:  0,

  // Drawing
  isDrawing:      false,
  startX:         0,
  startY:         0,
  lastX:          0,
  lastY:          0,
  snapshot:       null,    // ImageData for anti-ghosting

  // Brush
  brushColor:     '#000000',
  brushSize:      4,

  // Text
  ghostFont:      'Space Mono',
  ghostFontSize:  24,
  ghostX:         0,
  ghostY:         0,

  // Selection
  selX: 0, selY: 0, selW: 0, selH: 0,

  // Multi-page
  pages:          [],      // Array of { wrapper, canvas, ctx }
  pageCount:      0,
};

/* ────────────────────────────────────────
   DOM REFS
──────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const DOM = {
  workspace:        $('workspace'),
  canvasStack:      $('canvas-stack'),
  ghost:            $('ghost-input'),
  popup:            $('floating-popup'),
  popupClose:       $('popup-close'),
  popupSize:        $('popup-size'),
  popupSizeVal:     $('popup-size-val'),
  popupColorPicker: $('popup-color-picker'),
  popupFontSize:    $('popup-font-size'),
  popupFontSizeVal: $('popup-font-size-val'),
  popupSelectSect:  $('popup-select-actions'),
  popupBrush:       $('popup-brush'),
  popupColorSect:   $('popup-color-section'),
  popupFonts:       $('popup-fonts'),
  selFillBtn:       $('sel-fill-btn'),
  selDeleteBtn:     $('sel-delete-btn'),
  selFillColor:     $('sel-fill-color'),
  colorSidebar:     $('color-picker-sidebar'),
  sizeSidebar:      $('size-slider-sidebar'),
  sizeValue:        $('size-value'),
  statusTool:       $('status-tool'),
  statusPage:       $('status-page'),
  statusCoords:     $('status-coords'),
  btnNewPage:       $('btn-new-page'),
  btnClearPage:     $('btn-clear-page'),
  btnSave:          $('btn-save'),
  btnNuke:          $('btn-nuke'),
};

/* ────────────────────────────────────────
   PAGE MANAGEMENT
──────────────────────────────────────── */
function createPage() {
  STATE.pageCount++;
  const idx = STATE.pageCount;

  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.pageIdx = idx;

  const label = document.createElement('div');
  label.className = 'page-label';
  label.textContent = `PAGE ${idx}`;

  const canvas = document.createElement('canvas');
  canvas.width  = 800;
  canvas.height = 1000;
  canvas.className = 'canvas-el';
  canvas.dataset.pageIdx = idx;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  wrapper.appendChild(label);
  wrapper.appendChild(canvas);
  DOM.canvasStack.appendChild(wrapper);

  const pageData = { wrapper, canvas, ctx, idx };
  STATE.pages.push(pageData);

  // Attach events
  canvas.addEventListener('mousedown',  onMouseDown);
  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseup',    onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('click',      onCanvasClick);

  // Set as active
  setActivePage(pageData);
  updateStatus();
  return pageData;
}

function setActivePage(pageData) {
  // Remove active class from all
  $$('.canvas-el').forEach(c => c.classList.remove('active-canvas'));
  STATE.activeCanvas = pageData.canvas;
  STATE.activeCtx    = pageData.ctx;
  STATE.activePageIdx = pageData.idx;
  pageData.canvas.classList.add('active-canvas');
  updateStatus();
}

function clearActivePage() {
  if (!STATE.activeCtx) return;
  STATE.activeCtx.fillStyle = '#ffffff';
  STATE.activeCtx.fillRect(0, 0, STATE.activeCanvas.width, STATE.activeCanvas.height);
}

function nukeAll() {
  if (!confirm('NUKE ALL PAGES? This cannot be undone.')) return;
  DOM.canvasStack.innerHTML = '';
  STATE.pages = [];
  STATE.pageCount = 0;
  STATE.activeCanvas = null;
  STATE.activeCtx = null;
  createPage();
}

/* ────────────────────────────────────────
   COORDINATE HELPERS
──────────────────────────────────────── */
function getCanvasCoords(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top)  * scaleY),
  };
}

/* ────────────────────────────────────────
   CANVAS EVENT HANDLERS
──────────────────────────────────────── */
function onMouseDown(e) {
  if (e.button !== 0) return;
  const canvas = e.currentTarget;
  const pageData = STATE.pages.find(p => p.canvas === canvas);
  if (pageData) setActivePage(pageData);

  const { x, y } = getCanvasCoords(canvas, e);
  STATE.isDrawing = true;
  STATE.startX = x;
  STATE.startY = y;
  STATE.lastX  = x;
  STATE.lastY  = y;

  // Take snapshot for anti-ghosting (shapes, select)
  STATE.snapshot = STATE.activeCtx.getImageData(0, 0, canvas.width, canvas.height);

  // Tool-specific init
  if (STATE.currentTool === 'pen' || STATE.currentTool === 'eraser') {
    STATE.activeCtx.beginPath();
    STATE.activeCtx.moveTo(x, y);
  }
}

function onMouseMove(e) {
  const canvas = e.currentTarget;
  if (canvas !== STATE.activeCanvas) return;

  const { x, y } = getCanvasCoords(canvas, e);
  DOM.statusCoords.textContent = `X:${x} Y:${y}`;

  if (!STATE.isDrawing) return;

  const ctx = STATE.activeCtx;

  switch (STATE.currentTool) {
    case 'pen':
      drawPen(ctx, x, y);
      break;
    case 'eraser':
      drawEraser(ctx, x, y);
      break;
    case 'rect':
      drawRect(ctx, x, y);
      break;
    case 'circle':
      drawCircle(ctx, x, y);
      break;
    case 'select':
      drawSelection(ctx, x, y);
      break;
  }

  STATE.lastX = x;
  STATE.lastY = y;
}

function onMouseUp(e) {
  if (!STATE.isDrawing) return;
  STATE.isDrawing = false;

  const canvas = e.currentTarget;
  const { x, y } = getCanvasCoords(canvas, e);

  const ctx = STATE.activeCtx;
  const dx = Math.abs(x - STATE.startX);
  const dy = Math.abs(y - STATE.startY);
  const isDrag = (dx > 4 || dy > 4);

  if (STATE.currentTool === 'pen' || STATE.currentTool === 'eraser') {
    // End stroke cleanly
    ctx.beginPath();
  }

  if (STATE.currentTool === 'select' && isDrag) {
    // Finalise selection rect
    STATE.selX = Math.min(STATE.startX, x);
    STATE.selY = Math.min(STATE.startY, y);
    STATE.selW = Math.abs(x - STATE.startX);
    STATE.selH = Math.abs(y - STATE.startY);
    showSelectPopup(e);
  }
}

function onMouseLeave(e) {
  if (STATE.isDrawing && (STATE.currentTool === 'pen' || STATE.currentTool === 'eraser')) {
    STATE.activeCtx.beginPath();
    STATE.isDrawing = false;
  }
}

// Single click — show contextual popup (non-drag)
function onCanvasClick(e) {
  const canvas = e.currentTarget;
  const { x, y } = getCanvasCoords(canvas, e);

  const dx = Math.abs(x - STATE.startX);
  const dy = Math.abs(y - STATE.startY);
  const isDrag = (dx > 4 || dy > 4);

  if (isDrag) return; // handled by mouseUp

  if (STATE.currentTool === 'write') {
    openGhostInput(canvas, e, x, y);
    return;
  }

  // For non-write tools: show contextual popup at click
  if (STATE.currentTool !== 'select') {
    showContextPopup(e);
  }
}

/* ────────────────────────────────────────
   DRAW: PEN
──────────────────────────────────────── */
function drawPen(ctx, x, y) {
  ctx.setLineDash([]);  // Guard: always solid
  ctx.strokeStyle = STATE.brushColor;
  ctx.lineWidth   = STATE.brushSize;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.lineTo(x, y);
  ctx.stroke();
}

/* ────────────────────────────────────────
   DRAW: ERASER
──────────────────────────────────────── */
function drawEraser(ctx, x, y) {
  ctx.setLineDash([]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = STATE.brushSize * 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.lineTo(x, y);
  ctx.stroke();
}

/* ────────────────────────────────────────
   DRAW: RECT (anti-ghost via snapshot)
──────────────────────────────────────── */
function drawRect(ctx, x, y) {
  ctx.putImageData(STATE.snapshot, 0, 0);
  ctx.setLineDash([]);

  const rx = Math.min(STATE.startX, x);
  const ry = Math.min(STATE.startY, y);
  const rw = Math.abs(x - STATE.startX);
  const rh = Math.abs(y - STATE.startY);

  ctx.strokeStyle = STATE.brushColor;
  ctx.lineWidth   = STATE.brushSize;
  ctx.lineCap     = 'square';

  ctx.beginPath();
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.beginPath(); // reset path
}

/* ────────────────────────────────────────
   DRAW: CIRCLE (anti-ghost via snapshot)
──────────────────────────────────────── */
function drawCircle(ctx, x, y) {
  ctx.putImageData(STATE.snapshot, 0, 0);
  ctx.setLineDash([]);

  const cx = (STATE.startX + x) / 2;
  const cy = (STATE.startY + y) / 2;
  const rx = Math.abs(x - STATE.startX) / 2;
  const ry = Math.abs(y - STATE.startY) / 2;

  ctx.strokeStyle = STATE.brushColor;
  ctx.lineWidth   = STATE.brushSize;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath(); // reset path
}

/* ────────────────────────────────────────
   DRAW: SELECTION (dashed rect)
──────────────────────────────────────── */
function drawSelection(ctx, x, y) {
  ctx.putImageData(STATE.snapshot, 0, 0);

  const rx = Math.min(STATE.startX, x);
  const ry = Math.min(STATE.startY, y);
  const rw = Math.abs(x - STATE.startX);
  const rh = Math.abs(y - STATE.startY);

  // Outer dashed border
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'square';

  ctx.beginPath();
  ctx.strokeRect(rx, ry, rw, rh);

  // Inner magenta dash offset
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = 10;
  ctx.strokeStyle = '#FF00FF';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

  // CRITICAL: reset dash so Pen never becomes dashed
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
}

/* ────────────────────────────────────────
   WRITE TOOL — Ghost Input Engine
──────────────────────────────────────── */
function openGhostInput(canvas, mouseEvent, cx, cy) {
  const ghost = DOM.ghost;
  const rect  = canvas.getBoundingClientRect();

  // Scale factors (canvas logical vs displayed size)
  const scaleX = rect.width  / canvas.width;
  const scaleY = rect.height / canvas.height;

  // Position ghost textarea at mouse position in screen coords
  const screenX = rect.left + cx * scaleX;
  const screenY = rect.top  + cy * scaleY;

  ghost.style.left     = `${screenX}px`;
  ghost.style.top      = `${screenY}px`;
  ghost.style.fontSize = `${STATE.ghostFontSize * scaleY}px`;
  ghost.style.fontFamily = `'${STATE.ghostFont}', monospace`;
  ghost.style.color    = 'transparent';
  ghost.style.caretColor = STATE.brushColor;
  ghost.style.display  = 'block';
  ghost.value          = '';

  // Store where to burn text
  STATE.ghostX = cx;
  STATE.ghostY = cy;

  ghost.focus();

  // Burn text on blur
  ghost.onblur = () => burnText(canvas);

  // Resize ghost as user types
  ghost.oninput = () => {
    ghost.style.width  = 'auto';
    ghost.style.height = 'auto';
    ghost.style.width  = (ghost.scrollWidth + 20) + 'px';
    ghost.style.height = (ghost.scrollHeight + 10) + 'px';
  };
}

function burnText(canvas) {
  const ghost = DOM.ghost;
  const text  = ghost.value.trim();
  ghost.style.display = 'none';
  ghost.onblur  = null;
  ghost.oninput = null;

  if (!text) return;

  const ctx = STATE.activeCtx;
  ctx.save();
  ctx.font      = `${STATE.ghostFontSize}px '${STATE.ghostFont}', monospace`;
  ctx.fillStyle = STATE.brushColor;
  ctx.textBaseline = 'top';
  ctx.setLineDash([]);

  // Support multi-line
  const lines    = text.split('\n');
  const lineH    = STATE.ghostFontSize * 1.3;

  lines.forEach((line, i) => {
    ctx.fillText(line, STATE.ghostX, STATE.ghostY + i * lineH);
  });

  ctx.restore();
  ctx.beginPath();
}

/* ────────────────────────────────────────
   FLOATING POPUP
──────────────────────────────────────── */
function showContextPopup(e) {
  const popup = DOM.popup;
  positionPopup(e.clientX, e.clientY);

  // Show/hide sections based on tool
  const isBrush   = ['pen', 'rect', 'circle', 'eraser'].includes(STATE.currentTool);
  const isWrite   = STATE.currentTool === 'write';

  DOM.popupBrush.classList.toggle('hidden',      isWrite);
  DOM.popupColorSect.classList.remove('hidden');
  DOM.popupFonts.classList.toggle('hidden',      !isWrite);
  DOM.popupSelectSect.classList.add('hidden');

  popup.classList.remove('hidden');
}

function showSelectPopup(e) {
  const popup = DOM.popup;
  positionPopup(e.clientX, e.clientY);

  DOM.popupBrush.classList.add('hidden');
  DOM.popupColorSect.classList.add('hidden');
  DOM.popupFonts.classList.add('hidden');
  DOM.popupSelectSect.classList.remove('hidden');

  popup.classList.remove('hidden');
}

function positionPopup(cx, cy) {
  const popup = DOM.popup;
  popup.classList.remove('hidden');
  // Temporarily show to measure
  popup.style.left = '-9999px';
  popup.style.top  = '-9999px';

  const pw = popup.offsetWidth  || 240;
  const ph = popup.offsetHeight || 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = cx + 14;
  let top  = cy + 14;
  if (left + pw > vw - 10) left = cx - pw - 10;
  if (top  + ph > vh - 10) top  = cy - ph - 10;
  if (left < 0) left = 10;
  if (top  < 0) top  = 10;

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

function closePopup() {
  DOM.popup.classList.add('hidden');
  // Redraw selection border gone
  if (STATE.activeCtx && STATE.currentTool === 'select') {
    // restore canvas (remove dashed overlay)
    // If user dismisses without action we restore snapshot
    if (STATE.snapshot) {
      STATE.activeCtx.putImageData(STATE.snapshot, 0, 0);
    }
  }
}

/* ────────────────────────────────────────
   SELECTION ACTIONS
──────────────────────────────────────── */
function selectionFill() {
  if (!STATE.activeCtx) return;
  const ctx = STATE.activeCtx;
  ctx.putImageData(STATE.snapshot, 0, 0); // clear dashes first
  ctx.fillStyle = DOM.selFillColor.value;
  ctx.fillRect(STATE.selX, STATE.selY, STATE.selW, STATE.selH);
  ctx.beginPath();
  closePopup();
}

function selectionDelete() {
  if (!STATE.activeCtx) return;
  const ctx = STATE.activeCtx;
  ctx.putImageData(STATE.snapshot, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(STATE.selX, STATE.selY, STATE.selW, STATE.selH);
  ctx.beginPath();
  closePopup();
}

/* ────────────────────────────────────────
   TOOL SELECTION
──────────────────────────────────────── */
function setTool(toolName) {
  STATE.currentTool = toolName;
  document.body.dataset.tool = toolName;

  $$('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  DOM.statusTool.textContent = `TOOL: ${toolName.toUpperCase()}`;

  // Hide ghost if switching away from write
  if (toolName !== 'write' && DOM.ghost.style.display !== 'none') {
    burnText(STATE.activeCanvas);
  }

  closePopup();
}

/* ────────────────────────────────────────
   COLOR & SIZE SYNC
──────────────────────────────────────── */
function setColor(hex) {
  STATE.brushColor = hex;

  // Sync all swatches
  $$('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === hex);
  });

  // Sync pickers
  DOM.colorSidebar.value        = hex;
  DOM.popupColorPicker.value    = hex;
  DOM.ghost.style.caretColor    = hex;
}

function setSize(val) {
  STATE.brushSize = parseInt(val, 10);
  DOM.sizeValue.textContent        = STATE.brushSize;
  DOM.sizeSidebar.value            = STATE.brushSize;
  DOM.popupSize.value              = STATE.brushSize;
  DOM.popupSizeVal.textContent     = STATE.brushSize;
}

/* ────────────────────────────────────────
   STATUS BAR
──────────────────────────────────────── */
function updateStatus() {
  DOM.statusPage.textContent = `PAGE: ${STATE.activePageIdx}/${STATE.pageCount}`;
}

/* ────────────────────────────────────────
   SAVE
──────────────────────────────────────── */
function savePage() {
  if (!STATE.activeCanvas) return;
  const link   = document.createElement('a');
  link.download = `brutal-studio-page-${STATE.activePageIdx}.png`;
  link.href     = STATE.activeCanvas.toDataURL('image/png');
  link.click();
}

/* ────────────────────────────────────────
   KEYBOARD SHORTCUTS
──────────────────────────────────────── */
document.addEventListener('keydown', e => {
  // Don't intercept if ghost is active or popup input focused
  if (DOM.ghost.style.display !== 'none') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const keyMap = {
    'p': 'pen',
    't': 'write',
    's': 'select',
    'r': 'rect',
    'c': 'circle',
    'e': 'eraser',
  };

  if (keyMap[e.key.toLowerCase()]) {
    setTool(keyMap[e.key.toLowerCase()]);
  }

  if (e.key === 'Escape') {
    closePopup();
    if (DOM.ghost.style.display !== 'none') {
      DOM.ghost.style.display = 'none';
    }
  }
});

/* ────────────────────────────────────────
   WIRE UP ALL CONTROLS
──────────────────────────────────────── */
function wireControls() {

  // Tool buttons
  $$('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // Top bar
  DOM.btnNewPage.addEventListener('click',   createPage);
  DOM.btnClearPage.addEventListener('click', clearActivePage);
  DOM.btnSave.addEventListener('click',      savePage);
  DOM.btnNuke.addEventListener('click',      nukeAll);
  DOM.popupClose.addEventListener('click',   closePopup);

  // Sidebar swatches
  $$('#quick-swatches .swatch').forEach(s => {
    s.addEventListener('click', () => setColor(s.dataset.color));
  });

  // Popup swatches
  $$('#popup-palette .swatch').forEach(s => {
    s.addEventListener('click', () => setColor(s.dataset.color));
  });

  // Color pickers
  DOM.colorSidebar.addEventListener('input', e => setColor(e.target.value));
  DOM.popupColorPicker.addEventListener('input', e => setColor(e.target.value));

  // Size sliders — sync both
  DOM.sizeSidebar.addEventListener('input', e => setSize(e.target.value));
  DOM.popupSize.addEventListener('input',   e => setSize(e.target.value));

  // Font size
  DOM.popupFontSize.addEventListener('input', e => {
    STATE.ghostFontSize = parseInt(e.target.value, 10);
    DOM.popupFontSizeVal.textContent = STATE.ghostFontSize;
  });

  // Font buttons
  $$('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.ghostFont = btn.dataset.font;
      $$('.font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Selection actions
  DOM.selFillBtn.addEventListener('click',   selectionFill);
  DOM.selDeleteBtn.addEventListener('click', selectionDelete);

  // Prevent popup from closing canvas events
  DOM.popup.addEventListener('mousedown', e => e.stopPropagation());

  // Close popup if clicking on workspace outside canvas
  DOM.workspace.addEventListener('mousedown', e => {
    if (e.target === DOM.workspace || e.target === DOM.canvasStack) {
      closePopup();
    }
  });

  // Track cursor over workspace
  DOM.workspace.addEventListener('mousemove', e => {
    if (e.target === DOM.workspace) {
      DOM.statusCoords.textContent = 'X:- Y:-';
    }
  });

  // Set page as active when a canvas receives focus
  $$('.canvas-el').forEach(c => {
    c.addEventListener('mousedown', () => {
      const pageData = STATE.pages.find(p => p.canvas === c);
      if (pageData) setActivePage(pageData);
    });
  });
}

/* ────────────────────────────────────────
   INIT
──────────────────────────────────────── */
function init() {
  // Create the first page
  createPage();

  // Wire all controls
  wireControls();

  // Set initial state on DOM
  setTool('pen');
  setColor('#000000');
  setSize(4);

  console.log('%c BRUTAL STUDIO v2.0 — READY ', 'background:#FF00FF; color:#000; font-family:monospace; font-size:14px; padding:4px 10px;');
}

// Boot!
document.addEventListener('DOMContentLoaded', init);
