// consumer.js -- Reemplaza el consumer.js basado en amqplib. Como la API
// REST de IBM MQ no soporta "push" de mensajes (a diferencia de
// channel.consume() de AMQP), este archivo hace "polling" -- consulta la
// cola repetidamente, usando el parametro 'wait' de IBM MQ para un
// long-poll (espera hasta 'wait' milisegundos por un mensaje nuevo antes
// de responder vacio, en vez de consultar sin parar en un bucle rapido).

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const IBM_MQ_REST_URL = process.env.IBM_MQ_REST_URL || 'https://ibm-mq-qa:9443';
const IBM_MQ_QMGR = process.env.IBM_MQ_QMGR || 'QM1';
const IBM_MQ_QUEUE = process.env.IBM_MQ_QUEUE || 'DEV.QUEUE.1';
const IBM_MQ_USUARIO = process.env.IBM_MQ_USUARIO || 'app';
const IBM_MQ_PASSWORD = process.env.IBM_MQ_PASSWORD || 'passw0rd123';
const WAIT_MS = 5000;

function _authHeader() {
  const auth = Buffer.from(`${IBM_MQ_USUARIO}:${IBM_MQ_PASSWORD}`).toString('base64');
  return `Basic ${auth}`;
}

async function consumirUnMensaje() {
  const url = `${IBM_MQ_REST_URL}/ibmmq/rest/v2/messaging/qmgr/${IBM_MQ_QMGR}/queue/${IBM_MQ_QUEUE}/message?wait=${WAIT_MS}`;

  const respuesta = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: _authHeader(),
      Accept: 'text/plain',
      'ibm-mq-rest-csrf-token': 'app-microservicio',
    },
  });

  if (respuesta.status === 200) {
    const texto = await respuesta.text();
    const contenido = JSON.parse(texto);
    console.log(`[Consumer] Procesando [${contenido.routingKey}]:`, contenido);
    console.log(`[Consumer] Completado [${contenido.routingKey}] accountNumber=${contenido.accountNumber}`);
    return true;
  }
  if (respuesta.status === 404) {
    // No habia ningun mensaje esperando dentro del tiempo de 'wait' --
    // esto es normal (cola vacia), no un error.
    return false;
  }
  console.error('[Consumer] Respuesta inesperada de IBM MQ:', respuesta.status);
  return false;
}

async function startConsumer() {
  console.log(`[Consumer] Listening on queue "${IBM_MQ_QUEUE}" via IBM MQ REST (modo polling, wait=${WAIT_MS}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await consumirUnMensaje();
    } catch (err) {
      console.error('[Consumer] Failed to poll:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

startConsumer().catch((err) => {
  console.error('[Consumer] Failed to start:', err.message);
});

module.exports = { startConsumer };