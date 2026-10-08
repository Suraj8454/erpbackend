const jwt = require("jsonwebtoken");
const db = require("../config/db");

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await db.query(
            "SELECT id, username, email, first_name, last_name, role, is_active FROM users WHERE id = ?",
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        if (!users[0].is_active) {
            return res.status(403).json({
                success: false,
                message: "User account is deactivated"
            });
        }

        req.user = users[0];
        req.userId = decoded.id;

        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired"
            });
        }
        console.error("Auth error:", error);
        res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
};

// Role-based access control
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(" or ")}`
            });
        }

        next();
    };
};

module.exports = { authMiddleware, requireRole };