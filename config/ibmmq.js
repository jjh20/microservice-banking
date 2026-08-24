// config/ibmmq.js -- Reemplaza config/rabbitmq.js. Publica eventos hacia
// IBM MQ usando su API REST de mensajeria (mqweb), en vez de un cliente
// AMQP nativo -- evita tener que compilar la libreria nativa de IBM MQ
// (paquete 'ibmmq') dentro de la imagen Docker, algo mucho mas riesgoso
// de armar bien a un dia de una demostracion.
//
// Nota de diseno: IBM MQ (a diferencia de RabbitMQ) no tiene el concepto
// de "exchange" ni "routing key" a nivel de broker -- es mas simple,
// centrado en colas. Para no complicar la configuracion del Queue
// Manager antes de la demo, el "routingKey" se guarda DENTRO del propio
// mensaje JSON (en vez de usarse para enrutar a nivel de broker como en
// RabbitMQ). El consumidor lo lee del payload para saber que tipo de
// evento es.

const IBM_MQ_REST_URL = process.env.IBM_MQ_REST_URL || 'https://ibm-mq-qa:9443';
const IBM_MQ_QMGR = process.env.IBM_MQ_QMGR || 'QM1';
const IBM_MQ_QUEUE = process.env.IBM_MQ_QUEUE || 'DEV.QUEUE.1';
const IBM_MQ_USUARIO = process.env.IBM_MQ_USUARIO || 'app';
const IBM_MQ_PASSWORD = process.env.IBM_MQ_PASSWORD || 'passw0rd123';

// El certificado de la instalacion de desarrollo de IBM MQ es
// autofirmado (mismo motivo por el que usamos 'curl -k' en las pruebas
// manuales) -- esto desactiva la verificacion de certificado para TODO
// el proceso de Node. Aceptable en un ambiente de practica; en
// produccion real, se recomienda usar el certificado real del banco en
// vez de desactivar esta verificacion.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function _authHeader() {
  const auth = Buffer.from(`${IBM_MQ_USUARIO}:${IBM_MQ_PASSWORD}`).toString('base64');
  return `Basic ${auth}`;
}

async function connectIBMMQ() {
  // A diferencia de RabbitMQ, la API REST no mantiene una conexion
  // persistente -- cada llamada es una peticion HTTP independiente. Esta
  // funcion solo confirma que el servidor mqweb responde, imitando la
  // forma de uso del connectRabbitMQ() original (para no tener que
  // cambiar el resto del archivo que la llama).
  try {
    const respuesta = await fetch(`${IBM_MQ_REST_URL}/ibmmq/rest/v2/admin/installation`, {
      headers: { Authorization: _authHeader() },
    });
    // 401 tambien confirma que mqweb SI esta vivo (solo que ese endpoint
    // puntual requiere un usuario con mas privilegios) -- lo unico que
    // nos interesa aqui es que el servidor responda algo, sin importar
    // el codigo exacto.
    if (respuesta.status < 500) {
      console.log('[IBM MQ] Connected -- servidor mqweb responde en', IBM_MQ_REST_URL);
    } else {
      throw new Error(`status ${respuesta.status}`);
    }
  } catch (err) {
    console.error('[IBM MQ] Failed to connect, retrying in 5s...', err.message);
    setTimeout(connectIBMMQ, 5000);
  }
}

async function publishToQueue(queueName, routingKey, payload) {
  const mensaje = JSON.stringify({
    ...payload,
    routingKey,
    timestamp: new Date().toISOString(),
  });

  const url = `${IBM_MQ_REST_URL}/ibmmq/rest/v2/messaging/qmgr/${IBM_MQ_QMGR}/queue/${queueName}/message`;

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: _authHeader(),
        'Content-Type': 'text/plain;charset=utf-8',
        'ibm-mq-rest-csrf-token': 'app-microservicio',
      },
      body: mensaje,
    });
    if (!respuesta.ok) {
      console.error('[IBM MQ] No se pudo publicar el evento:', routingKey, '-- status', respuesta.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[IBM MQ] Error publicando evento:', routingKey, err.message);
    return false;
  }
}

async function publishEvent(routingKey, payload) {
  return publishToQueue(IBM_MQ_QUEUE, routingKey, payload);
}

module.exports = { connectIBMMQ, publishEvent, publishToQueue };