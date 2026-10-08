const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const register = async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, phone, role } = req.body;

        // Check if user exists
        const [existingUser] = await db.query(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            [username, email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Username or email already exists"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const [result] = await db.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, email, hashedPassword, firstName, lastName, phone, role || "user"]
        );

        const [newUser] = await db.query(
            "SELECT id, username, email, first_name, last_name, role FROM users WHERE id = ?",
            [result.insertId]
        );

        // Generate token
        const token = jwt.sign(
            { id: newUser[0].id, email: newUser[0].email, role: newUser[0].role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || "7d" }
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                user: newUser[0],
                token
            }
        });

    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({
            success: false,
            message: "Registration failed",
            error: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const [users] = await db.query(
            "SELECT id, username, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = users[0];

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Account is deactivated"
            });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Update last login
        await db.query(
            "UPDATE users SET last_login = NOW() WHERE id = ?",
            [user.id]
        );

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || "7d" }
        );

        // Remove password from response
        delete user.password_hash;

        res.json({
            success: true,
            message: "Login successful",
            data: {
                user,
                token
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Login failed",
            error: error.message
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, username, email, first_name, last_name, phone, role, is_active, created_at FROM users WHERE id = ?",
            [req.userId]
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
        console.error("Profile error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get profile",
            error: error.message
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, phone } = req.body;

        await db.query(
            "UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?",
            [firstName, lastName, phone, req.userId]
        );

        const [users] = await db.query(
            "SELECT id, username, email, first_name, last_name, phone, role FROM users WHERE id = ?",
            [req.userId]
        );

        res.json({
            success: true,
            message: "Profile updated successfully",
            data: users[0]
        });

    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update profile",
            error: error.message
        });
    }
};

module.exports = {
    register,
    login,
    getProfile,
    updateProfile
};