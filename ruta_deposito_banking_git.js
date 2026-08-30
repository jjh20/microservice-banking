// 4. Depositar (acreditar saldo) -- usado por otros microservicios,
// ej. prestamos, para acreditar un desembolso en la cuenta destino.
app.post('/deposito', async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;

        // Misma barrera de proteccion contra inyeccion NoSQL que en /retiro
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
            { accountNumber },
            { $inc: { balance: montoNumerico } },
            { new: true }
        );

        if (!acc) {
            return res.status(404).json({ error: "Cuenta no existe" });
        }

        await publishEvent('transaction.deposit', {
            accountNumber: acc.accountNumber,
            amount: montoNumerico,
            newBalance: acc.balance
        });

        const COLAS_DESTINO_DEPOSITO = ['DEV.QUEUE.3', 'DEV.QUEUE.4'];

        await Promise.all(
            COLAS_DESTINO_DEPOSITO.map(cola => publishToQueue(cola, 'transaction.deposit', {
                accountNumber: acc.accountNumber,
                amount: montoNumerico,
                newBalance: acc.balance
            }))
        );

        res.json(acc);
    } catch (err) {
        console.error('[POST /deposito] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
