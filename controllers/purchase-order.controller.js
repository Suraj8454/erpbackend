const db = require("../config/db");
const { randomUUID } = require("crypto");

// Get all purchase orders
const getAllPurchaseOrders = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT po.*, 
                   s.company_name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (po.po_number LIKE ? OR s.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND po.status = ?";
            params.push(status);
        }

        sql += " ORDER BY po.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [orders] = await db.query(sql, params);

        for (let i = 0; i < orders.length; i++) {
            const [items] = await db.query(
                "SELECT COUNT(*) as count FROM purchase_order_items WHERE purchase_order_id = ?",
                [orders[i].id]
            );
            orders[i].items_count = items[0].count;
        }

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error("Get purchase orders error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch purchase orders",
            error: error.message
        });
    }
};

// Get purchase order by ID
const getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(
            `SELECT po.*, 
                    s.company_name as supplier_name,
                    s.contact_person as supplier_contact,
                    s.mobile as supplier_mobile
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             WHERE po.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Purchase order not found"
            });
        }

        const [items] = await db.query(
            "SELECT * FROM purchase_order_items WHERE purchase_order_id = ?",
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
        console.error("Get purchase order error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch purchase order",
            error: error.message
        });
    }
};

// Create purchase order
const createPurchaseOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            supplier_id, quote_reference, po_date, expected_delivery,
            warehouse_id, payment_terms, delivery_terms, freight,
            discount, remarks, items
        } = req.body;

        console.log('📥 Create PO request:', req.body);

        // Generate PO number
        const [lastPO] = await connection.query(
            "SELECT po_number FROM purchase_orders ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "PO-00001";
        if (lastPO.length > 0) {
            const lastNum = parseInt(lastPO[0].po_number.replace("PO-", ""));
            newNumber = `PO-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID
        const poId = randomUUID();

        // Calculate totals
        let subtotal = 0;
        if (items && items.length > 0) {
            items.forEach(item => {
                subtotal += Number(item.quantity) * Number(item.rate);
            });
        }

        const total = subtotal - (Number(discount) || 0) + (Number(freight) || 0);

        // Insert PO
        await connection.query(
            `INSERT INTO purchase_orders (
                id, po_number, supplier_id, quote_reference, po_date,
                expected_delivery, warehouse_id, payment_terms,
                delivery_terms, freight, subtotal, discount, total,
                status, remarks, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
            [
                poId,
                newNumber,
                supplier_id,
                quote_reference || null,
                po_date,
                expected_delivery || null,
                warehouse_id || null,
                payment_terms || null,
                delivery_terms || null,
                Number(freight) || 0,
                subtotal,
                Number(discount) || 0,
                total,
                remarks || null,
                req.userId
            ]
        );

        // Insert items
        if (items && items.length > 0) {
            for (const item of items) {
                const itemId = randomUUID();
                await connection.query(
                    `INSERT INTO purchase_order_items (
                        id, purchase_order_id, product_id, product_name, grade,
                        quantity, unit, rate, total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        itemId,
                        poId,
                        item.product_id || null,
                        item.product_name || 'Product',
                        item.grade || '',
                        Number(item.quantity) || 0,
                        item.unit || 'KG',
                        Number(item.rate) || 0,
                        Number(item.quantity) * Number(item.rate) || 0
                    ]
                );
            }
        }

        await connection.commit();

        const [po] = await connection.query(
            "SELECT * FROM purchase_orders WHERE id = ?",
            [poId]
        );

        console.log('✅ PO created:', newNumber);

        res.status(201).json({
            success: true,
            message: "Purchase order created successfully",
            data: po[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Create PO error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create purchase order",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Update purchase order status
const updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.query(
            "UPDATE purchase_orders SET status = ? WHERE id = ?",
            [status, id]
        );

        const [order] = await db.query(
            "SELECT * FROM purchase_orders WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Status updated",
            data: order[0]
        });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update status",
            error: error.message
        });
    }
};

// Receive PO (create GRN)
const receivePurchaseOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            grn_date, vehicle_number, driver_name,
            warehouse_id, items, remarks,
        } = req.body;

        console.log('🔄 Receiving PO:', id);
        console.log('📦 Items:', items);

        const [orders] = await connection.query(
            "SELECT * FROM purchase_orders WHERE id = ?",
            [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "PO not found" });
        }

        const order = orders[0];

        // Generate GRN number
        const [lastGRN] = await connection.query(
            "SELECT grn_number FROM grn ORDER BY created_at DESC LIMIT 1"
        );
        let newNumber = "GRN-00001";
        if (lastGRN.length > 0) {
            const lastNum = parseInt(lastGRN[0].grn_number.replace("GRN-", ""));
            newNumber = `GRN-${String(lastNum + 1).padStart(5, "0")}`;
        }

        const grnId = randomUUID();

        let totalQty = 0;
        if (items && items.length > 0) {
            items.forEach((item) => {
                totalQty += Number(item.received_quantity) || 0;
            });
        }

        await connection.query(
            `INSERT INTO grn (
                id, grn_number, purchase_order_id, supplier_id, grn_date,
                vehicle_number, driver_name, warehouse_id, received_by,
                total_quantity, status, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QC Pending', ?)`,
            [
                grnId,
                newNumber,
                id,
                order.supplier_id,
                grn_date || new Date().toISOString().split("T")[0],
                vehicle_number || null,
                driver_name || null,
                warehouse_id || order.warehouse_id,
                req.userId,
                totalQty,
                remarks || null,
            ]
        );

        // Insert GRN items
        if (items && items.length > 0) {
            for (const item of items) {
                const itemId = randomUUID();
                await connection.query(
                    `INSERT INTO grn_items (
                        id, grn_id, product_id, product_name, grade,
                        ordered_quantity, received_quantity, unit,
                        batch_number, manufacturing_date, expiry_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        itemId,
                        grnId,
                        item.product_id || null,
                        item.product_name || "Product",
                        item.grade || "",
                        Number(item.ordered_quantity) || 0,
                        Number(item.received_quantity) || 0,
                        item.unit || "KG",
                        item.batch_number || null,
                        item.manufacturing_date || null,
                        item.expiry_date || null,
                    ]
                );
            }
        }

        // Update PO status
        await connection.query(
            "UPDATE purchase_orders SET status = 'Received' WHERE id = ?",
            [id]
        );

        await connection.commit();

        const [grn] = await connection.query(
            "SELECT * FROM grn WHERE id = ?",
            [grnId]
        );

        console.log('✅ GRN created:', newNumber);

        res.status(201).json({
            success: true,
            message: "Goods received successfully",
            data: grn[0],
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Receive error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to receive goods",
            error: error.message,
        });
    } finally {
        connection.release();
    }
};
// Delete purchase order
const deletePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM purchase_orders WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Purchase order deleted"
        });
    } catch (error) {
        console.error("Delete PO error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete",
            error: error.message
        });
    }
};

module.exports = {
    getAllPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    deletePurchaseOrder
};