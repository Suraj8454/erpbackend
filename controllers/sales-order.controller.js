const db = require("../config/db");
const { randomUUID } = require("crypto");  

// Get all sales orders
const getAllSalesOrders = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT so.*, 
                   c.company_name as customer_name,
                   CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            LEFT JOIN users u ON so.salesperson_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (so.order_number LIKE ? OR c.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND so.status = ?";
            params.push(status);
        }

        sql += " ORDER BY so.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [orders] = await db.query(sql, params);

        // Get items count
        for (let i = 0; i < orders.length; i++) {
            const [items] = await db.query(
                "SELECT COUNT(*) as count FROM sales_order_items WHERE sales_order_id = ?",
                [orders[i].id]
            );
            orders[i].items_count = items[0].count;
        }

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error("Get sales orders error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch sales orders",
            error: error.message
        });
    }
};

// Get sales order by ID
const getSalesOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(
            `SELECT so.*, 
                    c.company_name as customer_name,
                    c.billing_address, c.shipping_address,
                    c.gstin as customer_gstin,
                    CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             LEFT JOIN users u ON so.salesperson_id = u.id
             WHERE so.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Sales order not found"
            });
        }

        const [items] = await db.query(
            "SELECT * FROM sales_order_items WHERE sales_order_id = ?",
            [id]
        );

        res.json({
            success: true,
            data: {
                ...orders[0],
                items
            }
        });
    } catch (error) {
        console.error("Get sales order error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch sales order",
            error: error.message
        });
    }
};

// Update sales order status
const updateSalesOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.query(
            "UPDATE sales_orders SET status = ? WHERE id = ?",
            [status, id]
        );

        const [order] = await db.query(
            "SELECT * FROM sales_orders WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Sales order status updated",
            data: order[0]
        });
    } catch (error) {
        console.error("Update sales order status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update status",
            error: error.message
        });
    }
};

// Dispatch sales order
const dispatchSalesOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { dispatch_date, transporter, vehicle_number, remarks } = req.body;

        // Update sales order
        await connection.query(
            `UPDATE sales_orders SET status = 'Dispatched' WHERE id = ?`,
            [id]
        );

        // Get items to update stock
        const [items] = await connection.query(
            "SELECT * FROM sales_order_items WHERE sales_order_id = ?",
            [id]
        );

        // Update stock ledger (stock out)
        for (const item of items) {
            // Get current balance
            const [currentStock] = await connection.query(
                `SELECT COALESCE(SUM(quantity_in) - SUM(quantity_out), 0) as balance
                 FROM stock_ledger
                 WHERE product_id = ?`,
                [item.product_id]
            );

            const currentBalance = currentStock[0].balance || 0;
            const newBalance = currentBalance - item.quantity;

            // Insert stock ledger entry
            await connection.query(
                `INSERT INTO stock_ledger (
                    product_id, transaction_type, reference_id, reference_number,
                    quantity_out, balance, transaction_date, created_by, remarks
                ) VALUES (?, 'Sales', ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                    item.product_id, id, `SO-DISPATCH`,
                    item.quantity, newBalance, req.userId,
                    `Dispatched for sales order`
                ]
            );

            // Update current_stock
            await connection.query(
                `UPDATE current_stock 
                 SET quantity = quantity - ?
                 WHERE product_id = ?`,
                [item.quantity, item.product_id]
            );
        }

        await connection.commit();

        res.json({
            success: true,
            message: "Sales order dispatched successfully"
        });
    } catch (error) {
        await connection.rollback();
        console.error("Dispatch sales order error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to dispatch sales order",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Generate invoice from sales order
const generateInvoice = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        console.log('🔄 Generating invoice for SO:', id);

        // Get sales order
        const [orders] = await connection.query(
            "SELECT * FROM sales_orders WHERE id = ?",
            [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Sales order not found"
            });
        }

        const order = orders[0];
        console.log('📋 Order:', order.order_number, '| Status:', order.status);

        // Check if invoice already exists
        const [existingInvoice] = await connection.query(
            "SELECT id, invoice_number FROM sales_invoices WHERE sales_order_id = ?",
            [id]
        );

        if (existingInvoice.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Invoice already exists: ${existingInvoice[0].invoice_number}`
            });
        }

        // Generate invoice number
        const [lastInvoice] = await connection.query(
            "SELECT invoice_number FROM sales_invoices ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "INV-00001";
        if (lastInvoice.length > 0) {
            const lastNum = parseInt(lastInvoice[0].invoice_number.replace("INV-", ""));
            newNumber = `INV-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID
        const invoiceId = randomUUID();

        // Due date = today + 30 days
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split("T")[0];

        // ✅ Insert invoice with explicit UUID
        await connection.query(
            `INSERT INTO sales_invoices (
                id, invoice_number, sales_order_id, customer_id,
                invoice_date, due_date, subtotal, discount,
                tax, total, paid_amount, balance, status
            ) VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, 0, ?, 'Unpaid')`,
            [
                invoiceId,
                newNumber,
                id,
                order.customer_id,
                dueDateStr,
                order.subtotal || 0,
                order.discount || 0,
                order.tax || 0,
                order.total || 0,
                order.total || 0
            ]
        );

        // Copy items
        const [orderItems] = await connection.query(
            "SELECT * FROM sales_order_items WHERE sales_order_id = ?",
            [id]
        );

        console.log('📦 Items to copy:', orderItems.length);

        for (const item of orderItems) {
            const itemId = randomUUID();

            await connection.query(
                `INSERT INTO sales_invoice_items (
                    id, invoice_id, product_id, product_name, grade,
                    quantity, unit, rate, discount_percent,
                    taxable_value, gst_rate, gst_amount, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    itemId,
                    invoiceId,
                    item.product_id || null,
                    item.product_name || 'Product',
                    item.grade || '',
                    item.quantity || 0,
                    item.unit || 'KG',
                    item.rate || 0,
                    item.discount_percent || 0,
                    item.taxable_value || 0,
                    item.gst_rate || 0,
                    item.gst_amount || 0,
                    item.total || 0
                ]
            );
        }

        // Update SO status to Delivered
        await connection.query(
            "UPDATE sales_orders SET status = 'Delivered' WHERE id = ?",
            [id]
        );

        await connection.commit();

        const [invoice] = await connection.query(
            "SELECT * FROM sales_invoices WHERE id = ?",
            [invoiceId]
        );

        console.log('✅ Invoice created:', newNumber);

        res.status(201).json({
            success: true,
            message: "Invoice generated successfully",
            data: invoice[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Generate invoice error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate invoice",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Delete sales order
const deleteSalesOrder = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM sales_orders WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Sales order deleted successfully"
        });
    } catch (error) {
        console.error("Delete sales order error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete sales order",
            error: error.message
        });
    }
};

module.exports = {
    getAllSalesOrders,
    getSalesOrderById,
    updateSalesOrderStatus,
    dispatchSalesOrder,
    generateInvoice,
    deleteSalesOrder
};