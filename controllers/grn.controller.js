const db = require("../config/db");

// Get all GRNs
const getAllGRNs = async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = `
            SELECT g.*, 
                   s.company_name as supplier_name,
                   po.po_number
            FROM grn g
            LEFT JOIN suppliers s ON g.supplier_id = s.id
            LEFT JOIN purchase_orders po ON g.purchase_order_id = po.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (g.grn_number LIKE ? OR s.company_name LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status && status !== "all") {
            sql += " AND g.status = ?";
            params.push(status);
        }

        sql += " ORDER BY g.created_at DESC";
        const [grns] = await db.query(sql, params);

        res.json({
            success: true,
            data: grns
        });
    } catch (error) {
        console.error("Get GRNs error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch GRNs",
            error: error.message
        });
    }
};

// Get GRN by ID
const getGRNById = async (req, res) => {
    try {
        const { id } = req.params;

        const [grns] = await db.query(
            `SELECT g.*, 
                    s.company_name as supplier_name,
                    po.po_number
             FROM grn g
             LEFT JOIN suppliers s ON g.supplier_id = s.id
             LEFT JOIN purchase_orders po ON g.purchase_order_id = po.id
             WHERE g.id = ?`,
            [id]
        );

        if (grns.length === 0) {
            return res.status(404).json({
                success: false,
                message: "GRN not found"
            });
        }

        const [items] = await db.query(
            "SELECT * FROM grn_items WHERE grn_id = ?",
            [id]
        );

        res.json({
            success: true,
            data: {
                ...grns[0],
                items
            }
        });
    } catch (error) {
        console.error("Get GRN error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch GRN",
            error: error.message
        });
    }
};

// Update GRN status
const updateGRNStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;

        await db.query(
            "UPDATE grn SET status = ?, remarks = COALESCE(?, remarks) WHERE id = ?",
            [status, remarks, id]
        );

        const [grn] = await db.query(
            "SELECT * FROM grn WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "GRN status updated",
            data: grn[0]
        });
    } catch (error) {
        console.error("Update GRN error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update GRN",
            error: error.message
        });
    }
};

module.exports = {
    getAllGRNs,
    getGRNById,
    updateGRNStatus
};