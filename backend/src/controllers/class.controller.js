const {
  MainClass,
  TeachingClass,
  User,
  Notification,
  StudentScore,
  AttendanceSession,
  AttendanceLog,
  Semester,
  Major,
  Department,
} = require("../models/schemas");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

/**
 * Controller quản lý lớp học
 */

// =================== MAIN CLASS CONTROLLERS ===================

// @desc    Lấy danh sách tất cả lớp chính
// @route   GET /api/classes/main
// @access  Private
exports.getAllMainClasses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const majorIdFilter = req.query.major_id || "";
    const departmentIdFilter = req.query.department_id || "";
    const getAllWithoutPagination = req.query.all === "true";
    const advisorId = req.query.advisor_id || "";
    const yearStartFilter = req.query.year_start || "";

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { class_code: { $regex: search, $options: "i" } },
      ];
    }

    if (majorIdFilter) {
      if (!mongoose.Types.ObjectId.isValid(majorIdFilter)) {
        return res.status(400).json({
          success: false,
          message: "ID Ngành không hợp lệ",
        });
      }
      query.major_id = majorIdFilter;
    } else if (departmentIdFilter) {
      if (!mongoose.Types.ObjectId.isValid(departmentIdFilter)) {
        return res.status(400).json({
          success: false,
          message: "ID Khoa không hợp lệ",
        });
      }
      const majorsInDepartment = await Major.find({
        department_id: departmentIdFilter,
      }).select("_id");
      if (majorsInDepartment.length > 0) {
        query.major_id = { $in: majorsInDepartment.map((m) => m._id) };
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          total: 0,
          totalPages: 1,
          currentPage: page,
          data: [],
        });
      }
    }

    if (yearStartFilter) {
      const year = parseInt(yearStartFilter, 10);
      if (!isNaN(year)) {
        query.year_start = year;
      }
    }

    if (advisorId) {
      if (!mongoose.Types.ObjectId.isValid(advisorId)) {
        return res.status(400).json({
          success: false,
          message: "ID giáo viên cố vấn không hợp lệ",
        });
      }
      query.advisor_id = advisorId;
    }

    const populateOptions = [
      {
        path: "major_id",
        select: "name code department_id",
        populate: {
          path: "department_id",
          select: "name code",
        },
      },
      { path: "advisor_id", select: "full_name email" },
    ];

    if (getAllWithoutPagination) {
      const mainClasses = await MainClass.find(query)
        .populate(populateOptions)
        .sort({ name: 1 });

      return res.status(200).json({
        success: true,
        count: mainClasses.length,
        data: mainClasses,
      });
    }

    const total = await MainClass.countDocuments(query);
    const mainClasses = await MainClass.find(query)
      .populate(populateOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: mainClasses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: mainClasses,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách lớp chính",
      error: error.message,
    });
  }
};

// @desc    Lấy lớp chính theo ID
// @route   GET /api/classes/main/:id
// @access  Private
exports.getMainClassById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID lớp chính không hợp lệ" });
    }
    const mainClass = await MainClass.findById(req.params.id)
      .populate({
        path: "major_id",
        select: "name code department_id",
        populate: {
          path: "department_id",
          select: "name code",
        },
      })
      .populate("advisor_id", "full_name email")
      .populate("students", "full_name email student_id avatar_url");

    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    res.status(200).json({
      success: true,
      data: mainClass,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Tạo lớp chính mới
// @route   POST /api/classes/main
// @access  Private (Admin)
exports.createMainClass = async (req, res) => {
  try {
    const {
      name,
      class_code,
      major_id,
      advisor_id,
      students,
      year_start,
      year_end,
    } = req.body;

    if (!name || !class_code || !major_id || !year_start) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp đủ thông tin bắt buộc: tên lớp, mã lớp, ngành và năm bắt đầu.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(major_id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID Ngành không hợp lệ." });
    }
    const majorExists = await Major.findById(major_id);
    if (!majorExists) {
      return res
        .status(404)
        .json({ success: false, message: "Ngành học không tồn tại." });
    }

    if (advisor_id && !mongoose.Types.ObjectId.isValid(advisor_id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID Cố vấn không hợp lệ." });
    }
    if (advisor_id) {
      const advisorExists = await User.findById(advisor_id);
      if (!advisorExists || advisorExists.role !== "teacher") {
        return res.status(404).json({
          success: false,
          message: "Cố vấn không tồn tại hoặc không phải là giáo viên.",
        });
      }
    }

    const existingClass = await MainClass.findOne({ class_code });
    if (existingClass) {
      return res.status(400).json({
        success: false,
        message: "Mã lớp đã tồn tại",
      });
    }

    const mainClass = await MainClass.create({
      name,
      class_code,
      major_id,
      advisor_id: advisor_id || null,
      students: students || [],
      year_start,
      year_end,
    });

    const populatedMainClass = await MainClass.findById(mainClass._id)
      .populate({
        path: "major_id",
        select: "name code department_id",
        populate: { path: "department_id", select: "name code" },
      })
      .populate("advisor_id", "full_name email");

    res.status(201).json({
      success: true,
      data: populatedMainClass,
      message: "Tạo lớp chính thành công",
    });
  } catch (error) {
    console.error("Lỗi khi tạo lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo lớp chính",
      error: error.message,
    });
  }
};

// @desc    Cập nhật lớp chính
// @route   PUT /api/classes/main/:id
// @access  Private (Admin, Teacher)
exports.updateMainClass = async (req, res) => {
  try {
    const {
      name,
      class_code,
      major_id,
      advisor_id,
      students,
      year_start,
      year_end,
    } = req.body;
    const mainClassId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(mainClassId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID lớp chính không hợp lệ" });
    }

    const existingClass = await MainClass.findById(mainClassId);
    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    if (
      req.user.role === "teacher" &&
      (!existingClass.advisor_id ||
        existingClass.advisor_id.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Bạn không có quyền cập nhật lớp này vì bạn không phải là cố vấn của lớp",
      });
    }

    if (major_id) {
      if (!mongoose.Types.ObjectId.isValid(major_id)) {
        return res
          .status(400)
          .json({ success: false, message: "ID Ngành không hợp lệ." });
      }
      const majorExists = await Major.findById(major_id);
      if (!majorExists) {
        return res
          .status(404)
          .json({ success: false, message: "Ngành học không tồn tại." });
      }
    }

    if (req.user.role === "admin" && advisor_id) {
      if (!mongoose.Types.ObjectId.isValid(advisor_id)) {
        return res
          .status(400)
          .json({ success: false, message: "ID Cố vấn không hợp lệ." });
      }
      const advisorExists = await User.findById(advisor_id);
      if (!advisorExists || advisorExists.role !== "teacher") {
        return res.status(404).json({
          success: false,
          message: "Cố vấn không tồn tại hoặc không phải là giáo viên.",
        });
      }
    }

    if (class_code && class_code !== existingClass.class_code) {
      const duplicateCode = await MainClass.findOne({
        class_code: class_code,
        _id: { $ne: mainClassId },
      });
      if (duplicateCode) {
        return res.status(400).json({
          success: false,
          message: "Mã lớp đã tồn tại cho lớp khác",
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (class_code) updateData.class_code = class_code;
    if (major_id) updateData.major_id = major_id;
    if (year_start) updateData.year_start = year_start;
    if (year_end) updateData.year_end = year_end;

    if (req.user.role === "admin") {
      if (advisor_id !== undefined) updateData.advisor_id = advisor_id;
    } else {
      // Giáo viên không được tự ý đổi ngành, năm học, cố vấn, hoặc danh sách sinh viên của lớp.
      // Họ chỉ có thể sửa tên, mã lớp (nếu logic cho phép).
      // Để đơn giản, hiện tại không cho giáo viên sửa gì ở đây ngoài việc xem.
      // Nếu muốn cho sửa, cần check kỹ các trường được phép.
    }

    const updatedMainClass = await MainClass.findByIdAndUpdate(
      mainClassId,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: "major_id",
        select: "name code department_id",
        populate: { path: "department_id", select: "name code" },
      })
      .populate("advisor_id", "full_name email");

    // Gửi thông báo cho sinh viên trong lớp nếu có sự thay đổi quan trọng
    if (
      updatedMainClass &&
      existingClass.students &&
      existingClass.students.length > 0
    ) {
      const studentIds = existingClass.students.map(
        (student) => student._id || student
      ); // student có thể là ObjectId hoặc object User đã populate
      const notifications = studentIds.map((studentId) => ({
        receiver_id: studentId,
        sender_id: req.user.id, // Người thực hiện thay đổi
        type: "SCHEDULE_UPDATE", // Hoặc một type phù hợp hơn như 'CLASS_INFO_UPDATE'
        content: `Thông tin lớp chính '${existingClass.name}' đã được cập nhật.`,
        link: `/class-details/${mainClassId}`, // Link tới trang chi tiết lớp học
        data: {
          mainClassId: mainClassId,
          className: existingClass.name,
        },
      }));
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    res.status(200).json({
      success: true,
      data: updatedMainClass,
      message: "Cập nhật lớp chính thành công",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật lớp chính",
      error: error.message,
    });
  }
};

// @desc    Xóa lớp chính
// @route   DELETE /api/classes/main/:id
// @access  Private (Admin)
exports.deleteMainClass = async (req, res) => {
  try {
    const mainClassId = req.params.id;

    const mainClass = await MainClass.findById(mainClassId);

    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    // Kiểm tra quyền: Admin có thể xóa bất kỳ lớp nào.
    // Giáo viên chỉ có thể xóa lớp chính mà họ làm cố vấn.
    if (req.user.role === "teacher") {
      if (
        !mainClass.advisor_id ||
        mainClass.advisor_id.toString() !== req.user.id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Bạn không có quyền xóa lớp chính này vì bạn không phải là cố vấn của lớp.",
        });
      }
    } else if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện thao tác này.",
      });
    }

    // 1. Cập nhật User: gỡ bỏ main_class_id của các sinh viên thuộc lớp này
    await User.updateMany(
      { main_class_id: mainClassId },
      { $unset: { main_class_id: "" } }
    );

    // 2. Cập nhật TeachingClass: đặt main_class_id thành null
    await TeachingClass.updateMany(
      { main_class_id: mainClassId },
      { $set: { main_class_id: null } }
    );

    // 3. Xóa Notification liên quan đến việc phê duyệt/từ chối vào lớp này
    await Notification.deleteMany({
      type: "CLASS_ENROLLMENT", // Cập nhật type
      "data.mainClassId": mainClassId, // Cập nhật đường dẫn trong data
    });

    // 4. Xóa Lớp chính
    await MainClass.findByIdAndDelete(mainClassId);

    res.status(200).json({
      success: true,
      message: "Xóa lớp chính và các dữ liệu liên quan thành công",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Lỗi khi xóa lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa lớp chính",
      error: error.message,
    });
  }
};

// @desc    Lấy thông kê của lớp chính
// @route   GET /api/classes/main-statistics
// @access  Private (Admin)
exports.getMainClassStatistics = async (req, res) => {
  try {
    const totalCount = await MainClass.countDocuments();

    // Lưu ý: trong schema, trường code được đặt tên là class_code
    const departmentStats = await MainClass.aggregate([
      {
        $match: {
          department_id: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$department_id",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "department",
        },
      },
      {
        $unwind: {
          path: "$department",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          departmentName: "$department.name",
          count: 1,
        },
      },
    ]);

    // Tính số lượng sinh viên trong tất cả các lớp chính
    const totalStudents = await MainClass.aggregate([
      {
        $project: {
          studentCount: {
            $cond: {
              if: { $isArray: "$students" },
              then: { $size: "$students" },
              else: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: "$studentCount" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      totalCount,
      departmentStats,
      totalStudents:
        totalStudents.length > 0 ? totalStudents[0].totalStudents : 0,
    });
  } catch (error) {
    console.error("Error in getMainClassStatistics:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy thống kê lớp chính",
      error: error.message,
    });
  }
};

// =================== TEACHING CLASS CONTROLLERS ===================

// @desc    Lấy danh sách tất cả lớp giảng dạy
// @route   GET /api/classes/teaching
// @access  Private
exports.getAllTeachingClasses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const subjectId = req.query.subject_id || "";
    const teacherId = req.query.teacher_id || "";
    const semesterId = req.query.semester || "";
    const mainClassId = req.query.main_class_id || "";

    const query = {};

    if (search) {
      query.$or = [{ class_name: { $regex: search, $options: "i" } }];
    }

    if (subjectId) {
      query.subject_id = subjectId;
    }

    if (teacherId) {
      query.teacher_id = teacherId;
    }

    if (semesterId) {
      query.semester_id = semesterId;
    }

    if (mainClassId) {
      query.main_class_id = mainClassId;
    }

    const total = await TeachingClass.countDocuments(query);
    const teachingClasses = await TeachingClass.find(query)
      .populate("subject_id", "name code")
      .populate("teacher_id", "full_name email")
      .populate("main_class_id", "name class_code")
      .populate("semester_id", "name year academic_year start_date end_date")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const classesWithStatus = await Promise.all(
      teachingClasses.map(async (cls) => {
        const classObj = cls.toObject();

        if (classObj.semester_id) {
          const currentDate = new Date();
          const startDate = new Date(classObj.semester_id.start_date);
          const endDate = new Date(classObj.semester_id.end_date);

          if (currentDate < startDate) {
            classObj.is_active = false;
            classObj.status = "chưa bắt đầu";
          } else if (currentDate > endDate) {
            classObj.is_active = false;
            classObj.status = "đã kết thúc";
          } else {
            classObj.is_active = true;
            classObj.status = "đang học";
          }
        } else {
          classObj.is_active = false;
          classObj.status = "không xác định";
        }

        return classObj;
      })
    );

    res.status(200).json({
      success: true,
      count: classesWithStatus.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: classesWithStatus,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy lớp giảng dạy theo ID
// @route   GET /api/classes/teaching/:id
// @access  Private
exports.getTeachingClassById = async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ",
      });
    }

    const teachingClass = await TeachingClass.findById(id)
      .populate("subject_id", "name code")
      .populate("teacher_id", "full_name email")
      .populate("main_class_id", "name class_code")
      .populate("semester_id", "name year")
      .populate("students", "full_name email school_info avatar_url");

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    res.status(200).json({
      success: true,
      data: teachingClass,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy các lớp giảng dạy của giáo viên
// @route   GET /api/classes/teaching/teacher/:id
// @access  Private
exports.getTeachingClassesByTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const semester_id = req.query.semester_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = { teacher_id: teacherId };

    if (semester_id) {
      if (!mongoose.Types.ObjectId.isValid(semester_id)) {
        return res
          .status(400)
          .json({ success: false, message: "ID học kỳ không hợp lệ" });
      }
      query.semester_id = semester_id;
    }

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      const subjectIds = await mongoose
        .model("Subject")
        .find({
          $or: [{ name: searchRegex }, { code: searchRegex }],
        })
        .select("_id");

      query.$or = [
        { class_name: searchRegex },
        { class_code: searchRegex },
        { subject_id: { $in: subjectIds.map((s) => s._id) } },
      ];
    }

    const total = await TeachingClass.countDocuments(query);
    const teachingClasses = await TeachingClass.find(query)
      .populate("subject_id", "name code credits")
      .populate("teacher_id", "full_name email")
      .populate("main_class_id", "name class_code")
      .populate("semester_id", "name year start_date end_date")
      .populate({
        path: "students",
        select: "full_name email school_info.student_id",
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const classesWithStatus = await Promise.all(
      teachingClasses.map(async (cls) => {
        const classObj = cls.toObject();

        if (
          classObj.semester_id &&
          classObj.semester_id.start_date &&
          classObj.semester_id.end_date
        ) {
          const currentDate = new Date();
          const startDate = new Date(classObj.semester_id.start_date);
          const endDate = new Date(classObj.semester_id.end_date);

          if (currentDate < startDate) {
            classObj.is_active = false;
            classObj.status = "chưa bắt đầu";
          } else if (currentDate > endDate) {
            classObj.is_active = false;
            classObj.status = "đã kết thúc";
          } else {
            classObj.is_active = true;
            classObj.status = "đang học";
          }
        } else {
          classObj.is_active = false;
          classObj.status = "không xác định";
        }

        if (classObj.subject_id === null) {
          classObj.subject_id = { name: "N/A", code: "N/A", credits: 0 };
        }
        if (classObj.teacher_id === null) {
          classObj.teacher_id = { full_name: "N/A", email: "N/A" };
        }
        if (classObj.semester_id === null) {
          classObj.semester_id = {
            name: "N/A",
            year: "N/A",
            start_date: null,
            end_date: null,
          };
        }
        if (classObj.main_class_id === null) {
          classObj.main_class_id = { name: "N/A", class_code: "N/A" };
        }

        return classObj;
      })
    );

    res.status(200).json({
      success: true,
      count: classesWithStatus.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: classesWithStatus,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy các lớp giảng dạy của sinh viên
// @route   GET /api/classes/teaching/student/:id
// @access  Private
exports.getTeachingClassesByStudent = async (req, res) => {
  try {
    const studentId = req.params.id;
    const semesterId = req.query.semester;
    const academicYear = req.query.academicYear;
    const search = req.query.search || "";

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID sinh viên không hợp lệ" });
    }

    const pipeline = [];

    let semesterIdsToFilter = [];
    if (semesterId && mongoose.Types.ObjectId.isValid(semesterId)) {
      semesterIdsToFilter.push(new ObjectId(semesterId));
    } else if (academicYear) {
      const semestersInYear = await Semester.find({
        academic_year: academicYear,
      }).select("_id");
      semesterIdsToFilter = semestersInYear.map((s) => s._id);
      if (semesterIdsToFilter.length === 0) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    }

    const matchStage = {
      $match: {
        students: new ObjectId(studentId),
      },
    };
    if (semesterIdsToFilter.length > 0) {
      matchStage.$match.semester_id = { $in: semesterIdsToFilter };
    }
    pipeline.push(matchStage);

    pipeline.push({
      $lookup: {
        from: "subjects",
        localField: "subject_id",
        foreignField: "_id",
        as: "subjectInfo",
      },
    });
    pipeline.push({
      $unwind: { path: "$subjectInfo", preserveNullAndEmptyArrays: true },
    });

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "teacher_id",
        foreignField: "_id",
        as: "teacherInfo",
      },
    });
    pipeline.push({
      $unwind: { path: "$teacherInfo", preserveNullAndEmptyArrays: true },
    });

    pipeline.push({
      $lookup: {
        from: "semesters",
        localField: "semester_id",
        foreignField: "_id",
        as: "semesterInfo",
      },
    });
    pipeline.push({
      $unwind: { path: "$semesterInfo", preserveNullAndEmptyArrays: true },
    });

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      pipeline.push({
        $match: {
          $or: [
            { class_name: searchRegex },
            { class_code: searchRegex },
            { "subjectInfo.name": searchRegex },
            { "subjectInfo.code": searchRegex },
            { "teacherInfo.full_name": searchRegex },
          ],
        },
      });
    }

    pipeline.push({
      $project: {
        _id: 1,
        class_name: 1,
        class_code: 1,
        students: 1,
        total_sessions: 1,
        max_absent_allowed: 1,
        schedule: 1,
        course_start_date: 1,
        course_end_date: 1,
        created_at: 1,
        updated_at: 1,
        subject_id: {
          _id: "$subjectInfo._id",
          name: "$subjectInfo.name",
          code: "$subjectInfo.code",
          credits: "$subjectInfo.credits",
        },
        teacher_id: {
          _id: "$teacherInfo._id",
          full_name: "$teacherInfo.full_name",
          email: "$teacherInfo.email",
        },
        semester_id: {
          _id: "$semesterInfo._id",
          name: "$semesterInfo.name",
          year: "$semesterInfo.year",
          academic_year: "$semesterInfo.academic_year",
          start_date: "$semesterInfo.start_date",
          end_date: "$semesterInfo.end_date",
        },
      },
    });

    pipeline.push({ $sort: { created_at: -1 } });

    console.log("Executing pipeline:", JSON.stringify(pipeline, null, 2));
    const teachingClasses = await TeachingClass.aggregate(pipeline);

    const classesWithStatus = teachingClasses.map((cls) => {
      const currentDate = new Date();
      const startDate = cls.semester_id?.start_date
        ? new Date(cls.semester_id.start_date)
        : null;
      const endDate = cls.semester_id?.end_date
        ? new Date(cls.semester_id.end_date)
        : null;

      if (startDate && endDate) {
        if (currentDate < startDate) {
          cls.status = "chưa bắt đầu";
        } else if (currentDate > endDate) {
          cls.status = "đã kết thúc";
        } else {
          cls.status = "đang học";
        }
      } else {
        cls.status = "không xác định";
      }
      return cls;
    });

    res.status(200).json({
      success: true,
      count: classesWithStatus.length,
      data: classesWithStatus,
    });
  } catch (error) {
    console.error("Lỗi khi lấy lớp học của sinh viên:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Tạo lớp giảng dạy mới
// @route   POST /api/classes/teaching
// @access  Private (Admin, Teacher)
exports.createTeachingClass = async (req, res) => {
  try {
    const {
      class_name,
      class_code,
      subject_id,
      teacher_id,
      main_class_id,
      semester_id,
      total_sessions,
      students,
      schedule,
      course_start_date,
      course_end_date,
      auto_generate_sessions,
    } = req.body;

    const semester = await Semester.findById(semester_id);
    if (!semester) {
      return res.status(400).json({
        success: false,
        message: "Học kỳ không tồn tại",
      });
    }

    if (course_start_date && course_end_date) {
      const startDate = new Date(course_start_date);
      const endDate = new Date(course_end_date);
      const semesterStartDate = new Date(semester.start_date);
      const semesterEndDate = new Date(semester.end_date);

      if (startDate < semesterStartDate || endDate > semesterEndDate) {
        return res.status(400).json({
          success: false,
          message:
            "Thời gian khóa học phải nằm trong khoảng thời gian của học kỳ",
          details: {
            semester_start: semester.start_date,
            semester_end: semester.end_date,
            course_start: course_start_date,
            course_end: course_end_date,
          },
        });
      }
    }

    if (schedule && Array.isArray(schedule)) {
      for (const item of schedule) {
        if (!item.room_id) {
          return res.status(400).json({
            success: false,
            message: `Vui lòng chọn phòng học cho buổi học vào ${getDayOfWeekName(
              item.day_of_week
            )}`,
          });
        }
      }
    }

    const teachingClass = await TeachingClass.create({
      class_name,
      class_code,
      subject_id,
      teacher_id,
      main_class_id: main_class_id || null,
      semester_id,
      total_sessions: total_sessions || 15,
      students: students || [],
      schedule: schedule || [],
      course_start_date,
      course_end_date,
      auto_generate_sessions:
        auto_generate_sessions !== undefined ? auto_generate_sessions : true,
      updated_at: Date.now(),
    });

    if (
      teachingClass.auto_generate_sessions &&
      schedule &&
      schedule.length > 0 &&
      course_start_date &&
      course_end_date
    ) {
      await generateAttendanceSessions(teachingClass);
    }

    res.status(201).json({
      success: true,
      data: teachingClass,
      message: "Tạo lớp giảng dạy thành công",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Cập nhật lớp giảng dạy
// @route   PUT /api/classes/teaching/:id
// @access  Private (Admin, Teacher)
exports.updateTeachingClass = async (req, res) => {
  try {
    const {
      class_name,
      class_code,
      subject_id,
      teacher_id,
      main_class_id,
      semester_id,
      total_sessions,
      schedule,
      students,
      course_start_date,
      course_end_date,
      auto_generate_sessions,
    } = req.body;

    const teachingClass = await TeachingClass.findById(req.params.id);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật lớp này",
      });
    }

    const semesterId = semester_id || teachingClass.semester_id;

    const semester = await Semester.findById(semesterId);
    if (!semester) {
      return res.status(400).json({
        success: false,
        message: "Học kỳ không tồn tại",
      });
    }

    if (course_start_date && course_end_date) {
      const startDate = new Date(course_start_date);
      const endDate = new Date(course_end_date);
      const semesterStartDate = new Date(semester.start_date);
      const semesterEndDate = new Date(semester.end_date);

      if (startDate < semesterStartDate || endDate > semesterEndDate) {
        return res.status(400).json({
          success: false,
          message:
            "Thời gian khóa học phải nằm trong khoảng thời gian của học kỳ",
          details: {
            semester_start: semester.start_date,
            semester_end: semester.end_date,
            course_start: course_start_date,
            course_end: course_end_date,
          },
        });
      }
    }

    if (schedule && Array.isArray(schedule)) {
      for (const item of schedule) {
        if (!item.room_id) {
          return res.status(400).json({
            success: false,
            message: `Vui lòng chọn phòng học cho buổi học vào ${getDayOfWeekName(
              item.day_of_week
            )}`,
          });
        }
      }
    }

    const updateData = {
      class_name,
      class_code,
      subject_id,
      teacher_id,
      main_class_id: main_class_id || null,
      semester_id,
      total_sessions,
      schedule,
      students,
      course_start_date,
      course_end_date,
      updated_at: Date.now(),
    };

    if (auto_generate_sessions !== undefined) {
      updateData.auto_generate_sessions = auto_generate_sessions;
    }

    const updatedClass = await TeachingClass.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (
      updatedClass.auto_generate_sessions &&
      schedule &&
      schedule.length > 0 &&
      course_start_date &&
      course_end_date
    ) {
      await generateAttendanceSessions(updatedClass);
    }

    // Gửi thông báo cho sinh viên trong lớp nếu có sự thay đổi quan trọng
    if (
      updatedClass &&
      teachingClass.students &&
      teachingClass.students.length > 0
    ) {
      const studentIds = teachingClass.students.map(
        (student) => student._id || student
      ); // student có thể là ObjectId hoặc object User đã populate

      const notifications = studentIds.map((studentId) => ({
        receiver_id: studentId,
        sender_id: req.user.id, // Người thực hiện thay đổi
        type: "SCHEDULE_UPDATE", // Hoặc một type phù hợp hơn như 'CLASS_INFO_UPDATE'
        content: `Thông tin lớp học phần '${teachingClass.class_name}' đã được cập nhật.`,
        link: `/teaching-class-details/${updatedClass._id}`, // Link tới trang chi tiết lớp học phần
        data: {
          teachingClassId: updatedClass._id,
          className: teachingClass.class_name,
        },
      }));
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    res.status(200).json({
      success: true,
      data: updatedClass,
      message: "Cập nhật lớp giảng dạy thành công",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Xóa lớp giảng dạy
// @route   DELETE /api/classes/teaching/:id
// @access  Private (Admin, Teacher)
exports.deleteTeachingClass = async (req, res) => {
  try {
    const classId = req.params.id;
    const teachingClass = await TeachingClass.findById(classId);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (req.user.role !== "admin") {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: "Xác thực không thành công hoặc thiếu thông tin người dùng.",
        });
      }
      if (
        !teachingClass.teacher_id ||
        teachingClass.teacher_id.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Bạn không có quyền xóa lớp giảng dạy này. Lớp có thể không có giáo viên được phân công, hoặc bạn không phải là giáo viên của lớp.",
        });
      }
    }

    const sessions = await AttendanceSession.find({
      teaching_class_id: classId,
    });
    const sessionIds = sessions.map((s) => s._id);

    if (sessionIds.length > 0) {
      await AttendanceLog.deleteMany({ session_id: { $in: sessionIds } });
    }
    await AttendanceSession.deleteMany({ teaching_class_id: classId });

    await StudentScore.deleteMany({ teaching_class_id: classId });

    await TeachingClass.findByIdAndDelete(classId);

    res.status(200).json({
      success: true,
      message: "Xóa lớp giảng dạy và các dữ liệu liên quan thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa lớp giảng dạy:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa lớp giảng dạy",
      error: error.message,
    });
  }
};

// @desc    Kiểm tra xung đột lịch học
// @route   POST /api/classes/teaching/check-conflicts
// @access  Private
exports.checkScheduleConflicts = async (req, res) => {
  try {
    const { teacher_id, schedule, class_id } = req.body;

    if (
      !teacher_id ||
      !schedule ||
      !Array.isArray(schedule) ||
      schedule.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết để kiểm tra xung đột lịch",
      });
    }

    const conflicts = [];

    for (const scheduleItem of schedule) {
      const { day_of_week, start_time, end_time, room_id } = scheduleItem;

      if (!day_of_week || !start_time || !end_time || !room_id) {
        continue;
      }

      const teacherClassesQuery = {
        teacher_id,
        schedule: {
          $elemMatch: {
            day_of_week: day_of_week,
            $or: [
              {
                start_time: { $lte: start_time },
                end_time: { $gte: start_time },
              },
              {
                start_time: { $lte: end_time },
                end_time: { $gte: end_time },
              },
              {
                start_time: { $gte: start_time },
                end_time: { $lte: end_time },
              },
            ],
          },
        },
      };

      if (class_id) {
        teacherClassesQuery._id = { $ne: class_id };
      }

      const teacherConflicts = await TeachingClass.find(teacherClassesQuery)
        .populate("subject_id", "name code")
        .select("class_name class_code subject_id schedule");

      if (teacherConflicts.length > 0) {
        teacherConflicts.forEach((conflictClass) => {
          const conflictSchedule = conflictClass.schedule.find(
            (item) =>
              item.day_of_week === day_of_week &&
              ((item.start_time <= start_time && item.end_time >= start_time) ||
                (item.start_time <= end_time && item.end_time >= end_time) ||
                (item.start_time >= start_time && item.end_time <= end_time))
          );

          if (conflictSchedule) {
            conflicts.push({
              type: "teacher",
              day_of_week,
              time: `${conflictSchedule.start_time} - ${conflictSchedule.end_time}`,
              class_info: {
                id: conflictClass._id,
                name: conflictClass.class_name,
                code: conflictClass.class_code,
                subject: conflictClass.subject_id?.name || "Không xác định",
              },
              message: `Giáo viên đã có lịch dạy lớp ${
                conflictClass.class_name
              } (${
                conflictClass.subject_id?.name || "Không xác định"
              }) vào ${getDayOfWeekName(day_of_week)} lúc ${
                conflictSchedule.start_time
              } - ${conflictSchedule.end_time}`,
            });
          }
        });
      }

      const roomQuery = {
        schedule: {
          $elemMatch: {
            room_id: new mongoose.Types.ObjectId(room_id),
            day_of_week: day_of_week,
            $or: [
              {
                start_time: { $lte: start_time },
                end_time: { $gte: start_time },
              },
              {
                start_time: { $lte: end_time },
                end_time: { $gte: end_time },
              },
              {
                start_time: { $gte: start_time },
                end_time: { $lte: end_time },
              },
            ],
          },
        },
      };

      if (class_id) {
        roomQuery._id = { $ne: class_id };
      }

      const roomConflicts = await TeachingClass.find(roomQuery)
        .populate("subject_id", "name code")
        .populate("teacher_id", "full_name")
        .select("class_name class_code subject_id teacher_id schedule");

      if (roomConflicts.length > 0) {
        roomConflicts.forEach((conflictClass) => {
          const conflictSchedule = conflictClass.schedule.find(
            (item) =>
              item.room_id.toString() === room_id.toString() &&
              item.day_of_week === day_of_week &&
              ((item.start_time <= start_time && item.end_time >= start_time) ||
                (item.start_time <= end_time && item.end_time >= end_time) ||
                (item.start_time >= start_time && item.end_time <= end_time))
          );

          if (conflictSchedule) {
            conflicts.push({
              type: "room",
              day_of_week,
              time: `${conflictSchedule.start_time} - ${conflictSchedule.end_time}`,
              room_id,
              class_info: {
                id: conflictClass._id,
                name: conflictClass.class_name,
                code: conflictClass.class_code,
                subject: conflictClass.subject_id?.name || "Không xác định",
                teacher:
                  conflictClass.teacher_id?.full_name || "Không xác định",
              },
              message: `Phòng học đã được đặt cho lớp ${
                conflictClass.class_name
              } (${
                conflictClass.subject_id?.name || "Không xác định"
              }) của giảng viên ${
                conflictClass.teacher_id?.full_name || "Không xác định"
              } vào ${getDayOfWeekName(day_of_week)} lúc ${
                conflictSchedule.start_time
              } - ${conflictSchedule.end_time}`,
            });
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      has_conflicts: conflicts.length > 0,
      conflicts,
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra xung đột lịch học:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi kiểm tra xung đột lịch học",
      error: error.message,
    });
  }
};

// Hàm hỗ trợ để lấy tên thứ trong tuần từ số
const getDayOfWeekName = (day) => {
  const days = [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ];
  return days[day] || "Không xác định";
};

// Hàm hỗ trợ tạo các buổi điểm danh dựa vào lịch học
async function generateAttendanceSessions(teachingClass) {
  try {
    await AttendanceSession.deleteMany({
      teaching_class_id: teachingClass._id,
      status: "pending",
    });

    if (!teachingClass.schedule || teachingClass.schedule.length === 0) {
      return;
    }

    const startDate = new Date(teachingClass.course_start_date);
    const endDate = new Date(teachingClass.course_end_date);

    if (!startDate || !endDate) {
      return;
    }

    for (const scheduleItem of teachingClass.schedule) {
      if (!scheduleItem.is_recurring) {
        if (
          scheduleItem.specific_dates &&
          scheduleItem.specific_dates.length > 0
        ) {
          for (const specificDate of scheduleItem.specific_dates) {
            const sessionDate = new Date(specificDate);
            await createAttendanceSession(
              teachingClass,
              scheduleItem,
              sessionDate
            );
          }
        }
        continue;
      }

      const currentDate = new Date(startDate);
      let sessionCount = 0;

      while (
        currentDate <= endDate &&
        sessionCount < teachingClass.total_sessions
      ) {
        if (currentDate.getDay() === scheduleItem.day_of_week) {
          const isExcluded =
            scheduleItem.excluded_dates &&
            scheduleItem.excluded_dates.some(
              (date) =>
                new Date(date).toDateString() === currentDate.toDateString()
            );

          if (!isExcluded) {
            await createAttendanceSession(
              teachingClass,
              scheduleItem,
              new Date(currentDate)
            );
            sessionCount++;
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  } catch (error) {
    console.error("Lỗi khi tạo buổi điểm danh:", error);
  }
}

async function createAttendanceSession(
  teachingClass,
  scheduleItem,
  sessionDate
) {
  const [startHour, startMinute] = scheduleItem.start_time
    .split(":")
    .map(Number);
  const [endHour, endMinute] = scheduleItem.end_time.split(":").map(Number);

  const startTime = new Date(sessionDate);
  startTime.setHours(startHour, startMinute, 0);

  const endTime = new Date(sessionDate);
  endTime.setHours(endHour, endMinute, 0);

  const sessionNumber =
    (await AttendanceSession.countDocuments({
      teaching_class_id: teachingClass._id,
    })) + 1;

  await AttendanceSession.create({
    teaching_class_id: teachingClass._id,
    session_number: sessionNumber,
    date: sessionDate,
    room: scheduleItem.room_id,
    start_time: startTime,
    end_time: endTime,
    status: "pending",
    students_absent: [...teachingClass.students],
  });
}

// @desc    Tạo lại tất cả các buổi điểm danh theo lịch học
// @route   POST /api/classes/teaching/:id/generate-sessions
// @access  Private (Admin, Teacher)
exports.regenerateAttendanceSessions = async (req, res) => {
  try {
    const teachingClass = await TeachingClass.findById(req.params.id).populate(
      "students",
      "_id"
    );

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện hành động này",
      });
    }

    await generateAttendanceSessions(teachingClass);

    res.status(200).json({
      success: true,
      message: "Tạo lại các buổi điểm danh thành công",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy thông kê của lớp giảng dạy
// @route   GET /api/classes/teaching-statistics
// @access  Private (Admin)
exports.getTeachingClassStatistics = async (req, res) => {
  try {
    const totalCount = await TeachingClass.countDocuments();

    const subjectStats = await TeachingClass.aggregate([
      {
        $match: {
          subject_id: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$subject_id",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "subjects",
          localField: "_id",
          foreignField: "_id",
          as: "subject",
        },
      },
      {
        $unwind: {
          path: "$subject",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          subjectName: "$subject.name",
          subjectCode: "$subject.code",
          count: 1,
        },
      },
    ]);

    const teacherStats = await TeachingClass.aggregate([
      {
        $match: {
          teacher_id: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$teacher_id",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "teacher",
        },
      },
      {
        $unwind: {
          path: "$teacher",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          teacherName: "$teacher.full_name",
          teacherEmail: "$teacher.email",
          count: 1,
        },
      },
    ]);

    const totalStudents = await TeachingClass.aggregate([
      {
        $project: {
          studentCount: {
            $cond: {
              if: { $isArray: "$students" },
              then: { $size: "$students" },
              else: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: "$studentCount" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      totalCount,
      subjectStats,
      teacherStats,
      totalStudents:
        totalStudents.length > 0 ? totalStudents[0].totalStudents : 0,
    });
  } catch (error) {
    console.error("Error in getTeachingClassStatistics:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy thống kê lớp giảng dạy",
      error: error.message,
    });
  }
};

// =================== STUDENT MANAGEMENT CONTROLLERS ===================

// @desc    Thêm sinh viên vào lớp giảng dạy
// @route   POST /api/classes/teaching/:id/students
// @access  Private (Admin, Teacher)
exports.addStudentToClass = async (req, res) => {
  try {
    const { student_id } = req.body;
    const classId = req.params.id;

    const teachingClass = await TeachingClass.findById(classId);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thêm sinh viên vào lớp này",
      });
    }

    if (teachingClass.students.includes(student_id)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên đã có trong lớp",
      });
    }

    teachingClass.students.push(student_id);
    await teachingClass.save();

    res.status(200).json({
      success: true,
      message: "Thêm sinh viên vào lớp thành công",
      data: teachingClass,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Thêm nhiều sinh viên vào lớp giảng dạy
// @route   POST /api/classes/teaching/:id/students/batch
// @access  Private (Admin, Teacher)
exports.addStudentsBatch = async (req, res) => {
  try {
    const { student_ids } = req.body;
    const classId = req.params.id;

    if (!student_ids || !Array.isArray(student_ids)) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp danh sách ID sinh viên",
      });
    }

    const teachingClass = await TeachingClass.findById(classId);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thêm sinh viên vào lớp này",
      });
    }

    const newStudents = student_ids.filter(
      (id) => !teachingClass.students.includes(id)
    );

    teachingClass.students = [...teachingClass.students, ...newStudents];
    await teachingClass.save();

    res.status(200).json({
      success: true,
      message: `Đã thêm ${newStudents.length} sinh viên vào lớp`,
      data: teachingClass,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Xóa sinh viên khỏi lớp giảng dạy
// @route   DELETE /api/classes/teaching/:id/students/:studentId
// @access  Private (Admin, Teacher)
exports.removeStudentFromClass = async (req, res) => {
  try {
    const { id: classId, studentId } = req.params;

    const teachingClass = await TeachingClass.findById(classId);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa sinh viên khỏi lớp này",
      });
    }

    if (!teachingClass.students.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên không có trong lớp",
      });
    }

    teachingClass.students = teachingClass.students.filter(
      (id) => id.toString() !== studentId
    );
    await teachingClass.save();

    await StudentScore.deleteOne({
      teaching_class_id: classId,
      student_id: studentId,
    });

    const sessions = await AttendanceSession.find({
      teaching_class_id: classId,
    });

    for (const session of sessions) {
      await AttendanceLog.deleteMany({
        session_id: session._id,
        student_id: studentId,
      });

      session.students_present = session.students_present.filter(
        (id) => id.toString() !== studentId
      );
      session.students_absent = session.students_absent.filter(
        (id) => id.toString() !== studentId
      );
      await session.save();
    }

    res.status(200).json({
      success: true,
      message: "Xóa sinh viên khỏi lớp và các dữ liệu liên quan thành công",
      data: teachingClass,
    });
  } catch (error) {
    console.error("Lỗi khi xóa sinh viên khỏi lớp giảng dạy:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa sinh viên",
      error: error.message,
    });
  }
};

// =================== STUDENT APPROVAL CONTROLLERS ===================

// @desc    Get pending students of a main class
// @route   GET /api/classes/main/:id/pending-students
// @access  Private (Admin, Advisor)
exports.getPendingStudents = async (req, res) => {
  try {
    const { id } = req.params;

    const mainClass = await MainClass.findById(id);
    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    if (
      req.user.role !== "admin" &&
      (req.user.role !== "teacher" ||
        !mainClass.advisor_id ||
        !mainClass.advisor_id.equals(req.user.id))
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Bạn không có quyền xem danh sách sinh viên chờ duyệt của lớp này",
      });
    }

    if (!mainClass.pending_students) {
      mainClass.pending_students = [];
      await mainClass.save();

      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const pendingStudents = await User.find({
      _id: { $in: mainClass.pending_students },
      role: "student",
      status: "pending",
    })
      .select("-password -refresh_token -faceFeatures.descriptors") // Loại bỏ descriptors lớn
      .populate({
        path: "school_info.class_id",
        select: "name class_code major_id year_start",
        populate: {
          path: "major_id",
          select: "name code department_id",
          populate: {
            path: "department_id",
            select: "name code",
          },
        },
      })
      .populate("contact") // Populate thông tin liên hệ
      .sort({ created_at: -1 }); // Sắp xếp theo ngày tạo mới nhất lên trước

    const pendingStudentsWithFaceInfo = pendingStudents.map((student) => {
      const studentObj = student.toObject();

      studentObj.has_face_data = !!(
        studentObj.faceFeatures &&
        studentObj.faceFeatures.descriptors &&
        studentObj.faceFeatures.descriptors.length > 0
      );

      if (
        studentObj.has_face_data &&
        studentObj.faceImages &&
        studentObj.faceImages.length > 0
      ) {
        studentObj.faceImages = studentObj.faceImages;
      } else {
        studentObj.faceImages = [];
      }

      return studentObj;
    });

    return res.status(200).json({
      success: true,
      data: pendingStudentsWithFaceInfo,
    });
  } catch (error) {
    console.error("Error getting pending students:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

// @desc    Approve a student to join a main class
// @route   PUT /api/classes/main/:id/approve-student/:studentId
// @access  Private (Admin, Advisor)
exports.approveStudent = async (req, res) => {
  try {
    const { id, studentId } = req.params;

    const mainClass = await MainClass.findById(id);
    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    if (
      req.user.role !== "admin" &&
      (req.user.role !== "teacher" ||
        !mainClass.advisor_id ||
        !mainClass.advisor_id.equals(req.user.id))
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền phê duyệt sinh viên vào lớp này",
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sinh viên",
      });
    }

    if (!mainClass.pending_students.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên không nằm trong danh sách chờ duyệt",
      });
    }

    if (mainClass.students.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên đã được phê duyệt vào lớp này trước đó",
      });
    }

    student.status = "approved";
    student.main_class_id = id;
    await student.save();

    mainClass.students.push(studentId);
    mainClass.pending_students = mainClass.pending_students.filter(
      (id) => id.toString() !== studentId.toString()
    );
    await mainClass.save();

    try {
      await Notification.create({
        title: "Đăng ký lớp học được chấp nhận",
        content: `Yêu cầu tham gia lớp ${mainClass.name} (${mainClass.class_code}) của bạn đã được chấp nhận.`,
        type: "CLASS_ENROLLMENT",
        sender_id: req.user.id,
        receiver_id: studentId,
        data: {
          studentId: studentId,
          studentName: student.full_name, // Giả sử student đã được populate hoặc lấy thông tin trước đó
          mainClassId: id,
          mainClassName: mainClass.name,
          mainClassCode: mainClass.class_code,
          status: "approved",
        },
        link: `/student/classes/main/${id}`, // Link tới trang chi tiết lớp chính của sinh viên
      });
    } catch (notifError) {
      console.error(
        "Lỗi khi tạo thông báo phê duyệt sinh viên vào lớp:",
        notifError
      );
    }

    return res.status(200).json({
      success: true,
      message: "Phê duyệt sinh viên thành công",
      data: {
        student: {
          id: student._id,
          fullName: student.fullName,
          email: student.email,
          status: student.status,
        },
        main_class: {
          id: mainClass._id,
          name: mainClass.name,
        },
      },
    });
  } catch (error) {
    console.error("Error approving student:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

// @desc    Từ chối sinh viên vào lớp chính
// @route   PUT /api/classes/main/:id/reject-student/:studentId
// @access  Private (Admin, Teacher)
exports.rejectStudent = async (req, res) => {
  try {
    const mainClassId = req.params.id;
    const studentId = req.params.studentId;
    const { reason } = req.body;

    const mainClass = await MainClass.findById(mainClassId).populate(
      "advisor_id",
      "full_name email"
    );

    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền từ chối sinh viên vào lớp này",
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sinh viên",
      });
    }

    await User.findByIdAndUpdate(studentId, {
      status: "rejected",
      approved_by: req.user.id,
      approval_date: Date.now(),
    });

    if (mainClass.pending_students && mainClass.pending_students.length > 0) {
      mainClass.pending_students = mainClass.pending_students.filter(
        (id) => id.toString() !== studentId.toString()
      );
      await mainClass.save();
    }

    try {
      await Notification.create({
        title: "Đăng ký lớp học bị từ chối",
        content: `Yêu cầu tham gia lớp ${mainClass.name} (${
          mainClass.class_code
        }) của bạn đã bị từ chối. ${
          reason
            ? "Lý do: " + reason
            : "Vui lòng liên hệ giáo viên cố vấn hoặc quản trị viên để biết thêm chi tiết."
        }`,
        type: "CLASS_ENROLLMENT",
        sender_id: req.user.id,
        receiver_id: studentId,
        // main_class_id: mainClassId, // Loại bỏ, đã đưa vào data
        data: {
          studentId: studentId,
          studentName: student.full_name, // Giả sử student đã được populate hoặc lấy thông tin trước đó
          mainClassId: mainClassId,
          mainClassName: mainClass.name,
          mainClassCode: mainClass.class_code,
          reason: reason || null,
          status: "rejected",
        },
        link: "/student/class-registration", // Link tới trang đăng ký lớp để SV tìm lớp khác
      });
    } catch (notifError) {
      console.error(
        "Lỗi khi tạo thông báo từ chối sinh viên vào lớp:",
        notifError
      );
    }

    res.status(200).json({
      success: true,
      message: "Đã từ chối sinh viên",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách sinh viên đã được duyệt trong lớp chính
// @route   GET /api/classes/main/:id/approved-students
// @access  Private (Admin, Advisor)
exports.getApprovedStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { search, page = 1, limit = 10, sort = "full_name" } = req.query;
    const mainClass = await MainClass.findById(id);

    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    if (
      req.user.role !== "admin" &&
      req.user.role !== "teacher" &&
      (!mainClass.advisor_id || mainClass.advisor_id.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem danh sách này",
      });
    }

    const query = {
      _id: { $in: mainClass.students },
      role: "student",
    };

    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { "school_info.student_id": { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    const approvedStudents = await User.find(query)
      .select("-password -refresh_token")
      .sort({ [sort]: 1 })
      .skip(skip)
      .limit(limitInt);

    const approvedStudentsWithFaceInfo = approvedStudents.map((student) => {
      const studentObj = student.toObject();

      studentObj.has_face_data = !!(
        studentObj.faceFeatures &&
        studentObj.faceFeatures.descriptors &&
        studentObj.faceFeatures.descriptors.length > 0
      );

      if (
        studentObj.has_face_data &&
        studentObj.faceImages &&
        studentObj.faceImages.length > 0
      ) {
        studentObj.faceImages = studentObj.faceImages;
      } else {
        studentObj.faceImages = [];
      }

      return studentObj;
    });

    res.status(200).json({
      success: true,
      data: {
        students: approvedStudentsWithFaceInfo,
        total,
        page: pageInt,
        limit: limitInt,
        totalPages: Math.ceil(total / limitInt),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách sinh viên đăng ký trong một lớp giảng dạy
// @route   GET /api/classes/teaching/:id/students
// @access  Private (Teacher, Admin)
exports.getClassStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const teachingClass = await TeachingClass.findById(id);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem thông tin lớp này",
      });
    }

    const students = await User.find({
      _id: { $in: teachingClass.students },
    }).select("_id full_name email avatar_url school_info.student_id");

    const studentScores = await StudentScore.find({
      teaching_class_id: id,
    });

    const studentsWithScores = students.map((student) => {
      const score = studentScores.find(
        (score) => score.student_id.toString() === student._id.toString()
      );

      return {
        ...student.toObject(),
        score: score
          ? {
              attendance_score: score.attendance_score,
              absent_sessions: score.absent_sessions,
              final_score: score.final_score,
              is_failed_due_to_absent: score.is_failed_due_to_absent,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: studentsWithScores,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách sinh viên trong lớp:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách sinh viên trong lớp",
      error: error.message,
    });
  }
};

// @desc    Cập nhật điểm môn học cho sinh viên
// @route   PUT /api/classes/teaching/:id/students/:studentId/score
// @access  Private (Teacher)
exports.updateStudentScore = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { final_score, attendance_score, note } = req.body;

    const teachingClass = await TeachingClass.findById(id);
    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      teachingClass.teacher_id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật điểm cho lớp này",
      });
    }

    if (!teachingClass.students.includes(studentId)) {
      return res.status(404).json({
        success: false,
        message: "Sinh viên không thuộc lớp học này",
      });
    }

    let scoreRecord = await StudentScore.findOne({
      teaching_class_id: id,
      student_id: studentId,
    });

    if (!scoreRecord) {
      scoreRecord = new StudentScore({
        teaching_class_id: id,
        student_id: studentId,
        total_sessions: teachingClass.total_sessions,
        max_absent_allowed: teachingClass.max_absent_allowed || 3,
      });
    }

    if (final_score !== undefined) {
      scoreRecord.final_score = final_score;
    }

    if (attendance_score !== undefined) {
      scoreRecord.attendance_score = attendance_score;
    }

    if (note) {
      scoreRecord.note = note;
    }

    scoreRecord.last_updated = Date.now();
    await scoreRecord.save();

    res.status(200).json({
      success: true,
      message: "Cập nhật điểm thành công",
      data: scoreRecord,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật điểm sinh viên:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật điểm sinh viên",
      error: error.message,
    });
  }
};

// @desc    Lấy thông tin về tình trạng vắng mặt trong lớp học
// @route   GET /api/classes/teaching/:id/attendance-stats
// @access  Private (Teacher, Admin)
exports.getClassAttendanceStats = async (req, res) => {
  try {
    const { id } = req.params;

    const teachingClass = await TeachingClass.findById(id);
    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp giảng dạy",
      });
    }

    if (
      req.user.role !== "admin" &&
      teachingClass.teacher_id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem thông tin lớp này",
      });
    }

    const sessions = await AttendanceSession.find({
      teaching_class_id: id,
    }).sort({ session_number: 1 });

    const studentScores = await StudentScore.find({
      teaching_class_id: id,
    });

    const students = await User.find({
      _id: { $in: teachingClass.students },
    }).select("_id full_name school_info.student_id");

    const attendanceLogs = await AttendanceLog.find({
      session_id: { $in: sessions.map((s) => s._id) },
    });

    const studentStats = students.map((student) => {
      const score = studentScores.find(
        (s) => s.student_id.toString() === student._id.toString()
      );

      const sessionStats = sessions.map((session) => {
        const log = attendanceLogs.find(
          (log) =>
            log.session_id.toString() === session._id.toString() &&
            log.student_id.toString() === student._id.toString()
        );

        return {
          session_id: session._id,
          session_number: session.session_number,
          date: session.date,
          status: log ? log.status : "absent",
          note: log ? log.note : null,
        };
      });

      return {
        student_id: student._id,
        full_name: student.full_name,
        student_id: student.school_info?.student_id,
        absent_sessions: score ? score.absent_sessions : 0,
        attendance_score: score ? score.attendance_score : 10,
        is_failed_due_to_absent: score ? score.is_failed_due_to_absent : false,
        sessions: sessionStats,
      };
    });

    const sessionStats = sessions.map((session) => {
      const presentCount = session.students_present.length;
      const absentCount = session.students_absent.length;
      const totalStudents = teachingClass.students.length;

      return {
        session_id: session._id,
        session_number: session.session_number,
        date: session.date,
        present_count: presentCount,
        absent_count: absentCount,
        attendance_rate:
          totalStudents > 0 ? (presentCount / totalStudents) * 100 : 0,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        class_info: {
          _id: teachingClass._id,
          class_name: teachingClass.class_name,
          class_code: teachingClass.class_code,
          total_sessions: teachingClass.total_sessions,
          max_absent_allowed: teachingClass.max_absent_allowed,
        },
        sessions_completed: sessions.filter((s) => s.status === "completed")
          .length,
        total_sessions: teachingClass.total_sessions,
        student_stats: studentStats,
        session_stats: sessionStats,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thống kê điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê điểm danh",
      error: error.message,
    });
  }
};

// @desc    Xóa sinh viên khỏi lớp chính và cập nhật các liên kết
// @route   DELETE /api/classes/main/:id/students/:studentId
// @access  Private (Admin, Advisor)
exports.removeStudentFromMainClass = async (req, res) => {
  try {
    const { id: classId, studentId } = req.params;

    const mainClass = await MainClass.findById(classId);
    if (!mainClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp chính",
      });
    }

    if (
      req.user.role !== "admin" &&
      (!mainClass.advisor_id || mainClass.advisor_id.toString() !== req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa sinh viên khỏi lớp này",
      });
    }

    if (!mainClass.students.map((s) => s.toString()).includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên không có trong lớp chính này",
      });
    }

    mainClass.students = mainClass.students.filter(
      (sId) => sId.toString() !== studentId
    );
    await mainClass.save();

    await User.findByIdAndUpdate(studentId, { $unset: { main_class_id: "" } });

    await Notification.deleteMany({
      recipient_id: studentId,
      type: "class_approval",
      "data.class_id": classId,
    });

    res.status(200).json({
      success: true,
      message: "Xóa sinh viên khỏi lớp chính và cập nhật liên kết thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa sinh viên khỏi lớp chính:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa sinh viên khỏi lớp chính",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách các buổi học có thể xin nghỉ của sinh viên cho một lớp học cụ thể
// @route   GET /api/v1/classes/teaching/:teachingClassId/schedulable-sessions-for-student
// @access  Private (Student)
exports.getSchedulableSessionsForStudent = async (req, res) => {
  try {
    const { teachingClassId } = req.params;
    const studentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(teachingClassId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID lớp học không hợp lệ." });
    }

    // 1. Lấy TeachingClass đầy đủ, bao gồm cả 'schedule'
    const teachingClass = await TeachingClass.findById(teachingClassId)
      .select("+schedule") // Đảm bảo lấy trường schedule
      .lean();

    if (!teachingClass) {
      return res
        .status(404)
        .json({ success: false, message: "Lớp học không tồn tại." });
    }

    const isStudentInClass = teachingClass.students.some(
      (sId) => sId.toString() === studentId
    );
    if (!isStudentInClass) {
      return res.status(403).json({
        success: false,
        message: "Sinh viên không thuộc lớp học này.",
      });
    }

    // 2. Lấy các buổi học (AttendanceSession) của lớp đó
    // const now = new Date(); // Không cần 'now' nữa nếu 'today' được khởi tạo đúng
    const today = new Date(new Date().setHours(0, 0, 0, 0)); // Khởi tạo today một cách an toàn hơn

    const sessionsQuery = AttendanceSession.find({
      teaching_class_id: teachingClassId,
    });

    sessionsQuery
      .populate({
        path: "teaching_class_id",
        select: "class_name subject_id",
        populate: {
          path: "subject_id",
          select: "name code",
        },
      })
      .populate("room", "room_number");

    const sessions = await sessionsQuery
      .sort({ date: 1, start_period: 1 })
      .lean();

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // 3. Lọc và bổ sung thông tin cho các buổi học hợp lệ
    const schedulableSessions = [];

    for (let session of sessions) {
      const sessionDate = new Date(session.date);

      if (
        (session.start_period == null || session.end_period == null) &&
        teachingClass.schedule &&
        teachingClass.schedule.length > 0
      ) {
        const sessionDayOfWeek = sessionDate.getDay();

        const matchedScheduleItem = teachingClass.schedule.find(
          (item) => item.day_of_week === sessionDayOfWeek
        );

        if (matchedScheduleItem) {
          if (session.start_period == null) {
            session.start_period = matchedScheduleItem.start_period;
          }
          if (session.end_period == null) {
            session.end_period = matchedScheduleItem.end_period;
          }
        }
      }

      let canSchedule = false;
      if (sessionDate >= today) {
        canSchedule = true;
      } else {
        const attendanceLog = await AttendanceLog.findOne({
          session_id: session._id,
          student_id: studentId,
          status: "present",
        }).lean();
        if (!attendanceLog) {
          canSchedule = true;
        }
      }

      if (canSchedule) {
        schedulableSessions.push(session);
      }
    }

    res.status(200).json({
      success: true,
      count: schedulableSessions.length,
      data: schedulableSessions,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách buổi học có thể xin nghỉ:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách buổi học.",
      error: error.message,
    });
  }
};
