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

// ── CONFIGURACIÓN ─────────────────────────────────
const WA_TOKEN     = process.env.WA_TOKEN     || 'EAANorwrMgogBRCbOggwCPVtdo40MUZAtIeixevvPYJMP1cuqR9aM1FPTxij9zKheYf7qrIC0yCwOjJqwwinZCp2EIkBWbQ0xwlbL3fVHzB3EIGW1qBq2adQDZAn6sPULiXi1JyJtXxTQU2wfif8nhjh7tSfZCKyjQdemdCzZAbCWbaEfidtJYJfZABOYD4yJeEDzU7ZBPZAgZBU8gicwhj1Ip0PianyFXkxYsCtksQoSG';
const WA_PHONE_ID  = process.env.WA_PHONE_ID  || '1087781197744698';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'jarv_verify_2024';

// ── BASE DE CURSOS ────────────────────────────────
let cursos = {};

// Historial de conversaciones en memoria
let conversaciones = {};

// ── ENVIAR MENSAJE DE TEXTO LIBRE ─────────────────
async function enviarMensaje(to, texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { preview_url: false, body: texto }
      },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ Mensaje enviado a ${to}`);
  } catch (e) {
    console.error('Error en texto libre, intentando plantilla...', e.response?.data?.error?.message);
    // Si falla texto libre, usar plantilla aprobada
    await enviarPlantillaBienvenida(to);
  }
}

// ── ENVIAR PLANTILLA APROBADA ─────────────────────
async function enviarPlantillaBienvenida(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: 'bienvenida_cursos',
          language: { code: 'es_MX' }
        }
      },
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✓ Plantilla bienvenida_cursos enviada a ${to}`);
  } catch (e) {
    console.error('Error enviando plantilla:', e.response?.data || e.message);
  }
}

// ── HELPERS ───────────────────────────────────────
function generarRespuestaCurso(clave) {
  const curso = cursos[clave.toUpperCase()];
  if (!curso) return null;
  return `🎓 *${curso.nombre}*\n\n📋 *Descripción:*\n${curso.descripcion}\n\n⏱ *Duración:* ${curso.duracion}\n💰 *Precio:* ${curso.precio}\n\n🔗 *Más información:*\n${curso.link || 'Próximamente'}\n\n¿Te gustaría inscribirte? Responde *SÍ* y un asesor te contactará en breve. 😊`;
}

function generarCatalogo() {
  const entradas = Object.entries(cursos);
  if (!entradas.length) return '📚 Aún no tenemos cursos registrados. ¡Pronto tendremos novedades!';
  const lista = entradas.map(([clave, c]) =>
    `▸ *${clave}* — ${c.nombre}\n   💰 ${c.precio} | ⏱ ${c.duracion}`
  ).join('\n\n');
  return `📚 *Catálogo de Cursos Disponibles*\n\n${lista}\n\n👉 Escribe el código del curso que te interesa (ej. *CURSO-A*) para recibir información completa.`;
}

function procesarMensaje(from, texto) {
  const msg = texto.trim().toUpperCase();

  // Detectar palabra clave de curso
  if (cursos[msg]) return generarRespuestaCurso(msg);

  // Catálogo
  if (['CURSOS', 'CATALOGO', 'CATÁLOGO', 'INFO'].includes(msg)) return generarCatalogo();

  // Confirmación
  if (['SÍ', 'SI', 'YES', 'QUIERO'].includes(msg))
    return `✅ ¡Excelente! Hemos registrado tu interés.\n\nUn asesor te contactará en las próximas horas para completar tu inscripción.\n\n¿Tienes alguna pregunta mientras tanto?`;

  // Saludo
  if (['HOLA', 'BUENAS', 'HI', 'HELLO', 'BUEN DIA', 'BUENOS DIAS', 'BUENAS TARDES'].includes(msg))
    return `¡Hola! 👋 Bienvenido a *Cursos Online*.\n\nPuedes:\n\n📚 Escribir *CURSOS* para ver nuestro catálogo\n🔤 Escribir el código de un curso (ej. *CURSO-A*) si ya sabes cuál te interesa\n\n¿En qué puedo ayudarte?`;

  // Default
  return `Hola 👋 No entendí tu mensaje, pero puedo ayudarte con nuestros cursos.\n\nEscribe *CURSOS* para ver el catálogo, o el código del curso (ej. *CURSO-A*).`;
}

// ── WEBHOOK VERIFICACIÓN (GET) ────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✓ Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── WEBHOOK MENSAJES (POST) ───────────────────────
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

        const from  = msg.from;
        const texto = msg.text.body;
        const ts    = new Date().toISOString();

        console.log(`📨 Mensaje de ${from}: ${texto}`);

        if (!conversaciones[from]) conversaciones[from] = [];
        conversaciones[from].push({ dir: 'received', texto, ts });

        const respuesta = procesarMensaje(from, texto);
        await enviarMensaje(from, respuesta);

        conversaciones[from].push({ dir: 'sent', texto: respuesta, ts: new Date().toISOString() });
      }
    }
  }
});

// ── API DEL PANEL ─────────────────────────────────
app.get('/api/cursos', (req, res) => res.json(cursos));

app.post('/api/cursos', (req, res) => {
  const { clave, nombre, precio, duracion, descripcion, link } = req.body;
  if (!clave || !nombre) return res.status(400).json({ error: 'Clave y nombre requeridos' });
  cursos[clave.toUpperCase()] = { nombre, precio, duracion, descripcion, link };
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

// ── INICIAR ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 JARV corriendo en puerto ${PORT}`));
