   const { connectIBMMQ, publishEvent, publishToQueue } = require('./config/ibmmq');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Account = require('./Account');
//
const app = express();
app.use(express.json());

// Conexión a MongoDB 
console.log('URI:', process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/bankdb?retryWrites=false')
  .then(() => {
    console.log('MongoDB conectado exitosamente');
    connectIBMMQ();
    app.listen(3000, () => console.log('Servicio corriendo en puerto 3000'));
  })
  .catch(err => console.error('Error de conexión:', err));
   mongoose.connection.on('disconnected', () => {
  console.error('[Mongo] Desconectado - el servicio esta operando sin base de datos');
});

mongoose.connection.on('reconnected', () => {
  console.log('[Mongo] Reconectado exitosamente - servicio recuperado');
});
// Ruta de prueba
app.get('/test', (req, res) => res.json({ status: "OK", message: "Microservicio operativo" }));

// 1. Crear cuenta
app.post('/cuenta', async (req, res) => {
    try {
        const { accountNumber, owner, balance } = req.body;

        // BARRERA QA: No permitir cuentas con saldo inicial negativo o inválido
        if (typeof balance !== 'number' || balance < 0) {
            return res.status(400).json({ error: "El balance inicial debe ser un número válido y no negativo" });
        }

        const cuenta = new Account({ accountNumber, owner, balance });
        await cuenta.save();
        
        await publishEvent('transaction.cuenta', {
            evento: 'CUENTA_CREADA',
            accountNumber: cuenta.accountNumber,
            owner: cuenta.owner,
            balance: cuenta.balance,
            idRegistro: cuenta._id
        });

        const COLAS_DESTINO_CUENTA = ['DEV.QUEUE.2', 'DEV.QUEUE.3', 'DEV.QUEUE.4', 'DEV.QUEUE.5'];

        await Promise.all(
            COLAS_DESTINO_CUENTA.map(cola => publishToQueue(cola, 'transaction.cuenta', {
                evento: 'CUENTA_CREADA',
                accountNumber: cuenta.accountNumber,
                owner: cuenta.owner,
                balance: cuenta.balance,
            }))
        );

        res.status(201).json(cuenta);
    } catch (err) { 
        console.error('[POST /cuenta] Error:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// 2. Consultar Saldo cuenta
app.get('/saldo/:accountNumber', async (req, res) => {
    try {
        const acc = await Account.findOne({ accountNumber: req.params.accountNumber });
        acc ? res.json(acc) : res.status(404).json({ message: "Cuenta no existe" });
   } catch (err) { 
        console.error('[GET /saldo] Error:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// 3. Retirar
app.post('/retiro', async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;

        // =========================================================
        // NUEVA BARRERA: Protección contra Inyección NoSQL
        // =========================================================
        if (typeof accountNumber !== 'string') {
            return res.status(400).json({ 
                error: "Formato de cuenta inválido. Se detectó un payload no permitido." 
            });
        }

        const montoNumerico = Number(amount);

        if (isNaN(montoNumerico) || montoNumerico <= 0) {
            return res.status(400).json({ error: "El monto debe ser un número válido y mayor a cero" });
        }

        

        const acc = await Account.findOneAndUpdate(
            { accountNumber, balance: { $gte: montoNumerico } },
            { $inc: { balance: -montoNumerico } },
            { new: true }
        );

        if (!acc) {
            const cuentaExiste = await Account.findOne({ accountNumber });
            if (!cuentaExiste) return res.status(404).json({ error: "Cuenta no existe" });
            return res.status(400).json({ error: "Saldo insuficiente" });
        }

        await publishEvent('transaction.withdraw', {
            accountNumber: acc.accountNumber,
            amount: montoNumerico,
            newBalance: acc.balance
        });

        const COLAS_DESTINO_RETIRO = ['DEV.QUEUE.3', 'DEV.QUEUE.4'];

        await Promise.all(
            COLAS_DESTINO_RETIRO.map(cola => publishToQueue(cola, 'transaction.withdraw', {
                accountNumber: acc.accountNumber,
                amount: montoNumerico,
                newBalance: acc.balance
            }))
        );

        res.json(acc);
    } catch (err) { 
        console.error('[POST /retiro] Error:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});