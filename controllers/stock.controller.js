const db = require("../config/db");

// Get current stock
const getCurrentStock = async (req, res) => {
    try {
        const { warehouse_id, product_id } = req.query;

        let sql = `
            SELECT 
                cs.*, 
                p.name as product_name,
                p.code as product_code,
                p.suta as grade,
                p.unit,
                p.reorder_level,
                p.sales_rate,
                p.purchase_rate
            FROM current_stock cs
            LEFT JOIN products p ON cs.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (warehouse_id) {
            sql += " AND cs.warehouse_id = ?";
            params.push(warehouse_id);
        }
        if (product_id) {
            sql += " AND cs.product_id = ?";
            params.push(product_id);
        }

        sql += " ORDER BY p.name, cs.batch_number";

        console.log('📦 Stock query params:', params);
        const [stock] = await db.query(sql, params);

        // Compute stock_value
        const enriched = stock.map((item) => ({
            ...item,
            stock_value: Number(item.quantity || 0) * Number(item.unit_cost || 0),
        }));

        console.log('✅ Stock found:', enriched.length);

        res.json({
            success: true,
            data: enriched,
        });
    } catch (error) {
        console.error("❌ Get stock error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch stock",
            error: error.message,
        });
    }
};


// Get stock summary
const getStockSummary = async (req, res) => {
    try {
        const [summary] = await db.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.code as product_code,
                p.unit,
                COALESCE(SUM(cs.quantity), 0) as total_quantity,
                COALESCE(SUM(cs.reserved_quantity), 0) as reserved_quantity,
                COALESCE(SUM(cs.hold_quantity), 0) as hold_quantity,
                COALESCE(SUM(cs.rejected_quantity), 0) as rejected_quantity,
                COUNT(DISTINCT cs.batch_number) as batch_count
            FROM products p
            LEFT JOIN current_stock cs ON p.id = cs.product_id
            WHERE p.is_active = TRUE
            GROUP BY p.id, p.name, p.code, p.unit
            ORDER BY p.name
        `);

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error("Get stock summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch stock summary",
            error: error.message
        });
    }
};

// Get stock ledger
const getStockLedger = async (req, res) => {
    try {
        const { product_id, from_date, to_date, page = 1, limit = 100 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT sl.*, 
                   p.name as product_name,
                   p.code as product_code,
                   CONCAT(u.first_name, ' ', u.last_name) as created_by_name
            FROM stock_ledger sl
            LEFT JOIN products p ON sl.product_id = p.id
            LEFT JOIN users u ON sl.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (product_id) {
            sql += " AND sl.product_id = ?";
            params.push(product_id);
        }
        if (from_date) {
            sql += " AND DATE(sl.transaction_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(sl.transaction_date) <= ?";
            params.push(to_date);
        }

        sql += " ORDER BY sl.transaction_date DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [ledger] = await db.query(sql, params);

        res.json({
            success: true,
            data: ledger
        });
    } catch (error) {
        console.error("Get ledger error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch stock ledger",
            error: error.message
        });
    }
};

// Get batches
const getBatches = async (req, res) => {
    try {
        const { product_id, status } = req.query;

        let sql = `
            SELECT 
                cs.id,
                cs.batch_number as id,
                cs.product_id,
                cs.batch_number,
                cs.quantity,
                cs.reserved_quantity,
                cs.hold_quantity,
                cs.rejected_quantity,
                cs.unit_cost,
                cs.last_updated,
                p.name as product_name,
                p.code as product_code,
                p.suta as grade,
                p.unit
            FROM current_stock cs
            LEFT JOIN products p ON cs.product_id = p.id
            WHERE cs.batch_number IS NOT NULL
        `;
        const params = [];

        if (product_id) {
            sql += " AND cs.product_id = ?";
            params.push(product_id);
        }
        if (status === "Available") {
            sql += " AND cs.quantity > 0";
        } else if (status === "Exhausted") {
            sql += " AND cs.quantity = 0";
        }

        sql += " ORDER BY cs.last_updated DESC";

        const [batches] = await db.query(sql, params);

        console.log('📦 Batches found:', batches.length);

        res.json({
            success: true,
            data: batches,
        });
    } catch (error) {
        console.error("❌ Get batches error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch batches",
            error: error.message,
        });
    }
};

// Stock adjustment
const adjustStock = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            product_id, batch_number, warehouse_id,
            adjustment_type, quantity, reason
        } = req.body;

        // Get current stock
        const [currentStock] = await connection.query(
            `SELECT * FROM current_stock 
             WHERE product_id = ? 
             AND (batch_number = ? OR (batch_number IS NULL AND ? IS NULL))
             AND (warehouse_id = ? OR (warehouse_id IS NULL AND ? IS NULL))`,
            [product_id, batch_number, batch_number, warehouse_id, warehouse_id]
        );

        if (currentStock.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Stock record not found"
            });
        }

        const stock = currentStock[0];

        let newQuantity = stock.quantity;
        let quantityIn = 0;
        let quantityOut = 0;

        if (adjustment_type === "IN") {
            newQuantity += quantity;
            quantityIn = quantity;
        } else if (adjustment_type === "OUT") {
            if (stock.quantity < quantity) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Insufficient stock"
                });
            }
            newQuantity -= quantity;
            quantityOut = quantity;
        }

        // Update current stock
        await connection.query(
            `UPDATE current_stock 
             SET quantity = ?, last_updated = NOW()
             WHERE id = ?`,
            [newQuantity, stock.id]
        );

        // Get current balance for ledger
        const [ledgerBalance] = await connection.query(
            `SELECT COALESCE(SUM(quantity_in) - SUM(quantity_out), 0) as balance
             FROM stock_ledger WHERE product_id = ?`,
            [product_id]
        );

        // Insert stock ledger entry
        await connection.query(
            `INSERT INTO stock_ledger (
                product_id, batch_number, warehouse_id,
                transaction_type, reference_number,
                quantity_in, quantity_out, balance,
                transaction_date, created_by, remarks
            ) VALUES (?, ?, ?, 'Adjustment', 'ADJUST', ?, ?, ?, NOW(), ?, ?)`,
            [
                product_id, batch_number, warehouse_id,
                quantityIn, quantityOut,
                ledgerBalance[0].balance + quantityIn - quantityOut,
                req.userId, reason
            ]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Stock adjusted successfully"
        });
    } catch (error) {
        await connection.rollback();
        console.error("Adjust stock error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to adjust stock",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Get stock movements for a product
const getStockMovements = async (req, res) => {
    try {
        const { productId } = req.params;

        const [movements] = await db.query(
            `SELECT sl.*, 
                    CONCAT(u.first_name, ' ', u.last_name) as created_by_name
             FROM stock_ledger sl
             LEFT JOIN users u ON sl.created_by = u.id
             WHERE sl.product_id = ?
             ORDER BY sl.transaction_date DESC
             LIMIT 100`,
            [productId]
        );

        res.json({ success: true, data: movements });
    } catch (error) {
        console.error("Get movements error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch movements",
            error: error.message,
        });
    }
};

module.exports = {
    getCurrentStock,
    getStockSummary,
    getStockLedger,
    getBatches,
    adjustStock,
    getStockMovements
};