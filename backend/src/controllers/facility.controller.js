const { Campus, Building, Room, RoomSchedule } = require("../models/schemas");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

/**
 * Controller quản lý cơ sở vật chất
 */

// =================== CAMPUS CONTROLLERS ===================

// @desc    Lấy danh sách tất cả cơ sở
// @route   GET /api/campus
// @access  Private (Admin)
exports.getAllCampuses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Campus.countDocuments(query);
    const campuses = await Campus.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: campuses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: campuses,
    });
  } catch (error) {
    console.error("Error in getAllCampuses:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách cơ sở",
      error: error.message,
    });
  }
};

// @desc    Lấy cơ sở theo ID
// @route   GET /api/campus/:id
// @access  Private
exports.getCampusById = async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở",
      });
    }

    res.status(200).json({
      success: true,
      data: campus,
    });
  } catch (error) {
    console.error("Error in getCampusById:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy thông tin cơ sở",
      error: error.message,
    });
  }
};

// @desc    Tạo cơ sở mới
// @route   POST /api/campus
// @access  Private (Admin)
exports.createCampus = async (req, res) => {
  try {
    const { name, code, address, location, description, image_url, status } =
      req.body;

    // Kiểm tra cơ sở đã tồn tại chưa
    const existingCampus = await Campus.findOne({ code });
    if (existingCampus) {
      return res.status(400).json({
        success: false,
        message: "Mã cơ sở đã tồn tại",
      });
    }

    const campus = await Campus.create({
      name,
      code,
      address,
      location,
      description,
      image_url,
      status: status || "active",
    });

    res.status(201).json({
      success: true,
      data: campus,
      message: "Tạo cơ sở mới thành công",
    });
  } catch (error) {
    console.error("Error in createCampus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo cơ sở mới",
      error: error.message,
    });
  }
};

// @desc    Cập nhật cơ sở
// @route   PUT /api/campus/:id
// @access  Private (Admin)
exports.updateCampus = async (req, res) => {
  try {
    const { name, code, address, location, description, image_url, status } =
      req.body;
    const campusId = req.params.id;

    // Kiểm tra mã cơ sở đã tồn tại chưa (trừ cơ sở hiện tại)
    if (code) {
      const existingCampus = await Campus.findOne({
        code,
        _id: { $ne: campusId },
      });

      if (existingCampus) {
        return res.status(400).json({
          success: false,
          message: "Mã cơ sở đã tồn tại",
        });
      }
    }

    const campus = await Campus.findByIdAndUpdate(
      campusId,
      { name, code, address, location, description, image_url, status },
      { new: true, runValidators: true }
    );

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở",
      });
    }

    res.status(200).json({
      success: true,
      data: campus,
      message: "Cập nhật cơ sở thành công",
    });
  } catch (error) {
    console.error("Error in updateCampus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật cơ sở",
      error: error.message,
    });
  }
};

// @desc    Xóa cơ sở
// @route   DELETE /api/campus/:id
// @access  Private (Admin)
exports.deleteCampus = async (req, res) => {
  try {
    const campusId = req.params.id;

    // Kiểm tra xem có tòa nhà nào thuộc cơ sở này không
    const buildingsCount = await Building.countDocuments({
      campus_id: campusId,
    });
    if (buildingsCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể xóa cơ sở này vì đã có tòa nhà được gán cho cơ sở này",
      });
    }

    const campus = await Campus.findByIdAndDelete(campusId);

    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa cơ sở thành công",
    });
  } catch (error) {
    console.error("Error in deleteCampus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa cơ sở",
      error: error.message,
    });
  }
};

// =================== BUILDING CONTROLLERS ===================

// @desc    Lấy danh sách tất cả tòa nhà
// @route   GET /api/buildings
// @access  Private (Admin)
exports.getAllBuildings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const campusId = req.query.campus_id || "";

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    if (campusId) {
      query.campus_id = campusId;
    }

    const total = await Building.countDocuments(query);
    const buildings = await Building.find(query)
      .populate("campus_id", "name code")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: buildings.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: buildings,
    });
  } catch (error) {
    console.error("Error in getAllBuildings:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách tòa nhà theo campus
// @route   GET /api/buildings/campus/:campusId
// @access  Private
exports.getBuildingsByCampus = async (req, res) => {
  try {
    const campusId = req.params.campusId;

    const buildings = await Building.find({ campus_id: campusId })
      .populate("campus_id", "name code")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: buildings.length,
      data: buildings,
    });
  } catch (error) {
    console.error("Error in getBuildingsByCampus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách tòa nhà theo campus",
      error: error.message,
    });
  }
};

// @desc    Lấy tòa nhà theo ID
// @route   GET /api/buildings/:id
// @access  Private
exports.getBuildingById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id).populate(
      "campus_id",
      "name code"
    );

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà",
      });
    }

    res.status(200).json({
      success: true,
      data: building,
    });
  } catch (error) {
    console.error("Error in getBuildingById:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy thông tin tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Tạo tòa nhà mới
// @route   POST /api/buildings
// @access  Private (Admin)
exports.createBuilding = async (req, res) => {
  try {
    const {
      name,
      code,
      campus_id,
      floors_count,
      year_built,
      status,
      facilities,
      image_url,
    } = req.body;

    // Kiểm tra tòa nhà đã tồn tại chưa
    const existingBuilding = await Building.findOne({ code });
    if (existingBuilding) {
      return res.status(400).json({
        success: false,
        message: "Mã tòa nhà đã tồn tại",
      });
    }

    // Kiểm tra campus_id có phải là ObjectId hợp lệ không
    if (!mongoose.Types.ObjectId.isValid(campus_id)) {
      return res.status(400).json({
        success: false,
        message: "Mã khu vực không hợp lệ",
      });
    }

    // Kiểm tra cơ sở có tồn tại không
    const campus = await Campus.findById(campus_id);
    if (!campus) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở",
      });
    }

    const building = await Building.create({
      name,
      code,
      campus_id,
      floors_count: floors_count || 1,
      year_built,
      status: status || "active",
      facilities: facilities || [],
      image_url,
    });

    res.status(201).json({
      success: true,
      data: building,
      message: "Tạo tòa nhà mới thành công",
    });
  } catch (error) {
    console.error("Error in createBuilding:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo tòa nhà mới",
      error: error.message,
    });
  }
};

// @desc    Cập nhật tòa nhà
// @route   PUT /api/buildings/:id
// @access  Private (Admin)
exports.updateBuilding = async (req, res) => {
  try {
    const {
      name,
      code,
      campus_id,
      floors_count,
      year_built,
      status,
      facilities,
      image_url,
    } = req.body;
    const buildingId = req.params.id;

    // Kiểm tra mã tòa nhà đã tồn tại chưa (trừ tòa nhà hiện tại)
    if (code) {
      const existingBuilding = await Building.findOne({
        code,
        _id: { $ne: buildingId },
      });

      if (existingBuilding) {
        return res.status(400).json({
          success: false,
          message: "Mã tòa nhà đã tồn tại",
        });
      }
    }

    // Kiểm tra cơ sở có tồn tại không
    if (campus_id) {
      const campus = await Campus.findById(campus_id);
      if (!campus) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cơ sở",
        });
      }
    }

    const building = await Building.findByIdAndUpdate(
      buildingId,
      {
        name,
        code,
        campus_id,
        floors_count,
        year_built,
        status,
        facilities,
        image_url,
      },
      { new: true, runValidators: true }
    );

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà",
      });
    }

    res.status(200).json({
      success: true,
      data: building,
      message: "Cập nhật tòa nhà thành công",
    });
  } catch (error) {
    console.error("Error in updateBuilding:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Xóa tòa nhà
// @route   DELETE /api/buildings/:id
// @access  Private (Admin)
exports.deleteBuilding = async (req, res) => {
  try {
    const buildingId = req.params.id;

    // Kiểm tra xem có phòng nào thuộc tòa nhà này không
    const roomsCount = await Room.countDocuments({ building_id: buildingId });
    if (roomsCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể xóa tòa nhà này vì đã có phòng được gán cho tòa nhà này",
      });
    }

    const building = await Building.findByIdAndDelete(buildingId);

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa tòa nhà thành công",
    });
  } catch (error) {
    console.error("Error in deleteBuilding:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa tòa nhà",
      error: error.message,
    });
  }
};

// =================== ROOM CONTROLLERS ===================

// @desc    Lấy danh sách tất cả phòng học
// @route   GET /api/rooms
// @access  Private
exports.getAllRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const buildingId = req.query.building_id || "";
    const roomType = req.query.room_type || "";
    const capacity = parseInt(req.query.capacity) || 0;
    const status = req.query.status || "";

    const query = {};

    if (search) {
      query.$or = [{ room_number: { $regex: search, $options: "i" } }];
    }

    if (buildingId) {
      query.building_id = buildingId;
    }

    if (roomType) {
      query.room_type = roomType;
    }

    if (capacity > 0) {
      query.capacity = { $gte: capacity };
    }

    if (status) {
      query.status = status;
    }

    const total = await Room.countDocuments(query);
    const rooms = await Room.find(query)
      .populate({
        path: "building_id",
        select: "name code campus_id",
        populate: {
          path: "campus_id",
          select: "name code",
        },
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ room_number: 1 });

    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: rooms,
    });
  } catch (error) {
    console.error("Error in getAllRooms:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách phòng học",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách phòng học theo tòa nhà
// @route   GET /api/rooms/building/:buildingId
// @access  Private
exports.getRoomsByBuilding = async (req, res) => {
  try {
    const buildingId = req.params.buildingId;

    const rooms = await Room.find({ building_id: buildingId })
      .populate("building_id", "name code")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: rooms.length,
      data: rooms,
    });
  } catch (error) {
    console.error("Error in getRoomsByBuilding:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách phòng học theo tòa nhà",
      error: error.message,
    });
  }
};

// @desc    Lấy phòng học theo ID
// @route   GET /api/rooms/:id
// @access  Private
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate(
      "building_id",
      "name code campus_id"
    );

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Error in getRoomById:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy thông tin phòng học",
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

    // Kiểm tra tòa nhà có tồn tại không
    const building = await Building.findById(building_id);
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tòa nhà",
      });
    }

    // Kiểm tra phòng đã tồn tại chưa
    const existingRoom = await Room.findOne({
      room_number,
      building_id,
      floor,
    });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: "Phòng học này đã tồn tại trong tòa nhà và tầng đã chọn",
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
      message: "Tạo phòng học mới thành công",
    });
  } catch (error) {
    console.error("Error in createRoom:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo phòng học mới",
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

    // Kiểm tra tòa nhà có tồn tại không
    if (building_id) {
      const building = await Building.findById(building_id);
      if (!building) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy tòa nhà",
        });
      }
    }

    // Kiểm tra phòng đã tồn tại chưa (trừ phòng hiện tại)
    if (room_number && building_id && floor) {
      const existingRoom = await Room.findOne({
        room_number,
        building_id,
        floor,
        _id: { $ne: roomId },
      });

      if (existingRoom) {
        return res.status(400).json({
          success: false,
          message: "Phòng học này đã tồn tại trong tòa nhà và tầng đã chọn",
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
        message: "Không tìm thấy phòng học",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
      message: "Cập nhật phòng học thành công",
    });
  } catch (error) {
    console.error("Error in updateRoom:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật phòng học",
      error: error.message,
    });
  }
};

// @desc    Xóa phòng học
// @route   DELETE /api/rooms/:id
// @access  Private (Admin)
exports.deleteRoom = async (req, res) => {
  try {
    const roomId = req.params.id;

    // Kiểm tra xem có lịch sử dụng phòng nào không
    const scheduleCount = await RoomSchedule.countDocuments({
      room_id: roomId,
    });
    if (scheduleCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Không thể xóa phòng này vì đã có lịch sử dụng phòng",
      });
    }

    const room = await Room.findByIdAndDelete(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa phòng học thành công",
    });
  } catch (error) {
    console.error("Error in deleteRoom:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa phòng học",
      error: error.message,
    });
  }
};

// =================== ROOM SCHEDULE CONTROLLERS ===================

// @desc    Lấy lịch sử dụng phòng
// @route   GET /api/facilities/rooms/:id/schedule
// @access  Private
exports.getRoomSchedule = async (req, res) => {
  try {
    const roomId = req.params.id;
    const startDate = req.query.start_date
      ? new Date(req.query.start_date)
      : new Date();
    const endDate = req.query.end_date
      ? new Date(req.query.end_date)
      : new Date(startDate);

    // Nếu không có end_date, mặc định là 7 ngày sau start_date
    if (!req.query.end_date) {
      endDate.setDate(startDate.getDate() + 7);
    }

    const schedule = await RoomSchedule.find({
      room_id: roomId,
      $or: [
        {
          start_time: { $gte: startDate, $lte: endDate },
        },
        {
          end_time: { $gte: startDate, $lte: endDate },
        },
      ],
    })
      .populate("teaching_class_id", "class_name class_code")
      .populate("created_by", "full_name email")
      .sort({ start_time: 1 });

    res.status(200).json({
      success: true,
      count: schedule.length,
      data: schedule,
    });
  } catch (error) {
    console.error("Error in getRoomSchedule:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy lịch sử dụng phòng",
      error: error.message,
    });
  }
};

// @desc    Đặt lịch sử dụng phòng
// @route   POST /api/facilities/rooms/:id/schedule
// @access  Private
exports.scheduleRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const {
      teaching_class_id,
      event_name,
      start_time,
      end_time,
      day_of_week,
      repeat_type,
    } = req.body;

    // Kiểm tra phòng có tồn tại không
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng học",
      });
    }

    // Kiểm tra thời gian đặt phòng
    const startDateTime = new Date(start_time);
    const endDateTime = new Date(end_time);

    if (startDateTime >= endDateTime) {
      return res.status(400).json({
        success: false,
        message: "Thời gian bắt đầu phải trước thời gian kết thúc",
      });
    }

    // Kiểm tra xung đột lịch
    const conflictingSchedule = await RoomSchedule.findOne({
      room_id: roomId,
      $or: [
        {
          start_time: { $lt: endDateTime },
          end_time: { $gt: startDateTime },
        },
        {
          start_time: { $eq: startDateTime },
        },
        {
          end_time: { $eq: endDateTime },
        },
      ],
      day_of_week: day_of_week,
      status: { $ne: "cancelled" },
    });

    if (conflictingSchedule) {
      return res.status(400).json({
        success: false,
        message: "Phòng học đã được đặt trong khoảng thời gian này",
      });
    }

    const schedule = await RoomSchedule.create({
      room_id: roomId,
      teaching_class_id,
      event_name: !teaching_class_id ? event_name : undefined,
      start_time: startDateTime,
      end_time: endDateTime,
      day_of_week,
      repeat_type: repeat_type || "weekly",
      created_by: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: schedule,
      message: "Đặt lịch sử dụng phòng thành công",
    });
  } catch (error) {
    console.error("Error in scheduleRoom:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi đặt lịch sử dụng phòng",
      error: error.message,
    });
  }
};

// @desc    Hủy lịch sử dụng phòng
// @route   PUT /api/facilities/schedule/:id/cancel
// @access  Private
exports.cancelRoomSchedule = async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const { reason } = req.body;

    const schedule = await RoomSchedule.findById(scheduleId);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch sử dụng phòng",
      });
    }

    // Kiểm tra quyền
    if (
      schedule.created_by.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền hủy lịch này",
      });
    }

    schedule.status = "cancelled";
    schedule.cancelReason = reason;
    schedule.cancelledAt = new Date();
    schedule.cancelledBy = req.user.id;

    await schedule.save();

    res.status(200).json({
      success: true,
      data: schedule,
      message: "Hủy lịch sử dụng phòng thành công",
    });
  } catch (error) {
    console.error("Error in cancelRoomSchedule:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi hủy lịch sử dụng phòng",
      error: error.message,
    });
  }
};

// @desc    Tìm phòng trống theo thời gian
// @route   GET /api/facilities/rooms/available
// @access  Private
exports.findAvailableRooms = async (req, res) => {
  try {
    const {
      start_time,
      end_time,
      day_of_week,
      building_id,
      capacity,
      room_type,
    } = req.query;

    if (!start_time || !end_time || !day_of_week) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin thời gian tìm kiếm",
      });
    }

    const startDateTime = new Date(start_time);
    const endDateTime = new Date(end_time);
    const dayOfWeek = parseInt(day_of_week);

    if (startDateTime >= endDateTime) {
      return res.status(400).json({
        success: false,
        message: "Thời gian bắt đầu phải trước thời gian kết thúc",
      });
    }

    // Tìm các phòng đã đặt trong khoảng thời gian này
    const bookedRooms = await RoomSchedule.find({
      $or: [
        {
          start_time: { $lt: endDateTime },
          end_time: { $gt: startDateTime },
        },
        {
          start_time: { $eq: startDateTime },
        },
        {
          end_time: { $eq: endDateTime },
        },
      ],
      day_of_week: dayOfWeek,
      status: { $ne: "cancelled" },
    }).distinct("room_id");

    // Tìm các phòng trống
    let query = {
      _id: { $nin: bookedRooms },
      status: "available",
    };

    if (building_id) {
      query.building_id = building_id;
    }

    if (capacity) {
      query.capacity = { $gte: parseInt(capacity) };
    }

    if (room_type) {
      query.room_type = room_type;
    }

    const availableRooms = await Room.find(query)
      .populate("building_id", "name code campus_id")
      .sort({ building_id: 1, floor: 1, room_number: 1 });

    res.status(200).json({
      success: true,
      count: availableRooms.length,
      data: availableRooms,
    });
  } catch (error) {
    console.error("Error in findAvailableRooms:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tìm phòng trống",
      error: error.message,
    });
  }
};
