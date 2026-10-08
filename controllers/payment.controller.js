const db = require("../config/db");

// Get all customer payments
const getAllPayments = async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = `
            SELECT cp.*, 
                   c.company_name as customer_name,
                   si.invoice_number
            FROM customer_payments cp
            LEFT JOIN customers c ON cp.customer_id = c.id
            LEFT JOIN sales_invoices si ON cp.invoice_id = si.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (cp.payment_number LIKE ? OR c.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND cp.status = ?";
            params.push(status);
        }

        sql += " ORDER BY cp.created_at DESC";
        const [payments] = await db.query(sql, params);

        res.json({
            success: true,
            data: payments
        });
    } catch (error) {
        console.error("Get payments error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payments",
            error: error.message
        });
    }
};

// Create customer payment
const createPayment = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            invoice_id, customer_id, payment_date,
            amount, method, reference_number, remarks
        } = req.body;

        // Get invoice
        const [invoices] = await connection.query(
            "SELECT * FROM sales_invoices WHERE id = ?",
            [invoice_id]
        );

        if (invoices.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        const invoice = invoices[0];

        if (amount > invoice.balance) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Amount exceeds balance. Balance: ${invoice.balance}`
            });
        }

        // Generate payment number
        const [lastPayment] = await connection.query(
            "SELECT payment_number FROM customer_payments ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "PMT-00001";
        if (lastPayment.length > 0) {
            const lastNum = parseInt(lastPayment[0].payment_number.replace("PMT-", ""));
            newNumber = `PMT-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // Create payment
        const [result] = await connection.query(
            `INSERT INTO customer_payments (
                payment_number, invoice_id, customer_id, payment_date,
                amount, method, reference_number, status, remarks, received_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`,
            [
                newNumber, invoice_id, customer_id, payment_date,
                amount, method, reference_number, remarks, req.userId
            ]
        );

        // Update invoice
        const newPaidAmount = parseFloat(invoice.paid_amount) + parseFloat(amount);
        const newBalance = parseFloat(invoice.total) - newPaidAmount;
        let newStatus = "Partial";
        if (newBalance <= 0) newStatus = "Paid";

        await connection.query(
            `UPDATE sales_invoices 
             SET paid_amount = ?, balance = ?, status = ?
             WHERE id = ?`,
            [newPaidAmount, newBalance, newStatus, invoice_id]
        );

        await connection.commit();

        const [payment] = await connection.query(
            "SELECT * FROM customer_payments WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Payment recorded successfully",
            data: payment[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("Create payment error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to record payment",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
    try {
        const { id } = req.params;

        const [payments] = await db.query(
            `SELECT cp.*, 
                    c.company_name as customer_name,
                    si.invoice_number, si.total as invoice_total
             FROM customer_payments cp
             LEFT JOIN customers c ON cp.customer_id = c.id
             LEFT JOIN sales_invoices si ON cp.invoice_id = si.id
             WHERE cp.id = ?`,
            [id]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        res.json({
            success: true,
            data: payments[0]
        });
    } catch (error) {
        console.error("Get payment error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payment",
            error: error.message
        });
    }
};

// Get payment summary
const getPaymentSummary = async (req, res) => {
    try {
        const [summary] = await db.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Completed' THEN amount ELSE 0 END), 0) as total_received,
                COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0) as total_pending,
                COUNT(*) as total_payments,
                COUNT(CASE WHEN MONTH(payment_date) = MONTH(CURDATE()) AND YEAR(payment_date) = YEAR(CURDATE()) THEN 1 END) as this_month_count,
                COALESCE(SUM(CASE WHEN MONTH(payment_date) = MONTH(CURDATE()) AND YEAR(payment_date) = YEAR(CURDATE()) THEN amount ELSE 0 END), 0) as this_month_amount
            FROM customer_payments
        `);

        res.json({
            success: true,
            data: summary[0]
        });
    } catch (error) {
        console.error("Get payment summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch summary",
            error: error.message
        });
    }
};

module.exports = {
    getAllPayments,
    createPayment,
    getPaymentById,
    getPaymentSummary
};