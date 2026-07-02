const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE_NAME = 'banking.events';
const QUEUE_NAME = 'banking.audit.queue';
const ROUTING_PATTERN = 'transaction.*'; // captura withdraw, transfer, etc.

async function startConsumer() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);

  console.log(`[Consumer] Listening on queue "${QUEUE_NAME}" for pattern "${ROUTING_PATTERN}"`);

  channel.consume(QUEUE_NAME, (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      console.log(`[Consumer] Event received [${msg.fields.routingKey}]:`, content);

      // Aquí simularías lo que haría API Connect / un sistema downstream:
      // auditoría, notificación, sincronización con otro sistema, etc.

      channel.ack(msg);
    }
  });
}

startConsumer().catch((err) => {
  console.error('[Consumer] Failed to start:', err.message);
});