const express = require("express");
const {
    getAllSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier
} = require("../controllers/supplier.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllSuppliers);
router.get("/:id", getSupplierById);
router.post("/", createSupplier);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

module.exports = router;