const { Room, Building } = require("../models/schemas");

/**
 * Controller quản lý phòng học
 */

// @desc    Lấy danh sách tất cả phòng học
// @route   GET /api/rooms
// @access  Private
exports.getAllRooms = async (req, res) => {
  try {
    const { building_id, floor, room_type, status } = req.query;
    const query = {};

    if (building_id) {
      query.building_id = building_id;
    }

    if (floor) {
      query.floor = floor;
    }

    if (room_type) {
      query.room_type = room_type;
    }

    if (status) {
      query.status = status;
    }

    const rooms = await Room.find(query)
      .populate({
        path: "building_id",
        select: "name code campus_id",
        populate: {
          path: "campus_id",
          select: "name code",
        },
      })
      .sort({ room_number: 1 });

    res.status(200).json({
      success: true,
      count: rooms.length,
      data: rooms,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách phòng học:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách phòng học",
      error: error.message,
    });
  }
};

// @desc    Lấy phòng học theo ID
// @route   GET /api/rooms/:id
// @access  Private
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate({
      path: "building_id",
      select: "name code campus_id",
      populate: {
        path: "campus_id",
        select: "name code address",
      },
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin phòng học:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin phòng học",
      error: error.message,
    });
  }
};

// @desc    Tạo phòng học mới
// @route   POST /api/rooms
// @access  Private (Admin)
exports.createRoom = async (req, res) => {
  try {
    const {
      room_number,
      building_id,
      floor,
      room_type,
      capacity,
      area,
      equipment,
      status,
      image_url,
    } = req.body;

    // Kiểm tra building tồn tại
    const building = await Building.findById(building_id);
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà với ID này",
      });
    }

    // Kiểm tra số tầng hợp lệ
    if (floor > building.floors_count) {
      return res.status(400).json({
        success: false,
        message: `Tòa nhà ${building.name} chỉ có ${building.floors_count} tầng`,
      });
    }

    // Kiểm tra phòng học đã tồn tại trong tòa nhà chưa
    const existingRoom = await Room.findOne({
      building_id,
      room_number,
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: "Phòng học này đã tồn tại trong tòa nhà",
      });
    }

    const room = await Room.create({
      room_number,
      building_id,
      floor,
      room_type,
      capacity,
      area,
      equipment: equipment || [],
      status: status || "available",
      image_url,
    });

    res.status(201).json({
      success: true,
      data: room,
      message: "Tạo phòng học thành công",
    });
  } catch (error) {
    console.error("Lỗi khi tạo phòng học mới:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo phòng học mới",
      error: error.message,
    });
  }
};

// @desc    Cập nhật phòng học
// @route   PUT /api/rooms/:id
// @access  Private (Admin)
exports.updateRoom = async (req, res) => {
  try {
    const {
      room_number,
      building_id,
      floor,
      room_type,
      capacity,
      area,
      equipment,
      status,
      image_url,
    } = req.body;
    const roomId = req.params.id;

    // Nếu có thay đổi tòa nhà hoặc số phòng, kiểm tra sự tồn tại
    if (building_id && room_number) {
      // Kiểm tra building tồn tại
      const building = await Building.findById(building_id);
      if (!building) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tòa nhà với ID này",
        });
      }

      // Kiểm tra số tầng hợp lệ
      if (floor > building.floors_count) {
        return res.status(400).json({
          success: false,
          message: `Tòa nhà ${building.name} chỉ có ${building.floors_count} tầng`,
        });
      }

      // Kiểm tra phòng học đã tồn tại trong tòa nhà chưa (trừ phòng hiện tại)
      const existingRoom = await Room.findOne({
        building_id,
        room_number,
        _id: { $ne: roomId },
      });

      if (existingRoom) {
        return res.status(400).json({
          success: false,
          message: "Phòng học này đã tồn tại trong tòa nhà",
        });
      }
    }

    const room = await Room.findByIdAndUpdate(
      roomId,
      {
        room_number,
        building_id,
        floor,
        room_type,
        capacity,
        area,
        equipment,
        status,
        image_url,
      },
      { new: true, runValidators: true }
    );

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học với ID này",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
      message: "Cập nhật phòng học thành công",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật phòng học:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật phòng học",
      error: error.message,
    });
  }
};

// @desc    Xóa phòng học
// @route   DELETE /api/rooms/:id
// @access  Private (Admin)
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học với ID này",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa phòng học thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa phòng học:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa phòng học",
      error: error.message,
    });
  }
};
