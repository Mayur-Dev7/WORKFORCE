import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Modal,
  Form,
  Switch,
  message,
  Typography,
} from 'antd';
import {
  UserAddOutlined,
  SearchOutlined,
  EditOutlined,
  SmileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { User, Office, Department, Role, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';

const { Title, Text } = Typography;

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string | undefined>();

  // Create Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (filterRole) params.roleId = filterRole;

      const res = await api.get<ApiResponse<User[]>>('/users', { params });
      setUsers(res.data.data);
    } catch {
      message.error('Failed to load employees list');
    } finally {
      setLoading(false);
    }
  };

  const fetchMeta = async () => {
    try {
      const [officesRes, deptsRes, rolesRes] = await Promise.all([
        api.get<ApiResponse<Office[]>>('/offices'),
        api.get<ApiResponse<Department[]>>('/departments'),
        api.get<ApiResponse<Role[]>>('/roles'),
      ]);
      setOffices(officesRes.data.data);
      setDepartments(deptsRes.data.data);
      setRoles(rolesRes.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchMeta();
  }, [filterRole]);

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const defaultCompanyId = offices[0]?.company_id;
      await api.post('/users', {
        ...values,
        company_id: defaultCompanyId,
      });
      message.success('Employee created successfully');
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to create employee');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      name: user.name,
      email: user.email,
      office_id: user.office_id,
      department_id: user.department_id,
      role_id: user.role_id,
      is_active: user.is_active,
    });
    setEditModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    if (!editingUser) return;
    setUpdating(true);
    try {
      await api.patch(`/users/${editingUser.id}`, values);
      message.success('Employee updated successfully');
      setEditModalVisible(false);
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to update employee');
    } finally {
      setUpdating(false);
    }
  };

  const columns = [
    {
      title: 'Employee Code',
      dataIndex: 'employee_code',
      key: 'code',
      render: (val: string) => <strong>{val}</strong>,
    },
    {
      title: 'Name & Email',
      key: 'name_email',
      render: (_: any, r: User) => (
        <div>
          <Text strong>{r.name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Assigned Office',
      dataIndex: 'office_name',
      key: 'office',
      render: (val: string) => <Tag color="blue">{val || 'Unassigned'}</Tag>,
    },
    {
      title: 'Department',
      dataIndex: 'department_name',
      key: 'department',
      render: (val: string | null) => val || <Text type="secondary">N/A</Text>,
    },
    {
      title: 'Role',
      dataIndex: 'role_name',
      key: 'role',
      render: (val: string) => <Tag color="purple">{val}</Tag>,
    },
    {
      title: 'Biometric Face',
      dataIndex: 'face_enrolled',
      key: 'face',
      render: (enrolled: boolean) =>
        enrolled ? (
          <Tag color="success" icon={<SmileOutlined />}>
            Enrolled
          </Tag>
        ) : (
          <Tag color="warning">Not Enrolled</Tag>
        ),
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
      render: (_: any, r: User) => (
        <Space size="middle">
          <PermissionGate permission={PermissionKey.USER_UPDATE}>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
              Edit
            </Button>
          </PermissionGate>

          <PermissionGate permission={PermissionKey.FACE_ENROLL}>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<SmileOutlined />}
              onClick={() => navigate(`/admin/users/${r.id}/face-enrollment`)}
            >
              {r.face_enrolled ? 'Replace Face' : 'Enroll Face'}
            </Button>
          </PermissionGate>
        </Space>
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
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Staff & Employee Directory
            </Title>
            <Text type="secondary">Manage employee credentials, biometric profiles, and office locations</Text>
          </div>

          <PermissionGate permission={PermissionKey.USER_CREATE}>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              New Employee
            </Button>
          </PermissionGate>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder="Search by name, code, or email..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={fetchUsers}
            style={{ width: 300 }}
          />

          <Select
            placeholder="Filter by Role"
            allowClear
            value={filterRole}
            onChange={setFilterRole}
            style={{ width: 180 }}
          >
            {roles.map((r) => (
              <Select.Option key={r.id} value={r.id}>
                {r.name}
              </Select.Option>
            ))}
          </Select>

          <Button onClick={fetchUsers}>Apply Filters</Button>
        </div>

        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Create New Employee"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="employee_code"
            label="Employee Code"
            rules={[{ required: true, message: 'Employee code required' }]}
          >
            <Input placeholder="e.g. EMP-104" />
          </Form.Item>

          <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Rachel Adams" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Corporate Email"
            rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
          >
            <Input placeholder="e.g. rachel@workforce.com" />
          </Form.Item>

          <Form.Item
            name="office_id"
            label="Assigned Office (Geofence Target)"
            rules={[{ required: true, message: 'Office assignment is required' }]}
          >
            <Select placeholder="Select office location">
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name} ({o.radius_meters}m boundary)
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="department_id" label="Department">
            <Select placeholder="Select department (optional)" allowClear>
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="role_id" label="Role & Permissions" rules={[{ required: true }]}>
            <Select placeholder="Select role">
              {roles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="password" label="Temporary Password" initialValue="Password123!">
            <Input.Password />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={creating}>
                Create Employee
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={`Edit Employee - ${editingUser?.employee_code}`}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="office_id" label="Office">
            <Select>
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="department_id" label="Department">
            <Select allowClear>
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="role_id" label="Role">
            <Select>
              {roles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="Account Active" valuePropName="checked">
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
