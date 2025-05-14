import React, { useState, useEffect } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useSnackbar } from "notistack";
import axios from "../utils/axios";
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  Divider,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  School,
  Work,
  Face,
  ExpandMore,
  Check,
} from "@mui/icons-material";
import FaceRegistrationComponent from "../components/FaceRegistrationComponent";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const REQUIRED_IMAGES = 3;

const RegisterPage = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    phone: "",
    address: "",
    role: "",
    school_info: {
      student_id: "",
      teacher_code: "",
      department_id: "",
      class_id: "",
      year: "",
    },
  });

  const [formErrors, setFormErrors] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    phone: "",
    address: "",
    role: "",
    "school_info.department_id": "",
    "school_info.student_id": "",
    "school_info.teacher_code": "",
    "school_info.class_id": "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [mainClasses, setMainClasses] = useState([]);
  const [filteredClasses, setFilteredClasses] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [derivedCourseYear, setDerivedCourseYear] = useState("");
  const [derivedMajorName, setDerivedMajorName] = useState("");
  const [faceRegistrationExpanded, setFaceRegistrationExpanded] =
    useState(false);
  const [faceData, setFaceData] = useState(null);
  const [isFaceRegistrationComplete, setIsFaceRegistrationComplete] =
    useState(false);

  // Tải danh sách Khoa và Lớp khi component mount
  useEffect(() => {
    fetchDepartments();
    fetchMainClasses();
  }, []);

  // Lọc danh sách lớp theo khoa được chọn
  useEffect(() => {
    if (formData.school_info.department_id && mainClasses.length > 0) {
      const filtered = mainClasses.filter(
        (cls) =>
          cls.major_id?.department_id?._id ===
          formData.school_info.department_id
      );
      setFilteredClasses(filtered);
      // Reset class_id nếu khoa thay đổi và lớp hiện tại không thuộc khoa mới
      const currentClassExistsInFiltered = filtered.some(
        (cls) => cls._id === formData.school_info.class_id
      );
      if (!currentClassExistsInFiltered) {
        setFormData((prev) => ({
          ...prev,
          school_info: { ...prev.school_info, class_id: "" },
        }));
        setFormErrors((prev) => ({ ...prev, "school_info.class_id": "" })); // Clear error too
      }
    } else {
      setFilteredClasses([]);
      setFormData((prev) => ({
        ...prev,
        school_info: { ...prev.school_info, class_id: "" },
      }));
      setFormErrors((prev) => ({ ...prev, "school_info.class_id": "" })); // Clear error too
    }
  }, [formData.school_info.department_id, mainClasses]);

  // useEffect để cập nhật Khóa học (năm) và Ngành dựa trên Lớp được chọn cho Sinh viên
  useEffect(() => {
    if (
      formData.role === "student" &&
      formData.school_info.class_id &&
      mainClasses.length > 0 // Đảm bảo mainClasses đã được tải
    ) {
      const selectedClass = mainClasses.find(
        (cls) => cls._id === formData.school_info.class_id
      );
      if (selectedClass) {
        // Cập nhật năm học
        if (selectedClass.year_start) {
          const yearString = selectedClass.year_start.toString();
          setDerivedCourseYear(yearString);
          setFormData((prev) => ({
            ...prev,
            school_info: { ...prev.school_info, year: yearString },
          }));
        } else {
          setDerivedCourseYear("");
          setFormData((prev) => ({
            ...prev,
            school_info: { ...prev.school_info, year: "" },
          }));
        }
        // Cập nhật tên ngành
        if (selectedClass.major_id && selectedClass.major_id.name) {
          setDerivedMajorName(selectedClass.major_id.name);
        } else {
          setDerivedMajorName("");
        }
      } else {
        setDerivedCourseYear("");
        setDerivedMajorName("");
        setFormData((prev) => ({
          ...prev,
          school_info: { ...prev.school_info, year: "" }, // Vẫn reset year nếu lớp không tìm thấy
        }));
      }
    } else {
      // Reset nếu không phải sinh viên hoặc chưa chọn lớp, hoặc chưa có mainClasses
      setDerivedCourseYear("");
      setDerivedMajorName("");
      setFormData((prev) => ({
        ...prev,
        school_info: { ...prev.school_info, year: "" },
      }));
    }
  }, [formData.school_info.class_id, formData.role, mainClasses]);

  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const response = await axios.get(`${API_URL}/departments/public`);
      if (response.data.success) {
        setDepartments(response.data.data);
      } else {
        setDepartments([]);
        enqueueSnackbar(
          response.data.message || "Không thể tải danh sách khoa",
          { variant: "error" }
        );
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      setDepartments([]);
      enqueueSnackbar("Lỗi khi tải danh sách khoa.", { variant: "error" });
    } finally {
      setLoadingDepartments(false);
    }
  };

  const fetchMainClasses = async () => {
    setLoadingClasses(true);
    try {
      const response = await axios.get(
        `${API_URL}/classes/main/public?all=true`
      );
      if (response.data.success) {
        setMainClasses(response.data.data);
      } else {
        setMainClasses([]);
        enqueueSnackbar(
          response.data.message || "Không thể tải danh sách lớp",
          { variant: "error" }
        );
      }
    } catch (error) {
      console.error("Error fetching main classes:", error);
      setMainClasses([]);
      enqueueSnackbar("Lỗi khi tải danh sách lớp.", { variant: "error" });
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let currentErrors = { ...formErrors };

    if (name.startsWith("school_info.")) {
      const fieldName = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        school_info: { ...prev.school_info, [fieldName]: value },
      }));
      currentErrors[name] = ""; // Clear specific error
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      currentErrors[name] = ""; // Clear specific error
    }

    if (name === "role") {
      // Reset fields not applicable to the new role
      setFormData((prev) => ({
        ...prev,
        school_info: {
          ...prev.school_info,
          student_id: value === "teacher" ? "" : prev.school_info.student_id,
          teacher_code:
            value === "student" ? "" : prev.school_info.teacher_code,
          class_id: value === "teacher" ? "" : prev.school_info.class_id,
        },
      }));
      // Clear errors for reset fields
      currentErrors = {
        ...currentErrors,
        "school_info.student_id": "",
        "school_info.teacher_code": "",
        "school_info.class_id": "",
      };
    }

    if (name === "school_info.department_id") {
      setFormData((prev) => ({
        ...prev,
        school_info: { ...prev.school_info, class_id: "" }, // Reset class on department change
      }));
      currentErrors["school_info.class_id"] = ""; // Clear class error
    }
    setFormErrors(currentErrors);
  };

  const validateForm = () => {
    let valid = true;
    const errors = {
      email: "",
      password: "",
      confirmPassword: "",
      full_name: "",
      phone: "",
      address: "",
      role: "",
      "school_info.department_id": "",
      "school_info.student_id": "",
      "school_info.teacher_code": "",
      "school_info.class_id": "",
    };

    if (!formData.email) {
      errors.email = "Email là bắt buộc";
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = "Email không hợp lệ";
      valid = false;
    }
    if (!formData.full_name) {
      errors.full_name = "Họ tên là bắt buộc";
      valid = false;
    }
    if (!formData.password) {
      errors.password = "Mật khẩu là bắt buộc";
      valid = false;
    } else if (formData.password.length < 6) {
      errors.password = "Mật khẩu phải có ít nhất 6 ký tự";
      valid = false;
    }
    if (!formData.confirmPassword) {
      errors.confirmPassword = "Vui lòng xác nhận mật khẩu";
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Mật khẩu không khớp";
      valid = false;
    }
    if (!formData.role) {
      errors.role = "Vui lòng chọn vai trò";
      valid = false;
    }

    if (formData.role) {
      if (!formData.school_info.department_id) {
        errors["school_info.department_id"] = "Vui lòng chọn khoa";
        valid = false;
      }

      if (formData.role === "student") {
        if (!formData.school_info.student_id) {
          errors["school_info.student_id"] = "MSSV là bắt buộc";
          valid = false;
        }
        if (!formData.school_info.class_id) {
          errors["school_info.class_id"] = "Vui lòng chọn lớp";
          valid = false;
        }
      } else if (formData.role === "teacher") {
        if (!formData.school_info.teacher_code) {
          errors["school_info.teacher_code"] = "Mã giảng viên là bắt buộc";
          valid = false;
        }
      }
    }

    if (!formData.phone) {
      errors.phone = "Số điện thoại không hợp lệ";
      valid = false;
    }

    if (!formData.address) {
      errors.address = "Địa chỉ là bắt buộc";
      valid = false;
    }

    setFormErrors(errors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      enqueueSnackbar("Vui lòng kiểm tra lại thông tin đã nhập", {
        variant: "warning",
      });
      return;
    }

    if (validateForm()) {
      if (formData.role === "student" && !isFaceRegistrationComplete) {
        enqueueSnackbar("Vui lòng hoàn tất đăng ký khuôn mặt.", {
          variant: "warning",
        });
        return;
      }
      setIsSubmitting(true);
      try {
        const { confirmPassword, ...submitDataWithoutConfirm } = formData;
        const { school_info, ...restOfSubmitData } = submitDataWithoutConfirm;

        // Prepare school_info based on role
        const finalSchoolInfo = {
          department_id: school_info.department_id,
        };
        if (submitDataWithoutConfirm.role === "student") {
          finalSchoolInfo.student_id = school_info.student_id;
          finalSchoolInfo.class_id = school_info.class_id;
          if (school_info.year) {
            finalSchoolInfo.year = parseInt(school_info.year, 10);
          }
        } else if (submitDataWithoutConfirm.role === "teacher") {
          finalSchoolInfo.teacher_code = school_info.teacher_code;
          finalSchoolInfo.department_id = school_info.department_id;
        }

        const finalSubmitData = {
          ...restOfSubmitData,
          school_info: finalSchoolInfo,
          contact: {
            phone: formData.phone,
            address: formData.address,
          },
          faceFeatures:
            isFaceRegistrationComplete && faceData
              ? { descriptors: faceData }
              : undefined,
        };

        const response = await axios.post(
          `${API_URL}/auth/register`,
          finalSubmitData
        );

        if (response.data.success) {
          enqueueSnackbar(
            response.data.message ||
              "Đăng ký thành công! Vui lòng chờ phê duyệt.",
            { variant: "success" }
          );
          navigate("/login");
        } else {
          enqueueSnackbar(response.data.message || "Đăng ký thất bại", {
            variant: "error",
          });
        }
      } catch (err) {
        console.error("Registration error:", err);
        const errorMessage =
          err.response?.data?.message || "Đăng ký thất bại. Lỗi máy chủ.";
        enqueueSnackbar(errorMessage, { variant: "error" });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleFaceDataCapture = (capturedFaceData) => {
    if (capturedFaceData && capturedFaceData.length >= REQUIRED_IMAGES) {
      setFaceData(capturedFaceData.map((item) => item.descriptor));
      setIsFaceRegistrationComplete(true);
      enqueueSnackbar("Đã chụp đủ ảnh khuôn mặt!", { variant: "success" });
    } else {
      setFaceData(null);
      setIsFaceRegistrationComplete(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{ padding: 4, width: "100%", borderRadius: 3 }}
        >
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Đăng Ký
          </Typography>
          <Typography
            variant="body1"
            align="center"
            color="text.secondary"
            mb={3}
          >
            Tạo tài khoản mới trong hệ thống
          </Typography>

          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ mt: 1 }}
          >
            {/* Basic Fields */}
            <TextField
              margin="normal"
              required
              fullWidth
              id="full_name"
              label="Họ và tên"
              name="full_name"
              autoComplete="name"
              autoFocus
              value={formData.full_name}
              onChange={handleChange}
              error={!!formErrors.full_name}
              helperText={formErrors.full_name}
              disabled={isSubmitting}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Địa chỉ Email"
              name="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              error={!!formErrors.email}
              helperText={formErrors.email}
              disabled={isSubmitting}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Mật khẩu"
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              error={!!formErrors.password}
              helperText={formErrors.password}
              disabled={isSubmitting}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    {" "}
                    <IconButton onClick={toggleShowPassword} edge="end">
                      {" "}
                      {showPassword ? <VisibilityOff /> : <Visibility />}{" "}
                    </IconButton>{" "}
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Xác nhận mật khẩu"
              type={showPassword ? "text" : "password"}
              id="confirmPassword"
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={!!formErrors.confirmPassword}
              helperText={formErrors.confirmPassword}
              disabled={isSubmitting}
            />
            <TextField
              margin="normal"
              fullWidth
              id="phone"
              label="Số điện thoại"
              name="phone"
              autoComplete="tel"
              value={formData.phone}
              onChange={handleChange}
              error={!!formErrors.phone}
              helperText={formErrors.phone}
              disabled={isSubmitting}
            />
            <TextField
              margin="normal"
              fullWidth
              id="address"
              label="Địa chỉ"
              name="address"
              autoComplete="street-address"
              value={formData.address}
              onChange={handleChange}
              error={!!formErrors.address}
              helperText={formErrors.address}
              disabled={isSubmitting}
            />

            <Divider sx={{ my: 2 }} />

            {/* Role Selection */}
            <FormControl
              fullWidth
              margin="normal"
              required
              error={!!formErrors.role}
            >
              <InputLabel id="role-label">Vai trò</InputLabel>
              <Select
                labelId="role-label"
                id="role"
                name="role"
                value={formData.role}
                label="Vai trò"
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <MenuItem value={"student"}>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <School fontSize="small" sx={{ mr: 1 }} /> Sinh viên
                  </Box>
                </MenuItem>
                <MenuItem value={"teacher"}>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <Work fontSize="small" sx={{ mr: 1 }} /> Giảng viên
                  </Box>
                </MenuItem>
              </Select>
              <FormHelperText>{formErrors.role}</FormHelperText>
            </FormControl>

            {/* Conditional Fields */}
            {formData.role && (
              <>
                <Divider sx={{ my: 2 }}>Thông tin trường học</Divider>

                {/* Department Selection (Common) */}
                <FormControl
                  fullWidth
                  margin="normal"
                  required
                  error={!!formErrors["school_info.department_id"]}
                >
                  <InputLabel id="department-label">Khoa</InputLabel>
                  <Select
                    labelId="department-label"
                    id="department"
                    name="school_info.department_id"
                    value={formData.school_info.department_id}
                    label="Khoa"
                    onChange={handleChange}
                    disabled={loadingDepartments || isSubmitting}
                  >
                    {loadingDepartments ? (
                      <MenuItem disabled value="">
                        <em>Đang tải khoa...</em>
                      </MenuItem>
                    ) : departments.length > 0 ? (
                      departments.map((dept) => (
                        <MenuItem key={dept._id} value={dept._id}>
                          {dept.name}
                        </MenuItem>
                      ))
                    ) : (
                      <MenuItem disabled value="">
                        <em>Không có khoa nào</em>
                      </MenuItem>
                    )}
                  </Select>
                  <FormHelperText>
                    {formErrors["school_info.department_id"]}
                  </FormHelperText>
                </FormControl>

                {/* Student Specific Fields */}
                {formData.role === "student" && (
                  <>
                    <TextField
                      margin="normal"
                      required
                      fullWidth
                      id="student_id"
                      label="Mã số sinh viên (MSSV)"
                      name="school_info.student_id"
                      value={formData.school_info.student_id}
                      onChange={handleChange}
                      error={!!formErrors["school_info.student_id"]}
                      helperText={formErrors["school_info.student_id"]}
                      disabled={isSubmitting}
                    />

                    {/* Class Selection */}
                    <FormControl
                      fullWidth
                      margin="normal"
                      required
                      error={!!formErrors["school_info.class_id"]}
                    >
                      <InputLabel id="class-label">Lớp</InputLabel>
                      <Select
                        labelId="class-label"
                        id="class_id"
                        name="school_info.class_id"
                        value={formData.school_info.class_id}
                        label="Lớp"
                        onChange={handleChange}
                        disabled={
                          !formData.school_info.department_id ||
                          loadingClasses ||
                          isSubmitting
                        }
                      >
                        {loadingClasses ? (
                          <MenuItem disabled value="">
                            <em>Đang tải lớp...</em>
                          </MenuItem>
                        ) : filteredClasses.length > 0 ? (
                          filteredClasses.map((cls) => (
                            <MenuItem key={cls._id} value={cls._id}>
                              {cls.name} ({cls.class_code})
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem disabled value="">
                            {formData.school_info.department_id
                              ? "Không có lớp trong khoa này"
                              : "Vui lòng chọn khoa trước"}
                          </MenuItem>
                        )}
                      </Select>
                      <FormHelperText>
                        {formErrors["school_info.class_id"]}
                      </FormHelperText>
                    </FormControl>
                    {/* Hiển thị Ngành học được suy ra */}
                    {derivedMajorName && formData.role === "student" && (
                      <TextField
                        margin="normal"
                        fullWidth
                        id="derived_major_name"
                        label="Ngành học (từ lớp)"
                        value={derivedMajorName}
                        InputProps={{
                          readOnly: true,
                        }}
                        variant="filled"
                        sx={{ mt: 1 }}
                      />
                    )}
                    {/* Hiển thị năm học (khóa) được suy ra */}
                    {derivedCourseYear && formData.role === "student" && (
                      <TextField
                        margin="normal"
                        fullWidth
                        id="derived_course_year"
                        label="Năm nhập học (Khóa)"
                        value={derivedCourseYear}
                        InputProps={{
                          readOnly: true,
                        }}
                        variant="filled"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </>
                )}

                {/* Teacher Specific Fields */}
                {formData.role === "teacher" && (
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    id="teacher_code"
                    label="Mã giảng viên"
                    name="school_info.teacher_code"
                    value={formData.school_info.teacher_code}
                    onChange={handleChange}
                    error={!!formErrors["school_info.teacher_code"]}
                    helperText={formErrors["school_info.teacher_code"]}
                    disabled={isSubmitting}
                  />
                )}
              </>
            )}

            {/* Phần đăng ký khuôn mặt - Chỉ hiển thị cho Sinh viên */}
            {formData.role === "student" && (
              <Accordion
                expanded={faceRegistrationExpanded}
                onChange={() =>
                  setFaceRegistrationExpanded(!faceRegistrationExpanded)
                }
                sx={{ mt: 3, mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <Face sx={{ mr: 1 }} />
                    <Typography>Đăng ký khuôn mặt (khuyến khích)</Typography>
                    {isFaceRegistrationComplete && (
                      <Chip
                        label="Đã hoàn tất"
                        color="success"
                        size="small"
                        sx={{ ml: 2 }}
                        icon={<Check fontSize="small" />}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Đăng ký khuôn mặt giúp hệ thống điểm danh tự động và tăng
                    cường bảo mật. Cần chụp đủ {REQUIRED_IMAGES} ảnh rõ mặt,
                    không đeo kính, không đeo khẩu trang.
                  </Alert>
                  <FaceRegistrationComponent
                    onFaceDataCapture={handleFaceDataCapture}
                    requiredImages={REQUIRED_IMAGES}
                  />
                </AccordionDetails>
              </Accordion>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isSubmitting || !formData.role}
            >
              {isSubmitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Đăng ký"
              )}
            </Button>
            <Grid container justifyContent="flex-end">
              <Grid item>
                {/* <<< Sử dụng RouterLink >>> */}
                <Link component={RouterLink} to="/login" variant="body2">
                  Đã có tài khoản? Đăng nhập
                </Link>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default RegisterPage;
