const db = require("../config/db");
const { randomUUID } = require("crypto");

const getAllLeads = async (req, res) => {
    try {
        const { search, status, source, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT l.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
            FROM leads l
            LEFT JOIN users u ON l.salesperson_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (l.company_name LIKE ? OR l.contact_person LIKE ? OR l.mobile LIKE ? OR l.lead_number LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND l.status = ?";
            params.push(status);
        }
        if (source && source !== "all") {
            sql += " AND l.source = ?";
            params.push(source);
        }

        sql += " ORDER BY l.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [leads] = await db.query(sql, params);

        // Get total count
        let countSql = "SELECT COUNT(*) as total FROM leads WHERE 1=1";
        const countParams = [];
        if (search) {
            countSql += " AND (company_name LIKE ? OR contact_person LIKE ? OR mobile LIKE ?)";
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            countSql += " AND status = ?";
            countParams.push(status);
        }
        const [countResult] = await db.query(countSql, countParams);

        res.json({
            success: true,
            data: leads,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error("Get leads error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch leads",
            error: error.message
        });
    }
};

const getLeadById = async (req, res) => {
    try {
        const { id } = req.params;
        const [leads] = await db.query(
            `SELECT l.*, 
                    CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
             FROM leads l
             LEFT JOIN users u ON l.salesperson_id = u.id
             WHERE l.id = ?`,
            [id]
        );

        if (leads.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        // Get activities
        const [activities] = await db.query(
            `SELECT la.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name
             FROM lead_activities la
             LEFT JOIN users u ON la.created_by = u.id
             WHERE la.lead_id = ?
             ORDER BY la.created_at DESC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...leads[0],
                activities
            }
        });
    } catch (error) {
        console.error("Get lead error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch lead",
            error: error.message
        });
    }
};

const createLead = async (req, res) => {
    try {
        const {
            company_name, contact_person, mobile, whatsapp, email,
            address, city, state, country, customer_type, source,
            interested_product, expected_quantity, expected_value,
            expected_order_date, required_grade, status, probability,
            expected_closing_date, next_followup_date, salesperson_id, remarks
        } = req.body;

        // Generate lead number
        const [lastLead] = await db.query(
            "SELECT lead_number FROM leads ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "L-00001";
        if (lastLead.length > 0) {
            const lastNum = parseInt(lastLead[0].lead_number.replace("L-", ""));
            newNumber = `L-${String(lastNum + 1).padStart(5, "0")}`;
        }

        const [result] = await db.query(
            `INSERT INTO leads (
                lead_number, company_name, contact_person, mobile, whatsapp, email,
                address, city, state, country, customer_type, source,
                interested_product, expected_quantity, expected_value,
                expected_order_date, required_grade, status, probability,
                expected_closing_date, next_followup_date, salesperson_id, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newNumber, company_name, contact_person, mobile, whatsapp, email,
                address, city, state, country || "India", customer_type, source,
                interested_product, expected_quantity, expected_value,
                expected_order_date, required_grade, status || "New",
                probability || 0, expected_closing_date, next_followup_date,
                salesperson_id || req.userId, remarks
            ]
        );

        const [newLead] = await db.query(
            "SELECT * FROM leads WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Lead created successfully",
            data: newLead[0]
        });
    } catch (error) {
        console.error("Create lead error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create lead",
            error: error.message
        });
    }
};

const updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            "company_name", "contact_person", "mobile", "whatsapp", "email",
            "address", "city", "state", "country", "customer_type", "source",
            "interested_product", "expected_quantity", "expected_value",
            "expected_order_date", "required_grade", "status", "probability",
            "expected_closing_date", "next_followup_date", "salesperson_id", "remarks"
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
            `UPDATE leads SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            "SELECT * FROM leads WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Lead updated successfully",
            data: updated[0]
        });
    } catch (error) {
        console.error("Update lead error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update lead",
            error: error.message
        });
    }
};

const deleteLead = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM leads WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Lead deleted successfully"
        });
    } catch (error) {
        console.error("Delete lead error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete lead",
            error: error.message
        });
    }
};

const convertLeadToCustomer = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get lead
        const [leads] = await connection.query(
            "SELECT * FROM leads WHERE id = ?",
            [id]
        );

        if (leads.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        const lead = leads[0];

        // Check if already converted
        if (lead.converted_to_customer_id) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lead already converted to customer"
            });
        }

        // Generate customer code
        const [lastCustomer] = await connection.query(
            "SELECT customer_code FROM customers ORDER BY created_at DESC LIMIT 1"
        );

        let newCode = "CUST-00001";
        if (lastCustomer.length > 0) {
            const lastNum = parseInt(lastCustomer[0].customer_code.replace("CUST-", ""));
            newCode = `CUST-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID in Node.js instead of relying on MySQL
        const { randomUUID } = require("crypto");
        const customerId = randomUUID();

        // ✅ Insert customer with explicit ID
        await connection.query(
            `INSERT INTO customers (
                id, customer_code, company_name, contact_person, mobile, whatsapp, email,
                billing_address, city, state, country, customer_type, salesperson_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [
                customerId,
                newCode,
                lead.company_name,
                lead.contact_person,
                lead.mobile,
                lead.whatsapp,
                lead.email,
                lead.address,
                lead.city,
                lead.state,
                lead.country || "India",
                lead.customer_type,
                lead.salesperson_id
            ]
        );

        // Update lead
        await connection.query(
            `UPDATE leads 
             SET status = 'Won', 
                 converted_to_customer_id = ?, 
                 converted_at = NOW() 
             WHERE id = ?`,
            [customerId, id]
        );

        await connection.commit();

        const [customer] = await connection.query(
            "SELECT * FROM customers WHERE id = ?",
            [customerId]
        );

        res.json({
            success: true,
            message: "Lead converted to customer successfully",
            data: customer[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error("Convert lead error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to convert lead",
            error: error.message
        });
    } finally {
        connection.release();
    }
};

const addActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const { activity_type, subject, description, scheduled_date } = req.body;

        const [result] = await db.query(
            `INSERT INTO lead_activities 
             (lead_id, activity_type, subject, description, scheduled_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, activity_type, subject, description, scheduled_date, req.userId]
        );

        const [activity] = await db.query(
            "SELECT * FROM lead_activities WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Activity added successfully",
            data: activity[0]
        });
    } catch (error) {
        console.error("Add activity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add activity",
            error: error.message
        });
    }
};

module.exports = {
    getAllLeads,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    convertLeadToCustomer,
    addActivity
};