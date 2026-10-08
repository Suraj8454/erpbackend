const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto"); 

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const { search, role, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT id, username, email, first_name, last_name, phone, 
                   role, is_active, last_login, created_at
            FROM users
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR username LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (role && role !== "all") {
            sql += " AND role = ?";
            params.push(role);
        }
        if (status && status !== "all") {
            sql += " AND is_active = ?";
            params.push(status === "Active" ? 1 : 0);
        }

        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [users] = await db.query(sql, params);

        // Get total count
        let countSql = "SELECT COUNT(*) as total FROM users WHERE 1=1";
        const countParams = [];

        if (search) {
            countSql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)";
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (role && role !== "all") {
            countSql += " AND role = ?";
            countParams.push(role);
        }
        if (status && status !== "all") {
            countSql += " AND is_active = ?";
            countParams.push(status === "Active" ? 1 : 0);
        }

        const [countResult] = await db.query(countSql, countParams);

        res.json({
            success: true,
            data: users,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
            error: error.message
        });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const [users] = await db.query(
            `SELECT id, username, email, first_name, last_name, phone, 
                    role, is_active, last_login, created_at
             FROM users WHERE id = ?`,
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user",
            error: error.message
        });
    }
};

// Create user
const createUser = async (req, res) => {
    try {
        const {
            username, email, password, first_name, last_name,
            phone, role, is_active,
        } = req.body;

        console.log('📥 Create user:', req.body);

        // Validate required
        if (!username || !email || !password || !first_name || !last_name) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields",
            });
        }

        // Check if user exists
        const [existing] = await db.query(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Username or email already exists",
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // ✅ Generate UUID for user
        const { randomUUID } = require("crypto");
        const userId = randomUUID();

        // Insert user with explicit ID
        await db.query(
            `INSERT INTO users (
                id, username, email, password_hash, first_name, last_name,
                phone, role, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                username,
                email,
                password_hash,
                first_name,
                last_name,
                phone || null,
                role || "user",
                is_active !== false ? 1 : 0,
            ]
        );

        // Fetch using the generated UUID
        const [newUser] = await db.query(
            `SELECT id, username, email, first_name, last_name, phone,
                    role, is_active, created_at
             FROM users WHERE id = ?`,
            [userId]
        );

        console.log('✅ User created:', username);

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: newUser[0],
        });
    } catch (error) {
        console.error("❌ Create user error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create user",
            error: error.message,
        });
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            username, email, first_name, last_name,
            phone, role, is_active, password
        } = req.body;

        // Check if user exists
        const [existing] = await db.query(
            "SELECT id FROM users WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check username/email conflict with other users
        if (username || email) {
            const [conflict] = await db.query(
                "SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?",
                [username, email, id]
            );

            if (conflict.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Username or email already in use"
                });
            }
        }

        // Build dynamic update
        const fields = [];
        const values = [];

        if (username) { fields.push("username = ?"); values.push(username); }
        if (email) { fields.push("email = ?"); values.push(email); }
        if (first_name) { fields.push("first_name = ?"); values.push(first_name); }
        if (last_name) { fields.push("last_name = ?"); values.push(last_name); }
        if (phone !== undefined) { fields.push("phone = ?"); values.push(phone); }
        if (role) { fields.push("role = ?"); values.push(role); }
        if (is_active !== undefined) { fields.push("is_active = ?"); values.push(is_active ? 1 : 0); }

        // Hash new password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);
            fields.push("password_hash = ?");
            values.push(password_hash);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update"
            });
        }

        values.push(id);

        await db.query(
            `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            `SELECT id, username, email, first_name, last_name, phone, 
                    role, is_active, created_at
             FROM users WHERE id = ?`,
            [id]
        );

        res.json({
            success: true,
            message: "User updated successfully",
            data: updated[0]
        });
    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update user",
            error: error.message
        });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting self
        if (id === req.userId) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete your own account"
            });
        }

        const [result] = await db.query(
            "DELETE FROM users WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete user",
            error: error.message
        });
    }
};

// Toggle user status
const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.userId) {
            return res.status(400).json({
                success: false,
                message: "Cannot deactivate your own account"
            });
        }

        await db.query(
            "UPDATE users SET is_active = NOT is_active WHERE id = ?",
            [id]
        );

        const [user] = await db.query(
            "SELECT id, username, email, is_active FROM users WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: `User ${user[0].is_active ? "activated" : "deactivated"} successfully`,
            data: user[0]
        });
    } catch (error) {
        console.error("Toggle status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to toggle user status",
            error: error.message
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        // If changing own password, verify current
        if (id === req.userId) {
            const [users] = await db.query(
                "SELECT password_hash FROM users WHERE id = ?",
                [id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect"
                });
            }
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(newPassword, salt);

        await db.query(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [password_hash, id]
        );

        res.json({
            success: true,
            message: "Password changed successfully"
        });
    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to change password",
            error: error.message
        });
    }
};

// Get user roles
const getUserRoles = async (req, res) => {
    try {
        const roles = [
            { value: "admin", label: "Admin" },
            { value: "manager", label: "Manager" },
            { value: "sales_manager", label: "Sales Manager" },
            { value: "salesperson", label: "Salesperson" },
            { value: "purchase_manager", label: "Purchase Manager" },
            { value: "warehouse_manager", label: "Warehouse Manager" },
            { value: "accountant", label: "Accountant" },
            { value: "user", label: "User" }
        ];

        res.json({
            success: true,
            data: roles
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get user stats
const getUserStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
                SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_users,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
            FROM users
        `);

        res.json({
            success: true,
            data: {
                totalUsers: stats[0].total_users,
                activeUsers: stats[0].active_users,
                inactiveUsers: stats[0].inactive_users,
                admins: stats[0].admins,
                newToday: stats[0].new_today
            }
        });
    } catch (error) {
        console.error("Get user stats error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch stats",
            error: error.message
        });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    changePassword,
    getUserRoles,
    getUserStats
};