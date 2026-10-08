const db = require("../config/db");

// Get all invoices
const getAllInvoices = async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = `
            SELECT si.*, 
                   c.company_name as customer_name,
                   so.order_number
            FROM sales_invoices si
            LEFT JOIN customers c ON si.customer_id = c.id
            LEFT JOIN sales_orders so ON si.sales_order_id = so.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (si.invoice_number LIKE ? OR c.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND si.status = ?";
            params.push(status);
        }

        sql += " ORDER BY si.created_at DESC";
        const [invoices] = await db.query(sql, params);

        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error("Get invoices error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch invoices",
            error: error.message
        });
    }
};

// Get invoice by ID
const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const [invoices] = await db.query(
            `SELECT si.*, 
                    c.company_name as customer_name,
                    c.billing_address, c.shipping_address,
                    c.gstin as customer_gstin,
                    so.order_number
             FROM sales_invoices si
             LEFT JOIN customers c ON si.customer_id = c.id
             LEFT JOIN sales_orders so ON si.sales_order_id = so.id
             WHERE si.id = ?`,
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        const [items] = await db.query(
            "SELECT * FROM sales_invoice_items WHERE invoice_id = ?",
            [id]
        );

        // Get payments
        const [payments] = await db.query(
            "SELECT * FROM customer_payments WHERE invoice_id = ? ORDER BY payment_date DESC",
            [id]
        );

        res.json({
            success: true,
            data: {
                ...invoices[0],
                items,
                payments
            }
        });
    } catch (error) {
        console.error("Get invoice error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch invoice",
            error: error.message
        });
    }
};

// Get outstanding invoices
const getOutstandingInvoices = async (req, res) => {
    try {
        const [invoices] = await db.query(`
            SELECT si.*, 
                   c.company_name as customer_name,
                   c.mobile as customer_mobile,
                   DATEDIFF(CURDATE(), si.due_date) as days_overdue
            FROM sales_invoices si
            LEFT JOIN customers c ON si.customer_id = c.id
            WHERE si.balance > 0
            ORDER BY si.due_date ASC
        `);

        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error("Get outstanding error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch outstanding invoices",
            error: error.message
        });
    }
};

module.exports = {
    getAllInvoices,
    getInvoiceById,
    getOutstandingInvoices
};