const {
  AttendanceSession,
  AttendanceLog,
  TeachingClass,
  StudentScore,
  User,
} = require("../models/schemas");

// @desc    Tạo phiên điểm danh mới
// @route   POST /api/attendance/sessions
// @access  Private (Chỉ giáo viên)
exports.createAttendanceSession = async (req, res) => {
  try {
    const { teaching_class_id, session_number, date, room } = req.body;

    // Tìm lớp học
    const teachingClass = await TeachingClass.findById(teaching_class_id);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // Kiểm tra xem người gửi request có phải giáo viên của lớp không
    if (
      teachingClass.teacher_id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không phải giáo viên của lớp này",
      });
    }

    // Kiểm tra session number
    if (session_number > teachingClass.total_sessions) {
      return res.status(400).json({
        success: false,
        message: "Số buổi vượt quá tổng số buổi học",
      });
    }

    // Kiểm tra xem đã tồn tại phiên điểm danh chưa
    const existingSession = await AttendanceSession.findOne({
      teaching_class_id,
      session_number,
    });

    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: "Phiên điểm danh đã tồn tại",
      });
    }

    // Tạo phiên điểm danh mới
    const attendanceSession = await AttendanceSession.create({
      teaching_class_id,
      session_number,
      date: date || new Date(),
      room,
      started_by: req.user.id,
      status: "active",
      start_time: new Date(),
      students_absent: [...teachingClass.students], // Ban đầu tất cả vắng mặt
      students_present: [],
    });

    res.status(201).json({
      success: true,
      data: attendanceSession,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// @desc    Lấy thông tin phiên điểm danh
// @route   GET /api/attendance/sessions/:id
// @access  Private
exports.getAttendanceSession = async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.id)
      .populate({
        path: "teaching_class_id",
        select: "class_name class_code subject_id teacher_id students",
        populate: [
          {
            path: "subject_id",
            select: "name code credits",
          },
          {
            path: "students",
            select: "full_name email school_info avatar_url",
          },
        ],
      })
      .populate({
        path: "students_present.student_id",
        select: "full_name student_id avatar_url school_info email",
      })
      .populate({
        path: "students_absent",
        select: "full_name student_id avatar_url school_info email",
      })
      .populate({
        path: "room",
        select: "room_number capacity building_id",
        populate: {
          path: "building_id",
          select: "name campus_id",
          populate: {
            path: "campus_id",
            select: "name",
          },
        },
      })
      .populate({
        path: "started_by",
        select: "full_name",
      });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    // Nếu phiên có trạng thái completed nhưng không có dữ liệu students_present hoặc students_absent
    // thì tính toán lại dựa trên danh sách lớp
    if (
      session.status === "completed" &&
      (!session.students_present || session.students_present.length === 0) &&
      (!session.students_absent || session.students_absent.length === 0)
    ) {
      // Lấy danh sách tất cả sinh viên trong lớp
      const allStudents = session.teaching_class_id.students || [];

      // Tạo danh sách students_present và students_absent (tạm thời coi mọi sinh viên là có mặt)
      const studentsPresent = allStudents.map((student) => ({
        student_id: student._id,
        timestamp: new Date(),
        check_type: "auto",
      }));

      const studentsAbsent = [];

      // Lưu lại các thay đổi
      await AttendanceSession.updateOne(
        { _id: session._id },
        {
          $set: {
            students_present: studentsPresent,
            students_absent: studentsAbsent,
          },
        }
      );

      // Lấy lại phiên sau khi cập nhật
      return res.status(200).json({
        success: true,
        data: {
          ...session.toObject(),
          students_present: studentsPresent.map((sp) => ({
            student_id: allStudents.find(
              (s) => s._id.toString() === sp.student_id.toString()
            ),
            timestamp: sp.timestamp,
            check_type: sp.check_type,
          })),
          students_absent: [],
        },
        message: "Dữ liệu đã được tính toán lại dựa trên danh sách lớp",
      });
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin phiên điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Cập nhật phiên điểm danh
// @route   PUT /api/attendance/sessions/:id
// @access  Private (Chỉ giáo viên)
exports.updateAttendanceSession = async (req, res) => {
  try {
    const { status, notes, students_absent } = req.body;

    // Tìm phiên điểm danh
    const session = await AttendanceSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    // Xác minh quyền - chỉ giáo viên tạo hoặc admin có thể cập nhật
    const teachingClass = await TeachingClass.findById(
      session.teaching_class_id
    );

    if (
      teachingClass.teacher_id.toString() !== req.user.id &&
      session.started_by.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật phiên điểm danh này",
      });
    }

    // Nếu có danh sách students_absent từ frontend, sử dụng nó trực tiếp
    if (students_absent && Array.isArray(students_absent)) {
      session.students_absent = students_absent;
    }

    // Cập nhật trạng thái
    if (status) {
      session.status = status;

      // Nếu hoàn thành và không có danh sách students_absent từ frontend,
      // tính toán lại dựa trên dữ liệu hiện tại
      if (status === "completed" && !students_absent) {
        const classWithStudents = await TeachingClass.findById(
          session.teaching_class_id
        )
          .select("students")
          .lean();

        if (classWithStudents && classWithStudents.students) {
          // Lấy danh sách ID sinh viên đã có mặt
          const presentStudentIds = session.students_present.map((p) =>
            p.student_id.toString()
          );

          // Tính toán sinh viên vắng mặt = tất cả sinh viên - sinh viên có mặt
          const absentStudents = classWithStudents.students.filter(
            (studentId) => !presentStudentIds.includes(studentId.toString())
          );

          // Cập nhật danh sách vắng mặt
          session.students_absent = absentStudents;
        }
      }
    }

    // Cập nhật ghi chú
    if (notes) {
      session.notes = notes;
    }

    await session.save();

    // Gọi cập nhật điểm SAU KHI LƯU, chỉ khi status là completed
    if (status === "completed") {
      try {
        if (typeof updateAttendanceScores === "function") {
          console.log(
            `[updateAttendanceSession] Calling updateAttendanceScores for class ${session.teaching_class_id} after completing session ${session._id}`
          );
          await updateAttendanceScores(session.teaching_class_id);
          console.log(
            `[updateAttendanceSession] Finished updateAttendanceScores for class ${session.teaching_class_id}`
          );
        }
      } catch (scoreError) {
        console.error(
          `[updateAttendanceSession] Error calling updateAttendanceScores for class ${session.teaching_class_id}:`,
          scoreError
        );
        // Không nên trả lỗi cho client ở đây, chỉ log lại
      }
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật phiên điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách phiên điểm danh của lớp học
// @route   GET /api/attendance/teaching-class/:id/sessions
// @access  Private
exports.getClassAttendanceSessions = async (req, res) => {
  try {
    const teachingClassId = req.params.id;

    // Kiểm tra lớp học
    const teachingClass = await TeachingClass.findById(teachingClassId);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // Kiểm tra quyền
    const isTeacher = teachingClass.teacher_id.toString() === req.user.id;
    const isStudent = teachingClass.students.includes(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isTeacher && !isStudent && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền xem phiên điểm danh của lớp này",
      });
    }

    // Lấy danh sách phiên điểm danh
    const sessions = await AttendanceSession.find({
      teaching_class_id: teachingClassId,
    })
      .sort({ session_number: 1 })
      .populate({
        path: "started_by",
        select: "full_name",
      })
      .populate({
        path: "room",
        select: "room_number capacity building_id",
        populate: {
          path: "building_id",
          select: "name campus_id",
          populate: {
            path: "campus_id",
            select: "name",
          },
        },
      });

    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách phiên điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách logs điểm danh trong một phiên
// @route   GET /api/attendance/logs/:sessionId
// @access  Private
exports.getAttendanceLogs = async (req, res) => {
  try {
    const sessionId = req.params.sessionId;

    // Tìm phiên điểm danh
    const session = await AttendanceSession.findById(sessionId).populate({
      path: "teaching_class_id",
      select: "teacher_id subject_id students",
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    // Kiểm tra quyền
    const isTeacher =
      session.teaching_class_id.teacher_id.toString() === req.user.id;
    const isStudent = session.teaching_class_id.students.includes(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isTeacher && !isStudent && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền xem logs điểm danh của phiên này",
      });
    }

    // Nếu là sinh viên, chỉ xem được log của mình
    let query = { session_id: sessionId };
    if (isStudent && !isTeacher && !isAdmin) {
      query.student_id = req.user.id;
    }

    // Lấy danh sách logs
    const logs = await AttendanceLog.find(query)
      .populate({
        path: "student_id",
        select: "full_name student_id avatar_url school_info",
      })
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách logs điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy lịch sử điểm danh của sinh viên (bao gồm cả vắng mặt)
// @route   GET /api/attendance/student/:studentId/logs
// @access  Private
exports.getStudentAttendanceLogs = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const teachingClassId = req.query.teaching_class;

    // Kiểm tra quyền
    const isStudent = req.user.id === studentId;
    const isAdmin = req.user.role === "admin";
    const isTeacher = req.user.role === "teacher";

    if (!isStudent && !isAdmin && !isTeacher) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền xem lịch sử điểm danh của sinh viên này",
      });
    }

    // Xác định các lớp học mà sinh viên này tham gia
    const studentClassesQuery = { students: studentId };
    if (teachingClassId) {
      studentClassesQuery._id = teachingClassId;
    }
    const studentClasses = await TeachingClass.find(studentClassesQuery).select(
      "_id"
    );
    const studentClassIds = studentClasses.map((cls) => cls._id);

    if (studentClassIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: "Sinh viên không tham gia lớp học nào",
      });
    }

    // Tìm tất cả các phiên điểm danh đã hoàn thành của các lớp đó
    const completedSessions = await AttendanceSession.find({
      teaching_class_id: { $in: studentClassIds },
      status: "completed",
    })
      .populate({
        path: "teaching_class_id",
        select: "class_name class_code subject_id",
        populate: { path: "subject_id", select: "name code" },
      })
      .sort({ date: -1 }); // Sắp xếp theo ngày giảm dần

    // Lấy tất cả các log điểm danh liên quan của sinh viên
    const studentLogs = await AttendanceLog.find({
      student_id: studentId,
      session_id: { $in: completedSessions.map((s) => s._id) },
    });

    // Tạo map để dễ tra cứu log theo session_id
    const logMap = new Map();
    studentLogs.forEach((log) => logMap.set(log.session_id.toString(), log));

    // Tạo kết quả cuối cùng, bao gồm cả buổi vắng mặt
    const fullHistory = completedSessions.map((session) => {
      const log = logMap.get(session._id.toString());

      let status = "absent"; // Mặc định là vắng mặt
      let timestamp = session.date; // Sử dụng ngày của session làm timestamp mặc định cho buổi vắng
      let note = "-";
      let recognized = false;
      let captured_face_url = null;
      let recognized_confidence = null;

      if (log) {
        // Nếu tìm thấy log
        status = log.status;
        timestamp = log.timestamp;
        note = log.note || "-";
        recognized = log.recognized;
        captured_face_url = log.captured_face_url;
        recognized_confidence = log.recognized_confidence;
      }

      return {
        _id: log ? log._id : `${session._id}_absent_${studentId}`, // Tạo ID giả cho buổi vắng
        session_id: {
          _id: session._id,
          teaching_class_id: session.teaching_class_id,
          session_number: session.session_number,
          date: session.date,
          status: session.status, // Status của session (luôn là completed ở đây)
        },
        student_id: studentId, // Giữ studentId để biết của ai
        status: status, // Trạng thái điểm danh (present, absent, etc.)
        timestamp: timestamp, // Thời gian ghi nhận (log timestamp hoặc session date)
        note: note,
        recognized: recognized,
        captured_face_url: captured_face_url,
        recognized_confidence: recognized_confidence,
        // Thêm student_info nếu cần để hiển thị tên/avatar (tùy frontend)
        // student_info: { ... }
      };
    });

    res.status(200).json({
      success: true,
      count: fullHistory.length,
      data: fullHistory,
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử điểm danh đầy đủ:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Lấy điểm chuyên cần của sinh viên
// @route   GET /api/attendance/student/:studentId/scores
// @access  Private
exports.getStudentScores = async (req, res) => {
  try {
    const studentId = req.params.studentId;

    // Kiểm tra quyền
    const isStudent = req.user.id === studentId;
    const isAdmin = req.user.role === "admin";
    const isTeacher = req.user.role === "teacher";

    if (!isStudent && !isAdmin && !isTeacher) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền xem điểm chuyên cần của sinh viên này",
      });
    }

    // Lấy danh sách điểm
    const scores = await StudentScore.find({ student_id: studentId })
      .populate({
        path: "teaching_class_id",
        select:
          "class_name class_code subject_id teacher_id total_sessions max_absent_allowed semester_id",
        populate: [
          {
            path: "subject_id",
            select: "name code credits",
          },
          {
            path: "teacher_id",
            select: "full_name email",
          },
          {
            path: "semester_id",
            select: "name year semester_number academic_year",
          },
        ],
      })
      // Populate thêm thông tin student_id để lấy tên, mã sinh viên
      .populate({
        path: "student_id",
        select: "full_name email school_info.student_id",
      })
      .sort({ last_updated: -1 })
      .lean(); // Sử dụng lean()

    // Thêm dữ liệu để hiển thị rõ ràng hơn
    const enhancedScores = scores.map((scoreObj) => {
      // scoreObj đã là plain object
      // Lấy các giá trị từ scoreObj
      const totalCompletedSessions = scoreObj.total_sessions || 0;
      const absentSessions = scoreObj.absent_sessions || 0;
      const attendanceScore = scoreObj.attendance_score ?? 10;
      const isFailedDueToAbsent = scoreObj.is_failed_due_to_absent || false;
      const maxAbsentAllowed =
        scoreObj.max_absent_allowed ||
        scoreObj.teaching_class_id?.max_absent_allowed ||
        3;
      const totalPlannedSessions =
        scoreObj.teaching_class_id?.total_sessions || 0;

      // Tính toán các giá trị phụ trợ
      const attendedSessions = totalCompletedSessions - absentSessions;
      const attendancePercentage =
        totalCompletedSessions > 0
          ? Math.round((attendedSessions / totalCompletedSessions) * 100)
          : 0;
      const courseProgress =
        totalPlannedSessions > 0
          ? Math.round((totalCompletedSessions / totalPlannedSessions) * 100)
          : 0;

      // Tạo công thức tính điểm
      const attendanceCalculation = `10 - (${absentSessions} vắng * 2) = ${attendanceScore}`;

      // Tạo trạng thái điểm danh
      const attendanceStatus = isFailedDueToAbsent
        ? `Cấm thi (vắng ${absentSessions}/${maxAbsentAllowed + 1} buổi)`
        : "Đủ điều kiện dự thi";

      // Tạo đối tượng trả về
      return {
        _id: scoreObj._id,
        teaching_class_id: scoreObj.teaching_class_id?._id,
        student_id: scoreObj.student_id?._id,
        attendance_score: attendanceScore,
        total_sessions: totalCompletedSessions, // Tổng số buổi đã hoàn thành
        absent_sessions: absentSessions,
        attended_sessions: attendedSessions, // Số buổi có mặt
        max_absent_allowed: maxAbsentAllowed,
        is_failed_due_to_absent: isFailedDueToAbsent,
        last_updated: scoreObj.last_updated,
        // Dữ liệu đã populate và tính toán để hiển thị
        attendance_percentage: attendancePercentage,
        course_progress: courseProgress,
        attendance_calculation: attendanceCalculation, // Công thức tính điểm
        attendance_status: attendanceStatus, // Trạng thái (Cấm thi/Đủ điều kiện)
        class_info: scoreObj.teaching_class_id
          ? {
              _id: scoreObj.teaching_class_id._id,
              name: scoreObj.teaching_class_id.class_name,
              code: scoreObj.teaching_class_id.class_code,
              total_planned_sessions: totalPlannedSessions,
              subject: scoreObj.teaching_class_id.subject_id
                ? {
                    _id: scoreObj.teaching_class_id.subject_id._id,
                    name: scoreObj.teaching_class_id.subject_id.name,
                    code: scoreObj.teaching_class_id.subject_id.code,
                    credits: scoreObj.teaching_class_id.subject_id.credits,
                  }
                : null,
              teacher: scoreObj.teaching_class_id.teacher_id
                ? {
                    _id: scoreObj.teaching_class_id.teacher_id._id,
                    name: scoreObj.teaching_class_id.teacher_id.full_name,
                    email: scoreObj.teaching_class_id.teacher_id.email,
                  }
                : null,
              semester: scoreObj.teaching_class_id.semester_id
                ? {
                    _id: scoreObj.teaching_class_id.semester_id._id,
                    name: scoreObj.teaching_class_id.semester_id.name,
                    year: scoreObj.teaching_class_id.semester_id.year,
                    semester_number:
                      scoreObj.teaching_class_id.semester_id.semester_number,
                    academic_year:
                      scoreObj.teaching_class_id.semester_id.academic_year,
                  }
                : null,
            }
          : null,
        student_info: scoreObj.student_id
          ? {
              _id: scoreObj.student_id._id,
              full_name: scoreObj.student_id.full_name,
              student_id: scoreObj.student_id.school_info?.student_id,
              email: scoreObj.student_id.email,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      count: enhancedScores.length,
      data: enhancedScores,
    });
  } catch (error) {
    console.error("Lỗi khi lấy điểm chuyên cần:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

// @desc    Tính toán lại điểm chuyên cần
// @route   POST /api/attendance/scores/calculate
// @access  Private (Chỉ giáo viên)
exports.calculateAttendanceScores = async (req, res) => {
  try {
    const { teaching_class_id } = req.body;

    if (!teaching_class_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID lớp học",
      });
    }

    // Tìm lớp học
    const teachingClass = await TeachingClass.findById(teaching_class_id);

    if (!teachingClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // Kiểm tra quyền
    if (
      teachingClass.teacher_id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền tính toán điểm chuyên cần cho lớp này",
      });
    }

    // Gọi hàm tính toán điểm
    const updatedScores = await updateAttendanceScores(teaching_class_id);

    res.status(200).json({
      success: true,
      count: updatedScores.length,
      data: updatedScores,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

// Hàm hỗ trợ tính toán điểm chuyên cần
const updateAttendanceScores = async (teachingClassId) => {
  // Lấy thông tin lớp học
  const teachingClass = await TeachingClass.findById(teachingClassId).populate(
    "subject_id",
    "name code"
  );

  if (!teachingClass) {
    throw new Error("Không tìm thấy lớp học");
  }

  // Lấy tất cả phiên điểm danh đã hoàn thành
  const completedSessions = await AttendanceSession.find({
    teaching_class_id: teachingClassId,
    status: "completed",
  }).lean(); // Sử dụng lean() để lấy plain objects, hiệu quả hơn

  const completedSessionIds = completedSessions.map((s) => s._id);

  // Lấy số lượng phiên điểm danh đã hoàn thành
  const totalCompletedSessions = completedSessions.length;
  const totalPlannedSessions = teachingClass.total_sessions || 0;
  const maxAbsentAllowed = teachingClass.max_absent_allowed || 3; // Giữ lại để kiểm tra cấm thi

  // Cập nhật điểm cho từng sinh viên
  const updatedScores = [];

  for (const studentId of teachingClass.students) {
    try {
      // --- Đếm số buổi vắng mặt ---
      // 1. Lấy các session mà sinh viên có log 'present'
      const sessionsWithPresentLog = await AttendanceLog.find({
        session_id: { $in: completedSessionIds },
        student_id: studentId,
        status: "present",
      }).distinct("session_id"); // Lấy các session_id duy nhất

      // 2. Lấy các session mà sinh viên được đánh dấu có mặt thủ công
      const sessionsWithManualPresent = await AttendanceSession.find({
        _id: { $in: completedSessionIds },
        "students_present.student_id": studentId,
      })
        .select("_id")
        .lean();

      // 3. Kết hợp và đếm số buổi có mặt duy nhất
      const presentSessionIds = new Set([
        ...sessionsWithPresentLog.map((id) => id.toString()),
        ...sessionsWithManualPresent.map((s) => s._id.toString()),
      ]);
      const totalPresentCount = presentSessionIds.size;

      // 4. Tính số buổi vắng
      const absent_count = totalCompletedSessions - totalPresentCount;
      // --- Kết thúc đếm số buổi vắng ---

      // Tính điểm chuyên cần
      let attendanceScore = 10 - absent_count * 2;
      if (attendanceScore < 0) attendanceScore = 0;

      // Kiểm tra có rớt vì vắng quá số buổi cho phép không
      const isFailedDueToAbsent = absent_count > maxAbsentAllowed;

      // Tìm hoặc tạo mới StudentScore
      let studentScore = await StudentScore.findOneAndUpdate(
        { student_id: studentId, teaching_class_id: teachingClassId },
        {
          $set: {
            total_sessions: totalCompletedSessions, // Tổng số buổi đã hoàn thành
            absent_sessions: absent_count,
            attendance_score: attendanceScore,
            max_absent_allowed: maxAbsentAllowed, // Lưu lại để tiện truy vấn
            is_failed_due_to_absent: isFailedDueToAbsent,
            last_updated: Date.now(),
          },
        },
        { new: true, upsert: true } // upsert: true để tạo mới nếu chưa có
      );

      // Lấy thông tin user để trả về (tương tự như trước)
      const user = await User.findById(
        studentId,
        "full_name email school_info.student_id"
      ).lean();

      // Tạo đối tượng trả về
      const attended_sessions = totalCompletedSessions - absent_count; // Tổng có mặt = Tổng - Vắng
      const enhancedScore = {
        ...studentScore.toObject(),
        student_info: user
          ? {
              full_name: user.full_name,
              student_id: user.school_info?.student_id,
              email: user.email,
            }
          : null,
        completed_sessions: totalCompletedSessions, // Số buổi đã diễn ra
        total_planned_sessions: totalPlannedSessions, // Tổng số buổi dự kiến
        attended_sessions: attended_sessions, // Số buổi có mặt
        absent_sessions: absent_count, // Số buổi vắng
        // Tỷ lệ tham gia
        attendance_percentage:
          totalCompletedSessions > 0
            ? Math.round((attended_sessions / totalCompletedSessions) * 100)
            : 0,
        // Tiến độ khóa học
        course_progress:
          totalPlannedSessions > 0
            ? Math.round((totalCompletedSessions / totalPlannedSessions) * 100)
            : 0,
        // Không cần trả về attendance_calculation và status ở đây vì getStudentScores sẽ tạo
      };

      updatedScores.push(enhancedScore);
    } catch (err) {
      console.error(`Lỗi khi cập nhật điểm cho sinh viên ${studentId}:`, err);
      // Tiếp tục với sinh viên tiếp theo
    }
  }

  return updatedScores;
};

/**
 * @desc    Lấy tất cả các phiên điểm danh với phân trang
 * @route   GET /api/attendance/sessions
 * @access  Private (Admin, Teacher)
 */
exports.getAllAttendanceSessions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    // Nếu người dùng là giáo viên, chỉ lấy các phiên do họ tạo
    if (req.user.role === "teacher") {
      query.created_by = req.user._id;
    }

    const sessions = await AttendanceSession.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: "teaching_class_id",
        select: "class_name subject_id teacher_id",
        populate: [
          { path: "subject_id", select: "name code" },
          { path: "teacher_id", select: "full_name" },
        ],
      })
      .populate({
        path: "room",
        select: "room_number capacity building_id",
        populate: {
          path: "building_id",
          select: "name campus_id",
          populate: {
            path: "campus_id",
            select: "name",
          },
        },
      });

    const totalCount = await AttendanceSession.countDocuments(query);

    res.status(200).json({
      success: true,
      data: sessions,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalCount,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách phiên điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách phiên điểm danh",
      error: error.message,
    });
  }
};

// @desc    Cập nhật trạng thái phiên điểm danh
// @route   PUT /api/attendance/sessions/:id/status
// @access  Private (Chỉ giáo viên)
exports.updateSessionStatus = async (req, res) => {
  try {
    const { status, students_absent } = req.body;

    if (!status || !["pending", "active", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Trạng thái không hợp lệ. Trạng thái phải là 'pending', 'active', hoặc 'completed'",
      });
    }

    // Tìm phiên điểm danh
    const session = await AttendanceSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên điểm danh",
      });
    }

    // Xác minh quyền - chỉ giáo viên tạo hoặc admin có thể cập nhật
    const teachingClass = await TeachingClass.findById(
      session.teaching_class_id
    );

    if (
      !teachingClass ||
      (teachingClass.teacher_id.toString() !== req.user.id &&
        req.user.role !== "admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật phiên điểm danh này",
      });
    }

    // Nếu có danh sách students_absent từ frontend, sử dụng nó trực tiếp
    if (students_absent && Array.isArray(students_absent)) {
      session.students_absent = students_absent;
    }

    // Cập nhật trạng thái
    session.status = status;

    // Nếu bắt đầu, cập nhật thời gian bắt đầu
    if (status === "active" && !session.start_time) {
      session.start_time = new Date();
    }

    // Khi hoàn thành, xử lý danh sách vắng mặt nếu không được cung cấp từ frontend
    if (status === "completed" && !students_absent) {
      const classWithStudents = await TeachingClass.findById(
        session.teaching_class_id
      )
        .select("students")
        .lean();

      if (
        classWithStudents &&
        classWithStudents.students &&
        classWithStudents.students.length > 0
      ) {
        // Lấy danh sách ID sinh viên đã có mặt
        const presentStudentIds = session.students_present.map((p) =>
          typeof p.student_id === "object"
            ? p.student_id.toString()
            : p.student_id.toString()
        );

        // Tính toán sinh viên vắng mặt = tất cả sinh viên - sinh viên có mặt
        const absentStudents = classWithStudents.students.filter(
          (studentId) => !presentStudentIds.includes(studentId.toString())
        );

        // Cập nhật danh sách vắng mặt
        session.students_absent = absentStudents;
      }

      // Tự động cập nhật điểm chuyên cần
      if (typeof updateAttendanceScores === "function") {
        console.log(
          `[updateSessionStatus] Calling updateAttendanceScores for class ${session.teaching_class_id} after completing session ${session._id}`
        );
        await updateAttendanceScores(session.teaching_class_id);
        console.log(
          `[updateSessionStatus] Finished updateAttendanceScores for class ${session.teaching_class_id}`
        );
      }
    }

    await session.save();

    res.status(200).json({
      success: true,
      message: `Đã cập nhật trạng thái phiên điểm danh thành ${status}`,
      data: session,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái phiên điểm danh:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};
