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
} from 'antd';
import {
  EnvironmentOutlined,
  PlusOutlined,
  EditOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Office, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';

const { Title, Text, Paragraph } = Typography;

export const OfficesPage: React.FC = () => {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [editForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);

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

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const companyId = offices[0]?.company_id || '00000000-0000-0000-0000-000000000000';
      await api.post('/offices', {
        ...values,
        company_id: companyId,
      });
      message.success('Office location created successfully');
      setCreateModalVisible(false);
      createForm.resetFields();
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
    });
    setEditModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    if (!editingOffice) return;
    setUpdating(true);
    try {
      await api.patch(`/offices/${editingOffice.id}`, values);
      message.success('Office details updated successfully');
      setEditModalVisible(false);
      fetchOffices();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to update office');
    } finally {
      setUpdating(false);
    }
  };

  const columns = [
    {
      title: 'Office Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <strong>{val}</strong>,
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      render: (val: string | null) => val || <Text type="secondary">N/A</Text>,
    },
    {
      title: 'Geofence Center Coordinates',
      key: 'coords',
      render: (_: any, r: Office) => (
        <Space direction="vertical" size={2}>
          <Text code>
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
      title: 'Assigned Staff',
      dataIndex: 'employee_count',
      key: 'staff',
      render: (val?: number) => `${val || 0} employees`,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'status',
      render: (active: boolean) =>
        active ? <Tag color="green">Active</Tag> : <Tag color="red">Disabled</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Office) => (
        <PermissionGate permission={PermissionKey.OFFICE_UPDATE}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
            Edit Geofence
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Office Locations & Physical Geofences
            </Title>
            <Text type="secondary">Configure geographical boundaries for attendance validation</Text>
          </div>

          <PermissionGate permission={PermissionKey.OFFICE_CREATE}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              Add Office Location
            </Button>
          </PermissionGate>
        </div>

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
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="Office Name"
            rules={[{ required: true, message: 'Office name required' }]}
          >
            <Input placeholder="e.g. Austin Regional Headquarters" />
          </Form.Item>

          <Form.Item name="address" label="Street Address">
            <Input placeholder="e.g. 100 Congress Ave, Austin, TX" />
          </Form.Item>

          <Form.Item
            name="latitude"
            label="Latitude (-90 to 90)"
            rules={[{ required: true, message: 'Valid latitude required' }]}
          >
            <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="e.g. 30.2672" />
          </Form.Item>

          <Form.Item
            name="longitude"
            label="Longitude (-180 to 180)"
            rules={[{ required: true, message: 'Valid longitude required' }]}
          >
            <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="e.g. -97.7431" />
          </Form.Item>

          <Form.Item
            name="radius_meters"
            label="Allowed Geofence Radius (Meters)"
            initialValue={150}
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: '100%' }} min={10} max={5000} />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={creating}>
                Save Office
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Edit Office Modal */}
      <Modal
        title={`Edit Geofence - ${editingOffice?.name}`}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="name" label="Office Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="address" label="Street Address">
            <Input />
          </Form.Item>

          <Form.Item name="latitude" label="Latitude" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} step={0.0001} />
          </Form.Item>

          <Form.Item name="longitude" label="Longitude" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} step={0.0001} />
          </Form.Item>

          <Form.Item name="radius_meters" label="Geofence Radius (Meters)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={10} max={5000} />
          </Form.Item>

          <Form.Item name="is_active" label="Active Location" valuePropName="checked">
            <Switch />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setEditModalVisible(false)}>Cancel</Button>
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
