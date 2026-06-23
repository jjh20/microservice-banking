require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Account = require('./Account');

const app = express();
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/bankdb')
  .then(() => {
    console.log('MongoDB conectado exitosamente');
    app.listen(3000, () => console.log('Servicio corriendo en puerto 3000'));
  })
  .catch(err => console.error('Error de conexión:', err));

// Ruta de prueba
app.get('/test', (req, res) => res.json({ status: "OK", message: "Microservicio operativo" }));

// 0. Crear cuenta
app.post('/cuenta', async (req, res) => {
    try {
        const { accountNumber, owner, balance } = req.body;
        const cuenta = new Account({ accountNumber, owner, balance });
        await cuenta.save();
        res.status(201).json(cuenta);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 1. Consultar Saldo
app.get('/saldo/:accountNumber', async (req, res) => {
    try {
        const acc = await Account.findOne({ accountNumber: req.params.accountNumber });
        acc ? res.json(acc) : res.status(404).json({ message: "Cuenta no encontrada" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Retirar
app.post('/retiro', async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;
        const acc = await Account.findOneAndUpdate(
            { accountNumber, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { new: true }
        );
        acc ? res.json(acc) : res.status(400).json({ error: "Saldo insuficiente o cuenta inexistente" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Transferir
app.post('/transferir', async (req, res) => {
    const { fromAccount, toAccount, amount } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const sender = await Account.findOneAndUpdate({ accountNumber: fromAccount, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { session, new: true });
        if (!sender) throw new Error("Emisor no encontrado o fondos insuficientes");
        
        const receiver = await Account.findOneAndUpdate({ accountNumber: toAccount }, { $inc: { balance: amount } }, { session, new: true });
        if (!receiver) throw new Error("Usuario receptor no encontrado");
        
        await session.commitTransaction();
        res.json({ message: "Transferencia exitosa", sender, receiver });
    } catch (err) {
        await session.abortTransaction();
        res.status(400).json({ error: err.message });
    } finally {
        session.endSession();
    }
});