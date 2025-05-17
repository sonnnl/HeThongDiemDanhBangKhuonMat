const multer = require("multer");
const cloudinary = require("../config/cloudinary.config");
const path = require("path");

// Cấu hình Multer để lưu file tạm thời trong memory
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Chỉ chấp nhận các định dạng ảnh phổ biến
  const allowedTypes = /jpeg|jpg|png|gif/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("Chỉ chấp nhận file ảnh (jpeg, jpg, png, gif)."), false);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn kích thước file 5MB
  fileFilter: fileFilter,
});

// Middleware để upload một file ảnh lên Cloudinary
// Sẽ thêm trường `file_url` vào `req` nếu upload thành công
const uploadToCloudinary = (fieldName = "evidence_image") => {
  return (req, res, next) => {
    // Sử dụng multer để xử lý file từ fieldName
    upload.single(fieldName)(req, res, async (err) => {
      console.log(
        `Middleware uploadToCloudinary for field "${fieldName}" triggered.`
      );
      if (req.file) {
        console.log(
          "File received by multer:",
          req.file.originalname,
          req.file.mimetype
        );
      } else {
        console.log("No file received by multer for this request.");
      }

      if (err) {
        // Xử lý lỗi từ multer (ví dụ: file quá lớn, sai định dạng)
        let errorMessage = "Lỗi upload file.";
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            errorMessage = "Kích thước file quá lớn (tối đa 5MB).";
          } else {
            errorMessage = err.message;
          }
        } else if (err.message) {
          errorMessage = err.message; // Lỗi từ fileFilter
        }
        console.error("Multer error:", errorMessage);
        return res.status(400).json({ success: false, message: errorMessage });
      }

      // Nếu không có file nào được upload (có thể là optional field)
      if (!req.file) {
        // Nếu field này là bắt buộc, bạn có thể trả lỗi ở đây
        // Hoặc nếu là optional thì gọi next()
        return next();
      }

      try {
        // Upload file từ buffer lên Cloudinary
        // Tạo một stream từ buffer của file
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "absence_evidence", // Thư mục trên Cloudinary để lưu ảnh
            resource_type: "image",
            // public_id: `evidence_${Date.now()}` // Tùy chọn: đặt tên file cụ thể
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary Upload Error inside callback:", error);
              return res.status(500).json({
                success: false,
                message: "Lỗi khi upload ảnh bằng chứng lên cloud.",
              });
            }
            console.log("Cloudinary Upload Result:", result);
            req.file_url = result.secure_url;
            console.log("Assigned req.file_url:", req.file_url);
            next();
          }
        );
        // Ghi buffer vào stream để upload
        console.log(
          "Attempting to upload file to Cloudinary:",
          req.file.originalname
        );
        uploadStream.end(req.file.buffer);
      } catch (uploadError) {
        console.error("Server Error during Cloudinary Upload:", uploadError);
        res.status(500).json({
          success: false,
          message: "Lỗi máy chủ khi upload ảnh.",
        });
      }
    });
  };
};

module.exports = { uploadToCloudinary, upload }; // Export cả upload nếu muốn dùng multer riêng
