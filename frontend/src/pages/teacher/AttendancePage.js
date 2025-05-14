import React, {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useCallback,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useSnackbar } from "notistack";
import axios from "axios";
import * as faceapi from "face-api.js";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Button,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Alert,
  AlertTitle,
  Tooltip,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from "@mui/material";
import {
  CameraAlt,
  Check,
  Close,
  Edit,
  Refresh,
  Save,
  VerifiedUser,
  HourglassEmpty,
  ArrowBack,
  Info,
  VideocamOff,
  PlayCircleOutline,
  StopCircleOutlined,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import {
  setModelLoaded as setFaceRecModelLoaded, // Rename to avoid conflict
  setCameraReady as setFaceRecCameraReady, // Rename to avoid conflict
  setDetectedFaces,
  setRecognizedStudents,
  clearRecognitionState,
  getClassFaceFeatures, // Correct thunk action name
  verifyAttendance,
  manualAttendance,
} from "../../redux/slices/faceRecognitionSlice"; // Fixed relative import path

// Lazy load Webcam
const Webcam = lazy(() => import("react-webcam"));

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Configuration Constants
const RECOGNITION_THRESHOLD = 0.4;
const DETECTION_THRESHOLD = 0.5;
const CONFIDENCE_THRESHOLD = 0.7;
const AUTO_DETECT_INTERVAL = 1500;
const FACE_DETECTION_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  scoreThreshold: DETECTION_THRESHOLD,
  inputSize: 320,
});
const MODEL_URL = "/models"; // Ensure models are in the public folder

// --- Helper Functions ---

// Function to load face recognition models
const loadFaceRecognitionModels = async (
  dispatch,
  enqueueSnackbar,
  closeSnackbar
) => {
  let loadingSnackbarKey = null; // Để lưu key của snackbar
  try {
    // Check if models are already loaded (using face-api internal state)
    if (
      faceapi.nets.tinyFaceDetector.isLoaded &&
      faceapi.nets.faceLandmark68Net.isLoaded &&
      faceapi.nets.faceRecognitionNet.isLoaded
      // Removed ssdMobilenetv1 check as TinyFaceDetector is preferred
    ) {
      dispatch(setFaceRecModelLoaded(true));
      return true;
    }

    loadingSnackbarKey = enqueueSnackbar("Đang tải mô hình nhận diện...", {
      variant: "info",
      autoHideDuration: null, // Giữ nguyên để nó không tự ẩn ban đầu
    });
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    if (loadingSnackbarKey) closeSnackbar(loadingSnackbarKey); // Đóng snackbar "Đang tải..."
    dispatch(setFaceRecModelLoaded(true));
    enqueueSnackbar("Tải mô hình nhận diện thành công", { variant: "success" });
    return true;
  } catch (error) {
    console.error("Lỗi khi tải mô hình:", error);
    if (loadingSnackbarKey) closeSnackbar(loadingSnackbarKey); // Đóng snackbar "Đang tải..." khi có lỗi
    enqueueSnackbar("Không thể tải mô hình nhận diện", { variant: "error" });
    dispatch(setFaceRecModelLoaded(false)); // Ensure state reflects failure
    return false;
  }
};

// Function to extract face descriptors from student data
const extractStudentDescriptors = (student) => {
  if (
    !student ||
    (!student.faceFeatures?.descriptors && !student.faceDescriptors)
  ) {
    return [];
  }

  const descriptors = [];
  const rawDescriptors =
    student.faceFeatures?.descriptors || student.faceDescriptors || [];

  const findDescriptors = (data) => {
    if (!data) return;
    if (Array.isArray(data)) {
      if (data.length === 128 && data.every((n) => typeof n === "number")) {
        descriptors.push(new Float32Array(data)); // Convert to Float32Array
      } else {
        data.forEach(findDescriptors); // Recursively search nested arrays
      }
    } else if (typeof data === "object" && data !== null) {
      // Handle potential object structures if necessary (though less common for raw descriptors)
      Object.values(data).forEach(findDescriptors);
    }
  };

  findDescriptors(rawDescriptors);
  return descriptors.filter((d) => d.length === 128); // Final validation
};

// --- React Component ---

const AttendancePage = () => {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  // Refs
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const autoModeIntervalRef = useRef(null);
  const landmarkIntervalRef = useRef(null);

  // Component State
  const [isLoading, setIsLoading] = useState(true);
  const [classInfo, setClassInfo] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [manualAttendanceData, setManualAttendanceData] = useState({
    note: "",
  });
  const [componentError, setComponentError] = useState(null); // For non-API errors

  // Redux State
  const { token } = useSelector((state) => state.auth);

  // Access faceRecognition state directly
  const {
    isModelLoaded,
    isCameraReady,
    detectedFaces,
    recognizedStudents,
    classStudents, // Assuming slice holds the relevant class students
    isProcessing,
    error: faceRecError, // Get error state
  } = useSelector((state) => state.faceRecognition);

  // --- Effects ---

  // Load initial data: class, session, logs, models, features
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setComponentError(null); // Clear previous errors
      try {
        // Fetch class, session, and log data in parallel
        const [classRes, sessionRes, logsRes] = await Promise.all([
          axios.get(`${API_URL}/classes/teaching/${classId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/attendance/sessions/${sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/attendance/logs/${sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const loadedSessionInfo = sessionRes.data.data;
        setClassInfo(classRes.data.data);
        setSessionInfo(loadedSessionInfo);
        setAttendanceLogs(logsRes.data.data);

        // Nếu phiên đã hoàn thành, không cần tải mô hình nhận dạng
        const isSessionCompleted = loadedSessionInfo?.status === "completed";

        if (isSessionCompleted) {
          // Không cần tải mô hình và đặc trưng khuôn mặt nếu phiên đã hoàn thành
          setIsLoading(false);
          return;
        }

        // Load models if not already loaded
        if (!isModelLoaded) {
          // Capture the return value indicating success/failure
          const modelsLoadedSuccessfully = await loadFaceRecognitionModels(
            dispatch,
            enqueueSnackbar,
            closeSnackbar
          );
          // Check if model loading failed using the return value
          if (!modelsLoadedSuccessfully) {
            // Use the return value here
            throw new Error("Failed to load face recognition models.");
          }
          // No need to check isModelLoaded from state again here
        }

        // Fetch face features only if session is not completed and models are loaded
        if (!isSessionCompleted && isModelLoaded) {
          await dispatch(getClassFaceFeatures(classId)).unwrap();
        }
      } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        const errMsg =
          error.response?.data?.message ||
          error.message ||
          "Lỗi khi tải dữ liệu";
        enqueueSnackbar(errMsg, { variant: "error" });
        setComponentError(errMsg); // Set component-level error for UI display
      } finally {
        setIsLoading(false);
      }
    };
    loadData();

    // Cleanup function
    return () => {
      dispatch(clearRecognitionState()); // Clear face-rec state on unmount
      clearInterval(autoModeIntervalRef.current);
      clearInterval(landmarkIntervalRef.current);
      // Stop camera stream if active
      webcamRef.current?.video?.srcObject
        ?.getTracks()
        .forEach((track) => track.stop());
    };
    // Ensure isModelLoaded is a dependency to refetch features if model loads later
  }, [
    classId,
    sessionId,
    token,
    dispatch,
    enqueueSnackbar,
    closeSnackbar,
    isModelLoaded,
  ]);

  // Effect to start/stop landmark detection interval
  useEffect(() => {
    if (isCameraReady && showLandmarks && !isAutoMode) {
      // Only draw landmarks in manual mode when enabled
      startLandmarkDetection();
    } else {
      stopLandmarkDetection();
      // Clear canvas when landmarks are off or in auto mode
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    // Cleanup interval on change
    return () => stopLandmarkDetection();
  }, [isCameraReady, showLandmarks, isAutoMode]); // Dependencies

  // --- Camera Handling ---

  const handleUserMedia = useCallback(
    (stream) => {
      // console.log("Camera đã được cấp quyền và khởi tạo:", stream.id);
      dispatch(setFaceRecCameraReady(true));
      setComponentError(null); // Clear camera errors
    },
    [dispatch]
  );

  const handleUserMediaError = useCallback(
    (error) => {
      console.error("Lỗi khi truy cập camera:", error);
      const errMsg = `Không thể truy cập camera: ${
        error.name === "NotAllowedError"
          ? "Bạn chưa cấp quyền truy cập camera"
          : error.name === "NotFoundError"
          ? "Không tìm thấy thiết bị camera"
          : error.message || "Lỗi không xác định"
      }`;
      enqueueSnackbar(errMsg, { variant: "error" });
      dispatch(setFaceRecCameraReady(false));
      setComponentError(errMsg);
    },
    [dispatch, enqueueSnackbar]
  );

  // --- Face Detection & Recognition Logic ---

  const drawLandmarks = useCallback(
    (detections, recognizedData = []) => {
      if (!canvasRef.current || !webcamRef.current?.video) return;

      const video = webcamRef.current.video;
      const canvas = canvasRef.current;
      const displaySize = {
        width: video.videoWidth,
        height: video.videoHeight,
      };
      faceapi.matchDimensions(canvas, displaySize);

      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      resizedDetections.forEach((detection, i) => {
        // Validate detection and box before drawing
        if (!detection || !detection.detection || !detection.detection.box) {
          console.warn(
            "Skipping drawing for invalid detection object:",
            detection
          );
          return; // Skip this detection
        }

        const box = detection.detection.box;

        // Further validate box properties
        if (
          box.x == null ||
          box.y == null ||
          box.width == null ||
          box.height == null ||
          box.width <= 0 ||
          box.height <= 0
        ) {
          console.warn("Skipping drawing for invalid box properties:", box);
          return; // Skip this detection
        }

        const landmarks = detection.landmarks;
        const recognized = recognizedData.find(
          (rec) => rec.detectionIndex === i
        ); // Match recognition result

        // Draw box
        const boxColor = recognized
          ? recognized.confidence > CONFIDENCE_THRESHOLD
            ? "#4CAF50"
            : "#FFC107"
          : "#2196F3"; // Green if high confidence, Yellow if medium, Blue if just detected
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Draw label background
        const label = recognized
          ? `${recognized.name} (${(recognized.confidence * 100).toFixed(1)}%)`
          : "Đang nhận diện...";
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(box.x, box.y - 20, textWidth + 10, 20);

        // Draw label text
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "14px Arial";
        ctx.fillText(label, box.x + 5, box.y - 5);

        // Draw landmarks if enabled
        if (showLandmarks && landmarks) {
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections); // Use face-api's drawing utility
        }
      });
    },
    [showLandmarks]
  ); // Dependency on showLandmarks

  const detectAndRecognizeFaces = useCallback(
    async (recognize = true) => {
      if (
        !isCameraReady ||
        !webcamRef.current?.video ||
        webcamRef.current.video.readyState !== 4 ||
        !isModelLoaded
      ) {
        return null; // Return null if detection can't proceed
      }

      const video = webcamRef.current.video;

      try {
        let faceData;
        if (recognize) {
          // Detect faces, landmarks, and descriptors for recognition
          faceData = await faceapi
            .detectAllFaces(video, FACE_DETECTION_OPTIONS)
            .withFaceLandmarks()
            .withFaceDescriptors();
        } else {
          // Only detect faces and landmarks (for drawing)
          faceData = await faceapi
            .detectAllFaces(video, FACE_DETECTION_OPTIONS)
            .withFaceLandmarks();
        }

        dispatch(setDetectedFaces(faceData)); // Update detected faces in Redux

        if (!faceData || faceData.length === 0) {
          // Clear canvas if no faces detected
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            ctx.clearRect(
              0,
              0,
              canvasRef.current.width,
              canvasRef.current.height
            );
          }
          dispatch(setRecognizedStudents([])); // Clear recognized students
          return null;
        }

        // --- Recognition Logic (if recognize === true) ---
        let recognizedData = [];
        if (recognize && classStudents && classStudents.length > 0) {
          const labeledDescriptors = classStudents
            .map((student) => {
              const descriptors = extractStudentDescriptors(student);
              if (descriptors.length > 0) {
                return new faceapi.LabeledFaceDescriptors(
                  student._id,
                  descriptors
                ); // Use student ID as label
              }
              return null;
            })
            .filter((ld) => ld !== null); // Filter out students with no descriptors

          if (labeledDescriptors.length > 0) {
            const faceMatcher = new faceapi.FaceMatcher(
              labeledDescriptors,
              RECOGNITION_THRESHOLD
            );

            recognizedData = faceData
              .map((fd, index) => {
                const bestMatch = faceMatcher.findBestMatch(fd.descriptor);
                const student = classStudents.find(
                  (s) => s._id === bestMatch.label
                ); // Find student by ID label
                return {
                  detectionIndex: index, // Link recognition to detection
                  studentId: student?._id,
                  name: student?.full_name || "Không rõ",
                  confidence: 1 - bestMatch.distance, // Convert distance to confidence-like score
                  isUnknown: bestMatch.label === "unknown",
                };
              })
              .filter((r) => !r.isUnknown); // Filter out unknown matches

            dispatch(setRecognizedStudents(recognizedData)); // Update recognized students in Redux
          } else {
            dispatch(setRecognizedStudents([])); // Clear if no labeled descriptors
          }
        }

        // Draw landmarks and boxes with recognition info
        drawLandmarks(faceData, recognizedData);

        return { detections: faceData, recognized: recognizedData }; // Return both detection and recognition results
      } catch (error) {
        console.error("Lỗi khi phát hiện/nhận diện khuôn mặt:", error);
        enqueueSnackbar("Lỗi trong quá trình xử lý khuôn mặt", {
          variant: "error",
        });
        // Clear canvas on error
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }
        dispatch(setDetectedFaces([]));
        dispatch(setRecognizedStudents([]));
        return null;
      }
    },
    [
      isCameraReady,
      isModelLoaded,
      classStudents,
      drawLandmarks,
      dispatch,
      enqueueSnackbar,
    ]
  );

  // --- Manual Actions ---

  // Handle manual capture & recognize button click
  const handleManualCapture = async () => {
    if (isProcessing) return; // Prevent multiple clicks

    const result = await detectAndRecognizeFaces(true); // Perform full detection and recognition

    if (result && result.recognized.length > 0) {
      const topMatch = result.recognized.sort(
        (a, b) => b.confidence - a.confidence
      )[0];
      enqueueSnackbar(
        `Đã nhận diện: ${topMatch.name} (${(topMatch.confidence * 100).toFixed(
          1
        )}%)`,
        { variant: "info" }
      );
      // Optionally, automatically mark attendance if confidence is high enough
      if (topMatch.confidence >= CONFIDENCE_THRESHOLD) {
        // Find the corresponding descriptor
        const descriptor =
          result.detections[topMatch.detectionIndex]?.descriptor;
        if (descriptor) {
          handleMarkAttendance(
            topMatch.studentId,
            topMatch.confidence,
            descriptor
          );
        } else {
          console.warn("Không tìm thấy descriptor cho top match", topMatch);
          enqueueSnackbar(
            "Lỗi: Không thể lấy đặc trưng khuôn mặt để điểm danh.",
            { variant: "warning" }
          );
        }
      }
    } else if (result && result.detections.length > 0) {
      enqueueSnackbar(
        "Phát hiện khuôn mặt nhưng không nhận diện được sinh viên nào",
        { variant: "warning" }
      );
    } else {
      enqueueSnackbar("Không phát hiện khuôn mặt nào", { variant: "warning" });
    }
  };

  // Open manual attendance dialog
  const openManualAttendanceDialog = (student) => {
    if (!student) return;
    setSelectedStudent(student);
    setManualAttendanceData({ note: "" }); // Chỉ cần reset note
    setManualDialogOpen(true);
  };

  // Close manual attendance dialog
  const handleManualDialogClose = () => {
    setManualDialogOpen(false);
    setSelectedStudent(null);
  };

  // Handle manual attendance form change (chỉ còn note)
  const handleManualAttendanceChange = (e) => {
    setManualAttendanceData({
      ...manualAttendanceData,
      [e.target.name]: e.target.value,
    });
  };

  // Handle manual attendance submission
  const handleManualAttendanceSubmit = async () => {
    if (!selectedStudent || isProcessing) return;

    try {
      // Chỉ gửi sessionId, studentId và note
      const result = await dispatch(
        manualAttendance({
          sessionId,
          studentId: selectedStudent._id,
          // status: manualAttendanceData.status, // Bỏ status
          note: manualAttendanceData.note,
        })
      ).unwrap();

      // Update local attendance logs immediately for better UX
      setAttendanceLogs((prevLogs) => {
        const existingLogIndex = prevLogs.findIndex(
          (log) => log.student_id?._id === selectedStudent._id
        );
        // Đảm bảo log mới có status là 'present'
        const newLogData = {
          ...result.data,
          status: "present",
          student_id: selectedStudent,
        };

        if (existingLogIndex > -1) {
          const updatedLogs = [...prevLogs];
          updatedLogs[existingLogIndex] = newLogData;
          return updatedLogs;
        } else {
          return [...prevLogs, newLogData];
        }
      });

      enqueueSnackbar(
        `Đã điểm danh thủ công (Có mặt) cho ${selectedStudent.full_name}`,
        { variant: "success" }
      );
      handleManualDialogClose();
      // Optionally refetch session info if needed
      // fetchSessionInfo();
    } catch (error) {
      console.error("Lỗi khi điểm danh thủ công:", error);
      enqueueSnackbar(error.message || "Lỗi khi điểm danh thủ công", {
        variant: "error",
      });
    }
  };

  // Mark attendance (used by both manual and auto modes)
  const handleMarkAttendance = useCallback(
    async (studentId, confidence, faceDescriptor) => {
      if (!studentId || isProcessing) return;

      // Check if student already marked present
      const isAlreadyPresent = attendanceLogs.some(
        (log) => log.student_id?._id === studentId && log.status === "present"
      );
      if (isAlreadyPresent) {
        return; // Don't mark again if already present
      }

      const student = classStudents.find((s) => s._id === studentId);
      if (!student) {
        console.warn("Student not found for marking attendance:", studentId);
        return;
      }

      // Capture image for proof (optional, but good practice)
      let imageBase64 = null;
      try {
        if (webcamRef.current) {
          imageBase64 = webcamRef.current.getScreenshot({
            width: 320,
            height: 240,
          }); // Smaller screenshot
        }
      } catch (screenshotError) {
        console.error("Error taking screenshot:", screenshotError);
        // Proceed without image if screenshot fails
      }

      try {
        const result = await dispatch(
          verifyAttendance({
            sessionId,
            studentId,
            faceDescriptor, // Pass the received descriptor
            confidence,
            imageBase64,
            recognized: true, // Mark as recognized by the system
          })
        ).unwrap();

        // Update local attendance logs
        setAttendanceLogs((prevLogs) => {
          const existingLogIndex = prevLogs.findIndex(
            (log) => log.student_id?._id === studentId
          );
          const newLog = { ...result.data, student_id: student }; // Use the found student data
          if (existingLogIndex > -1) {
            const updatedLogs = [...prevLogs];
            updatedLogs[existingLogIndex] = newLog;
            return updatedLogs;
          } else {
            return [...prevLogs, newLog];
          }
        });

        enqueueSnackbar(`Đã điểm danh cho ${student.full_name}`, {
          variant: "success",
        });
      } catch (error) {
        console.error("Lỗi khi xác nhận điểm danh:", error);
        enqueueSnackbar(error.message || "Lỗi khi xác nhận điểm danh", {
          variant: "error",
        });
      }
    },
    [
      dispatch,
      sessionId,
      classStudents,
      attendanceLogs,
      isProcessing,
      enqueueSnackbar,
    ]
  ); // Added dependencies

  // --- Auto Mode ---

  const startAutoAttendance = useCallback(() => {
    if (
      !isCameraReady ||
      !isModelLoaded ||
      !classStudents ||
      classStudents.length === 0
    ) {
      enqueueSnackbar(
        "Camera, mô hình, hoặc danh sách sinh viên chưa sẵn sàng cho chế độ tự động.",
        { variant: "warning" }
      );
      return;
    }
    stopAutoAttendance(); // Clear any existing interval first
    setIsAutoMode(true);
    enqueueSnackbar("Bật chế độ tự động điểm danh", { variant: "info" });

    autoModeIntervalRef.current = setInterval(async () => {
      const result = await detectAndRecognizeFaces(true); // Detect and recognize

      if (result && result.recognized.length > 0) {
        // Process recognized students
        result.recognized.forEach((rec) => {
          // Check if confidence meets or exceeds the threshold
          if (rec.confidence >= CONFIDENCE_THRESHOLD && rec.studentId) {
            // Find the corresponding descriptor
            const descriptor =
              result.detections[rec.detectionIndex]?.descriptor;
            if (descriptor) {
              handleMarkAttendance(rec.studentId, rec.confidence, descriptor); // Attempt to mark attendance
            } else {
              console.warn(
                "Không tìm thấy descriptor cho recognized student trong auto mode",
                rec
              );
            }
          }
        });
      }
    }, AUTO_DETECT_INTERVAL);
  }, [
    isCameraReady,
    isModelLoaded,
    classStudents,
    detectAndRecognizeFaces,
    handleMarkAttendance,
    enqueueSnackbar,
  ]); // Added dependencies

  const stopAutoAttendance = useCallback(() => {
    clearInterval(autoModeIntervalRef.current);
    autoModeIntervalRef.current = null;
    setIsAutoMode(false);
    dispatch(setRecognizedStudents([])); // Clear recognized students when stopping auto mode
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    enqueueSnackbar("Tắt chế độ tự động điểm danh", { variant: "info" });
  }, [dispatch, enqueueSnackbar]);

  // --- Landmark Detection Interval ---
  const startLandmarkDetection = useCallback(() => {
    stopLandmarkDetection(); // Clear existing interval
    landmarkIntervalRef.current = setInterval(async () => {
      // Only detect, don't recognize fully to save resources
      await detectAndRecognizeFaces(false);
    }, 100); // Detect landmarks frequently for smooth drawing
  }, [detectAndRecognizeFaces]); // Dependency

  const stopLandmarkDetection = useCallback(() => {
    clearInterval(landmarkIntervalRef.current);
    landmarkIntervalRef.current = null;
  }, []);

  // --- Other Actions ---

  const completeSession = async () => {
    if (isProcessing) return;
    try {
      // Lấy danh sách sinh viên vắng mặt từ UI
      const absentStudentIds = absentStudents.map((student) => student._id);

      enqueueSnackbar("Đang kết thúc phiên...", { variant: "info" });

      await axios.put(
        `${API_URL}/attendance/sessions/${sessionId}`,
        {
          status: "completed",
          students_absent: absentStudentIds,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      enqueueSnackbar("Phiên điểm danh đã kết thúc", { variant: "success" });
      setSessionInfo((prev) => ({ ...prev, status: "completed" }));
      stopAutoAttendance();
    } catch (error) {
      console.error("Lỗi khi kết thúc phiên:", error);
      enqueueSnackbar(
        error.response?.data?.message || "Lỗi khi kết thúc phiên",
        { variant: "error" }
      );
    }
  };

  const refreshAttendanceLogs = async () => {
    if (isProcessing) return;
    try {
      enqueueSnackbar("Đang làm mới dữ liệu...", { variant: "info" });
      const [logsRes, sessionRes] = await Promise.all([
        axios.get(`${API_URL}/attendance/logs/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/attendance/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setAttendanceLogs(logsRes.data.data);
      setSessionInfo(sessionRes.data.data);
      enqueueSnackbar("Đã làm mới dữ liệu", { variant: "success" });
    } catch (error) {
      console.error("Lỗi khi làm mới dữ liệu:", error);
      enqueueSnackbar(
        error.response?.data?.message || "Lỗi khi làm mới dữ liệu",
        { variant: "error" }
      );
    }
  };

  const toggleLandmarks = () => {
    setShowLandmarks((prev) => !prev);
  };

  // --- Derived State ---
  const presentStudents = attendanceLogs.filter(
    (log) => log.status === "present"
  );
  const absentStudents =
    classInfo?.students?.filter(
      (student) =>
        !attendanceLogs.some(
          (log) =>
            log.student_id?._id === student._id &&
            (log.status === "present" || log.status === "late")
        ) // Consider late as not absent
    ) || [];
  const totalStudents = classInfo?.students?.length || 0;
  const sessionCompleted = sessionInfo?.status === "completed";

  // --- Render Logic ---

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="80vh"
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Đang tải dữ liệu điểm danh...</Typography>
      </Box>
    );
  }

  if (componentError && !isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => window.location.reload()}
            >
              Tải lại trang
            </Button>
          }
        >
          <AlertTitle>Đã xảy ra lỗi</AlertTitle>
          {componentError}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2.5}
        pb={2}
        borderBottom="1px solid #eaeaea"
      >
        <Box>
          <Typography variant="h5" fontWeight={500}>
            Điểm Danh - {classInfo?.class_name}
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            Buổi {sessionInfo?.session_number} -{" "}
            {sessionInfo?.date
              ? new Date(sessionInfo.date).toLocaleDateString("vi-VN")
              : "N/A"}
            <Chip
              label={sessionInfo?.status || "N/A"}
              color={sessionCompleted ? "default" : "success"}
              size="small"
              sx={{ ml: 1 }}
            />
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate(`/teacher/classes/${classId}`)}
        >
          Quay lại lớp
        </Button>
      </Box>

      {sessionCompleted && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Phiên điểm danh này đã kết thúc. Bạn chỉ có thể xem lại kết quả.
        </Alert>
      )}

      {faceRecError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Lỗi từ hệ thống nhận diện: {faceRecError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left Column: Camera and Controls */}
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: "10px", boxShadow: 3, overflow: "hidden" }}>
            <CardContent
              sx={{
                bgcolor: "#f8f9fa",
                borderBottom: "1px solid #eaeaea",
                p: 2,
              }}
            >
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  variant="h6"
                  fontWeight={500}
                  display="flex"
                  alignItems="center"
                >
                  <CameraAlt sx={{ mr: 1, color: "primary.main" }} /> Camera
                </Typography>
                {!sessionCompleted &&
                  isModelLoaded && ( // Show controls only if session active and model loaded
                    <Box>
                      <Tooltip
                        title={
                          isAutoMode
                            ? "Dừng chế độ tự động"
                            : "Bắt đầu chế độ tự động"
                        }
                      >
                        <IconButton
                          onClick={
                            isAutoMode
                              ? stopAutoAttendance
                              : startAutoAttendance
                          }
                          color={isAutoMode ? "error" : "primary"}
                          disabled={!isCameraReady}
                        >
                          {isAutoMode ? (
                            <StopCircleOutlined />
                          ) : (
                            <PlayCircleOutline />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip
                        title={showLandmarks ? "Ẩn Landmark" : "Hiện Landmark"}
                      >
                        <IconButton
                          onClick={toggleLandmarks}
                          color="secondary"
                          disabled={!isCameraReady || isAutoMode}
                        >
                          {showLandmarks ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
              </Box>
            </CardContent>

            {/* Camera Display Area */}
            <Box
              sx={{
                position: "relative",
                width: "100%",
                aspectRatio: "640 / 480",
                backgroundColor: "#000",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {sessionCompleted ? (
                <Box textAlign="center" color="white" p={4}>
                  <Info sx={{ fontSize: 60, mb: 2 }} />
                  <Typography variant="h6">
                    Phiên điểm danh đã kết thúc
                  </Typography>
                  <Typography variant="body2" mt={1}>
                    Bạn có thể xem kết quả điểm danh ở danh sách bên phải
                  </Typography>
                </Box>
              ) : !isModelLoaded ? (
                <Box textAlign="center" color="white">
                  <CircularProgress color="inherit" />
                  <Typography>Đang tải mô hình nhận diện...</Typography>
                </Box>
              ) : (
                <Suspense
                  fallback={
                    <Box textAlign="center" color="white">
                      <CircularProgress color="inherit" />
                      <Typography>Đang khởi tạo camera...</Typography>
                    </Box>
                  }
                >
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width="100%"
                    height="100%"
                    videoConstraints={{
                      width: 640,
                      height: 480,
                      facingMode: "user",
                    }}
                    style={{
                      display: "block",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onUserMedia={handleUserMedia}
                    onUserMediaError={handleUserMediaError}
                  />
                </Suspense>
              )}

              {/* Canvas for Overlays - chỉ hiển thị nếu phiên chưa kết thúc */}
              {!sessionCompleted && (
                <canvas
                  ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 10,
                  }}
                />
              )}

              {/* Camera Error/Loading Overlay */}
              {(!isCameraReady || componentError?.includes("camera")) &&
                !sessionCompleted && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      backgroundColor: "rgba(0,0,0,0.7)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      color: "white",
                      zIndex: 20,
                    }}
                  >
                    <VideocamOff sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">Camera không khả dụng</Typography>
                    <Typography
                      variant="body2"
                      sx={{ mt: 1, px: 2, textAlign: "center" }}
                    >
                      {componentError ||
                        "Không thể kết nối camera. Vui lòng kiểm tra quyền truy cập và thiết bị."}
                    </Typography>
                    <Button
                      variant="outlined"
                      color="inherit"
                      sx={{ mt: 2 }}
                      onClick={() => window.location.reload()}
                    >
                      Thử lại
                    </Button>
                  </Box>
                )}
              {/* Auto Mode Indicator */}
              {isAutoMode && isCameraReady && (
                <Chip
                  label="Đang tự động điểm danh"
                  color="success"
                  size="small"
                  sx={{
                    position: "absolute",
                    bottom: 10,
                    right: 10,
                    zIndex: 15,
                  }}
                />
              )}
            </Box>

            {/* Action Buttons */}
            {!sessionCompleted && isCameraReady && isModelLoaded && (
              <Box
                display="flex"
                justifyContent="space-between"
                p={2}
                bgcolor="#f8f9fa"
                borderTop="1px solid #eaeaea"
              >
                <Button
                  variant="contained"
                  onClick={handleManualCapture}
                  startIcon={
                    isProcessing ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <CameraAlt />
                    )
                  }
                  disabled={isProcessing || isAutoMode}
                >
                  Chụp & Nhận diện
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={completeSession}
                  startIcon={<Save />}
                  disabled={isProcessing}
                >
                  Kết thúc phiên
                </Button>
              </Box>
            )}
          </Card>

          {/* Recognized Students Preview (Optional) */}
          {recognizedStudents.length > 0 && !isAutoMode && (
            <Card sx={{ mt: 2, borderRadius: "10px", boxShadow: 1 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="500" mb={1}>
                  Đã nhận diện gần đây
                </Typography>
                <Grid container spacing={1}>
                  {recognizedStudents.slice(0, 4).map(
                    (
                      rec,
                      index // Show max 4
                    ) => (
                      <Grid
                        item
                        xs={6}
                        sm={3}
                        key={`${rec.studentId}-${index}`}
                      >
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1,
                            textAlign: "center",
                            border: "1px solid #eee",
                          }}
                        >
                          <Typography variant="caption" display="block" noWrap>
                            {rec.name}
                          </Typography>
                          <Chip
                            label={`${(rec.confidence * 100).toFixed(0)}%`}
                            size="small"
                            color={
                              rec.confidence > CONFIDENCE_THRESHOLD
                                ? "success"
                                : "warning"
                            }
                            sx={{ mt: 0.5 }}
                          />
                        </Paper>
                      </Grid>
                    )
                  )}
                </Grid>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right Column: Student Lists */}
        <Grid item xs={12} md={4}>
          {/* Present Students */}
          <Card sx={{ mb: 3, borderRadius: "10px", boxShadow: 3 }}>
            <CardContent>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={1}
              >
                <Typography variant="h6" display="flex" alignItems="center">
                  <Check sx={{ mr: 1, color: "success.main" }} /> Có mặt (
                  {presentStudents.length}/{totalStudents})
                </Typography>
                <Tooltip title="Làm mới danh sách">
                  <IconButton
                    size="small"
                    onClick={refreshAttendanceLogs}
                    disabled={isProcessing}
                  >
                    <Refresh />
                  </IconButton>
                </Tooltip>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Box sx={{ maxHeight: "300px", overflow: "auto", pr: 1 }}>
                {presentStudents.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    align="center"
                    sx={{ py: 2 }}
                  >
                    Tất cả sinh viên đã có mặt.
                  </Typography>
                ) : (
                  <List dense>
                    {presentStudents
                      .sort(
                        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                      ) // Sort by time desc
                      .map((log) => (
                        // Simplified ListItem for debugging
                        <ListItem key={log._id}>
                          <ListItemText
                            primary={
                              log.student_id?.full_name ||
                              `Log ID: ${log._id} (Tên bị thiếu)`
                            }
                            secondary={`Trạng thái: ${log.status} - ${new Date(
                              log.timestamp
                            ).toLocaleTimeString("vi-VN")}`}
                          />
                        </ListItem>
                      ))}
                  </List>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Absent Students */}
          <Card sx={{ borderRadius: "10px", boxShadow: 3 }}>
            <CardContent>
              <Typography
                variant="h6"
                display="flex"
                alignItems="center"
                mb={1}
              >
                <Close sx={{ mr: 1, color: "error.main" }} /> Vắng mặt (
                {absentStudents.length}/{totalStudents})
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <Box sx={{ maxHeight: "300px", overflow: "auto", pr: 1 }}>
                {absentStudents.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    align="center"
                    sx={{ py: 2 }}
                  >
                    Tất cả sinh viên đã có mặt.
                  </Typography>
                ) : (
                  <List dense>
                    {absentStudents.map((student) => (
                      // Keep absent list detailed for now
                      <ListItem
                        key={student._id}
                        disablePadding
                        sx={{ mb: 0.5 }}
                        secondaryAction={
                          !sessionCompleted ? (
                            <Tooltip title="Điểm danh thủ công">
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() =>
                                  openManualAttendanceDialog(student)
                                }
                                disabled={isProcessing}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : null
                        }
                      >
                        <Paper
                          variant="outlined"
                          sx={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            p: 0.5,
                            borderRadius: "4px",
                          }}
                        >
                          <ListItemAvatar sx={{ minWidth: 45 }}>
                            <Avatar
                              alt={student.full_name}
                              src={student.avatar_url}
                              sx={{ width: 32, height: 32 }}
                            />
                          </ListItemAvatar>
                          <ListItemText
                            primary={
                              <Typography variant="body2" noWrap>
                                {student.full_name}
                              </Typography>
                            }
                            secondary={
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {student.school_info?.student_id || "N/A"}
                              </Typography>
                            }
                          />
                        </Paper>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Manual Attendance Dialog */}
      <Dialog
        open={manualDialogOpen}
        onClose={handleManualDialogClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Điểm danh thủ công (Ghi nhận Có mặt)</DialogTitle>
        <DialogContent>
          {selectedStudent && (
            <Box display="flex" alignItems="center" mb={2}>
              <Avatar
                src={selectedStudent.avatar_url}
                alt={selectedStudent.full_name}
                sx={{ width: 48, height: 48, mr: 2 }}
              />
              <Box>
                <Typography variant="subtitle1">
                  {selectedStudent.full_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  MSSV: {selectedStudent.school_info?.student_id || "N/A"}
                </Typography>
              </Box>
            </Box>
          )}
          <TextField
            fullWidth
            margin="normal"
            name="note"
            label="Ghi chú (tùy chọn)"
            value={manualAttendanceData.note}
            onChange={handleManualAttendanceChange}
            multiline
            rows={2}
            placeholder="Nhập lý do điểm danh thủ công (nếu có)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleManualDialogClose}>Hủy</Button>
          <Button
            onClick={handleManualAttendanceSubmit}
            variant="contained"
            color="primary"
            disabled={isProcessing}
          >
            Xác nhận Có mặt
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AttendancePage;
