import { results, describeItems, purchaseSummary, escapeHTML as e } from './game.mjs';
import { foodSVG, mealSVG, envelopeSVG } from './art.mjs';
const W = 940, H = 650, PAPER = '#E5E0D2', INK = '#25231F';
const imageFrom = url => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('无法读取这张照片，请试试 JPG、PNG 或截图。')); img.src = url; });
const svgImage = svg => imageFrom(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
function lines(ctx, text, width) {
  const output = []; let line = '';
  for (const char of Array.from(text)) { if (ctx.measureText(line + char).width > width && line) { output.push(line); line = ''; } line += char; }
  if (line) output.push(line); return output;
}
function block(ctx, text, x, y, width, height, max = 28, family = 'sans-serif') {
  let size = max, wrapped;
  do {
    ctx.font = `${size}px ${family}`; wrapped = lines(ctx, text, width);
    const balanced = wrapped.length === 1 || Array.from(wrapped.at(-1)).length >= 4 || size <= 16;
    if (wrapped.length * size * 1.4 <= height && balanced) break;
    if (size <= 1) break;
    size--;
  } while (size >= 1);
  wrapped.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.4));
}
function paperRect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; }

export function createPhoto({ game, toast }) {
  let container, back, source, outputURL, outputFile, zoom = 1, offsetX = 0, offsetY = 0, mode = 'choose', busy = false, drag, imageVersion = 0, active = true;
  const outcome = results(game), cache = new Map();
  const $ = selector => container.querySelector(selector);
  const art = async svg => { if (!cache.has(svg)) cache.set(svg, svgImage(svg)); return cache.get(svg); };
  function title() { return `<div class="photo-heading"><h1>把今天，贴起来。</h1><p>照片只在本机处理，刷新后需要重新选择。</p></div>`; }
  function inputs() { return '<input type="file" id="camera-input" hidden accept="image/*" capture="user" aria-label="拍摄双人合照"><input type="file" id="gallery-input" hidden accept="image/*" aria-label="从相册选择合照">'; }
  function mount(node, onBack) { container = node; active = true; back = () => { active = false; onBack(); }; render(); }
  function render() {
    if (mode === 'preview' && outputURL) preview();
    else if (source) crop();
    else choose();
    container.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function bindInputs() {
    for (const id of ['camera-input', 'gallery-input']) $( `#${id}`).onchange = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await load(file); };
    $('#photo-back').onclick = back;
  }
  function choose() {
    container.innerHTML = `${title()}<section class="photo-choice"><div class="photo-choice-art">${envelopeSVG('#B69ACA')}</div><h2>两张脸，一起入镜。</h2>${inputs()}<div class="button-row"><button id="camera" class="button">拍合照</button><button id="gallery" class="button secondary">从相册选择</button></div><button id="skip" class="text-button">先不拍，保存餐盘卡</button></section><div id="photo-error" role="alert"></div><div class="replay-row"><button id="photo-back" class="text-button">回到揭晓</button></div>`;
    bindInputs(); $('#camera').onclick = () => $('#camera-input').click(); $('#gallery').onclick = () => $('#gallery-input').click(); $('#skip').onclick = generate;
  }
  function error(message) { if ($('#photo-error')) { $('#photo-error').textContent = message; $('#photo-error').className = 'error-note photo-error'; } }
  async function load(file) {
    if (busy) return;
    if (file.size > 30 * 1024 * 1024) return error('这张照片超过 30 MB，请选一张较小的照片或截图。');
    if (!file.type.startsWith('image/')) return error('请选择图片文件。');
    busy = true; const version = ++imageVersion; const url = URL.createObjectURL(file);
    try {
      const image = await imageFrom(url);
      if (image.naturalWidth * image.naturalHeight > 64000000) throw new Error('照片尺寸太大，请先缩小或使用截图。');
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const reduced = document.createElement('canvas'); reduced.width = Math.round(image.naturalWidth * scale); reduced.height = Math.round(image.naturalHeight * scale);
      const ctx = reduced.getContext('2d'); ctx.drawImage(image, 0, 0, reduced.width, reduced.height);
      if (version !== imageVersion) return;
      if (source) { source.width = 0; source.height = 0; }
      source = reduced; zoom = 1; offsetX = 0; offsetY = 0; mode = 'crop'; clearOutput(); if (active) render();
    } catch (err) { error(err.message || '照片没能读出来，请重选。'); }
    finally { URL.revokeObjectURL(url); busy = false; }
  }
  function drawPhoto(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = '#F4F0E4'; ctx.fillRect(x, y, w, h);
    if (source) {
      const scale = Math.min(w / source.width, h / source.height) * zoom;
      ctx.drawImage(source, x + (w - source.width * scale) / 2 + offsetX * w / W, y + (h - source.height * scale) / 2 + offsetY * h / H, source.width * scale, source.height * scale);
    }
    ctx.restore();
  }
  function drawCrop() { const canvas = $('#crop'); if (!canvas) return; drawPhoto(canvas.getContext('2d'), 0, 0, W, H); }
  function clampOffset() { offsetX = Math.max(-W * .45, Math.min(W * .45, offsetX)); offsetY = Math.max(-H * .45, Math.min(H * .45, offsetY)); }
  function crop() {
    container.innerHTML = `${title()}<section><div class="crop-wrap"><canvas id="crop" class="crop-surface" width="${W}" height="${H}" tabindex="0" aria-label="照片取景，按方向键移动；也可拖动照片"></canvas><div class="crop-controls"><label for="zoom">缩放</label><input type="range" id="zoom" min="1" max="4" step="0.01" value="${zoom}"><button id="fit" class="text-button">完整入镜</button></div><div class="nudge-controls" aria-label="移动照片"><button data-nudge="left" aria-label="向左移动">←</button><button data-nudge="up" aria-label="向上移动">↑</button><button data-nudge="down" aria-label="向下移动">↓</button><button data-nudge="right" aria-label="向右移动">→</button></div></div><p class="crop-help">拖动照片调整位置 · 两个人都在画面里就好</p>${inputs()}<div id="photo-error" role="alert"></div><div class="action-dock"><button id="generate" class="button full">做成大头贴 <span aria-hidden="true">↗</span></button><div class="button-row"><button id="reselect" class="text-button">重新选照片</button><button id="photo-back" class="text-button">回到揭晓</button></div></div></section>`;
    bindInputs(); drawCrop();
    $('#zoom').oninput = event => { zoom = Number(event.target.value); drawCrop(); };
    $('#fit').onclick = () => { zoom = 1; offsetX = 0; offsetY = 0; $('#zoom').value = 1; drawCrop(); };
    $('#reselect').onclick = () => $('#gallery-input').click(); $('#generate').onclick = generate;
    const canvas = $('#crop');
    canvas.onpointerdown = event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = event => { if (!drag) return; const rect = canvas.getBoundingClientRect(); offsetX += (event.clientX - drag.x) * W / rect.width; offsetY += (event.clientY - drag.y) * H / rect.height; drag = { x: event.clientX, y: event.clientY }; clampOffset(); drawCrop(); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    const nudge = key => { if (key === 'left') offsetX -= 20; if (key === 'right') offsetX += 20; if (key === 'up') offsetY -= 20; if (key === 'down') offsetY += 20; clampOffset(); drawCrop(); };
    document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => nudge(b.dataset.nudge));
    canvas.onkeydown = event => { const key = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key]; if (key) { event.preventDefault(); nudge(key); } };
  }
  async function generate() {
    if (busy) return; busy = true;
    const version = imageVersion;
    const button = $('#generate') || $('#skip'); if (button) { button.disabled = true; button.textContent = '正在贴好这一餐…'; }
    try {
      await document.fonts.load('48px Xiaolai');
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1620;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 1080, 1620);
      ctx.fillStyle = INK; ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.font = '28px Xiaolai, sans-serif'; ctx.fillText('双人点餐游戏', 540, 43);
      ctx.font = '68px Xiaolai, sans-serif'; ctx.fillText('你以为我会点什么？', 540, 99);
      ctx.font = '23px sans-serif'; ctx.fillText(new Date(game.snapshot.createdAt).toLocaleDateString('zh-CN').replaceAll('/', ' . '), 540, 194);
      paperRect(ctx, 51, 234, 978, 720, '#F4F0E4');
      if (source) drawPhoto(ctx, 70, 252, W, H);
      else {
        ctx.fillStyle = '#B69ACA'; ctx.fillRect(70, 252, W, H);
        const left = await art(mealSVG(outcome[0].actual.items, '', outcome[0].actual.orders)), right = await art(mealSVG(outcome[1].actual.items, '', outcome[1].actual.orders));
        ctx.drawImage(left, 110, 326, 470, 308); ctx.drawImage(right, 500, 502, 470, 308);
        ctx.fillStyle = INK; ctx.font = '45px Xiaolai,sans-serif'; ctx.fillText('今天，一起吃这个。', 540, 804);
      }
      ctx.fillStyle = INK; ctx.font = '25px Xiaolai,sans-serif'; ctx.fillText('一顿饭，两个人，各有各的心头好。', 540, 915);
      for (const [kind, x, y, rotation] of [['burger', 7, 207, -.19], ['fries', 908, 785, .17]]) {
        const img = await art(foodSVG(kind)); ctx.save(); ctx.translate(x + 75, y + 75); ctx.rotate(rotation); ctx.drawImage(img, -75, -75, 150, 150); ctx.restore();
      }
      ctx.textAlign = 'left';
      for (let i = 0; i < 2; i++) {
        const r = outcome[i], x = i === 0 ? 51 : 555;
        paperRect(ctx, x, 983, 474, 494, '#F4F0E4');
        ctx.fillStyle = i === 0 ? '#E8C547' : '#70A58B'; ctx.fillRect(x + 2, 985, 470, 60);
        ctx.fillStyle = INK; block(ctx, `${r.name} 的餐单`, x + 22, 999, 426, 40, 29);
        ctx.font = '23px Xiaolai,sans-serif'; ctx.fillText('我想吃的', x + 22, 1064);
        if (game.version === 3) block(ctx, purchaseSummary(r.actual), x + 22, 1102, 426, 130, 25);
        else {
        block(ctx, r.actual.name, x + 22, 1102, 426, game.version === 2 ? 40 : 67, 29);
        block(ctx, describeItems(r.actual.items), x + 22, game.version === 2 ? 1143 : 1170, 426, game.version === 2 ? 90 : 63, 23);
        }
        ctx.strokeStyle = '#9C9586'; ctx.lineWidth = 1; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(x + 22, 1243); ctx.lineTo(x + 452, 1243); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = INK; block(ctx, `${r.friend} 猜的`, x + 22, 1258, 426, 35, 22);
        if (game.version === 3) block(ctx, purchaseSummary(r.guess), x + 22, 1300, 426, 118, 24);
        else {
        block(ctx, r.guess.name, x + 22, 1300, 426, game.version === 2 ? 40 : 60, 27);
        block(ctx, describeItems(r.guess.items), x + 22, game.version === 2 ? 1341 : 1361, 426, game.version === 2 ? 77 : 49, 22);
        }
        const verdict = r.exact ? '整份猜中！' : r.groups.map(g => `${g.label}${g.match ? '✓' : '×'}`).join('  ');
        ctx.font = '26px Xiaolai,sans-serif'; ctx.fillText(verdict, x + 22, 1435);
      }
      ctx.textAlign = 'center'; ctx.font = '21px sans-serif'; ctx.fillStyle = INK; ctx.fillText('sanliang.online/lab/play/guess-my-order/', 540, 1514);
      ctx.font = '23px Xiaolai,sans-serif'; ctx.fillText('好好吃饭，顺便猜猜。', 540, 1554);
      if (game.snapshot.demo) { ctx.fillStyle = '#B69ACA'; ctx.fillRect(0, 0, 1080, 28); ctx.fillStyle = INK; ctx.font = '17px sans-serif'; ctx.fillText('开发测试餐单 · 不代表真实可售商品或价格', 540, 4); }
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片导出失败，请重试。')), 'image/png'));
      canvas.width = 0; canvas.height = 0;
      if (version !== imageVersion) return;
      clearOutput(); outputFile = new File([blob], '你以为我会点什么.png', { type: 'image/png' }); outputURL = URL.createObjectURL(blob);
      mode = 'preview'; if (active) { preview(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    } catch (err) { error(err.message || '图片没能生成，照片和取景仍然保留，可以重试。'); if (button) { button.disabled = false; button.textContent = source ? '重新生成大头贴' : '重试生成餐盘卡'; } }
    finally { busy = false; }
  }
  function preview() {
    container.innerHTML = `<div class="photo-heading"><h1>今天这张，收好啦。</h1></div><img class="preview-image" src="${outputURL}" width="1080" height="1620" alt="${e(game.names.join('和'))} 的合影餐单卡，1080 × 1620"><div class="preview-actions"><div class="button-row"><a class="button" id="save-image" href="${outputURL}" download="你以为我会点什么.png">保存图片</a><button id="share-image" class="button secondary">分享</button></div><p class="image-save-tip">微信或部分浏览器中，请长按上方图片保存。<br><a href="${outputURL}" target="_blank" rel="noopener">打开原图</a></p><div class="button-row"><button id="edit-photo" class="text-button">${source ? '调整照片' : '加一张合照'}</button><button id="copy-link" class="text-button">复制游戏链接</button></div><div id="photo-error" role="alert"></div><div class="replay-row"><button id="photo-back" class="text-button">回到揭晓</button></div></div>`;
    $('#edit-photo').onclick = () => { mode = source ? 'crop' : 'choose'; render(); };
    $('#photo-back').onclick = back;
    $('#share-image').onclick = async () => {
      try {
        if (navigator.canShare?.({ files: [outputFile] })) await navigator.share({ files: [outputFile], title: '你以为我会点什么' });
        else { toast('请保存图片后分享给朋友；也可以长按上方图片。'); $('#save-image').focus(); }
      } catch (err) { if (err.name !== 'AbortError') error('系统分享没能打开，可以直接保存图片。'); }
    };
    $('#copy-link').onclick = async () => {
      try { await navigator.clipboard.writeText('https://sanliang.online/lab/play/guess-my-order/'); toast('游戏链接已复制。'); }
      catch { error('请复制：sanliang.online/lab/play/guess-my-order/'); }
    };
  }
  function clearOutput() { if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null; outputFile = null; }
  function dispose() { active = false; imageVersion++; clearOutput(); if (source) { source.width = 0; source.height = 0; source = null; } cache.clear(); }
  return { mount, dispose };
}
