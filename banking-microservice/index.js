require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Account = require('./account');

const app = express();
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bankdb')
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error:', err));

// 1. Consultar Saldo
app.get('/saldo/:accountNumber', async (req, res) => {
    const acc = await Account.findOne({ accountNumber: req.params.accountNumber });
    acc ? res.json(acc) : res.status(404).json({ message: "Cuenta no encontrada" });
});

// 2. Retirar
app.post('/retiro', async (req, res) => {
    const { accountNumber, amount } = req.body;
    const acc = await Account.findOneAndUpdate(
        { accountNumber, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true }
    );
    acc ? res.json(acc) : res.status(400).json({ error: "Saldo insuficiente o cuenta inexistente" });
});

// 3. Enviar (Transferir)
app.post('/transferir', async (req, res) => {
    const { fromAccount, toAccount, amount } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const sender = await Account.findOneAndUpdate({ accountNumber: fromAccount, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { session, new: true });
        if (!sender) throw new Error("Emisor no encontrado o fondos insuficientes");
        
        const receiver = await Account.findOneAndUpdate({ accountNumber: toAccount }, { $inc: { balance: amount } }, { session, new: true });
        if (!receiver) throw new Error("Usuario no encontrado");
        
        await session.commitTransaction();
        res.json({ message: "Transferencia exitosa", sender, receiver });
    } catch (err) {
        await session.abortTransaction();
        res.status(400).json({ error: err.message });
    } finally {
        session.endSession();
    }
});

app.listen(3000, () => console.log('Servicio en puerto 3000'));