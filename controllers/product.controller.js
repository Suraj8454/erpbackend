const db = require("../config/db");

// Get all products
const getAllProducts = async (req, res) => {
    try {
        const { search, category, grade, status } = req.query;
        
        let sql = `
            SELECT p.*, 
                   pc.name as category_name, 
                   pg.name as grade_name
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN product_grades pg ON p.grade_id = pg.id
            WHERE 1=1
        `;
        const params = [];

        // ✅ Skip search if empty
        if (search && search.trim()) {
            sql += " AND (p.name LIKE ? OR p.code LIKE ? OR p.suta LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        // ✅ Skip 'all'
        if (category && category !== "all") {
            sql += " AND p.category = ?";     // using text category column
            params.push(category);
        }
        
        // ✅ Skip 'all'
        if (grade && grade !== "all") {
            sql += " AND p.grade = ?";        // using text grade column
            params.push(grade);
        }
        
        // ✅ Skip 'all'
        if (status && status !== "all") {
            sql += " AND p.is_active = ?";
            params.push(status === "Active" ? 1 : 0);
        }

        sql += " ORDER BY p.created_at DESC";

        const [products] = await db.query(sql, params);

        console.log('📦 Products found:', products.length);

        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
            error: error.message
        });
    }
};

// Get single product
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const [products] = await db.query(
            `SELECT p.*, 
                    pc.name as category_name, 
                    pg.name as grade_name
             FROM products p
             LEFT JOIN product_categories pc ON p.category_id = pc.id
             LEFT JOIN product_grades pg ON p.grade_id = pg.id
             WHERE p.id = ?`,
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        res.json({
            success: true,
            data: products[0]
        });
    } catch (error) {
        console.error("Get product error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch product",
            error: error.message
        });
    }
};

// Create product
const createProduct = async (req, res) => {
    try {
        const {
            code, name, category_id, grade_id, description, unit, size,
            quality, colour, suta, moisture_limit, broken_limit,
            foreign_material_limit, black_seeds_limit, yellow_seeds_limit,
            purchase_rate, sales_rate, gst_rate, hsn_code,
            batch_required, expiry_required, qc_required, reorder_level
        } = req.body;

        // Check if code exists
        const [existing] = await db.query(
            "SELECT id FROM products WHERE code = ?",
            [code]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Product code already exists"
            });
        }

        const [result] = await db.query(
            `INSERT INTO products (
                code, name, category_id, grade_id, description, unit, size,
                quality, colour, suta, moisture_limit, broken_limit,
                foreign_material_limit, black_seeds_limit, yellow_seeds_limit,
                purchase_rate, sales_rate, gst_rate, hsn_code,
                batch_required, expiry_required, qc_required, reorder_level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code, name, category_id, grade_id, description, unit || "KG", size,
                quality, colour, suta, moisture_limit, broken_limit,
                foreign_material_limit, black_seeds_limit, yellow_seeds_limit,
                purchase_rate, sales_rate, gst_rate || 0, hsn_code,
                batch_required !== false ? 1 : 0,
                expiry_required ? 1 : 0,
                qc_required !== false ? 1 : 0,
                reorder_level
            ]
        );

        const [newProduct] = await db.query(
            "SELECT * FROM products WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: newProduct[0]
        });
    } catch (error) {
        console.error("Create product error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create product",
            error: error.message
        });
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Build dynamic update query
        const allowedFields = [
            "code", "name", "category_id", "grade_id", "description", "unit",
            "size", "quality", "colour", "suta", "moisture_limit", "broken_limit",
            "foreign_material_limit", "black_seeds_limit", "yellow_seeds_limit",
            "purchase_rate", "sales_rate", "gst_rate", "hsn_code",
            "batch_required", "expiry_required", "qc_required", "reorder_level", "is_active"
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
            `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            "SELECT * FROM products WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Product updated successfully",
            data: updated[0]
        });
    } catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update product",
            error: error.message
        });
    }
};

// Delete product
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            "DELETE FROM products WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        res.json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        console.error("Delete product error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete product",
            error: error.message
        });
    }
};

// Get product categories
const getCategories = async (req, res) => {
    try {
        const [categories] = await db.query(
            "SELECT * FROM product_categories WHERE is_active = TRUE ORDER BY name"
        );
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get product grades
const getGrades = async (req, res) => {
    try {
        const [grades] = await db.query(
            "SELECT * FROM product_grades WHERE is_active = TRUE ORDER BY name"
        );
        res.json({ success: true, data: grades });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getGrades
};