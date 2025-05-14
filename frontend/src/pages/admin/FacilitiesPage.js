import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSnackbar } from "notistack";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Card,
  Chip,
  Tooltip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Container,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  Search,
  Refresh,
  Room,
  Domain,
  ArrowBack,
  LocationOn,
} from "@mui/icons-material";
import {
  fetchBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  fetchRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  fetchAllCampuses,
  createCampus,
  updateCampus,
  deleteCampus,
  setSelectedCampus,
  setSelectedBuilding,
} from "../../redux/slices/facilitySlice";
import { toast } from "react-hot-toast";
import axiosInstance from "../../utils/axios";

// Các giá trị mặc định cho form
const defaultCampusFormData = {
  name: "",
  code: "",
  address: "",
  status: "active",
};

const defaultBuildingFormData = {
  name: "",
  code: "",
  campus_id: "",
  floors_count: 1,
  year_built: new Date().getFullYear(),
  status: "active",
  facilities: [],
  image_url: "",
};

const defaultRoomFormData = {
  _id: "",
  room_number: "",
  building_id: "",
  floor: "1",
  capacity: "0",
  room_type: "lecture",
  status: "available",
  equipment: [],
};

// Danh sách tiện ích có sẵn
const availableEquipment = [
  { id: "projector", label: "Máy chiếu" },
  { id: "air_conditioner", label: "Máy lạnh" },
  { id: "computer", label: "Máy tính" },
  { id: "tv", label: "TV" },
  { id: "sound_system", label: "Hệ thống âm thanh" },
  { id: "whiteboard", label: "Bảng trắng" },
  { id: "wifi", label: "WiFi" },
];

// Room types và status hợp lệ
const roomTypes = [
  { value: "lecture", label: "Phòng học" },
  { value: "lab", label: "Phòng thực hành" },
  { value: "office", label: "Phòng làm việc" },
  { value: "meeting", label: "Phòng họp" },
];

const roomStatuses = [
  { value: "available", label: "Hoạt động" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "unavailable", label: "Không hoạt động" },
];

// Danh sách tiện ích tòa nhà
const buildingFacilities = [
  { id: "elevator", label: "Thang máy" },
  { id: "parking", label: "Bãi đỗ xe" },
  { id: "security", label: "Bảo vệ 24/7" },
  { id: "cafeteria", label: "Căn tin" },
  { id: "disabled_access", label: "Lối đi cho người khuyết tật" },
  { id: "wifi", label: "WiFi" },
  { id: "backup_power", label: "Nguồn điện dự phòng" },
];

const FacilitiesPage = () => {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();

  // Lấy trạng thái từ Redux
  const {
    campuses,
    buildings,
    rooms,
    selectedCampus,
    selectedBuilding,
    isLoading,
    buildingPagination,
    roomPagination,
  } = useSelector((state) => state.facility);

  // States cho tabs
  const [tabValue, setTabValue] = useState(0);

  // State cho form submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quản lý cơ sở (Campuses)
  const [localCampusList, setLocalCampusList] = useState([]);
  const [campusSearchTerm, setCampusSearchTerm] = useState("");
  const [campusPage, setCampusPage] = useState(0);
  const [campusRowsPerPage, setCampusRowsPerPage] = useState(10);

  // Quản lý tòa nhà (Buildings)
  const [buildingSearchTerm, setBuildingSearchTerm] = useState("");
  const [buildingPage, setBuildingPage] = useState(0);
  const [buildingRowsPerPage, setBuildingRowsPerPage] = useState(10);

  // Quản lý phòng học (Rooms)
  const [roomSearchTerm, setRoomSearchTerm] = useState("");
  const [roomPage, setRoomPage] = useState(0);
  const [roomRowsPerPage, setRoomRowsPerPage] = useState(10);

  // States cho dialogs cơ sở
  const [campusDialogOpen, setCampusDialogOpen] = useState(false);
  const [campusDialogMode, setCampusDialogMode] = useState("add");
  const [campusFormData, setCampusFormData] = useState(defaultCampusFormData);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // States cho dialogs tòa nhà
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [buildingDialogMode, setBuildingDialogMode] = useState("add");
  const [buildingFormData, setBuildingFormData] = useState(
    defaultBuildingFormData
  );

  // States cho dialogs phòng học
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomDialogMode, setRoomDialogMode] = useState("add");
  const [roomFormData, setRoomFormData] = useState(defaultRoomFormData);

  // States cho dialogs xóa
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogType, setDeleteDialogType] = useState("building");
  const [itemToDelete, setItemToDelete] = useState(null);

  // Selectors cho dữ liệu từ Redux store
  const campusesData = useMemo(() => {
    if (!campuses) return [];
    return Array.isArray(campuses) ? campuses : campuses.data || [];
  }, [campuses]);

  const totalCampusItems = useMemo(() => {
    if (!campuses) return 0;
    return campuses.total || campuses.length || 0;
  }, [campuses]);

  // Fetch data khi component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        await dispatch(fetchAllCampuses({}));
        await fetchCampusList();
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Fetch campuses từ API khi tìm kiếm
  useEffect(() => {
    if (campusSearchTerm !== undefined) {
      const delaySearch = setTimeout(() => {
        dispatch(
          fetchAllCampuses({
            limit: 100,
            search: campusSearchTerm,
          })
        );
      }, 500);

      return () => clearTimeout(delaySearch);
    }
  }, [dispatch, campusSearchTerm]);

  // Load dữ liệu campus
  const loadCampuses = useCallback(() => {
    dispatch(
      fetchAllCampuses({
        page: 1,
        limit: 100,
        search: campusSearchTerm,
      })
    );
  }, [dispatch, campusSearchTerm]);

  // Fetch buildings với phân trang và tìm kiếm
  const loadBuildings = useCallback(() => {
    const params = {
      page: buildingPage + 1,
      limit: buildingRowsPerPage,
    };

    if (buildingSearchTerm) {
      params.search = buildingSearchTerm;
    }

    if (selectedCampus?._id) {
      params.campus_id = selectedCampus._id;
    }

    dispatch(fetchBuildings(params));
  }, [
    dispatch,
    buildingPage,
    buildingRowsPerPage,
    buildingSearchTerm,
    selectedCampus,
  ]);

  // Fetch rooms với phân trang và tìm kiếm
  const loadRooms = useCallback(() => {
    const params = {
      page: roomPage + 1,
      limit: roomRowsPerPage,
    };

    if (roomSearchTerm) {
      params.search = roomSearchTerm;
    }

    if (selectedBuilding?._id) {
      params.building_id = selectedBuilding._id;
    }

    dispatch(fetchRooms(params));
  }, [dispatch, roomPage, roomRowsPerPage, roomSearchTerm, selectedBuilding]);

  // Chạy loadBuildings khi tham số thay đổi
  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);

  // Chạy loadRooms khi tham số thay đổi
  useEffect(() => {
    if (selectedBuilding) {
      loadRooms();
    }
  }, [loadRooms, selectedBuilding]);

  // Fetch danh sách campuses cho dropdown
  const fetchCampusList = useCallback(async () => {
    try {
      const response = await axiosInstance.get(
        "/facilities/campuses?limit=100"
      );
      setLocalCampusList(response.data.data);
    } catch (error) {
      console.error("Lỗi khi tải danh sách cơ sở:", error);
      toast.error("Không thể tải danh sách cơ sở cho dropdown");
    }
  }, []);

  // Chạy fetchCampusList khi component mount
  useEffect(() => {
    fetchCampusList();
  }, [fetchCampusList]);

  // Handlers cho tabs
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    // Tải dữ liệu theo tab
    if (newValue === 0) {
      loadCampuses();
    } else if (newValue === 1) {
      loadBuildings();
    } else if (newValue === 2) {
      loadRooms();
    }
  };

  // Xử lý tìm kiếm campus
  const handleCampusSearchChange = (e) => {
    setCampusSearchTerm(e.target.value);
    // Debounce search
    clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      dispatch(
        fetchAllCampuses({
          page: 1,
          limit: 100,
          search: e.target.value,
        })
      );
    }, 500);
    setSearchTimeout(timeout);
  };

  // Xử lý thay đổi trang cho campus
  const handleCampusChangePage = (event, newPage) => {
    setCampusPage(newPage);
  };

  // Xử lý thay đổi số lượng hàng cho campus
  const handleCampusChangeRowsPerPage = (event) => {
    setCampusRowsPerPage(parseInt(event.target.value, 10));
    setCampusPage(0);
  };

  // Handlers cho phân trang tòa nhà
  const handleBuildingChangePage = (event, newPage) => {
    setBuildingPage(newPage);
  };

  const handleBuildingChangeRowsPerPage = (event) => {
    setBuildingRowsPerPage(parseInt(event.target.value, 10));
    setBuildingPage(0);
  };

  // Handlers cho phân trang phòng học
  const handleRoomChangePage = (event, newPage) => {
    setRoomPage(newPage);
  };

  const handleRoomChangeRowsPerPage = (event) => {
    setRoomRowsPerPage(parseInt(event.target.value, 10));
    setRoomPage(0);
  };

  // Mở dialog campus (thêm hoặc sửa)
  const handleCampusDialogOpen = (mode, campus = null) => {
    setCampusDialogMode(mode);
    if (mode === "edit" && campus) {
      setCampusFormData({
        ...campus,
      });
    } else {
      setCampusFormData(defaultCampusFormData);
    }
    setCampusDialogOpen(true);
  };

  // Đóng dialog campus
  const handleCampusDialogClose = () => {
    setCampusDialogOpen(false);
    setCampusFormData(defaultCampusFormData);
  };

  // Xử lý khi thay đổi form campus
  const handleCampusFormChange = (e) => {
    const { name, value } = e.target;
    setCampusFormData({
      ...campusFormData,
      [name]: value,
    });
  };

  // Xử lý submit form campus
  const handleCampusFormSubmit = async () => {
    try {
      const trimmedData = {
        ...campusFormData,
        code: campusFormData.code.trim(),
        name: campusFormData.name.trim(),
        address: campusFormData.address?.trim() || "",
        status: campusFormData.status || "active",
      };

      // Loại bỏ _id khi thêm mới
      if (campusDialogMode === "add") {
        delete trimmedData._id;
        await dispatch(createCampus(trimmedData)).unwrap();
        toast.success("Đã thêm cơ sở thành công");
      } else {
        // Đảm bảo có id khi cập nhật
        const updateData = {
          id: trimmedData._id,
          data: {
            name: trimmedData.name,
            code: trimmedData.code,
            address: trimmedData.address,
            status: trimmedData.status,
          },
        };

        await dispatch(updateCampus(updateData)).unwrap();
        toast.success("Đã cập nhật cơ sở thành công");
      }

      setCampusDialogOpen(false);
      setCampusFormData(defaultCampusFormData);

      // Đảm bảo tải lại dữ liệu sau khi thêm/cập nhật
      setTimeout(() => {
        dispatch(fetchAllCampuses({}));
        fetchCampusList();
      }, 500);
    } catch (error) {
      console.error("Lỗi khi xử lý form cơ sở:", error);
      toast.error(error?.message || "Đã có lỗi xảy ra khi xử lý cơ sở");
    }
  };

  // Xử lý xóa campus
  const handleDeleteCampus = (campusId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa cơ sở này không?")) {
      dispatch(deleteCampus(campusId))
        .unwrap()
        .then(() => {
          toast.success("Đã xóa cơ sở thành công");
          dispatch(fetchAllCampuses()); // Refresh list
        })
        .catch((error) => {
          console.error("Lỗi khi xóa cơ sở:", error);
          toast.error(error?.message || "Đã có lỗi xảy ra khi xóa cơ sở");
        });
    }
  };

  // Handlers cho bật/tắt building dialog
  const handleBuildingDialogOpen = (mode, building = null) => {
    setBuildingDialogMode(mode);
    if (mode === "edit" && building) {
      setBuildingFormData({
        _id: building._id,
        name: building.name,
        code: building.code,
        campus_id: building.campus_id || "",
        floors_count: building.floors_count || 1,
        year_built: building.year_built || new Date().getFullYear(),
        status: building.status || "active",
        facilities: building.facilities || [],
        image_url: building.image_url || "",
      });
    } else {
      setBuildingFormData({
        ...defaultBuildingFormData,
        campus_id: selectedCampus?._id || "",
      });
    }
    setBuildingDialogOpen(true);
  };

  const handleCloseBuildingDialog = () => {
    setBuildingDialogOpen(false);
  };

  // Handler cho building form change
  const handleBuildingFormChange = (e) => {
    const { name, value } = e.target;
    setBuildingFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handler cho submit building form
  const handleBuildingFormSubmit = async (e) => {
    e.preventDefault();

    // Validate form data
    if (!buildingFormData.name.trim() || !buildingFormData.code.trim()) {
      toast.error("Vui lòng nhập đầy đủ tên và mã tòa nhà");
      return;
    }

    // Kiểm tra campus_id
    if (!buildingFormData.campus_id) {
      toast.error("Vui lòng chọn cơ sở cho tòa nhà");
      return;
    }

    try {
      if (buildingDialogMode === "add") {
        // Tạo object mới chỉ với các trường cần thiết và loại bỏ _id
        const newBuildingData = {
          name: buildingFormData.name.trim(),
          code: buildingFormData.code.trim(),
          campus_id: buildingFormData.campus_id,
          floors_count: Number(buildingFormData.floors_count),
          year_built: Number(buildingFormData.year_built),
          status: buildingFormData.status,
          facilities: buildingFormData.facilities || [],
        };

        await dispatch(createBuilding(newBuildingData)).unwrap();
        toast.success("Thêm tòa nhà thành công");
      } else {
        // Cập nhật với định dạng {id, buildingData}
        const updateData = {
          id: buildingFormData._id,
          buildingData: {
            name: buildingFormData.name.trim(),
            code: buildingFormData.code.trim(),
            campus_id: buildingFormData.campus_id,
            floors_count: Number(buildingFormData.floors_count),
            year_built: Number(buildingFormData.year_built),
            status: buildingFormData.status,
            facilities: buildingFormData.facilities || [],
          },
        };

        await dispatch(updateBuilding(updateData)).unwrap();
        toast.success("Cập nhật tòa nhà thành công");
      }

      handleCloseBuildingDialog();

      // Đảm bảo tải lại dữ liệu sau khi thêm/cập nhật
      setTimeout(() => {
        loadBuildings();
      }, 500);
    } catch (error) {
      console.error("Lỗi khi xử lý form tòa nhà:", error);
      if (error.message === "jwt expired") {
        toast.error("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại");
      } else {
        toast.error(
          error.message || "Có lỗi xảy ra khi xử lý thông tin tòa nhà"
        );
      }
    }
  };

  // Handlers cho bật/tắt room dialog
  const handleRoomDialogOpen = (mode, room = null) => {
    setRoomDialogMode(mode);
    if (mode === "edit" && room) {
      setRoomFormData({
        _id: room._id || "",
        room_number: room.room_number || "",
        building_id: room.building_id || "",
        floor: room.floor ? String(room.floor) : "1",
        capacity: room.capacity ? String(room.capacity) : "0",
        room_type: room.room_type || "lecture",
        status: room.status || "available",
        equipment: room.equipment || [],
      });
    } else {
      setRoomFormData({
        _id: "",
        room_number: "",
        building_id: selectedBuilding?._id || "",
        floor: "1",
        capacity: "0",
        room_type: "lecture",
        status: "available",
        equipment: [],
      });
    }
    setRoomDialogOpen(true);
  };

  const handleCloseRoomDialog = () => {
    setRoomDialogOpen(false);
  };

  // Handler cho room form change
  const handleRoomFormChange = (e) => {
    const { name, value } = e.target;
    setRoomFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handler cho submit room form
  const handleRoomFormSubmit = async (e) => {
    e.preventDefault();

    // Validate form data
    if (!roomFormData.room_number.trim()) {
      toast.error("Vui lòng nhập đầy đủ số phòng");
      return;
    }

    // Kiểm tra building_id
    if (!roomFormData.building_id) {
      toast.error("Vui lòng chọn tòa nhà cho phòng học");
      return;
    }

    try {
      if (roomDialogMode === "add") {
        // Tạo object mới chỉ với các trường cần thiết và loại bỏ _id
        const newRoomData = {
          room_number: roomFormData.room_number.trim(),
          building_id: roomFormData.building_id,
          floor: Number(roomFormData.floor),
          capacity: Number(roomFormData.capacity),
          room_type: roomFormData.room_type,
          status: roomFormData.status,
          equipment: roomFormData.equipment || [],
        };

        await dispatch(createRoom(newRoomData)).unwrap();
        toast.success("Thêm phòng học thành công");
      } else {
        // Cập nhật với định dạng {id, data}
        const updateData = {
          id: roomFormData._id,
          data: {
            room_number: roomFormData.room_number.trim(),
            building_id: roomFormData.building_id,
            floor: Number(roomFormData.floor),
            capacity: Number(roomFormData.capacity),
            room_type: roomFormData.room_type,
            status: roomFormData.status,
            equipment: roomFormData.equipment || [],
          },
        };

        await dispatch(updateRoom(updateData)).unwrap();
        toast.success("Cập nhật phòng học thành công");
      }

      handleCloseRoomDialog();

      // Đảm bảo tải lại dữ liệu sau khi thêm/cập nhật
      setTimeout(() => {
        loadRooms();
      }, 500);
    } catch (error) {
      console.error("Lỗi khi xử lý form phòng học:", error);
      if (error.message === "jwt expired") {
        toast.error("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại");
      } else {
        toast.error(
          error.message || "Có lỗi xảy ra khi xử lý thông tin phòng học"
        );
      }
    }
  };

  // Handlers cho xóa
  const openDeleteDialog = (type, item) => {
    setDeleteDialogType(type);
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteItem = async () => {
    setIsSubmitting(true);
    try {
      if (deleteDialogType === "campus" && itemToDelete) {
        await dispatch(deleteCampus(itemToDelete._id)).unwrap();
        enqueueSnackbar("Xóa cơ sở thành công", { variant: "success" });
        loadCampuses();
      } else if (deleteDialogType === "building" && itemToDelete) {
        await dispatch(deleteBuilding(itemToDelete._id)).unwrap();
        enqueueSnackbar("Xóa tòa nhà thành công", { variant: "success" });
        loadBuildings();
      } else if (deleteDialogType === "room" && itemToDelete) {
        await dispatch(deleteRoom(itemToDelete._id)).unwrap();
        enqueueSnackbar("Xóa phòng học thành công", { variant: "success" });
        loadRooms();
      }
    } catch (error) {
      enqueueSnackbar(
        error.message || `Không thể xóa ${deleteDialogType}. Vui lòng thử lại.`,
        { variant: "error" }
      );
    } finally {
      setIsSubmitting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Handler cho việc chọn cơ sở
  const handleSelectCampus = (campus) => {
    dispatch(setSelectedCampus(campus));

    // Tải danh sách tòa nhà của cơ sở đã chọn
    const params = {
      page: 1,
      limit: buildingRowsPerPage,
      search: buildingSearchTerm,
      campus_id: campus._id,
    };

    dispatch(fetchBuildings(params));
    setTabValue(1); // Chuyển sang tab tòa nhà
  };

  // Handler cho việc chọn tòa nhà
  const handleSelectBuilding = (building) => {
    dispatch(setSelectedBuilding(building));

    // Tải danh sách phòng của tòa nhà đã chọn
    const params = {
      page: 1,
      limit: roomRowsPerPage,
      search: roomSearchTerm,
      building_id: building._id,
    };

    dispatch(fetchRooms(params));
    setTabValue(2); // Chuyển sang tab phòng học
  };

  const handleBackToCampuses = () => {
    dispatch(setSelectedCampus(null));
    setBuildingSearchTerm("");
    setBuildingPage(0);
  };

  // Thêm handler quay lại tòa nhà từ phòng học
  const handleBackToBuildings = () => {
    dispatch(setSelectedBuilding(null));
    setRoomSearchTerm("");
    setRoomPage(0);
  };

  // Thêm hàm xử lý building
  const handleBuildingSearch = () => {
    loadBuildings();
  };

  // Thêm hàm xử lý room
  const handleRoomSearch = () => {
    loadRooms();
  };

  const handleEditCampus = (campus) => {
    setCampusFormData({
      _id: campus._id,
      code: campus.code,
      name: campus.name,
      address: campus.address || "",
      status: campus.status,
    });
    setCampusDialogMode("edit");
    setCampusDialogOpen(true);
  };

  // Hàm để chuyển đổi room_type thành văn bản hiển thị
  const getRoomTypeLabel = (type) => {
    const roomType = roomTypes.find((rt) => rt.value === type);
    return roomType ? roomType.label : type;
  };

  // Hàm để chuyển đổi status thành văn bản hiển thị
  const getRoomStatusLabel = (status) => {
    const roomStatus = roomStatuses.find((rs) => rs.value === status);
    return roomStatus ? roomStatus.label : status;
  };

  // Hàm để lấy màu sắc dựa trên status
  const getRoomStatusColor = (status) => {
    switch (status) {
      case "available":
        return "success";
      case "maintenance":
        return "warning";
      case "unavailable":
        return "error";
      default:
        return "default";
    }
  };

  // Render tùy theo tab đang chọn
  const renderTabContent = () => {
    switch (tabValue) {
      case 0:
        return renderCampusesTab();
      case 1:
        return renderBuildingsTab();
      case 2:
        return renderRoomsTab();
      default:
        return renderCampusesTab();
    }
  };

  // Render tab cơ sở
  const renderCampusesTab = () => {
    // Đảm bảo hiển thị dữ liệu mới nhất
    const displayedCampuses = campusesData || [];

    return (
      <Box sx={{ mt: 2 }}>
        {/* Thanh công cụ */}
        <Box
          sx={{
            mb: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <TextField
            label="Tìm kiếm cơ sở"
            variant="outlined"
            size="small"
            value={campusSearchTerm}
            onChange={handleCampusSearchChange}
            sx={{ width: "300px" }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => dispatch(fetchAllCampuses({}))}
              sx={{ mr: 1 }}
            >
              Làm mới
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleCampusDialogOpen("add")}
            >
              Thêm cơ sở
            </Button>
          </Box>
        </Box>

        {/* Bảng cơ sở */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>STT</TableCell>
                  <TableCell>Mã</TableCell>
                  <TableCell>Tên cơ sở</TableCell>
                  <TableCell>Địa chỉ</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : displayedCampuses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      Không có dữ liệu
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedCampuses.map((campus, index) => (
                    <TableRow key={campus._id || index}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{campus.code}</TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            "&:hover": { color: "primary.main" },
                          }}
                          onClick={() => handleSelectCampus(campus)}
                        >
                          <LocationOn sx={{ mr: 1, fontSize: 20 }} />
                          {campus.name}
                        </Box>
                      </TableCell>
                      <TableCell>{campus.address || "N/A"}</TableCell>
                      <TableCell>
                        <Chip
                          label={
                            campus.status === "active"
                              ? "Hoạt động"
                              : campus.status === "maintenance"
                              ? "Bảo trì"
                              : "Không hoạt động"
                          }
                          color={
                            campus.status === "active"
                              ? "success"
                              : campus.status === "maintenance"
                              ? "warning"
                              : "error"
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleEditCampus(campus)}
                          title="Chỉnh sửa"
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCampus(campus._id)}
                          title="Xóa"
                          sx={{ color: "error.main" }}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCampusItems}
            page={campusPage}
            onPageChange={handleCampusChangePage}
            rowsPerPage={campusRowsPerPage}
            onRowsPerPageChange={handleCampusChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage="Số hàng mỗi trang:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} của ${count}`
            }
          />
        </Card>
      </Box>
    );
  };

  // Render tab tòa nhà
  const renderBuildingsTab = () => (
    <Box>
      {selectedCampus && (
        <Box sx={{ mb: 3 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={handleBackToCampuses}
            sx={{ mb: 2 }}
          >
            Quay lại danh sách cơ sở
          </Button>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {selectedCampus.name} ({selectedCampus.code})
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Địa chỉ: {selectedCampus.address}
            </Typography>
            {selectedCampus.description && (
              <Typography variant="body2" color="textSecondary">
                Mô tả: {selectedCampus.description}
              </Typography>
            )}
          </Paper>
        </Box>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box
          display="flex"
          flexDirection={{ xs: "column", sm: "row" }}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
          gap={2}
        >
          <Box display="flex" alignItems="center" gap={1} flexGrow={1}>
            <TextField
              label="Tìm kiếm tòa nhà"
              variant="outlined"
              size="small"
              fullWidth
              value={buildingSearchTerm}
              onChange={(e) => {
                setBuildingSearchTerm(e.target.value);
                if (e.target.value.trim() === "") {
                  handleBuildingSearch();
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleBuildingSearch}
              startIcon={<Search />}
            >
              Tìm
            </Button>
          </Box>

          <Box display="flex" gap={2}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadBuildings}
            >
              Làm mới
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleBuildingDialogOpen("add")}
              sx={{ ml: 2 }}
            >
              Thêm tòa nhà
            </Button>
          </Box>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell>Tên tòa nhà</TableCell>
              <TableCell>Mã</TableCell>
              <TableCell>Cơ sở</TableCell>
              <TableCell align="center">Số tầng</TableCell>
              <TableCell>Tiện ích</TableCell>
              <TableCell align="right">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && buildings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : buildings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  Không tìm thấy tòa nhà nào
                </TableCell>
              </TableRow>
            ) : (
              buildings.map((building) => (
                <TableRow key={building._id}>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Domain sx={{ mr: 1, color: "primary.main" }} />
                      <Typography variant="body1">{building.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{building.code}</TableCell>
                  <TableCell>
                    {building.campus_id?.name || "Không có thông tin"}
                  </TableCell>
                  <TableCell align="center">{building.floors_count}</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {building.facilities && building.facilities.length > 0 ? (
                        building.facilities.map((facilityId) => {
                          const facility = buildingFacilities.find(
                            (f) => f.id === facilityId
                          );
                          return facility ? (
                            <Chip
                              key={facilityId}
                              label={facility.label}
                              size="small"
                              variant="outlined"
                            />
                          ) : null;
                        })
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Không có
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box display="flex" justifyContent="flex-end">
                      <Tooltip title="Xem phòng học">
                        <IconButton
                          color="primary"
                          onClick={() => handleSelectBuilding(building)}
                        >
                          <Room />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Sửa tòa nhà">
                        <IconButton
                          color="primary"
                          onClick={() => {
                            dispatch(setSelectedBuilding(building));
                            handleBuildingDialogOpen("edit", building);
                          }}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Xóa tòa nhà">
                        <IconButton
                          color="error"
                          onClick={() => openDeleteDialog("building", building)}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={buildingPagination.totalCount}
          rowsPerPage={buildingRowsPerPage}
          page={buildingPage}
          onPageChange={handleBuildingChangePage}
          onRowsPerPageChange={handleBuildingChangeRowsPerPage}
          labelRowsPerPage="Dòng mỗi trang:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}-${to} trên ${count}`
          }
        />
      </TableContainer>
    </Box>
  );

  // Render tab phòng học
  const renderRoomsTab = () => (
    <Box>
      {selectedBuilding ? (
        <>
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={handleBackToBuildings}
              sx={{ mb: 2 }}
            >
              Quay lại danh sách tòa nhà
            </Button>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                {selectedBuilding.name} ({selectedBuilding.code})
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Cơ sở:{" "}
                {selectedBuilding.campus_id?.name || "Không có thông tin"}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Số tầng: {selectedBuilding.floors_count}
              </Typography>
              {selectedBuilding.description && (
                <Typography variant="body2" color="textSecondary">
                  Mô tả: {selectedBuilding.description}
                </Typography>
              )}
            </Paper>
          </Box>

          <Paper sx={{ p: 2, mb: 3 }}>
            <Box
              display="flex"
              flexDirection={{ xs: "column", sm: "row" }}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
              gap={2}
            >
              <Box display="flex" alignItems="center" gap={1} flexGrow={1}>
                <TextField
                  label="Tìm kiếm phòng học"
                  variant="outlined"
                  size="small"
                  fullWidth
                  value={roomSearchTerm}
                  onChange={(e) => {
                    setRoomSearchTerm(e.target.value);
                    if (e.target.value.trim() === "") {
                      handleRoomSearch();
                    }
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search />
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleRoomSearch}
                  startIcon={<Search />}
                >
                  Tìm
                </Button>
              </Box>

              <Box display="flex" gap={2}>
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={loadRooms}
                >
                  Làm mới
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => handleRoomDialogOpen("add")}
                  sx={{ ml: 2 }}
                >
                  Thêm phòng
                </Button>
              </Box>
            </Box>
          </Paper>

          <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Phòng học</TableCell>
                  <TableCell>Mã phòng</TableCell>
                  <TableCell align="center">Tầng</TableCell>
                  <TableCell align="center">Sức chứa</TableCell>
                  <TableCell>Loại phòng</TableCell>
                  <TableCell>Tiện ích</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Hành động</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && rooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <CircularProgress size={30} />
                    </TableCell>
                  </TableRow>
                ) : rooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      Không tìm thấy phòng học nào
                    </TableCell>
                  </TableRow>
                ) : (
                  rooms.map((room) => (
                    <TableRow key={room._id}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <Room sx={{ mr: 1, color: "primary.main" }} />
                          <Typography variant="body1">
                            Phòng {room.room_number}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{room.room_number}</TableCell>
                      <TableCell align="center">{room.floor}</TableCell>
                      <TableCell align="center">{room.capacity}</TableCell>
                      <TableCell>
                        <Chip
                          label={getRoomTypeLabel(room.room_type)}
                          color={
                            room.room_type === "lecture"
                              ? "primary"
                              : room.room_type === "lab"
                              ? "secondary"
                              : "default"
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                        >
                          {room.equipment && room.equipment.length > 0 ? (
                            room.equipment.map((equipmentItem, index) => {
                              // Xử lý cả trường hợp equipment là object hoặc chuỗi
                              const equipmentId =
                                typeof equipmentItem === "object"
                                  ? equipmentItem.name
                                  : equipmentItem;
                              const equipment = availableEquipment.find(
                                (f) => f.id === equipmentId
                              );
                              return equipment ? (
                                <Chip
                                  key={`${equipmentId}-${index}`}
                                  label={equipment.label}
                                  size="small"
                                  variant="outlined"
                                />
                              ) : null;
                            })
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Không có
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getRoomStatusLabel(room.status)}
                          color={getRoomStatusColor(room.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" justifyContent="flex-end">
                          <Tooltip title="Sửa phòng học">
                            <IconButton
                              color="primary"
                              onClick={() => handleRoomDialogOpen("edit", room)}
                            >
                              <Edit />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa phòng học">
                            <IconButton
                              color="error"
                              onClick={() => openDeleteDialog("room", room)}
                            >
                              <Delete />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={roomPagination.totalCount}
              rowsPerPage={roomRowsPerPage}
              page={roomPage}
              onPageChange={handleRoomChangePage}
              onRowsPerPageChange={handleRoomChangeRowsPerPage}
              labelRowsPerPage="Dòng mỗi trang:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} trên ${count}`
              }
            />
          </TableContainer>
        </>
      ) : (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="200px"
        >
          <Typography variant="h6" color="textSecondary">
            Vui lòng chọn một tòa nhà để xem danh sách phòng học
          </Typography>
        </Box>
      )}
    </Box>
  );

  // Render dialog xác nhận xóa
  const renderDeleteConfirmDialog = () => {
    return (
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>
          Xác nhận xóa{" "}
          {deleteDialogType === "campus"
            ? "cơ sở"
            : deleteDialogType === "building"
            ? "tòa nhà"
            : "phòng"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xóa{" "}
            {deleteDialogType === "campus"
              ? "cơ sở"
              : deleteDialogType === "building"
              ? "tòa nhà"
              : "phòng"}{" "}
            này? Hành động này không thể hoàn tác.
            {deleteDialogType === "campus" &&
              " Tất cả tòa nhà và phòng học trong cơ sở này cũng sẽ bị xóa."}
            {deleteDialogType === "building" &&
              " Tất cả phòng học trong tòa nhà này cũng sẽ bị xóa."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">
            Hủy
          </Button>
          <Button
            onClick={handleDeleteItem}
            color="error"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={24} /> : "Xóa"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Dialog Campus
  const renderCampusDialog = () => {
    return (
      <Dialog
        open={campusDialogOpen}
        onClose={handleCampusDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {campusDialogMode === "add" ? "Thêm cơ sở mới" : "Cập nhật cơ sở"}
        </DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  name="code"
                  label="Mã cơ sở"
                  fullWidth
                  required
                  value={campusFormData.code}
                  onChange={handleCampusFormChange}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  name="name"
                  label="Tên cơ sở"
                  fullWidth
                  required
                  value={campusFormData.name}
                  onChange={handleCampusFormChange}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="address"
                  label="Địa chỉ"
                  fullWidth
                  value={campusFormData.address}
                  onChange={handleCampusFormChange}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Trạng thái</InputLabel>
                  <Select
                    name="status"
                    value={campusFormData.status}
                    onChange={handleCampusFormChange}
                    label="Trạng thái"
                  >
                    <MenuItem value="active">Hoạt động</MenuItem>
                    <MenuItem value="maintenance">Bảo trì</MenuItem>
                    <MenuItem value="inactive">Không hoạt động</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCampusDialogClose}>Hủy</Button>
          <Button
            onClick={handleCampusFormSubmit}
            variant="contained"
            color="primary"
            disabled={!campusFormData.code || !campusFormData.name}
          >
            {campusDialogMode === "add" ? "Thêm mới" : "Cập nhật"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Dialog Building
  const renderBuildingDialog = () => {
    return (
      <Dialog
        open={buildingDialogOpen}
        onClose={handleCloseBuildingDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {buildingDialogMode === "add" ? "Thêm tòa nhà mới" : "Sửa tòa nhà"}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Tên tòa nhà"
                fullWidth
                required
                value={buildingFormData.name}
                onChange={handleBuildingFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="code"
                label="Mã tòa nhà"
                fullWidth
                required
                value={buildingFormData.code}
                onChange={handleBuildingFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Chọn cơ sở</InputLabel>
                <Select
                  name="campus_id"
                  value={buildingFormData.campus_id}
                  onChange={handleBuildingFormChange}
                  label="Chọn cơ sở"
                >
                  {localCampusList.map((campus) => (
                    <MenuItem key={campus._id} value={campus._id}>
                      {campus.name} ({campus.code})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="floors_count"
                label="Số tầng"
                type="number"
                fullWidth
                required
                value={buildingFormData.floors_count}
                onChange={handleBuildingFormChange}
                InputProps={{ inputProps: { min: 1 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="year_built"
                label="Năm xây dựng"
                type="number"
                fullWidth
                required
                value={buildingFormData.year_built}
                onChange={handleBuildingFormChange}
                InputProps={{
                  inputProps: { min: 1900, max: new Date().getFullYear() },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Trạng thái</InputLabel>
                <Select
                  name="status"
                  value={buildingFormData.status}
                  onChange={handleBuildingFormChange}
                  label="Trạng thái"
                >
                  <MenuItem value="active">Hoạt động</MenuItem>
                  <MenuItem value="maintenance">Bảo trì</MenuItem>
                  <MenuItem value="inactive">Ngưng hoạt động</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Tiện ích
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {buildingFacilities.map((facility) => (
                  <Chip
                    key={facility.id}
                    label={facility.label}
                    color={
                      buildingFormData.facilities.includes(facility.id)
                        ? "primary"
                        : "default"
                    }
                    onClick={() => {
                      const newFacilities =
                        buildingFormData.facilities.includes(facility.id)
                          ? buildingFormData.facilities.filter(
                              (id) => id !== facility.id
                            )
                          : [...buildingFormData.facilities, facility.id];

                      setBuildingFormData({
                        ...buildingFormData,
                        facilities: newFacilities,
                      });
                    }}
                    sx={{ m: 0.5, cursor: "pointer" }}
                  />
                ))}
              </Box>
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="image_url"
                label="URL hình ảnh"
                fullWidth
                value={buildingFormData.image_url || ""}
                onChange={handleBuildingFormChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBuildingDialogOpen(false)}>Hủy</Button>
          <Button
            onClick={handleBuildingFormSubmit}
            variant="contained"
            color="primary"
            disabled={!buildingFormData.name || !buildingFormData.code}
          >
            {buildingDialogMode === "add" ? "Tạo mới" : "Cập nhật"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Dialog Room
  const renderRoomDialog = () => {
    return (
      <Dialog
        open={roomDialogOpen}
        onClose={handleCloseRoomDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {roomDialogMode === "add" ? "Thêm phòng học mới" : "Sửa phòng học"}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="room_number"
                label="Số phòng"
                fullWidth
                required
                value={roomFormData.room_number}
                onChange={handleRoomFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="floor"
                label="Tầng"
                type="number"
                fullWidth
                required
                value={roomFormData.floor}
                onChange={handleRoomFormChange}
                InputProps={{
                  inputProps: {
                    min: 1,
                    max: selectedBuilding?.floors_count || 100,
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="capacity"
                label="Sức chứa"
                type="number"
                fullWidth
                required
                value={roomFormData.capacity}
                onChange={handleRoomFormChange}
                InputProps={{ inputProps: { min: 0 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Loại phòng</InputLabel>
                <Select
                  name="room_type"
                  value={roomFormData.room_type}
                  onChange={handleRoomFormChange}
                  label="Loại phòng"
                >
                  {roomTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Trạng thái</InputLabel>
                <Select
                  name="status"
                  value={roomFormData.status}
                  onChange={handleRoomFormChange}
                  label="Trạng thái"
                >
                  {roomStatuses.map((status) => (
                    <MenuItem key={status.value} value={status.value}>
                      {status.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Tiện ích
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {availableEquipment.map((facility) => (
                  <Chip
                    key={facility.id}
                    label={facility.label}
                    color={
                      roomFormData.equipment.includes(facility.id)
                        ? "primary"
                        : "default"
                    }
                    onClick={() => {
                      const newEquipment = roomFormData.equipment.includes(
                        facility.id
                      )
                        ? roomFormData.equipment.filter(
                            (id) => id !== facility.id
                          )
                        : [...roomFormData.equipment, facility.id];

                      setRoomFormData({
                        ...roomFormData,
                        equipment: newEquipment,
                      });
                    }}
                    sx={{ m: 0.5, cursor: "pointer" }}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomDialogOpen(false)}>Hủy</Button>
          <Button
            onClick={handleRoomFormSubmit}
            variant="contained"
            color="primary"
            disabled={!roomFormData.room_number}
          >
            {roomDialogMode === "add" ? "Tạo mới" : "Cập nhật"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Quản lý cơ sở vật chất
        </Typography>
      </Box>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Cơ sở" />
        <Tab label="Tòa nhà" />
        <Tab label="Phòng" />
      </Tabs>

      {renderTabContent()}

      {/* Dialogs */}
      {renderCampusDialog()}
      {renderBuildingDialog()}
      {renderRoomDialog()}
      {renderDeleteConfirmDialog()}
    </Container>
  );
};

export default FacilitiesPage;
