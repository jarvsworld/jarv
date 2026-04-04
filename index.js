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

// ── CONFIGURACIÓN — solo variables de entorno ─────
const WA_TOKEN     = process.env.WA_TOKEN;
const WA_PHONE_ID  = process.env.WA_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'jarv_verify_2024';
const AT_TOKEN     = process.env.AT_TOKEN;
const AT_BASE      = process.env.AT_BASE;
const AT_URL       = `https://api.airtable.com/v0/${AT_BASE}`;
const AT_HDR       = { 'Authorization': `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' };

// Verificar variables al arrancar
const REQUIRED = { WA_TOKEN, WA_PHONE_ID, AT_TOKEN, AT_BASE };
for (const [k, v] of Object.entries(REQUIRED)) {
  if (!v) console.warn(`⚠️  Variable de entorno faltante: ${k}`);
}

// ── CACHÉ DE CURSOS ───────────────────────────────
let cursosCache = {};
let ultimaActualizacion = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

let conversaciones = {};

// ── AIRTABLE ──────────────────────────────────────
async function cargarCursosDeAirtable() {
  try {
    const res = await axios.get(`${AT_URL}/Cursos`, { headers: AT_HDR });
    const registros = res.data.records || [];
    const nuevos = {};
    for (const rec of registros) {
      const f = rec.fields;
      if (!f.Clave) continue;
      const clave = f.Clave.toUpperCase().trim();
      nuevos[clave] = {
        _id:        rec.id,
        nombre:     f.Nombre      || '',
        precio:     f.Precio      || '',
        descripcion:f.Descripcion || '',
        modalidad:  f.Modalidad   || '1dia_6h',
        fecha1:     f.Fecha1      || '',
        fecha2:     f.Fecha2      || '',
        lugares:    Number(f.Lugares) || 0,
        link:       f.Link        || '',
        pdf:        f.PDF && f.PDF.length > 0 ? f.PDF[0].url      : null,
        pdfNombre:  f.PDF && f.PDF.length > 0 ? f.PDF[0].filename : null,
      };
    }
    cursosCache = nuevos;
    ultimaActualizacion = Date.now();
    console.log(`✓ ${Object.keys(nuevos).length} cursos cargados de Airtable`);
    return nuevos;
  } catch (e) {
    console.error('Error cargando cursos:', e.response?.data || e.message);
    return cursosCache;
  }
}

async function getCursos() {
  if (!ultimaActualizacion || Date.now() - ultimaActualizacion > CACHE_TTL) {
    await cargarCursosDeAirtable();
  }
  return cursosCache;
}

async function crearCursoAirtable(data) {
  const res = await axios.post(`${AT_URL}/Cursos`, {
    fields: {
      Nombre:      data.nombre,
      Clave:       data.clave.toUpperCase(),
      Precio:      data.precio,
      Descripcion: data.descripcion,
      Modalidad:   data.modalidad,
      Fecha1:      data.fecha1 || null,
      Fecha2:      data.fecha2 || null,
      Lugares:     Number(data.lugares) || 0,
      Link:        data.link,
    }
  }, { headers: AT_HDR });
  ultimaActualizacion = null;
  return res.data;
}

async function actualizarCursoAirtable(id, data) {
  const res = await axios.patch(`${AT_URL}/Cursos/${id}`, {
    fields: {
      Nombre:      data.nombre,
      Clave:       data.clave?.toUpperCase(),
      Precio:      data.precio,
      Descripcion: data.descripcion,
      Modalidad:   data.modalidad,
      Fecha1:      data.fecha1 || null,
      Fecha2:      data.fecha2 || null,
      Lugares:     Number(data.lugares) || 0,
      Link:        data.link,
    }
  }, { headers: AT_HDR });
  ultimaActualizacion = null;
  return res.data;
}

async function eliminarCursoAirtable(id) {
  await axios.delete(`${AT_URL}/Cursos/${id}`, { headers: AT_HDR });
  ultimaActualizacion = null;
}

// ── WHATSAPP ──────────────────────────────────────
async function enviarTexto(to, texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: texto } },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ Texto enviado a ${to}`);
  } catch (e) {
    console.error('Error texto:', e.response?.data?.error?.message);
    await enviarPlantillaBienvenida(to);
  }
}

async function enviarPDF(to, pdfUrl, nombreArchivo, caption) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: { link: pdfUrl, filename: nombreArchivo || 'informacion_curso.pdf', caption: caption || '' }
      },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ PDF enviado a ${to}`);
  } catch (e) {
    console.error('Error PDF:', e.response?.data || e.message);
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
  let fechaTexto = '', horarioTexto = '';
  if (modalidad === '1dia_6h') {
    fechaTexto   = f1 ? `📅 *Fecha:* ${f1}` : '';
    horarioTexto = '🕘 *Horario:* 9:00 am – 3:00 pm (6 horas)';
  } else if (modalidad === '2dias_4h') {
    fechaTexto   = [f1?`📅 *Día 1:* ${f1}`:'', f2?`📅 *Día 2:* ${f2}`:''].filter(Boolean).join('\n');
    horarioTexto = '🕘 *Horario:* 9:00 am – 1:00 pm cada día (4h/día)';
  } else if (modalidad === '2dias_6h') {
    fechaTexto   = [f1?`📅 *Día 1:* ${f1}`:'', f2?`📅 *Día 2:* ${f2}`:''].filter(Boolean).join('\n');
    horarioTexto = '🕘 *Horario:* 9:00 am – 3:00 pm cada día (6h/día)';
  }
  return { fechaTexto, horarioTexto };
}

// ── GENERAR MENSAJES ──────────────────────────────
function generarRespuestaCurso(curso) {
  const { fechaTexto, horarioTexto } = generarInfoFechas(curso);
  const lugares = Number(curso.lugares) || 0;
  const lugaresTexto = lugares <= 5
    ? `⚠️ *Lugares disponibles:* ${lugares} (¡Últimos lugares!)`
    : `✅ *Lugares disponibles:* ${lugares}`;
  return [
    `🎓 *${curso.nombre}*`, ``,
    `📋 *Descripción:*\n${curso.descripcion}`, ``,
    fechaTexto, horarioTexto,
    `💰 *Precio:* ${curso.precio}`,
    lugaresTexto,
    curso.link ? `🔗 *Más información:* ${curso.link}` : '',
    ``,
    curso.pdf ? `📄 Te envío a continuación el PDF con toda la información del curso.` : '',
    `¿Te gustaría inscribirte? Responde *SÍ* y un asesor te contactará en breve. 😊`
  ].filter(l => l !== null && l !== undefined).join('\n');
}

function generarCatalogo(cursos) {
  const entradas = Object.entries(cursos);
  if (!entradas.length) return '📚 Aún no tenemos cursos disponibles. ¡Pronto tendremos novedades!';
  const lista = entradas.map(([clave, c]) => {
    const { fechaTexto } = generarInfoFechas(c);
    const primeraFecha = fechaTexto ? fechaTexto.split('\n')[0].replace(/📅 \*.*?\* /, '') : 'Próximamente';
    return `▸ *${clave}* — ${c.nombre}\n   💰 ${c.precio} | 📅 ${primeraFecha} | ✅ ${c.lugares} lugares`;
  }).join('\n\n');
  return `📚 *Catálogo de Cursos Disponibles*\n\n${lista}\n\n👉 Escribe el código del curso (ej. *CURSO-A*) para ver detalles y recibir el PDF informativo.`;
}

// ── PROCESAR MENSAJE ──────────────────────────────
async function procesarMensaje(from, texto) {
  const msg = texto.trim().toUpperCase();
  const cursos = await getCursos();

  if (cursos[msg]) {
    const curso = cursos[msg];
    await enviarTexto(from, generarRespuestaCurso(curso));
    if (curso.pdf) await enviarPDF(from, curso.pdf, curso.pdfNombre, `📄 Información: ${curso.nombre}`);
    return;
  }
  if (['CURSOS', 'CATALOGO', 'CATÁLOGO', 'INFO'].includes(msg)) {
    await enviarTexto(from, generarCatalogo(cursos)); return;
  }
  if (['SÍ', 'SI', 'YES', 'QUIERO'].includes(msg)) {
    await enviarTexto(from, `✅ ¡Excelente! Hemos registrado tu interés.\n\nUn asesor te contactará en las próximas horas. 😊`); return;
  }
  if (['HOLA', 'BUENAS', 'HI', 'HELLO', 'BUEN DIA', 'BUENOS DIAS', 'BUENAS TARDES'].includes(msg)) {
    await enviarTexto(from, `¡Hola! 👋 Bienvenido a *Cursos Online*.\n\n📚 Escribe *CURSOS* para ver nuestro catálogo\n🔤 O escribe el código del curso (ej. *CURSO-A*)\n\n¿En qué puedo ayudarte?`); return;
  }
  await enviarTexto(from, `Hola 👋 Escribe *CURSOS* para ver el catálogo, o el código del curso que te interesa (ej. *CURSO-A*).`);
}

// ── WEBHOOK ───────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) { res.status(200).send(challenge); }
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
        await procesarMensaje(from, texto);
        conversaciones[from].push({ dir: 'sent', texto: '(respuesta enviada)', ts: new Date().toISOString() });
      }
    }
  }
});

// ── API ───────────────────────────────────────────
app.get('/api/cursos', async (req, res) => {
  const cursos = await getCursos();
  res.json(cursos);
});

app.post('/api/cursos', async (req, res) => {
  try {
    const { clave, nombre } = req.body;
    if (!clave || !nombre) return res.status(400).json({ error: 'Clave y nombre requeridos' });
    const existente = cursosCache[clave.toUpperCase()];
    if (existente) { await actualizarCursoAirtable(existente._id, req.body); }
    else { await crearCursoAirtable(req.body); }
    const cursos = await cargarCursosDeAirtable();
    res.json({ ok: true, cursos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cursos/:clave', async (req, res) => {
  try {
    const clave = req.params.clave.toUpperCase();
    const curso = cursosCache[clave];
    if (!curso) return res.status(404).json({ error: 'No encontrado' });
    await eliminarCursoAirtable(curso._id);
    await cargarCursosDeAirtable();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/conversaciones', (req, res) => res.json(conversaciones));

app.post('/api/enviar', async (req, res) => {
  const { to, texto } = req.body;
  if (!to || !texto) return res.status(400).json({ error: 'to y texto requeridos' });
  await enviarTexto(to, texto);
  if (!conversaciones[to]) conversaciones[to] = [];
  conversaciones[to].push({ dir: 'sent', texto, ts: new Date().toISOString() });
  res.json({ ok: true });
});

// Forzar recarga de Airtable
app.get('/api/reload', async (req, res) => {
  await cargarCursosDeAirtable();
  res.json({ ok: true, cursos: Object.keys(cursosCache).length });
});

app.get('/', (req, res) => res.json({ status: 'JARV ✓', cursos: Object.keys(cursosCache).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🤖 JARV en puerto ${PORT}`);
  await cargarCursosDeAirtable();
});
 
