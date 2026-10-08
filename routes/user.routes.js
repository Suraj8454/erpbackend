const express = require("express");
const {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    changePassword,
    getUserRoles,
    getUserStats
} = require("../controllers/user.controller");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// Stats and roles (accessible by all authenticated users)
router.get("/stats", getUserStats);
router.get("/roles", getUserRoles);

// User CRUD (admin only)
router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.post("/", requireRole("admin"), createUser);
router.put("/:id", requireRole("admin"), updateUser);
router.delete("/:id", requireRole("admin"), deleteUser);
router.patch("/:id/toggle-status", requireRole("admin"), toggleUserStatus);
router.patch("/:id/change-password", changePassword);

module.exports = router;