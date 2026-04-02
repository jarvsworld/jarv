const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const WA_TOKEN     = process.env.WA_TOKEN     || 'EAANorwrMgogBRCbOggwCPVtdo40MUZAtIeixevvPYJMP1cuqR9aM1FPTxij9zKheYf7qrIC0yCwOjJqwwinZCp2EIkBWbQ0xwlbL3fVHzB3EIGW1qBq2adQDZAn6sPULiXi1JyJtXxTQU2wfif8nhjh7tSfZCKyjQdemdCzZAbCWbaEfidtJYJfZABOYD4yJeEDzU7ZBPZAgZBU8gicwhj1Ip0PianyFXkxYsCtksQoSG';
const WA_PHONE_ID  = process.env.WA_PHONE_ID  || '1087781197744698';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'jarv_verify_2024';

let cursos = {};
let conversaciones = {};

// ── ENVIAR MENSAJE ────────────────────────────────
async function enviarMensaje(to, texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: texto } },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ Mensaje enviado a ${to}`);
  } catch (e) {
    console.error('Error texto libre, usando plantilla...', e.response?.data?.error?.message);
    await enviarPlantillaBienvenida(to);
  }
}

async function enviarPlantillaBienvenida(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to, type: 'template', template: { name: 'bienvenida_cursos', language: { code: 'es_MX' } } },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ Plantilla enviada a ${to}`);
  } catch (e) {
    console.error('Error plantilla:', e.response?.data || e.message);
  }
}

// ── FORMATEAR FECHAS ──────────────────────────────
function formatFecha(f) {
  if (!f) return null;
  const d = new Date(f + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function generarInfoFechas(curso) {
  const modalidad = curso.modalidad || '1dia_6h';
  const f1 = formatFecha(curso.fecha1);
  const f2 = formatFecha(curso.fecha2);
  const lugares = curso.lugares !== undefined ? curso.lugares : '?';

  let fechaTexto = '';
  let horarioTexto = '';

  if (modalidad === '1dia_6h') {
    fechaTexto = f1 ? `📅 *Fecha:* ${f1}` : '';
    horarioTexto = '🕘 *Horario:* 9:00 am – 3:00 pm (6 horas)';
  } else if (modalidad === '2dias_4h') {
    fechaTexto = [f1 ? `📅 *Día 1:* ${f1}` : '', f2 ? `📅 *Día 2:* ${f2}` : ''].filter(Boolean).join('\n');
    horarioTexto = '🕘 *Horario:* 9:00 am – 1:00 pm cada día (4h/día)';
  } else if (modalidad === '2dias_6h') {
    fechaTexto = [f1 ? `📅 *Día 1:* ${f1}` : '', f2 ? `📅 *Día 2:* ${f2}` : ''].filter(Boolean).join('\n');
    horarioTexto = '🕘 *Horario:* 9:00 am – 3:00 pm cada día (6h/día)';
  }

  return { fechaTexto, horarioTexto, lugares };
}

// ── GENERAR RESPUESTA DE CURSO ────────────────────
function generarRespuestaCurso(clave) {
  const curso = cursos[clave.toUpperCase()];
  if (!curso) return null;

  const { fechaTexto, horarioTexto, lugares } = generarInfoFechas(curso);
  const lugaresTexto = Number(lugares) <= 5
    ? `⚠️ *Lugares disponibles:* ${lugares} (¡Últimos lugares!)`
    : `✅ *Lugares disponibles:* ${lugares}`;

  return [
    `🎓 *${curso.nombre}*`,
    ``,
    `📋 *Descripción:*\n${curso.descripcion}`,
    ``,
    fechaTexto,
    horarioTexto,
    `💰 *Precio:* ${curso.precio}`,
    lugaresTexto,
    curso.link ? `🔗 *Más información:* ${curso.link}` : '',
    ``,
    `¿Te gustaría inscribirte? Responde *SÍ* y un asesor te contactará en breve. 😊`
  ].filter(l => l !== undefined && l !== null && !(l === '')).join('\n');
}

function generarCatalogo() {
  const entradas = Object.entries(cursos);
  if (!entradas.length) return '📚 Aún no tenemos cursos registrados. ¡Pronto tendremos novedades!';
  const lista = entradas.map(([clave, c]) => {
    const { fechaTexto, lugares } = generarInfoFechas(c);
    const primeraFecha = fechaTexto ? fechaTexto.split('\n')[0].replace('📅 *Fecha:* ', '').replace('📅 *Día 1:* ', '') : '';
    return `▸ *${clave}* — ${c.nombre}\n   💰 ${c.precio} | 📅 ${primeraFecha} | ✅ ${lugares} lugares`;
  }).join('\n\n');
  return `📚 *Catálogo de Cursos Disponibles*\n\n${lista}\n\n👉 Escribe el código del curso (ej. *CURSO-A*) para ver todos los detalles.`;
}

function procesarMensaje(from, texto) {
  const msg = texto.trim().toUpperCase();
  if (cursos[msg]) return generarRespuestaCurso(msg);
  if (['CURSOS', 'CATALOGO', 'CATÁLOGO', 'INFO'].includes(msg)) return generarCatalogo();
  if (['SÍ', 'SI', 'YES', 'QUIERO'].includes(msg))
    return `✅ ¡Excelente! Hemos registrado tu interés.\n\nUn asesor te contactará en las próximas horas para completar tu inscripción. 😊`;
  if (['HOLA', 'BUENAS', 'HI', 'HELLO', 'BUEN DIA', 'BUENOS DIAS', 'BUENAS TARDES'].includes(msg))
    return `¡Hola! 👋 Bienvenido a *Cursos Online*.\n\n📚 Escribe *CURSOS* para ver nuestro catálogo\n🔤 O escribe el código del curso (ej. *CURSO-A*)\n\n¿En qué puedo ayudarte?`;
  return `Hola 👋 Escribe *CURSOS* para ver el catálogo, o el código del curso que te interesa (ej. *CURSO-A*).`;
}

// ── WEBHOOK ───────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) { console.log('✓ Webhook verificado'); res.status(200).send(challenge); }
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value.messages) continue;
      for (const msg of value.messages) {
        if (msg.type !== 'text') continue;
        const from = msg.from, texto = msg.text.body, ts = new Date().toISOString();
        console.log(`📨 ${from}: ${texto}`);
        if (!conversaciones[from]) conversaciones[from] = [];
        conversaciones[from].push({ dir: 'received', texto, ts });
        const respuesta = procesarMensaje(from, texto);
        await enviarMensaje(from, respuesta);
        conversaciones[from].push({ dir: 'sent', texto: respuesta, ts: new Date().toISOString() });
      }
    }
  }
});

// ── API ───────────────────────────────────────────
app.get('/api/cursos', (req, res) => res.json(cursos));

app.post('/api/cursos', (req, res) => {
  const { clave, nombre, precio, descripcion, link, modalidad, fecha1, fecha2, lugares } = req.body;
  if (!clave || !nombre) return res.status(400).json({ error: 'Clave y nombre requeridos' });
  cursos[clave.toUpperCase()] = { nombre, precio, descripcion, link, modalidad, fecha1, fecha2, lugares: Number(lugares) || 0 };
  res.json({ ok: true, cursos });
});

app.delete('/api/cursos/:clave', (req, res) => {
  delete cursos[req.params.clave.toUpperCase()];
  res.json({ ok: true });
});

app.get('/api/conversaciones', (req, res) => res.json(conversaciones));

app.post('/api/enviar', async (req, res) => {
  const { to, texto } = req.body;
  if (!to || !texto) return res.status(400).json({ error: 'to y texto requeridos' });
  await enviarMensaje(to, texto);
  if (!conversaciones[to]) conversaciones[to] = [];
  conversaciones[to].push({ dir: 'sent', texto, ts: new Date().toISOString() });
  res.json({ ok: true });
});

app.get('/', (req, res) => res.json({ status: 'JARV corriendo ✓', cursos: Object.keys(cursos).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 JARV corriendo en puerto ${PORT}`));
// ── INICIAR ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 JARV corriendo en puerto ${PORT}`));
