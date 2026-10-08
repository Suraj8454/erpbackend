const express = require("express");
const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getGrades
} = require("../controllers/product.controller");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get("/", getAllProducts);
router.get("/categories", getCategories);
router.get("/grades", getGrades);
router.get("/:id", getProductById);
router.post("/", requireRole("admin", "manager"), createProduct);
router.put("/:id", requireRole("admin", "manager"), updateProduct);
router.delete("/:id", requireRole("admin"), deleteProduct);

module.exports = router;