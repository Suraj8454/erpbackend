const db = require("../config/db");
const { randomUUID } = require("crypto");

// Get all enquiries
const getAllEnquiries = async (req, res) => {
    try {
        const { search, status, priority, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT ce.*, 
                   c.company_name as customer_name,
                   c.mobile as customer_mobile,
                   c.email as customer_email,
                   CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
            FROM customer_enquiries ce
            LEFT JOIN customers c ON ce.customer_id = c.id
            LEFT JOIN users u ON ce.salesperson_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (ce.enquiry_number LIKE ? OR c.company_name LIKE ? OR ce.contact_person LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND ce.status = ?";
            params.push(status);
        }
        if (priority && priority !== "all") {
            sql += " AND ce.priority = ?";
            params.push(priority);
        }

        sql += " ORDER BY ce.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [enquiries] = await db.query(sql, params);

        // Get items for each enquiry
        for (let i = 0; i < enquiries.length; i++) {
            const [items] = await db.query(
                "SELECT * FROM enquiry_items WHERE enquiry_id = ?",
                [enquiries[i].id]
            );
            enquiries[i].items = items;
            enquiries[i].item_count = items.length;
        }

        res.json({
            success: true,
            data: enquiries,
        });
    } catch (error) {
        console.error("Get enquiries error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch enquiries",
            error: error.message,
        });
    }
};

// Get enquiry by ID
const getEnquiryById = async (req, res) => {
    try {
        const { id } = req.params;

        const [enquiries] = await db.query(
            `SELECT ce.*, 
                    c.company_name as customer_name,
                    c.mobile as customer_mobile,
                    c.email as customer_email,
                    c.billing_address as customer_address,
                    CONCAT(u.first_name, ' ', u.last_name) as salesperson_name
             FROM customer_enquiries ce
             LEFT JOIN customers c ON ce.customer_id = c.id
             LEFT JOIN users u ON ce.salesperson_id = u.id
             WHERE ce.id = ?`,
            [id]
        );

        if (enquiries.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Enquiry not found",
            });
        }

        const [items] = await db.query(
            "SELECT * FROM enquiry_items WHERE enquiry_id = ?",
            [id]
        );

        res.json({
            success: true,
            data: {
                ...enquiries[0],
                items,
            },
        });
    } catch (error) {
        console.error("Get enquiry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch enquiry",
            error: error.message,
        });
    }
};

// Create enquiry
const createEnquiry = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            customer_id,
            lead_id,
            contact_person,
            salesperson_id,
            source,
            required_delivery_date,
            payment_terms,
            shipping_location,
            status,
            priority,
            packaging,
            brand,
            private_label,
            flavour,
            specification,
            qc_requirements,
            remarks,
            items,
        } = req.body;

        // Generate enquiry number
        const [lastEnquiry] = await connection.query(
            "SELECT enquiry_number FROM customer_enquiries ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "ENQ-00001";
        if (lastEnquiry.length > 0) {
            const lastNum = parseInt(lastEnquiry[0].enquiry_number.replace("ENQ-", ""));
            newNumber = `ENQ-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // Generate UUID for enquiry
        const enquiryId = randomUUID();

        // Insert enquiry
        await connection.query(
            `INSERT INTO customer_enquiries (
                id, enquiry_number, customer_id, lead_id, contact_person,
                salesperson_id, source, required_delivery_date, payment_terms,
                shipping_location, status, priority, packaging, brand,
                private_label, flavour, specification, qc_requirements, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                enquiryId,
                newNumber,
                customer_id || null,
                lead_id || null,
                contact_person,
                salesperson_id || req.userId,
                source,
                required_delivery_date || null,
                payment_terms,
                shipping_location,
                status || "New",
                priority || "Medium",
                packaging,
                brand,
                private_label ? 1 : 0,
                flavour,
                specification,
                qc_requirements,
                remarks,
            ]
        );

        // Insert items
        if (items && items.length > 0) {
            for (const item of items) {
                const itemId = randomUUID();
                await connection.query(
                    `INSERT INTO enquiry_items (
                        id, enquiry_id, product_id, product_name, grade,
                        quantity, unit, target_rate, required_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        itemId,
                        enquiryId,
                        item.product_id || null,
                        item.product_name,
                        item.grade,
                        item.quantity,
                        item.unit || "KG",
                        item.target_rate,
                        item.required_date || null,
                    ]
                );
            }
        }

        await connection.commit();

        const [enquiry] = await connection.query(
            "SELECT * FROM customer_enquiries WHERE id = ?",
            [enquiryId]
        );

        res.status(201).json({
            success: true,
            message: "Enquiry created successfully",
            data: enquiry[0],
        });
    } catch (error) {
        await connection.rollback();
        console.error("Create enquiry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create enquiry",
            error: error.message,
        });
    } finally {
        connection.release();
    }
};

// Update enquiry
const updateEnquiry = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            "customer_id", "lead_id", "contact_person", "salesperson_id",
            "source", "required_delivery_date", "payment_terms", "shipping_location",
            "status", "priority", "packaging", "brand", "private_label",
            "flavour", "specification", "qc_requirements", "remarks"
        ];

        const fields = [];
        const values = [];

        Object.keys(updates).forEach((key) => {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (fields.length > 0) {
            values.push(id);
            await connection.query(
                `UPDATE customer_enquiries SET ${fields.join(", ")} WHERE id = ?`,
                values
            );
        }

        await connection.commit();

        const [enquiry] = await connection.query(
            "SELECT * FROM customer_enquiries WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Enquiry updated successfully",
            data: enquiry[0],
        });
    } catch (error) {
        await connection.rollback();
        console.error("Update enquiry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update enquiry",
            error: error.message,
        });
    } finally {
        connection.release();
    }
};

// Update enquiry status
const updateEnquiryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.query(
            "UPDATE customer_enquiries SET status = ? WHERE id = ?",
            [status, id]
        );

        const [enquiry] = await db.query(
            "SELECT * FROM customer_enquiries WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Status updated successfully",
            data: enquiry[0],
        });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update status",
            error: error.message,
        });
    }
};

// Delete enquiry
const deleteEnquiry = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query("DELETE FROM customer_enquiries WHERE id = ?", [id]);

        res.json({
            success: true,
            message: "Enquiry deleted successfully",
        });
    } catch (error) {
        console.error("Delete enquiry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete enquiry",
            error: error.message,
        });
    }
};

// Convert enquiry to quotation
const convertToQuotation = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get enquiry with items
        const [enquiries] = await connection.query(
            "SELECT * FROM customer_enquiries WHERE id = ?",
            [id]
        );

        if (enquiries.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Enquiry not found",
            });
        }

        const enquiry = enquiries[0];

        const [items] = await connection.query(
            "SELECT * FROM enquiry_items WHERE enquiry_id = ?",
            [id]
        );

        // Generate quotation number
        const [lastQuotation] = await connection.query(
            "SELECT quotation_number FROM quotations ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "Q-00001";
        if (lastQuotation.length > 0) {
            const lastNum = parseInt(lastQuotation[0].quotation_number.replace("Q-", ""));
            newNumber = `Q-${String(lastNum + 1).padStart(5, "0")}`;
        }

        const quotationId = randomUUID();
        const today = new Date().toISOString().split("T")[0];

        // Calculate valid until (30 days from now)
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30);
        const validUntilStr = validUntil.toISOString().split("T")[0];

        // Create quotation
        await connection.query(
            `INSERT INTO quotations (
                id, quotation_number, customer_id, enquiry_id, salesperson_id,
                date, valid_until, payment_terms, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
            [
                quotationId,
                newNumber,
                enquiry.customer_id,
                id,
                enquiry.salesperson_id,
                today,
                validUntilStr,
                enquiry.payment_terms,
            ]
        );

        // Copy items to quotation
        let subtotal = 0;
        for (const item of items) {
            const itemId = randomUUID();
            const lineTotal = (item.quantity || 0) * (item.target_rate || 0);
            subtotal += lineTotal;

            await connection.query(
                `INSERT INTO quotation_items (
                    id, quotation_id, product_id, product_name, grade,
                    quantity, unit, rate, taxable_value, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    itemId,
                    quotationId,
                    item.product_id,
                    item.product_name,
                    item.grade,
                    item.quantity,
                    item.unit,
                    item.target_rate,
                    lineTotal,
                    lineTotal,
                ]
            );
        }

        // Update quotation totals
        await connection.query(
            `UPDATE quotations SET subtotal = ?, total = ? WHERE id = ?`,
            [subtotal, subtotal, quotationId]
        );

        // Update enquiry status
        await connection.query(
            "UPDATE customer_enquiries SET status = 'Quoted' WHERE id = ?",
            [id]
        );

        await connection.commit();

        const [quotation] = await connection.query(
            "SELECT * FROM quotations WHERE id = ?",
            [quotationId]
        );

        res.status(201).json({
            success: true,
            message: "Enquiry converted to quotation successfully",
            data: quotation[0],
        });
    } catch (error) {
        await connection.rollback();
        console.error("Convert enquiry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to convert enquiry",
            error: error.message,
        });
    } finally {
        connection.release();
    }
};

module.exports = {
    getAllEnquiries,
    getEnquiryById,
    createEnquiry,
    updateEnquiry,
    updateEnquiryStatus,
    deleteEnquiry,
    convertToQuotation,
};