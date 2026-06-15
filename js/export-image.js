/* ── SAVE PAGE AS IMAGE ──
   Renders the data on the currently visible section into a clean PNG of the
   chosen aspect ratio (Desktop 16:9 / Mobile 9:16) and resolution, so users
   never have to screenshot. Uses html2canvas to rasterise the section DOM. */

let _saveImgOrient = 'desktop';
let _saveImgRes    = 'hd';

const _SAVE_IMG_DIMS = {
  desktop: { hd: [1920, 1080], ultra: [3840, 2160] },
  mobile:  { hd: [1080, 1920], ultra: [2160, 3840] },
};

// human-readable label for the active section, used in the filename
function _currentSectionName() {
  const id = _ALL_SECTIONS.find(s => { const e = document.getElementById(s); return e && e.style.display !== 'none'; }) || 'statRow';
  const el = document.getElementById(id);
  const t = el && el.querySelector('.section-title');
  const name = t ? t.textContent.trim() : (id === 'statRow' ? 'Overview' : id);
  return name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
}

function _currentSectionEl() {
  const id = _ALL_SECTIONS.find(s => { const e = document.getElementById(s); return e && e.style.display !== 'none'; }) || 'statRow';
  return document.getElementById(id);
}

function _openSaveImg() {
  document.getElementById('saveImgModal').classList.add('open');
}
function _closeSaveImg() {
  document.getElementById('saveImgModal').classList.remove('open');
}

async function _doSaveImg() {
  const section = _currentSectionEl();
  if (!section || typeof html2canvas === 'undefined') return;

  const go = document.getElementById('saveImgGo');
  const prev = go.textContent;
  go.textContent = 'Rendering…';
  go.disabled = true;

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#090909';
  const [W, H] = _SAVE_IMG_DIMS[_saveImgOrient][_saveImgRes];

  try {
    const shot = await html2canvas(section, {
      backgroundColor: bg,
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // contain-fit the capture into the frame with a small margin
    const pad = Math.round(Math.min(W, H) * 0.04);
    const availW = W - pad * 2, availH = H - pad * 2;
    const scale = Math.min(availW / shot.width, availH / shot.height);
    const dw = shot.width * scale, dh = shot.height * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shot, dx, dy, dw, dh);

    const a = document.createElement('a');
    a.download = `ascent-${_currentSectionName()}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
    _closeSaveImg();
  } catch (e) {
    console.error('Save image failed', e);
    setStatus('Could not render image — try again.', '');
  } finally {
    go.textContent = prev;
    go.disabled = false;
  }
}

/* wire up controls */
document.getElementById('saveImgBtn').addEventListener('click', _openSaveImg);
document.getElementById('saveImgClose').addEventListener('click', _closeSaveImg);
document.getElementById('saveImgCancel').addEventListener('click', _closeSaveImg);
document.getElementById('saveImgModal').addEventListener('click', e => { if (e.target === e.currentTarget) _closeSaveImg(); });
document.getElementById('saveImgGo').addEventListener('click', _doSaveImg);

document.getElementById('saveImgOrient').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  _saveImgOrient = b.dataset.orient;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('active', c === b));
});
document.getElementById('saveImgRes').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  _saveImgRes = b.dataset.res;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('active', c === b));
});
