/* ============================================
   5K FAMILIAR · CELEBRACIÓN DE CUMPLEAÑOS
   script.js — Frontend logic
   ============================================ */

// ── CONFIGURACIÓN (EDITA AQUÍ) ──────────────────────────────────────────────

/**
 * Pega aquí la URL de tu Google Apps Script Web App después de publicarla.
 * Instrucciones: Extensiones → Apps Script → Implementar → Nueva implementación
 * Tipo: Aplicación web | Ejecutar como: Yo | Acceso: Cualquier persona
 */
const RSVP_ENDPOINT = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

/**
 * Fecha y hora del evento (ISO 8601, sin zona horaria = local del dispositivo).
 * Cambia si necesitas ajustar.
 */
const EVENT_DATE = "2026-07-18T06:00:00";

// ─────────────────────────────────────────────────────────────────────────────

// Estado global
let isSubmitting = false;
let updateMode = false;     // true = actualizar respuesta existente
let activeRsvpCode = null;  // código cargado para actualizar

// ── DOM REFS ─────────────────────────────────────────────────────────────────
const $$ = (id) => document.getElementById(id);

// ── NAVBAR SCROLL ────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── COUNTDOWN ────────────────────────────────────────────────────────────────
function updateCountdown() {
  const now = new Date().getTime();
  const target = new Date(EVENT_DATE).getTime();
  const diff = target - now;

  const grid = $$('countdown-grid');
  const done = $$('countdown-done');

  if (diff <= 0) {
    grid.classList.add('hidden');
    done.classList.remove('hidden');
    return;
  }

  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  $$('cd-days').textContent    = String(days).padStart(2, '0');
  $$('cd-hours').textContent   = String(hours).padStart(2, '0');
  $$('cd-minutes').textContent = String(minutes).padStart(2, '0');
  $$('cd-seconds').textContent = String(seconds).padStart(2, '0');
}

updateCountdown();
setInterval(updateCountdown, 1000);

// ── SCROLL FADE-IN ANIMATIONS ─────────────────────────────────────────────────
function setupFadeIn() {
  const elements = document.querySelectorAll(
    '.detail-card, .timeline-item, .form-card, .section-title, .section-eyebrow'
  );
  elements.forEach(el => el.classList.add('fade-in'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  elements.forEach(el => observer.observe(el));
}

// ── RSVP CODE GENERATOR ───────────────────────────────────────────────────────
function generateRsvpCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusión
  let code = '5K-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── ASISTENCIA LOGIC ──────────────────────────────────────────────────────────
function computeAttendanceFlags(asistencia, cantidad) {
  const n = parseInt(cantidad, 10) || 0;
  const flags = {
    vaCorrer: false,
    vaComer: false,
    noAsiste: false,
    talVez: false,
    cantidadAcompanantes: n,
    totalPersonas: 0,
  };

  switch (asistencia) {
    case 'Solo correré el 5K':
      flags.vaCorrer = true;
      flags.totalPersonas = 1 + n;
      break;
    case 'Solo iré a comer después del 5K':
      flags.vaComer = true;
      flags.totalPersonas = 1 + n;
      break;
    case 'Correré el 5K y también iré a comer':
      flags.vaCorrer = true;
      flags.vaComer = true;
      flags.totalPersonas = 1 + n;
      break;
    case 'No podré asistir':
      flags.noAsiste = true;
      flags.totalPersonas = 0;
      break;
    case 'No estoy seguro todavía':
      flags.talVez = true;
      flags.totalPersonas = 0;
      break;
  }

  return flags;
}

// Toggle: ocultar campos de acompañantes si no asiste / tal vez
$$('f-asistencia').addEventListener('change', () => {
  const val = $$('f-asistencia').value;
  const noCount = val === 'No podré asistir' || val === 'No estoy seguro todavía' || val === '';
  $$('group-acompanantes').style.opacity = noCount ? '0.4' : '1';
  $$('group-nombres-acompanantes').style.opacity = noCount ? '0.4' : '1';
  if (noCount) {
    $$('f-cantidad').value = '0';
    $$('f-nombres-acompanantes').value = '';
  }
});

// ── UPDATE MODE TOGGLE ────────────────────────────────────────────────────────
$$('toggle-update-mode').addEventListener('click', () => {
  $$('update-code-row').classList.remove('hidden');
  $$('toggle-update-mode').closest('.update-mode-toggle').style.display = 'none';
});

$$('toggle-new-mode').addEventListener('click', () => {
  $$('update-code-row').classList.add('hidden');
  $$('toggle-update-mode').closest('.update-mode-toggle').style.display = '';
  $$('mode-badge').classList.add('hidden');
  $$('rsvp-update-code').value = '';
  $$('update-status').classList.add('hidden');
  updateMode = false;
  activeRsvpCode = null;
  $$('submit-btn').querySelector('.btn-text').textContent = 'Confirmar asistencia';
});

// Normalizar código al escribir
$$('rsvp-update-code').addEventListener('input', (e) => {
  let v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  // Agregar prefijo 5K- automáticamente
  if (!v.startsWith('5K-') && v.length > 0) {
    if (v.startsWith('5K') && v.length === 2) v = '5K-';
    else if (!v.startsWith('5')) v = '5K-' + v;
  }
  e.target.value = v.slice(0, 9);
});

// Botón "Aplicar código"
$$('apply-code-btn').addEventListener('click', () => {
  const code = $$('rsvp-update-code').value.trim().toUpperCase();
  const status = $$('update-status');

  if (!code.match(/^5K-[A-Z0-9]{6}$/)) {
    status.textContent = 'El código debe tener el formato 5K-XXXXXX.';
    status.className = 'update-status error';
    status.classList.remove('hidden');
    return;
  }

  // Activar modo actualización
  updateMode = true;
  activeRsvpCode = code;

  status.textContent = `✓ Modo actualización activo para ${code}`;
  status.className = 'update-status success';
  status.classList.remove('hidden');

  $$('mode-badge').classList.remove('hidden');
  $$('active-code-display').textContent = code;
  $$('submit-btn').querySelector('.btn-text').textContent = 'Actualizar respuesta';
});

// ── VALIDACIÓN ────────────────────────────────────────────────────────────────
function validateForm() {
  const nombre    = $$('f-nombre').value.trim();
  const telefono  = $$('f-telefono').value.trim();
  const email     = $$('f-email').value.trim();
  const asistencia = $$('f-asistencia').value;

  if (!nombre) return 'Por favor ingresa tu nombre completo.';
  if (!telefono) return 'Por favor ingresa tu número de teléfono.';
  if (!email || !email.includes('@')) return 'Por favor ingresa un email válido.';
  if (!asistencia) return 'Por favor selecciona cómo participarás.';
  return null;
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
$$('submit-btn').addEventListener('click', async () => {
  if (isSubmitting) return;

  const error = validateForm();
  const errorBox = $$('form-error');

  if (error) {
    errorBox.textContent = error;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  errorBox.classList.add('hidden');

  // Recoger datos del formulario
  const nombre             = $$('f-nombre').value.trim();
  const telefono           = $$('f-telefono').value.trim();
  const email              = $$('f-email').value.trim();
  const asistencia         = $$('f-asistencia').value;
  const cantidadRaw        = $$('f-cantidad').value;
  const nombresAcompanantes = $$('f-nombres-acompanantes').value.trim();
  const notas              = $$('f-notas').value.trim();

  const flags = computeAttendanceFlags(asistencia, cantidadRaw);
  const rsvpCode = updateMode ? activeRsvpCode : generateRsvpCode();
  const now = new Date().toISOString();

  const payload = {
    mode:               updateMode ? 'update' : 'create',
    timestamp:          now,
    rsvpCode:           rsvpCode,
    nombre:             nombre,
    telefono:           telefono,
    email:              email,
    asistencia:         asistencia,
    vaCorrer:           flags.vaCorrer,
    vaComer:            flags.vaComer,
    noAsiste:           flags.noAsiste,
    talVez:             flags.talVez,
    cantidadAcompanantes: flags.cantidadAcompanantes,
    nombresAcompanantes:  nombresAcompanantes,
    totalPersonas:      flags.totalPersonas,
    notas:              notas,
    source:             'Website',
  };

  // UI: loading
  isSubmitting = true;
  const btnText    = $$('submit-btn').querySelector('.btn-text');
  const btnLoading = $$('submit-btn').querySelector('.btn-loading');
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  $$('submit-btn').disabled = true;

  try {
    const response = await fetch(RSVP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'cors',
    });

    const result = await response.json();

    if (result.ok) {
      showConfirmation(result, payload);
    } else {
      throw new Error(result.error || 'Error desconocido del servidor.');
    }
  } catch (err) {
    let msg = 'No pudimos guardar tu respuesta. Intenta nuevamente.';
    if (err.message && err.message.includes('No encontramos')) {
      msg = err.message;
    } else if (err.message && err.message.toLowerCase().includes('fetch')) {
      msg = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
    }
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    isSubmitting = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    $$('submit-btn').disabled = false;
  }
});

// ── MOSTRAR CONFIRMACIÓN ──────────────────────────────────────────────────────
function showConfirmation(result, payload) {
  const overlay = $$('confirmation-overlay');
  $$('conf-code').textContent = result.rsvpCode || payload.rsvpCode;

  // Título según acción
  const isUpdate = payload.mode === 'update';
  $$('confirmation-title').textContent = isUpdate
    ? '¡Respuesta actualizada!'
    : '¡Gracias por confirmar!';
  $$('confirmation-subtitle').textContent = isUpdate
    ? 'Tu respuesta fue actualizada exitosamente.'
    : 'Recibimos tu respuesta. ¡Nos vemos el 18 de julio!';

  // Resumen
  const totalLabel = payload.totalPersonas > 0
    ? `${payload.totalPersonas} persona${payload.totalPersonas > 1 ? 's' : ''} en total`
    : '—';

  $$('conf-summary').innerHTML = `
    <p>
      <strong>Nombre:</strong> ${payload.nombre}<br>
      <strong>Asistencia:</strong> ${payload.asistencia}<br>
      ${payload.totalPersonas > 0 ? `<strong>Total de personas:</strong> ${totalLabel}<br>` : ''}
      ${payload.notas ? `<strong>Notas:</strong> ${payload.notas}` : ''}
    </p>
    <p style="font-size:0.8rem;color:#aaa;margin-top:8px;">
      Guardado el ${formatDate(payload.timestamp)}
    </p>
  `;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('es', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Cerrar confirmación
$$('close-confirmation').addEventListener('click', () => {
  $$('confirmation-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  // Scroll al inicio del formulario
  $$('rsvp').scrollIntoView({ behavior: 'smooth' });
  // Limpiar formulario
  resetForm();
});

// Cerrar al hacer click fuera de la card
$$('confirmation-overlay').addEventListener('click', (e) => {
  if (e.target === $$('confirmation-overlay')) {
    $$('close-confirmation').click();
  }
});

function resetForm() {
  $$('f-nombre').value = '';
  $$('f-telefono').value = '';
  $$('f-email').value = '';
  $$('f-asistencia').value = '';
  $$('f-cantidad').value = '0';
  $$('f-nombres-acompanantes').value = '';
  $$('f-notas').value = '';
  $$('form-error').classList.add('hidden');

  // Resetear modo actualización
  updateMode = false;
  activeRsvpCode = null;
  $$('update-code-row').classList.add('hidden');
  $$('mode-badge').classList.add('hidden');
  $$('rsvp-update-code').value = '';
  $$('update-status').classList.add('hidden');
  const toggleRow = $$('toggle-update-mode').closest('.update-mode-toggle');
  if (toggleRow) toggleRow.style.display = '';
  $$('submit-btn').querySelector('.btn-text').textContent = 'Confirmar asistencia';
}

// ── BUBBLE FIELD: añadir más burbujas dinámicamente ───────────────────────────
function addBubbles() {
  const field = document.querySelector('.bubble-field');
  if (!field) return;
  const sizes = [16, 20, 28, 12, 36, 22];
  const positions = [10, 20, 35, 50, 60, 75, 85];
  positions.forEach((left, i) => {
    const b = document.createElement('div');
    const size = sizes[i % sizes.length];
    const delay = (i * 2.3) % 12;
    const dur = 12 + (i * 1.7) % 8;
    b.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      border-radius:50%;
      border:1.5px solid rgba(78,205,196,0.28);
      bottom:-60px;left:${left}%;
      animation:bubbleRise ${dur}s ${delay}s linear infinite;
    `;
    field.appendChild(b);
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupFadeIn();
  addBubbles();

  // Aviso si el endpoint no fue configurado
  if (RSVP_ENDPOINT === 'PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
    console.warn(
      '%c[5K RSVP] Recuerda configurar RSVP_ENDPOINT en script.js con tu URL de Google Apps Script.',
      'color: #ff6f61; font-weight: bold;'
    );
  }
});

// ============================================
// MEGA TÉ — Sevita True Fit Nutrition
// ============================================

/**
 * Endpoint separado para pedidos de Mega Té.
 * Puede ser el mismo Google Apps Script (con un "mode" distinto)
 * o un Web App / Google Form diferente — tú decides.
 */
const MEGATE_ENDPOINT = "PASTE_MEGATE_ENDPOINT_HERE";

let megateSubmitting = false;

// Abrir modal
const openMegateBtn = document.getElementById('open-megate-modal');
if (openMegateBtn) {
  openMegateBtn.addEventListener('click', () => {
    document.getElementById('megate-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
}

// Cerrar modal
function closeMegateModal() {
  document.getElementById('megate-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

const megateCloseBtn = document.getElementById('megate-close');
if (megateCloseBtn) {
  megateCloseBtn.addEventListener('click', closeMegateModal);
}

const megateOverlay = document.getElementById('megate-overlay');
if (megateOverlay) {
  megateOverlay.addEventListener('click', (e) => {
    if (e.target === megateOverlay) closeMegateModal();
  });
}

// Validación
function validateMegateForm() {
  const nombre = document.getElementById('mt-nombre').value.trim();
  const telefono = document.getElementById('mt-telefono').value.trim();
  const sabor = document.getElementById('mt-sabor').value;

  if (!nombre) return 'Por favor ingresa tu nombre completo.';
  if (!telefono) return 'Por favor ingresa tu número de teléfono.';
  if (!sabor) return 'Por favor selecciona un sabor.';
  return null;
}

// Submit
const megateSubmitBtn = document.getElementById('megate-submit-btn');
if (megateSubmitBtn) {
  megateSubmitBtn.addEventListener('click', async () => {
    if (megateSubmitting) return;

    const error = validateMegateForm();
    const errorBox = document.getElementById('megate-error');

    if (error) {
      errorBox.textContent = error;
      errorBox.classList.remove('hidden');
      return;
    }
    errorBox.classList.add('hidden');

    const payload = {
      mode: 'megate-order',
      timestamp: new Date().toISOString(),
      nombre: document.getElementById('mt-nombre').value.trim(),
      telefono: document.getElementById('mt-telefono').value.trim(),
      cantidad: parseInt(document.getElementById('mt-cantidad').value, 10) || 1,
      sabor: document.getElementById('mt-sabor').value,
      notas: document.getElementById('mt-notas').value.trim(),
      source: 'Website',
    };

    megateSubmitting = true;
    const btnText = megateSubmitBtn.querySelector('.btn-text');
    const btnLoading = megateSubmitBtn.querySelector('.btn-loading');
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    megateSubmitBtn.disabled = true;

    try {
      const response = await fetch(MEGATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
      });

      const result = await response.json();

      if (result.ok) {
        showMegateConfirmation(payload);
      } else {
        throw new Error(result.error || 'Error desconocido del servidor.');
      }
    } catch (err) {
      errorBox.textContent = 'No pudimos enviar tu pedido. Intenta nuevamente.';
      errorBox.classList.remove('hidden');
    } finally {
      megateSubmitting = false;
      btnText.classList.remove('hidden');
      btnLoading.classList.add('hidden');
      megateSubmitBtn.disabled = false;
    }
  });
}

// Mostrar confirmación
function showMegateConfirmation(payload) {
  closeMegateModal();

  const summary = document.getElementById('megate-conf-summary');
  summary.innerHTML = `
    <p>
      <strong>Nombre:</strong> ${payload.nombre}<br>
      <strong>Sabor:</strong> ${payload.sabor}<br>
      <strong>Cantidad:</strong> ${payload.cantidad}<br>
      <strong>Total:</strong> $${(payload.cantidad * 10).toFixed(2)}
      ${payload.notas ? `<br><strong>Notas:</strong> ${payload.notas}` : ''}
    </p>
  `;

  document.getElementById('megate-confirmation-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

const megateCloseConfirmBtn = document.getElementById('megate-close-confirmation');
if (megateCloseConfirmBtn) {
  megateCloseConfirmBtn.addEventListener('click', () => {
    document.getElementById('megate-confirmation-overlay').classList.add('hidden');
    document.body.style.overflow = '';

    // Reset form
    document.getElementById('mt-nombre').value = '';
    document.getElementById('mt-telefono').value = '';
    document.getElementById('mt-cantidad').value = '1';
    document.getElementById('mt-sabor').value = '';
    document.getElementById('mt-notas').value = '';
  });
}

// ============================================
// DRESS CODE — camiseta interactiva
// ============================================
(function setupDressCode() {
  const swatches = document.querySelectorAll('#dresscode-swatches .swatch');
  const shirtBody = document.getElementById('shirt-body');
  if (!swatches.length || !shirtBody) return;

  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.getAttribute('data-color');
      shirtBody.setAttribute('fill', color);
      swatches.forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
})();
