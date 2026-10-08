const db = require("../config/db");
const { randomUUID } = require("crypto"); 

// Get all QC inspections
const getAllQC = async (req, res) => {
    try {
        const { search, result } = req.query;
        let sql = `
            SELECT qc.*, 
                   s.company_name as supplier_name,
                   g.grn_number,
                   p.name as product_name
            FROM qc_inspections qc
            LEFT JOIN suppliers s ON qc.supplier_id = s.id
            LEFT JOIN grn g ON qc.grn_id = g.id
            LEFT JOIN products p ON qc.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (qc.qc_number LIKE ? OR s.company_name LIKE ? OR g.grn_number LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (result && result !== "all") {
            sql += " AND qc.result = ?";
            params.push(result);
        }

        sql += " ORDER BY qc.created_at DESC";
        const [inspections] = await db.query(sql, params);

        res.json({
            success: true,
            data: inspections
        });
    } catch (error) {
        console.error("Get QC error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch QC inspections",
            error: error.message
        });
    }
};

// Get QC by ID
const getQCById = async (req, res) => {
    try {
        const { id } = req.params;

        const [inspections] = await db.query(
            `SELECT qc.*, 
                    s.company_name as supplier_name,
                    g.grn_number,
                    p.name as product_name
             FROM qc_inspections qc
             LEFT JOIN suppliers s ON qc.supplier_id = s.id
             LEFT JOIN grn g ON qc.grn_id = g.id
             LEFT JOIN products p ON qc.product_id = p.id
             WHERE qc.id = ?`,
            [id]
        );

        if (inspections.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QC inspection not found"
            });
        }

        // Get QC results
        const [results] = await db.query(
            `SELECT qr.*, qp.name as parameter_name, qp.unit
             FROM qc_results qr
             LEFT JOIN qc_parameters qp ON qr.parameter_id = qp.id
             WHERE qr.qc_inspection_id = ?`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...inspections[0],
                results
            }
        });
    } catch (error) {
        console.error("Get QC error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch QC",
            error: error.message
        });
    }
};

// Create QC inspection
const createQC = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        console.log('📥 QC Request Body:', req.body);

        // ✅ Rename to avoid conflict
        const {
            grn_id,
            supplier_id,
            product_id,
            inspection_date,
            quantity,
            batch_number,
            inspector_id,
            result: qcResult,
            overall_quality,
            remarks,
        } = req.body;

        // Validate
        if (!grn_id || !qcResult) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "grn_id and result are required",
            });
        }

        // Generate QC number
        const [lastQC] = await connection.query(
            "SELECT qc_number FROM qc_inspections ORDER BY created_at DESC LIMIT 1"
        );

        let newNumber = "QC-00001";
        if (lastQC.length > 0) {
            const lastNum = parseInt(lastQC[0].qc_number.replace("QC-", ""));
            newNumber = `QC-${String(lastNum + 1).padStart(5, "0")}`;
        }

        // ✅ Generate UUID for QC
        const qcId = randomUUID();

        // Insert QC inspection
        await connection.query(
            `INSERT INTO qc_inspections (
                id, qc_number, grn_id, supplier_id, product_id,
                inspection_date, quantity, batch_number,
                inspector_id, result, overall_quality, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                qcId,
                newNumber,
                grn_id,
                supplier_id || null,
                product_id || null,
                inspection_date || new Date().toISOString().split("T")[0],
                quantity || 0,
                batch_number || null,
                inspector_id || req.userId,
                qcResult,
                overall_quality || null,
                remarks || null,
            ]
        );

        console.log('✅ QC created:', newNumber);

        // Determine GRN status
        let grnStatus = "Accepted";
        if (qcResult === "Rejected") grnStatus = "Rejected";
        else if (qcResult === "Partially Accepted") grnStatus = "Partially Accepted";
        else if (qcResult === "Hold") grnStatus = "Hold";

        await connection.query(
            "UPDATE grn SET status = ? WHERE id = ?",
            [grnStatus, grn_id]
        );

        console.log('✅ GRN status updated to:', grnStatus);

        // ✅ ADD STOCK — Only if accepted
        if (qcResult === "Accepted" || qcResult === "Partially Accepted") {
            console.log('📦 Adding stock...');

            // Get GRN items
            const [grnItems] = await connection.query(
                "SELECT * FROM grn_items WHERE grn_id = ?",
                [grn_id]
            );

            console.log('📦 GRN items found:', grnItems.length);

            if (grnItems.length === 0) {
                console.warn('⚠️ No GRN items found!');
            }

            for (const grnItem of grnItems) {
                const acceptedQty = qcResult === "Accepted"
                    ? Number(grnItem.received_quantity || 0)
                    : Number(quantity || 0);

                if (acceptedQty <= 0) {
                    console.log('⚠️ Skipping item with 0 quantity');
                    continue;
                }

                console.log(`📦 Adding ${acceptedQty} KG for product:`, grnItem.product_id);

                // Get current balance from ledger
                const [balanceRow] = await connection.query(
                    `SELECT COALESCE(SUM(quantity_in) - SUM(quantity_out), 0) as balance 
                     FROM stock_ledger WHERE product_id = ?`,
                    [grnItem.product_id]
                );
                const currentBalance = Number(balanceRow[0].balance || 0);
                const newBalance = currentBalance + acceptedQty;

                // ✅ Insert into stock_ledger
                await connection.query(
                    `INSERT INTO stock_ledger (
                        id, product_id, batch_number, warehouse_id,
                        transaction_type, reference_id, reference_number,
                        quantity_in, quantity_out, balance,
                        transaction_date, created_by
                    ) VALUES (?, ?, ?, ?, 'GRN', ?, ?, ?, 0, ?, NOW(), ?)`,
                    [
                        randomUUID(),
                        grnItem.product_id,
                        grnItem.batch_number || null,
                        null,
                        grn_id,
                        newNumber,
                        acceptedQty,
                        newBalance,
                        req.userId,
                    ]
                );

                console.log('✅ Ledger entry added. New balance:', newBalance);

                // ✅ Check if stock exists
                const [existingStock] = await connection.query(
                    `SELECT id FROM current_stock 
                     WHERE product_id = ? 
                     AND (batch_number <=> ?)`,
                    [grnItem.product_id, grnItem.batch_number || null]
                );

                if (existingStock.length > 0) {
                    // Update
                    await connection.query(
                        `UPDATE current_stock 
                         SET quantity = quantity + ?, last_updated = NOW()
                         WHERE id = ?`,
                        [acceptedQty, existingStock[0].id]
                    );
                    console.log('✅ current_stock updated');
                } else {
                    // Insert new
                    await connection.query(
                        `INSERT INTO current_stock (
                            id, product_id, batch_number, warehouse_id,
                            quantity, reserved_quantity, hold_quantity,
                            rejected_quantity, unit_cost
                        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)`,
                        [
                            randomUUID(),
                            grnItem.product_id,
                            grnItem.batch_number || null,
                            null,
                            acceptedQty,
                        ]
                    );
                    console.log('✅ current_stock inserted');
                }

                // Update GRN item accepted quantity
                await connection.query(
                    "UPDATE grn_items SET accepted_quantity = ? WHERE id = ?",
                    [acceptedQty, grnItem.id]
                );
            }

            // Update GRN header totals
            await connection.query(
                `UPDATE grn SET accepted_quantity = (
                    SELECT COALESCE(SUM(accepted_quantity), 0) 
                    FROM grn_items WHERE grn_id = ?
                ) WHERE id = ?`,
                [grn_id, grn_id]
            );
        }

        await connection.commit();

        const [qc] = await connection.query(
            "SELECT * FROM qc_inspections WHERE id = ?",
            [qcId]
        );

        res.status(201).json({
            success: true,
            message: "QC inspection created successfully",
            data: qc[0],
        });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Create QC error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create QC inspection",
            error: error.message,
        });
    } finally {
        connection.release();
    }
};

// Get QC parameters
const getQCParameters = async (req, res) => {
    try {
        const [parameters] = await db.query(
            "SELECT * FROM qc_parameters WHERE is_active = TRUE ORDER BY name"
        );
        res.json({ success: true, data: parameters });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllQC,
    getQCById,
    createQC,
    getQCParameters
};