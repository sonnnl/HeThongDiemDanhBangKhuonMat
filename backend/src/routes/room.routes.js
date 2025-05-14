const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth.middleware");
const roomController = require("../controllers/room.controller");

// Room routes
router
  .route("/")
  .get(roomController.getAllRooms)
  .post(protect, authorize("admin"), roomController.createRoom);

router
  .route("/:id")
  .get(roomController.getRoomById)
  .put(protect, authorize("admin"), roomController.updateRoom)
  .delete(protect, authorize("admin"), roomController.deleteRoom);

module.exports = router;
