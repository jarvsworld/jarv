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
const WA_TOKEN    = process.env.WA_TOKEN    || 'EAANorwrMgogBRCbOggwCPVtdo40MUZAtIeixevvPYJMP1cuqR9aM1FPTxij9zKheYf7qrIC0yCwOjJqwwinZCp2EIkBWbQ0xwlbL3fVHzB3EIGW1qBq2adQDZAn6sPULiXi1JyJtXxTQU2wfif8nhjh7tSfZCKyjQdemdCzZAbCWbaEfidtJYJfZABOYD4yJeEDzU7ZBPZAgZBU8gicwhj1Ip0PianyFXkxYsCtksQoSG';
const WA_PHONE_ID = process.env.WA_PHONE_ID || '1087781197744698';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'jarv_verify_2024';

// ── BASE DE CURSOS (editable desde el panel) ──────
let cursos = {
  'CURSO-A': {
    nombre: 'Marketing Digital Avanzado',
    precio: '$1,500 MXN',
    duracion: '8 semanas',
    descripcion: 'Domina las redes sociales, publicidad pagada y estrategias de contenido para hacer crecer tu negocio.',
    link: 'https://tulink.com/marketing-digital'
  },
  'CURSO-B': {
    nombre: 'Excel para Negocios',
    precio: '$800 MXN',
    duracion: '4 semanas',
    descripcion: 'Aprende a usar Excel para análisis de datos, reportes y automatización de tareas.',
    link: 'https://tulink.com/excel-negocios'
  },
  'CURSO-C': {
    nombre: 'Community Manager Pro',
    precio: '$1,200 MXN',
    duracion: '6 semanas',
    descripcion: 'Gestiona redes sociales profesionalmente y construye comunidades que venden.',
    link: 'https://tulink.com/community-manager'
  }
};

// Historial de conversaciones en memoria
let conversaciones = {};

// ── HELPERS ───────────────────────────────────────
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
    console.error('Error enviando mensaje:', e.response?.data || e.message);
  }
}

function generarRespuestaCurso(clave) {
  const curso = cursos[clave.toUpperCase()];
  if (!curso) return null;
  return `🎓 *${curso.nombre}*\n\n📋 *Descripción:*\n${curso.descripcion}\n\n⏱ *Duración:* ${curso.duracion}\n💰 *Precio:* ${curso.precio}\n\n🔗 *Más información:*\n${curso.link}\n\n¿Te gustaría inscribirte? Responde *SÍ* y un asesor te contactará en breve. 😊`;
}

function generarCatalogo() {
  const lista = Object.entries(cursos).map(([clave, c]) =>
    `▸ *${clave}* — ${c.nombre}\n   💰 ${c.precio} | ⏱ ${c.duracion}`
  ).join('\n\n');
  return `📚 *Catálogo de Cursos Disponibles*\n\n${lista}\n\n👉 Escribe el código del curso que te interesa (ej. *CURSO-A*) para recibir información completa.`;
}

function procesarMensaje(from, texto) {
  const msg = texto.trim().toUpperCase();

  // Detectar palabra clave de curso
  if (cursos[msg]) {
    return generarRespuestaCurso(msg);
  }

  // Catálogo
  if (msg === 'CURSOS' || msg === 'CATALOGO' || msg === 'CATÁLOGO' || msg === 'INFO') {
    return generarCatalogo();
  }

  // Confirmación de interés
  if (msg === 'SÍ' || msg === 'SI' || msg === 'YES' || msg === 'QUIERO') {
    return `✅ ¡Excelente! Hemos registrado tu interés.\n\nUn asesor te contactará en las próximas horas para completar tu inscripción.\n\n¿Tienes alguna pregunta mientras tanto?`;
  }

  // Saludo
  if (['HOLA', 'BUENAS', 'HI', 'HELLO', 'BUEN DIA', 'BUENOS DIAS', 'BUENAS TARDES'].includes(msg)) {
    return `¡Hola! 👋 Bienvenido a *Cursos Online*.\n\nEstoy aquí para ayudarte. Puedes:\n\n📚 Escribir *CURSOS* para ver nuestro catálogo\n🔤 Escribir el código de un curso (ej. *CURSO-A*) si ya sabes cuál te interesa\n\n¿En qué puedo ayudarte?`;
  }

  // Respuesta por defecto
  return `Hola 👋 No entendí tu mensaje, pero puedo ayudarte con nuestros cursos.\n\nEscribe *CURSOS* para ver el catálogo completo, o el código del curso que buscas (ej. *CURSO-A*).`;
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
  res.sendStatus(200); // Responder rápido a Meta

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

        // Guardar en historial
        if (!conversaciones[from]) conversaciones[from] = [];
        conversaciones[from].push({ dir: 'received', texto, ts });

        // Procesar y responder
        const respuesta = procesarMensaje(from, texto);
        await enviarMensaje(from, respuesta);

        // Guardar respuesta en historial
        conversaciones[from].push({ dir: 'sent', texto: respuesta, ts: new Date().toISOString() });
      }
    }
  }
});

// ── API DEL PANEL ─────────────────────────────────
// Obtener cursos
app.get('/api/cursos', (req, res) => res.json(cursos));

// Actualizar/crear curso
app.post('/api/cursos', (req, res) => {
  const { clave, nombre, precio, duracion, descripcion, link } = req.body;
  if (!clave || !nombre) return res.status(400).json({ error: 'Clave y nombre son requeridos' });
  cursos[clave.toUpperCase()] = { nombre, precio, duracion, descripcion, link };
  res.json({ ok: true, cursos });
});

// Eliminar curso
app.delete('/api/cursos/:clave', (req, res) => {
  delete cursos[req.params.clave.toUpperCase()];
  res.json({ ok: true });
});

// Obtener conversaciones
app.get('/api/conversaciones', (req, res) => res.json(conversaciones));

// Enviar mensaje manual
app.post('/api/enviar', async (req, res) => {
  const { to, texto } = req.body;
  if (!to || !texto) return res.status(400).json({ error: 'to y texto son requeridos' });
  await enviarMensaje(to, texto);
  if (!conversaciones[to]) conversaciones[to] = [];
  conversaciones[to].push({ dir: 'sent', texto, ts: new Date().toISOString() });
  res.json({ ok: true });
});

// Health check
app.get('/', (req, res) => res.json({ status: 'JARV corriendo ✓', cursos: Object.keys(cursos).length }));

// ── INICIAR ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 JARV corriendo en puerto ${PORT}`));
