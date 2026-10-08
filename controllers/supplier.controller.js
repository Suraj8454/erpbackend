const db = require("../config/db");
const { randomUUID } = require("crypto");

const getAllSuppliers = async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = "SELECT * FROM suppliers WHERE 1=1";
        const params = [];

        if (search) {
            sql += " AND (company_name LIKE ? OR contact_person LIKE ? OR mobile LIKE ? OR supplier_code LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND status = ?";
            params.push(status);
        }

        sql += " ORDER BY created_at DESC";
        const [suppliers] = await db.query(sql, params);

        res.json({
            success: true,
            count: suppliers.length,
            data: suppliers
        });
    } catch (error) {
        console.error("Get suppliers error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch suppliers",
            error: error.message
        });
    }
};

const getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        const [suppliers] = await db.query(
            "SELECT * FROM suppliers WHERE id = ?",
            [id]
        );

        if (suppliers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        // Get recent POs
        const [orders] = await db.query(
            `SELECT id, po_number, po_date, total, status
             FROM purchase_orders
             WHERE supplier_id = ?
             ORDER BY po_date DESC
             LIMIT 10`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...suppliers[0],
                recent_orders: orders
            }
        });
    } catch (error) {
        console.error("Get supplier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch supplier",
            error: error.message
        });
    }
};

const createSupplier = async (req, res) => {
    try {
        const {
            company_name, contact_person, mobile, whatsapp, email,
            address, city, state, country, pin_code, gstin, pan,
            bank_details, payment_terms, credit_days, supplier_category,
            products_supplied, rating
        } = req.body;

        console.log('📥 Create supplier:', req.body);

        // Generate supplier code
        const [lastSupplier] = await db.query(
            "SELECT supplier_code FROM suppliers ORDER BY created_at DESC LIMIT 1"
        );

        let newCode = "SUP-00001";
        if (lastSupplier.length > 0) {
            const lastNum = parseInt(lastSupplier[0].supplier_code.replace("SUP-", ""));
            newCode = `SUP-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID
        const supplierId = randomUUID();

        await db.query(
            `INSERT INTO suppliers (
                id, supplier_code, company_name, contact_person, mobile, whatsapp,
                email, address, city, state, country, pin_code, gstin, pan,
                bank_details, payment_terms, credit_days, supplier_category,
                products_supplied, rating, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [
                supplierId,
                newCode,
                company_name,
                contact_person || null,
                mobile || null,
                whatsapp || null,
                email || null,
                address || null,
                city || null,
                state || null,
                country || 'India',
                pin_code || null,
                gstin || null,
                pan || null,
                bank_details || null,
                payment_terms || null,
                credit_days || 30,
                supplier_category || null,
                products_supplied || null,
                rating || 0
            ]
        );

        const [supplier] = await db.query(
            "SELECT * FROM suppliers WHERE id = ?",
            [supplierId]
        );

        console.log('✅ Supplier created:', newCode);

        res.status(201).json({
            success: true,
            message: "Supplier created successfully",
            data: supplier[0]
        });
    } catch (error) {
        console.error("❌ Create supplier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create supplier",
            error: error.message
        });
    }
};

const updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            "company_name", "contact_person", "mobile", "whatsapp", "email",
            "address", "city", "state", "country", "pin_code", "gstin",
            "pan", "bank_details", "payment_terms", "credit_days",
            "supplier_category", "products_supplied", "rating", "status"
        ];

        const fields = [];
        const values = [];

        Object.keys(updates).forEach((key) => {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update"
            });
        }

        values.push(id);

        await db.query(
            `UPDATE suppliers SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            "SELECT * FROM suppliers WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Supplier updated successfully",
            data: updated[0]
        });
    } catch (error) {
        console.error("Update supplier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update supplier",
            error: error.message
        });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM suppliers WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Supplier deleted successfully"
        });
    } catch (error) {
        console.error("Delete supplier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete supplier",
            error: error.message
        });
    }
};

module.exports = {
    getAllSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier
};