const { connectRabbitMQ, publishEvent } = require('./config/rabbitmq');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Account = require('./Account');

const app = express();
app.use(express.json());

//Conexión a MongoDB 
console.log('URI:', process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/bankdb?retryWrites=false')
  .then(() => {
    console.log('MongoDB conectado exitosamente');
    connectRabbitMQ();
    app.listen(3000, () => console.log('Servicio corriendo en puerto 3000'));
  })
  .catch(err => console.error('Error de conexión:', err));
//Ruta de prueba
app.get('/test', (req, res) => res.json({ status: "OK", message: "Microservicio operativo" }));

// 1. Crear cuenta
// 1. Crear cuenta
app.post('/cuenta', async (req, res) => {
    try {
        const { accountNumber, owner, balance } = req.body;
        const cuenta = new Account({ accountNumber, owner, balance });
        await cuenta.save();
        /// Cuenta
        await publishEvent('transaction.cuenta', {
            evento: 'CUENTA_CREADA',
            accountNumber: cuenta.accountNumber,
            owner: cuenta.owner,
            balance: cuenta.balance,
            idRegistro: cuenta._id
        });

        res.status(201).json(cuenta);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// 2. Consultar Saldo cuenta
app.get('/saldo/:accountNumber', async (req, res) => {
    try {
        const acc = await Account.findOne({ accountNumber: req.params.accountNumber });
        acc ? res.json(acc) : res.status(404).json({ message: "Cuenta no existe" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3.Retirar
// 3.Retirar
app.post('/retiro', async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;
        const acc = await Account.findOneAndUpdate(
            { accountNumber, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { new: true }
        );

        if (!acc) return res.status(400).json({ error: "Saldo insuficiente" });

        await publishEvent('transaction.withdraw', {
            accountNumber: acc.accountNumber,
            amount: amount,
            newBalance: acc.balance
        });

        res.json(acc);
    } catch (err) { res.status(500).json({ error: err.message }); }
});



