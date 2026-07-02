const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE_NAME = 'banking.events';
const EXCHANGE_TYPE = 'topic';

let connection = null;
let channel = null;

async function connectRabbitMQ() {
  if (channel) return channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err.message);
    });

    connection.on('close', () => {
      console.warn('[RabbitMQ] Connection closed, retrying in 5s...');
      channel = null;
      setTimeout(connectRabbitMQ, 5000);
    });

    console.log('[RabbitMQ] Connected and exchange asserted:', EXCHANGE_NAME);
    return channel;
  } catch (err) {
    console.error('[RabbitMQ] Failed to connect, retrying in 5s...', err.message);
    setTimeout(connectRabbitMQ, 5000);
  }
}

async function publishEvent(routingKey, payload) {
  if (!channel) {
    console.error('[RabbitMQ] No channel available, event not sent:', routingKey);
    return false;
  }

  const message = Buffer.from(JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  }));

  return channel.publish(EXCHANGE_NAME, routingKey, message, { persistent: true });
}

module.exports = { connectRabbitMQ, publishEvent, EXCHANGE_NAME };