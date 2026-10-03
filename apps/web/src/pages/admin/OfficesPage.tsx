import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  message,
  Typography,
  Alert,
  Popconfirm,
  Divider,
  Row,
  Col,
  Empty,
} from 'antd';
import {
  EnvironmentOutlined,
  PlusOutlined,
  EditOutlined,
  CompassOutlined,
  TeamOutlined,
  AimOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Office, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { MapPicker } from '../../components/common/MapPicker.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { useAuth } from '../../context/AuthContext.js';
import { useLocationWarmup, broadcastOfficeUpdate } from '../../context/LocationContext.js';

const { Title, Text, Paragraph } = Typography;

/** Mobile Card representation for an Office Geofence */
const OfficeCard: React.FC<{
  office: Office;
  totalEmployeesInCompany: number;
  onEdit: (office: Office) => void;
  onApplyToAll: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}> = ({ office, totalEmployeesInCompany, onEdit, onApplyToAll, onDelete }) => {
  const hasEmployees = Boolean(office.employee_count && office.employee_count > 0);

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
      styles={{ body: { padding: '14px 14px' } }}
    >
      {/* Top Row: Office Name + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>{office.name}</Text>
          {office.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <EnvironmentOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{office.address}</Text>
            </div>
          )}
        </div>

        <Tag color={office.is_active ? 'success' : 'error'} style={{ margin: 0 }}>
          {office.is_active ? 'Active' : 'Disabled'}
        </Tag>
      </div>

      {/* Geofence specs grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          background: '#f9fafb',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '10px 0',
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            COORDINATES
          </Text>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1f2937', marginTop: 2 }}>
            {office.latitude.toFixed(5)}, {office.longitude.toFixed(5)}
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            RADIUS BOUNDARY
          </Text>
          <div style={{ marginTop: 2 }}>
            <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
              {office.radius_meters}m radius
            </Tag>
          </div>
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            GOVERNED EMPLOYEES
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Tag color={hasEmployees ? 'purple' : 'default'} icon={<TeamOutlined />} style={{ margin: 0 }}>
              {office.employee_count || 0} employees
            </Tag>
            {totalEmployeesInCompany > 0 && office.employee_count === totalEmployeesInCompany && (
              <Tag color="green" style={{ margin: 0 }}>100% of Company</Tag>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
            <Button
              size="middle"
              icon={<EditOutlined />}
              onClick={() => onEdit(office)}
              style={{ flex: 1, borderRadius: 8 }}
            >
              Edit on Map
            </Button>
          </PermissionGate>

          <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
            <Popconfirm
              title="Apply to ALL Company Employees?"
              description={`Every employee in your company will be assigned to "${office.name}". Check-in will be validated against this geofence.`}
              onConfirm={() => onApplyToAll(office.id, office.name)}
              okText="Yes, Apply to All"
              cancelText="Cancel"
            >
              <Button
                size="middle"
                type="primary"
                ghost
                icon={<TeamOutlined />}
                style={{ flex: 1.2, borderRadius: 8 }}
              >
                Apply to All Staff
              </Button>
            </Popconfirm>
          </PermissionGate>
        </div>

        <PermissionGate permission={PermissionKey.OFFICE_DISABLE}>
          <Popconfirm
            title={`Delete "${office.name}"?`}
            description={
              hasEmployees
                ? `Cannot delete: ${office.employee_count} employee(s) are assigned to this office. Reassign them first.`
                : 'Are you sure you want to permanently delete this office geofence?'
            }
            disabled={hasEmployees}
            onConfirm={() => onDelete(office.id, office.name)}
            okText="Yes, Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button
              size="middle"
              danger
              block
              icon={<DeleteOutlined />}
              disabled={hasEmployees}
              style={{ borderRadius: 8 }}
            >
              {hasEmployees ? `Cannot Delete (${office.employee_count} staff assigned)` : 'Delete Geofence'}
            </Button>
          </Popconfirm>
        </PermissionGate>
      </div>
    </Card>
  );
};

export const OfficesPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const { user, refreshUser } = useAuth();
  const { forceRefreshOffice } = useLocationWarmup();
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Create Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [createCoords, setCreateCoords] = useState({ lat: 37.774929, lon: -122.419416, radius: 150 });

  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [editForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);
  const [editCoords, setEditCoords] = useState({ lat: 37.774929, lon: -122.419416, radius: 150 });

  // Quick coordinate paste string
  const [pasteCoordInput, setPasteCoordInput] = useState('');

  const fetchOffices = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<Office[]>>('/offices');
      setOffices(res.data.data);
    } catch {
      message.error('Failed to load offices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffices();
  }, []);

  // Browser Geolocation auto-detection
  const handleDetectLocation = (formInstance: any, setCoordsFn: any) => {
    if (!('geolocation' in navigator)) {
      message.error('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lon = parseFloat(pos.coords.longitude.toFixed(6));
        formInstance.setFieldsValue({
          latitude: lat,
          longitude: lon,
        });
        setCoordsFn((prev: any) => ({ ...prev, lat, lon }));
        message.success(
          `GPS location captured: ${lat}, ${lon} (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`
        );
        setDetectingLocation(false);
      },
      (err) => {
        message.error(`GPS Error: ${err.message}. Please select on the map or input coordinates manually.`);
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Coordinate parser (e.g., "37.774929, -122.419416")
  const handleParseCoordinates = (val: string, formInstance: any, setCoordsFn: any) => {
    setPasteCoordInput(val);
    const cleaned = val.replace(/[^\d.,\-]/g, ' ');
    const parts = cleaned.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 2) {
      const [lat, lon] = parts;
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        formInstance.setFieldsValue({ latitude: lat, longitude: lon });
        setCoordsFn((prev: any) => ({ ...prev, lat, lon }));
        message.success(`Coordinates applied: Lat ${lat}, Lon ${lon}`);
      }
    }
  };

  const handleOpenCreateModal = () => {
    const defaultLat = offices[0]?.latitude || 37.774929;
    const defaultLon = offices[0]?.longitude || -122.419416;
    setCreateCoords({ lat: defaultLat, lon: defaultLon, radius: 150 });
    createForm.setFieldsValue({
      latitude: defaultLat,
      longitude: defaultLon,
      radius_meters: 150,
      apply_to_all_employees: true,
    });
    setPasteCoordInput('');
    setCreateModalVisible(true);
  };

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const companyId = user?.company_id || offices[0]?.company_id;
      const res = await api.post<ApiResponse<Office>>('/offices', {
        ...values,
        ...(companyId ? { company_id: companyId } : {}),
      });
      message.success(
        values.apply_to_all_employees
          ? 'Office created and assigned to ALL company employees!'
          : 'Office geofence created successfully'
      );
      if (values.apply_to_all_employees) {
        await refreshUser();
        if (res.data?.data?.id) {
          await forceRefreshOffice(res.data.data.id);
        }
        broadcastOfficeUpdate();
      }
      setCreateModalVisible(false);
      createForm.resetFields();
      setPasteCoordInput('');
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to create office');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (office: Office) => {
    setEditingOffice(office);
    setEditCoords({
      lat: office.latitude,
      lon: office.longitude,
      radius: office.radius_meters,
    });
    editForm.setFieldsValue({
      name: office.name,
      address: office.address,
      latitude: office.latitude,
      longitude: office.longitude,
      radius_meters: office.radius_meters,
      is_active: office.is_active,
      apply_to_all_employees: false,
    });
    setPasteCoordInput('');
    setEditModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    if (!editingOffice) return;
    setUpdating(true);
    try {
      await api.patch(`/offices/${editingOffice.id}`, values);
      message.success(
        values.apply_to_all_employees
          ? `Office updated and assigned to ALL employees in company!`
          : 'Office geofence updated successfully'
      );
      await refreshUser();
      await forceRefreshOffice(editingOffice.id);
      broadcastOfficeUpdate();
      setEditModalVisible(false);
      setPasteCoordInput('');
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to update office');
    } finally {
      setUpdating(false);
    }
  };

  const handleApplyToAll = async (officeId: string, officeName: string) => {
    try {
      const res = await api.post<ApiResponse<any>>(`/offices/${officeId}/apply-to-all`);
      message.success(
        `All employees assigned to "${officeName}"! (${res.data?.data?.affectedEmployees || 'All'} staff updated)`
      );
      await refreshUser();
      await forceRefreshOffice(officeId);
      broadcastOfficeUpdate();
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to apply office to employees');
    }
  };

  const handleDeleteOffice = async (officeId: string, officeName: string) => {
    try {
      await api.delete(`/offices/${officeId}`);
      message.success(`Office "${officeName}" deleted successfully`);
      await refreshUser();
      await forceRefreshOffice();
      broadcastOfficeUpdate();
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to delete office');
    }
  };

  const totalEmployeesInCompany = offices.reduce((sum, o) => sum + (o.employee_count || 0), 0);

  const columns = [
    {
      title: 'Office Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string, r: Office) => (
        <div>
          <Text strong>{val}</Text>
          {r.address && (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.address}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Geofence Coordinates (Lat, Long)',
      key: 'coords',
      render: (_: any, r: Office) => (
        <Space direction="vertical" size={2}>
          <Text code style={{ fontSize: 13 }}>
            Lat: {r.latitude.toFixed(6)}, Lon: {r.longitude.toFixed(6)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Geofence Radius',
      dataIndex: 'radius_meters',
      key: 'radius',
      render: (val: number) => <Tag color="blue">{val} meters</Tag>,
    },
    {
      title: 'Governed Employees',
      dataIndex: 'employee_count',
      key: 'staff',
      render: (val?: number) => (
        <Space>
          <Tag color={val && val > 0 ? 'purple' : 'default'} icon={<TeamOutlined />}>
            {val || 0} employees
          </Tag>
          {totalEmployeesInCompany > 0 && val === totalEmployeesInCompany && (
            <Tag color="green">100% of Company</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'status',
      render: (active: boolean) =>
        active ? <Tag color="success">Active</Tag> : <Tag color="error">Disabled</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Office) => {
        const hasEmployees = Boolean(r.employee_count && r.employee_count > 0);
        return (
          <Space>
            <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
                Edit on Map
              </Button>
            </PermissionGate>

            <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
              <Popconfirm
                title="Apply to ALL Company Employees?"
                description={`Every employee in your company will be assigned to "${r.name}". Their attendance check-in will be validated against this office's coordinates.`}
                onConfirm={() => handleApplyToAll(r.id, r.name)}
                okText="Yes, Apply to All"
                cancelText="Cancel"
              >
                <Button size="small" type="primary" ghost icon={<TeamOutlined />}>
                  Apply to All Staff
                </Button>
              </Popconfirm>
            </PermissionGate>

            <PermissionGate permission={PermissionKey.OFFICE_DISABLE}>
              <Popconfirm
                title={`Delete "${r.name}"?`}
                description={
                  hasEmployees
                    ? `Cannot delete: ${r.employee_count} employee(s) are assigned to this office. Reassign them first.`
                    : 'Are you sure you want to permanently delete this office geofence?'
                }
                disabled={hasEmployees}
                onConfirm={() => handleDeleteOffice(r.id, r.name)}
                okText="Yes, Delete"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={hasEmployees}
                  title={hasEmployees ? 'Cannot delete while employees are assigned' : 'Delete Geofence'}
                >
                  Delete
                </Button>
              </Popconfirm>
            </PermissionGate>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 22 }}>
            <EnvironmentOutlined style={{ color: '#1677ff', marginRight: 8 }} />
            Office Geofences & Locations
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Configure geofence boundaries and govern employee punch locations
          </Text>
        </div>

        <PermissionGate permission={PermissionKey.OFFICE_CREATE}>
          <Button
            type="primary"
            size="middle"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
          >
            Pick Office on Map
          </Button>
        </PermissionGate>
      </div>

      <Alert
        message="Geofence Validation"
        description="Employees must fall strictly within their assigned office boundary to complete check-in."
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8, fontSize: 12 }}
      />

      {/* ── Mobile View: Office Cards ── */}
      <div className="office-card-list">
        {offices.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
            <Empty description="No office locations configured yet" />
          </Card>
        ) : (
          offices.map((office) => (
            <OfficeCard
              key={office.id}
              office={office}
              totalEmployeesInCompany={totalEmployeesInCompany}
              onEdit={handleEdit}
              onApplyToAll={handleApplyToAll}
              onDelete={handleDeleteOffice}
            />
          ))
        )}
      </div>

      {/* ── Desktop View: Full Table ── */}
      <div className="office-table-desktop">
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={offices}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 850 }}
            pagination={false}
            locale={{ emptyText: <Empty description="No office locations configured yet" /> }}
          />
        </Card>
      </div>

      {/* Create Office Modal */}
      <Modal
        title="Choose Office Location on Map"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          setPasteCoordInput('');
        }}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '95vw' : 720}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="name"
                label="Office Name"
                rules={[{ required: true, message: 'Office name is required' }]}
              >
                <Input placeholder="e.g. Headquarters / Main Branch" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="address" label="Street Address">
                <Input placeholder="e.g. 100 Tech Boulevard" size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '8px 0 12px', fontSize: 13 }}>
            Interactive Map Area Selector (OpenStreetMap)
          </Divider>

          {/* Interactive Map Picker */}
          <MapPicker
            latitude={createCoords.lat}
            longitude={createCoords.lon}
            radiusMeters={createCoords.radius}
            height={isMobile ? 240 : 360}
            onChange={(lat, lon) => {
              setCreateCoords((prev) => ({ ...prev, lat, lon }));
              createForm.setFieldsValue({ latitude: lat, longitude: lon });
            }}
          />

          <Row gutter={12} style={{ marginTop: 12 }}>
            <Col xs={12} sm={8}>
              <Form.Item
                name="latitude"
                label="Latitude"
                rules={[{ required: true, message: 'Latitude is required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setCreateCoords((prev) => ({ ...prev, lat: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="longitude"
                label="Longitude"
                rules={[{ required: true, message: 'Longitude is required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setCreateCoords((prev) => ({ ...prev, lon: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="radius_meters"
                label="Radius (Meters)"
                initialValue={150}
                rules={[{ required: true, message: 'Radius is required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={10}
                  max={10000}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setCreateCoords((prev) => ({ ...prev, radius: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Form.Item
              name="apply_to_all_employees"
              valuePropName="checked"
              style={{ marginBottom: 0 }}
            >
              <Switch />
              <span style={{ marginLeft: 10, fontWeight: 600, fontSize: 13 }}>
                Apply to ALL employees in the company
              </span>
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              If enabled, all staff will be immediately assigned to this office.
            </Text>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => {
                setCreateModalVisible(false);
                setPasteCoordInput('');
              }}
              size="large"
              style={{ flex: 1, borderRadius: 8 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={creating}
              size="large"
              style={{ flex: 1.5, borderRadius: 8 }}
            >
              Save Office Geofence
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Edit Office Modal */}
      <Modal
        title={`Edit Geofence - ${editingOffice?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setPasteCoordInput('');
        }}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '95vw' : 720}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="Office Name" rules={[{ required: true }]}>
                <Input size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="address" label="Street Address">
                <Input size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '8px 0 12px', fontSize: 13 }}>
            Interactive Map Area Selector (OpenStreetMap)
          </Divider>

          {/* Interactive Map Picker */}
          <MapPicker
            latitude={editCoords.lat}
            longitude={editCoords.lon}
            radiusMeters={editCoords.radius}
            height={isMobile ? 240 : 360}
            onChange={(lat, lon) => {
              setEditCoords((prev) => ({ ...prev, lat, lon }));
              editForm.setFieldsValue({ latitude: lat, longitude: lon });
            }}
          />

          <Row gutter={12} style={{ marginTop: 12 }}>
            <Col xs={12} sm={8}>
              <Form.Item name="latitude" label="Latitude" rules={[{ required: true }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setEditCoords((prev) => ({ ...prev, lat: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="longitude" label="Longitude" rules={[{ required: true }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setEditCoords((prev) => ({ ...prev, lon: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="radius_meters"
                label="Radius (Meters)"
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={10}
                  max={10000}
                  size="large"
                  onChange={(val) => {
                    if (typeof val === 'number') {
                      setEditCoords((prev) => ({ ...prev, radius: val }));
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="is_active" label="Active Location" valuePropName="checked">
            <Switch />
          </Form.Item>

          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Form.Item
              name="apply_to_all_employees"
              valuePropName="checked"
              style={{ marginBottom: 0 }}
            >
              <Switch />
              <span style={{ marginLeft: 10, fontWeight: 600, fontSize: 13 }}>
                Apply updated geofence to ALL employees
              </span>
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Currently governs {editingOffice?.employee_count || 0} employees.
            </Text>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => {
                setEditModalVisible(false);
                setPasteCoordInput('');
              }}
              size="large"
              style={{ flex: 1, borderRadius: 8 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={updating}
              size="large"
              style={{ flex: 1.5, borderRadius: 8 }}
            >
              Save Changes
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
