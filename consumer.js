const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE_NAME = 'banking.events';
const QUEUE_NAME = 'banking.audit.queue';
const ROUTING_PATTERN = 'transaction.*';

async function startConsumer() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);

  channel.prefetch(1);

  console.log(`[Consumer] Listening on queue "${QUEUE_NAME}" for pattern "${ROUTING_PATTERN}" (modo lento: 1s por mensaje)`);

  channel.consume(QUEUE_NAME, async (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      console.log(`[Consumer] Procesando [${msg.fields.routingKey}]:`, content);

      await new Promise((resolve) => setTimeout(resolve,0)); 

      console.log(`[Consumer] Completado [${msg.fields.routingKey}] accountNumber=${content.accountNumber}`);
      channel.ack(msg);
    }
  }); 
}

startConsumer().catch((err) => {
  console.error('[Consumer] Failed to start:', err.message);
});

