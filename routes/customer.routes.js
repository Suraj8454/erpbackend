const express = require("express");
const {
    getAllCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
} = require("../controllers/customer.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;