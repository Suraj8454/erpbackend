const db = require("../config/db");
const { randomUUID } = require("crypto");

// Get all quotations
const getAllQuotations = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT q.*, 
                   c.company_name as customer_name,
                   CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
            FROM quotations q
            LEFT JOIN customers c ON q.customer_id = c.id
            LEFT JOIN users u ON q.salesperson_id = u.id
            WHERE 1=1
        `;
        const params = [];

        // ✅ Skip 'all' and empty
        if (search && search.trim()) {
            sql += " AND (q.quotation_number LIKE ? OR c.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND q.status = ?";
            params.push(status);
        }

        sql += " ORDER BY q.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [quotations] = await db.query(sql, params);

        // Get items count
        for (let i = 0; i < quotations.length; i++) {
            const [items] = await db.query(
                "SELECT COUNT(*) as count FROM quotation_items WHERE quotation_id = ?",
                [quotations[i].id]
            );
            quotations[i].items_count = items[0].count;
        }

        res.json({
            success: true,
            data: quotations
        });
    } catch (error) {
        console.error("Get quotations error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch quotations",
            error: error.message
        });
    }
};
// Get quotation by ID
const getQuotationById = async (req, res) => {
    try {
        const { id } = req.params;

        const [quotations] = await db.query(
            `SELECT q.*, 
                    c.company_name as customer_name,
                    c.billing_address as customer_address,
                    c.gstin as customer_gstin,
                    CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
             FROM quotations q
             LEFT JOIN customers c ON q.customer_id = c.id
             LEFT JOIN users u ON q.salesperson_id = u.id
             WHERE q.id = ?`,
            [id]
        );

        if (quotations.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Quotation not found"
            });
        }

        // Get items
        const [items] = await db.query(
            "SELECT * FROM quotation_items WHERE quotation_id = ?",
            [id]
        );

        res.json({
            success: true,
            data: {
                ...quotations[0],
                items
            }
        });
    } catch (error) {
        console.error("Get quotation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch quotation",
            error: error.message
        });
    }
};

// Create quotation
const createQuotation = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            customer_id, lead_id, enquiry_id, salesperson_id,
            date, valid_until, payment_terms, delivery_terms,
            freight_terms, currency, discount, tax, remarks,
            quality_spec, items
        } = req.body;

        console.log('📥 Create quotation request:', req.body);

        // Generate quotation number
        const [lastQuotation] = await connection.query(
            "SELECT quotation_number FROM quotations ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "Q-00001";
        if (lastQuotation.length > 0) {
            const lastNum = parseInt(lastQuotation[0].quotation_number.replace("Q-", ""));
            newNumber = `Q-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID for quotation
        const quotationId = randomUUID();

        // Calculate totals
        let subtotal = 0;
        let totalTax = 0;

        if (items && items.length > 0) {
            items.forEach(item => {
                const lineTotal = Number(item.quantity) * Number(item.rate);
                const lineDiscount = lineTotal * ((Number(item.discount_percent) || 0) / 100);
                const taxableValue = lineTotal - lineDiscount;
                const lineGst = taxableValue * ((Number(item.gst_rate) || 0) / 100);

                subtotal += taxableValue;
                totalTax += lineGst;
            });
        }

        const totalDiscount = Number(discount) || 0;
        const total = subtotal + totalTax - totalDiscount;

        // ✅ Insert quotation with explicit UUID
        await connection.query(
            `INSERT INTO quotations (
                id, quotation_number, customer_id, lead_id, enquiry_id, salesperson_id,
                date, valid_until, payment_terms, delivery_terms, freight_terms,
                currency, subtotal, discount, tax, total, status, remarks, quality_spec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
            [
                quotationId,
                newNumber,
                customer_id || null,
                lead_id || null,
                enquiry_id || null,
                salesperson_id || req.userId,
                date,
                valid_until,
                payment_terms || null,
                delivery_terms || null,
                freight_terms || null,
                currency || "INR",
                subtotal,
                totalDiscount,
                totalTax,
                total,
                remarks || null,
                quality_spec || null
            ]
        );

        // ✅ Insert items with explicit UUID
        if (items && items.length > 0) {
            for (const item of items) {
                const itemId = randomUUID();
                const lineTotal = Number(item.quantity) * Number(item.rate);
                const lineDiscount = lineTotal * ((Number(item.discount_percent) || 0) / 100);
                const taxableValue = lineTotal - lineDiscount;
                const lineGst = taxableValue * ((Number(item.gst_rate) || 0) / 100);
                const lineTotalWithTax = taxableValue + lineGst;

                await connection.query(
                    `INSERT INTO quotation_items (
                        id, quotation_id, product_id, product_name, grade,
                        quantity, unit, rate, discount_percent,
                        taxable_value, gst_rate, gst_amount, total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        itemId,
                        quotationId,
                        item.product_id || null,
                        item.product_name || 'Product',
                        item.grade || '',
                        Number(item.quantity) || 0,
                        item.unit || 'KG',
                        Number(item.rate) || 0,
                        Number(item.discount_percent) || 0,
                        taxableValue,
                        Number(item.gst_rate) || 0,
                        lineGst,
                        lineTotalWithTax
                    ]
                );
            }
        }

        await connection.commit();

        const [quotation] = await connection.query(
            "SELECT * FROM quotations WHERE id = ?",
            [quotationId]
        );

        console.log('✅ Quotation created:', quotationId);

        res.status(201).json({
            success: true,
            message: "Quotation created successfully",
            data: quotation[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Create quotation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create quotation",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Update quotation
const updateQuotation = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            customer_id, salesperson_id, date, valid_until,
            payment_terms, delivery_terms, freight_terms,
            currency, discount, remarks, items, status
        } = req.body;

        // Calculate totals from new items
        let subtotal = 0;
        let totalTax = 0;

        if (items && items.length > 0) {
            items.forEach(item => {
                const lineTotal = item.quantity * item.rate;
                const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
                const taxableValue = lineTotal - lineDiscount;
                const lineGst = taxableValue * ((item.gst_rate || 0) / 100);

                subtotal += taxableValue;
                totalTax += lineGst;
            });
        }

        const totalDiscount = discount || 0;
        const total = subtotal + totalTax - totalDiscount;

        // Update quotation
        await connection.query(
            `UPDATE quotations SET
                customer_id = ?, salesperson_id = ?, date = ?,
                valid_until = ?, payment_terms = ?, delivery_terms = ?,
                freight_terms = ?, currency = ?, subtotal = ?,
                discount = ?, tax = ?, total = ?, remarks = ?,
                status = COALESCE(?, status)
             WHERE id = ?`,
            [
                customer_id, salesperson_id, date, valid_until,
                payment_terms, delivery_terms, freight_terms,
                currency, subtotal, totalDiscount, totalTax, total,
                remarks, status, id
            ]
        );

        // Delete old items and insert new ones
        await connection.query(
            "DELETE FROM quotation_items WHERE quotation_id = ?",
            [id]
        );

        if (items && items.length > 0) {
            for (const item of items) {
                const lineTotal = item.quantity * item.rate;
                const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
                const taxableValue = lineTotal - lineDiscount;
                const lineGst = taxableValue * ((item.gst_rate || 0) / 100);
                const lineTotalWithTax = taxableValue + lineGst;

                await connection.query(
                    `INSERT INTO quotation_items (
                        quotation_id, product_id, product_name, grade,
                        quantity, unit, rate, discount_percent,
                        taxable_value, gst_rate, gst_amount, total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id, item.product_id, item.product_name,
                        item.grade, item.quantity, item.unit || "KG",
                        item.rate, item.discount_percent || 0,
                        taxableValue, item.gst_rate || 0, lineGst, lineTotalWithTotal
                    ]
                );
            }
        }

        await connection.commit();

        const [quotation] = await connection.query(
            "SELECT * FROM quotations WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Quotation updated successfully",
            data: quotation[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("Update quotation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update quotation",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Update quotation status
const updateQuotationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.query(
            "UPDATE quotations SET status = ? WHERE id = ?",
            [status, id]
        );

        const [quotation] = await db.query(
            "SELECT * FROM quotations WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: `Quotation status updated to ${status}`,
            data: quotation[0]
        });
    } catch (error) {
        console.error("Update quotation status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update status",
            error: error.message
        });
    }
};

// Approve quotation
const approveQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(
            `UPDATE quotations SET status = 'Approved', approval_status = 'Approved' WHERE id = ?`,
            [id]
        );

        const [quotation] = await db.query(
            "SELECT * FROM quotations WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Quotation approved successfully",
            data: quotation[0]
        });
    } catch (error) {
        console.error("Approve quotation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve quotation",
            error: error.message
        });
    }
};

// Convert quotation to sales order
const convertToSalesOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { delivery_date, warehouse_id, remarks } = req.body;

        console.log('🔄 Converting quotation:', id);

        // Get quotation
        const [quotations] = await connection.query(
            "SELECT * FROM quotations WHERE id = ?",
            [id]
        );

        if (quotations.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Quotation not found"
            });
        }

        const quotation = quotations[0];

        console.log('📋 Quotation:', quotation.quotation_number, '| Status:', quotation.status);

        // Check status
        if (quotation.status !== "Approved" && 
            quotation.status !== "Sent" && 
            quotation.status !== "Accepted") {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Cannot convert. Quotation status is: ${quotation.status}. Please approve first.`
            });
        }

        // Generate SO number
        const [lastOrder] = await connection.query(
            "SELECT order_number FROM sales_orders ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "SO-00001";
        if (lastOrder.length > 0) {
            const lastNum = parseInt(lastOrder[0].order_number.replace("SO-", ""));
            newNumber = `SO-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ GENERATE UUID
        const salesOrderId = randomUUID();

        // ✅ Insert with explicit ID
        await connection.query(
            `INSERT INTO sales_orders (
                id, order_number, quotation_id, customer_id, salesperson_id,
                order_date, delivery_date, payment_terms, warehouse_id,
                subtotal, discount, tax, total, status, remarks
            ) VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?)`,
            [
                salesOrderId,
                newNumber,
                id,
                quotation.customer_id,
                quotation.salesperson_id,
                delivery_date || null,
                quotation.payment_terms || null,
                warehouse_id || null,
                quotation.subtotal || 0,
                quotation.discount || 0,
                quotation.tax || 0,
                quotation.total || 0,
                remarks || null
            ]
        );

        // Copy items
        const [quotationItems] = await connection.query(
            "SELECT * FROM quotation_items WHERE quotation_id = ?",
            [id]
        );

        console.log('📦 Items to copy:', quotationItems.length);

        for (const item of quotationItems) {
            const soItemId = randomUUID();

            await connection.query(
                `INSERT INTO sales_order_items (
                    id, sales_order_id, product_id, product_name, grade,
                    quantity, unit, rate, discount_percent,
                    taxable_value, gst_rate, gst_amount, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    soItemId,
                    salesOrderId,
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

        // Update quotation
        await connection.query(
            "UPDATE quotations SET status = 'Accepted' WHERE id = ?",
            [id]
        );

        await connection.commit();

        const [salesOrder] = await connection.query(
            "SELECT * FROM sales_orders WHERE id = ?",
            [salesOrderId]
        );

        console.log('✅ Sales Order created:', newNumber);

        res.status(201).json({
            success: true,
            message: "Quotation converted successfully",
            data: salesOrder[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Convert error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to convert",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

// Delete quotation
const deleteQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM quotations WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Quotation deleted successfully"
        });
    } catch (error) {
        console.error("Delete quotation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete quotation",
            error: error.message
        });
    }
};

module.exports = {
    getAllQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    updateQuotationStatus,
    approveQuotation,
    convertToSalesOrder,
    deleteQuotation
};