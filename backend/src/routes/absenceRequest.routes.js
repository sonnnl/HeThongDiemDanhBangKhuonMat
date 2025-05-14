const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth.middleware");

// Giả định controllers
router.get("/", protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: "API yêu cầu vắng mặt hoạt động",
  });
});

module.exports = router;
