const db = require("../config/db");
const { randomUUID } = require("crypto"); 

const getAllCustomers = async (req, res) => {
    try {
        const { search, type, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT c.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
            FROM customers c
            LEFT JOIN users u ON c.salesperson_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (c.company_name LIKE ? OR c.contact_person LIKE ? OR c.mobile LIKE ? OR c.customer_code LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (type && type !== "all") {
            sql += " AND c.customer_type = ?";
            params.push(type);
        }
        if (status && status !== "all") {
            sql += " AND c.status = ?";
            params.push(status);
        }

        sql += " ORDER BY c.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [customers] = await db.query(sql, params);

        let countSql = "SELECT COUNT(*) as total FROM customers WHERE 1=1";
        const countParams = [];
        if (search) {
            countSql += " AND (company_name LIKE ? OR contact_person LIKE ? OR mobile LIKE ?)";
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        const [countResult] = await db.query(countSql, countParams);

        res.json({
            success: true,
            data: customers,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error("Get customers error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customers",
            error: error.message
        });
    }
};

const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🔄 Getting customer:', id);

        const [customers] = await db.query(
            `SELECT c.*, 
                    CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
             FROM customers c
             LEFT JOIN users u ON c.salesperson_id = u.id
             WHERE c.id = ?`,
            [id]
        );

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const customer = customers[0];

        // ✅ Get customer contacts (safe fallback)
        let contacts = [];
        try {
            const [contactRows] = await db.query(
                "SELECT * FROM customer_contacts WHERE customer_id = ?",
                [id]
            );
            contacts = contactRows;
        } catch (err) {
            console.warn('⚠️ customer_contacts table not found, skipping');
        }

        // ✅ Get recent orders (safe fallback)
        let recentOrders = [];
        try {
            const [orderRows] = await db.query(
                `SELECT id, order_number, order_date, total, status
                 FROM sales_orders
                 WHERE customer_id = ?
                 ORDER BY order_date DESC
                 LIMIT 10`,
                [id]
            );
            recentOrders = orderRows;
        } catch (err) {
            console.warn('⚠️ sales_orders lookup failed, skipping');
        }

        // ✅ Get outstanding (safe fallback)
        let totalOutstanding = 0;
        try {
            const [outstanding] = await db.query(
                `SELECT COALESCE(SUM(balance), 0) as total
                 FROM sales_invoices
                 WHERE customer_id = ? AND status != 'Paid'`,
                [id]
            );
            totalOutstanding = Number(outstanding[0].total || 0);
        } catch (err) {
            console.warn('⚠️ sales_invoices lookup failed, skipping');
        }

        console.log('✅ Customer loaded:', customer.company_name);

        res.json({
            success: true,
            data: {
                ...customer,
                contacts,
                recent_orders: recentOrders,
                total_outstanding: totalOutstanding,
            }
        });
    } catch (error) {
        console.error("❌ Get customer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customer",
            error: error.message
        });
    }
};

const createCustomer = async (req, res) => {
    try {
        const {
            company_name, legal_name, contact_person, mobile, whatsapp, email,
            billing_address, shipping_address, city, state, country, pin_code,
            gstin, pan, customer_type, credit_limit, credit_days, payment_terms,
            currency, discount_percent, salesperson_id, territory, customer_group,
        } = req.body;

        console.log('📥 Create customer:', req.body);

        // Generate customer code
        const [lastCustomer] = await db.query(
            "SELECT customer_code FROM customers ORDER BY created_at DESC LIMIT 1"
        );

        let newCode = "CUST-00001";
        if (lastCustomer.length > 0) {
            const lastNum = parseInt(lastCustomer[0].customer_code.replace("CUST-", ""));
            newCode = `CUST-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID
        const customerId = randomUUID();

        await db.query(
            `INSERT INTO customers (
                id, customer_code, company_name, legal_name, contact_person, mobile,
                whatsapp, email, billing_address, shipping_address, city, state,
                country, pin_code, gstin, pan, customer_type, credit_limit,
                credit_days, payment_terms, currency, discount_percent,
                salesperson_id, territory, customer_group, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [
                customerId,
                newCode,
                company_name,
                legal_name || null,
                contact_person || null,
                mobile || null,
                whatsapp || null,
                email || null,
                billing_address || null,
                shipping_address || null,
                city || null,
                state || null,
                country || "India",
                pin_code || null,
                gstin || null,
                pan || null,
                customer_type || "Retailer",
                Number(credit_limit) || 0,
                Number(credit_days) || 30,
                payment_terms || null,
                currency || "INR",
                Number(discount_percent) || 0,
                salesperson_id || req.userId,
                territory || null,
                customer_group || null,
            ]
        );

        const [customer] = await db.query(
            "SELECT * FROM customers WHERE id = ?",
            [customerId]
        );

        console.log('✅ Customer created:', newCode);

        res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: customer[0],
        });
    } catch (error) {
        console.error("❌ Create customer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create customer",
            error: error.message,
        });
    }
};

const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            "company_name", "legal_name", "contact_person", "mobile", "whatsapp",
            "email", "billing_address", "shipping_address", "city", "state",
            "country", "pin_code", "gstin", "pan", "customer_type",
            "credit_limit", "credit_days", "payment_terms", "currency",
            "discount_percent", "salesperson_id", "territory",
            "customer_group", "status"
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
            `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            "SELECT * FROM customers WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Customer updated successfully",
            data: updated[0]
        });
    } catch (error) {
        console.error("Update customer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update customer",
            error: error.message
        });
    }
};

const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM customers WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Customer deleted successfully"
        });
    } catch (error) {
        console.error("Delete customer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete customer",
            error: error.message
        });
    }
};

module.exports = {
    getAllCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
};