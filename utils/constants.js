const LEAD_STATUS = {
    NEW: "New",
    CONTACTED: "Contacted",
    QUALIFIED: "Qualified",
    QUOTATION_SENT: "Quotation Sent",
    NEGOTIATION: "Negotiation",
    WON: "Won",
    LOST: "Lost"
};

const QUOTATION_STATUS = {
    DRAFT: "Draft",
    PENDING_APPROVAL: "Pending Approval",
    APPROVED: "Approved",
    SENT: "Sent",
    NEGOTIATION: "Negotiation",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    EXPIRED: "Expired",
    CANCELLED: "Cancelled"
};

const QC_RESULT = {
    ACCEPTED: "Accepted",
    PARTIALLY_ACCEPTED: "Partially Accepted",
    REJECTED: "Rejected",
    HOLD: "Hold"
};

const STOCK_STATUS = {
    AVAILABLE: "Available",
    RESERVED: "Reserved",
    HOLD: "Hold",
    REJECTED: "Rejected",
    DAMAGED: "Damaged",
    IN_TRANSIT: "In Transit"
};

const CUSTOMER_TYPES = [
    "Retailer",
    "Distributor",
    "Wholesaler",
    "Exporter",
    "Manufacturer",
    "E-commerce",
    "Corporate"
];

const MAKHANA_GRADES = [
    "4 Suta",
    "5 Suta",
    "6 Suta",
    "Premium",
    "Standard",
    "Economy"
];

module.exports = {
    LEAD_STATUS,
    QUOTATION_STATUS,
    QC_RESULT,
    STOCK_STATUS,
    CUSTOMER_TYPES,
    MAKHANA_GRADES
};