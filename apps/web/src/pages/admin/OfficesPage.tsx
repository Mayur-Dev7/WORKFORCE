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
  Tooltip,
  Divider,
  Row,
  Col,
} from 'antd';
import {
  EnvironmentOutlined,
  PlusOutlined,
  EditOutlined,
  CompassOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Office, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';

const { Title, Text, Paragraph } = Typography;

export const OfficesPage: React.FC = () => {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Create Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [editForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);

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
  const handleDetectLocation = (formInstance: any) => {
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
        message.success(
          `GPS location captured: ${lat}, ${lon} (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`
        );
        setDetectingLocation(false);
      },
      (err) => {
        message.error(`GPS Error: ${err.message}. Please input coordinates manually.`);
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Coordinate parser (e.g., "37.774929, -122.419416")
  const handleParseCoordinates = (val: string, formInstance: any) => {
    setPasteCoordInput(val);
    const cleaned = val.replace(/[^\d.,\-]/g, ' ');
    const parts = cleaned.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 2) {
      const [lat, lon] = parts;
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        formInstance.setFieldsValue({ latitude: lat, longitude: lon });
        message.success(`Coordinates applied: Lat ${lat}, Lon ${lon}`);
      }
    }
  };

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const companyId = offices[0]?.company_id || '00000000-0000-0000-0000-000000000000';
      await api.post('/offices', {
        ...values,
        company_id: companyId,
      });
      message.success(
        values.apply_to_all_employees
          ? 'Office created and assigned to all company employees!'
          : 'Office location created successfully'
      );
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
          ? `Office updated and applied to all company employees!`
          : 'Office details updated successfully'
      );
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
      const res = await api.post(`/offices/${officeId}/apply-to-all`);
      message.success(
        `All employees assigned to "${officeName}"! (${res.data?.data?.affectedEmployees || 'All'} staff updated)`
      );
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to apply office to employees');
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
      render: (_: any, r: Office) => (
        <Space>
          <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
              Edit Coordinates
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
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12, marginBottom: 20 }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={3} style={{ margin: 0 }}>
              <EnvironmentOutlined style={{ color: '#1677ff', marginRight: 8 }} />
              Office Geofences & Employee Attendance Coordinates
            </Title>
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
              Configure the exact physical coordinates (Latitude, Longitude, Radius) of company offices.
              You can automatically detect your current GPS location, paste map coordinates, and
              apply the selected office geofence to <strong>all employees</strong> under your company.
            </Paragraph>
          </Col>

          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <PermissionGate permission={PermissionKey.OFFICE_CREATE}>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                Add Office Geofence
              </Button>
            </PermissionGate>
          </Col>
        </Row>
      </Card>

      <Alert
        message="Geofence Enforcement Rule"
        description="When an employee performs attendance check-in, their mobile device or browser GPS must fall strictly within the radius of their assigned office. Updating coordinates here takes effect immediately for all assigned staff."
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={offices}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Create Office Modal */}
      <Modal
        title="Add New Office Geofence"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          setPasteCoordInput('');
        }}
        footer={null}
        destroyOnClose
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="Office Name"
            rules={[{ required: true, message: 'Office name is required' }]}
          >
            <Input placeholder="e.g. Headquarters / Main Branch" />
          </Form.Item>

          <Form.Item name="address" label="Street Address">
            <Input placeholder="e.g. 100 Tech Boulevard, Suite 400" />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0 16px', fontSize: 13 }}>
            GPS Coordinates Selection
          </Divider>

          {/* Quick Helper Tools */}
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
              Quick Location Tools:
            </Text>
            <Space wrap>
              <Button
                size="small"
                icon={<CompassOutlined />}
                loading={detectingLocation}
                onClick={() => handleDetectLocation(createForm)}
              >
                Detect My Current GPS Location
              </Button>
            </Space>

            <div style={{ marginTop: 8 }}>
              <Input
                size="small"
                placeholder="Or paste 'Lat, Lon' (e.g. 37.7749, -122.4194)"
                value={pasteCoordInput}
                onChange={(e) => handleParseCoordinates(e.target.value, createForm)}
                prefix={<AimOutlined style={{ color: '#8c8c8c' }} />}
              />
            </div>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="latitude"
                label="Latitude (-90 to 90)"
                rules={[{ required: true, message: 'Valid latitude required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  placeholder="e.g. 37.774929"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="longitude"
                label="Longitude (-180 to 180)"
                rules={[{ required: true, message: 'Valid longitude required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  step={0.000001}
                  precision={6}
                  placeholder="e.g. -122.419416"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="radius_meters"
            label="Allowed Geofence Radius (Meters)"
            initialValue={150}
            rules={[{ required: true, message: 'Radius is required' }]}
          >
            <InputNumber style={{ width: '100%' }} min={10} max={10000} />
          </Form.Item>

          <div
            style={{
              background: '#e6f4ff',
              border: '1px solid #91caff',
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
              <span style={{ marginLeft: 10, fontWeight: 500 }}>
                Apply this office geofence to ALL employees in the company
              </span>
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              If enabled, all staff will be immediately assigned to this office and required to check in within this perimeter.
            </Text>
          </div>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button
                onClick={() => {
                  setCreateModalVisible(false);
                  setPasteCoordInput('');
                }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={creating}>
                Save Office Geofence
              </Button>
            </Space>
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
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="name" label="Office Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="address" label="Street Address">
            <Input />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0 16px', fontSize: 13 }}>
            GPS Coordinates Selection
          </Divider>

          {/* Quick Helper Tools */}
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
              Quick Location Tools:
            </Text>
            <Space wrap>
              <Button
                size="small"
                icon={<CompassOutlined />}
                loading={detectingLocation}
                onClick={() => handleDetectLocation(editForm)}
              >
                Detect My Current GPS Location
              </Button>
            </Space>

            <div style={{ marginTop: 8 }}>
              <Input
                size="small"
                placeholder="Or paste 'Lat, Lon' (e.g. 37.7749, -122.4194)"
                value={pasteCoordInput}
                onChange={(e) => handleParseCoordinates(e.target.value, editForm)}
                prefix={<AimOutlined style={{ color: '#8c8c8c' }} />}
              />
            </div>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="latitude" label="Latitude" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} step={0.000001} precision={6} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="longitude" label="Longitude" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} step={0.000001} precision={6} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="radius_meters"
            label="Geofence Radius (Meters)"
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: '100%' }} min={10} max={10000} />
          </Form.Item>

          <Form.Item name="is_active" label="Active Location" valuePropName="checked">
            <Switch />
          </Form.Item>

          <div
            style={{
              background: '#e6f4ff',
              border: '1px solid #91caff',
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
              <span style={{ marginLeft: 10, fontWeight: 500 }}>
                Apply this updated geofence to ALL employees in the company
              </span>
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Currently governs {editingOffice?.employee_count || 0} employees. Toggling this on ensures 100% of staff in your company are reassigned to this office.
            </Text>
          </div>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button
                onClick={() => {
                  setEditModalVisible(false);
                  setPasteCoordInput('');
                }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={updating}>
                Save Changes
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
