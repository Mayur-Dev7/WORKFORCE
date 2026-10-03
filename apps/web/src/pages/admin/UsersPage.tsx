import React, { useEffect, useState, useMemo } from 'react';
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
  Pagination,
  Empty,
  Tabs,
  Badge,
} from 'antd';
import {
  UserAddOutlined,
  SearchOutlined,
  EditOutlined,
  SmileOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  MailOutlined,
  DeleteOutlined,
  SendOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { User, Office, Department, Role, ApiResponse, PermissionKey, Invitation } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { useAuth } from '../../context/AuthContext.js';
import { useLocationWarmup, broadcastOfficeUpdate } from '../../context/LocationContext.js';

const { Title, Text, Paragraph } = Typography;

/** Mobile Card for displaying an employee cleanly on small viewports */
const EmployeeCard: React.FC<{
  user: User;
  currentUserId?: string;
  onEdit: (user: User) => void;
  onEnrollFace: (userId: string) => void;
  onRemove: (user: User) => void;
}> = ({ user, currentUserId, onEdit, onEnrollFace, onRemove }) => (
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
    {/* Top Row: Name + Code + Status */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 15 }}>{user.name}</Text>
          <Tag color="default" style={{ fontSize: 11, margin: 0, fontWeight: 600 }}>
            {user.employee_code}
          </Tag>
        </div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
          {user.email}
        </Text>
      </div>

      <Tag color={user.is_active ? 'green' : 'red'} style={{ margin: 0 }}>
        {user.is_active ? 'Active' : 'Disabled'}
      </Tag>
    </div>

    {/* Metadata Details Grid */}
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
          ROLE
        </Text>
        <div style={{ marginTop: 2 }}>
          <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
            {user.role_name}
          </Tag>
        </div>
      </div>

      <div>
        <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
          OFFICE
        </Text>
        <div style={{ marginTop: 2 }}>
          <Tag color="blue" icon={<EnvironmentOutlined />} style={{ margin: 0, fontSize: 11 }}>
            {user.office_name || 'Unassigned'}
          </Tag>
        </div>
      </div>

      <div>
        <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
          DEPARTMENT
        </Text>
        <div style={{ marginTop: 2 }}>
          <Text style={{ fontSize: 12 }}>{user.department_name || 'None'}</Text>
        </div>
      </div>

      <div>
        <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
          FACE ENROLLMENT
        </Text>
        <div style={{ marginTop: 2 }}>
          {user.face_enrolled ? (
            <Tag color="success" icon={<SmileOutlined />} style={{ margin: 0, fontSize: 11 }}>
              Enrolled
            </Tag>
          ) : (
            <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
              Not Enrolled
            </Tag>
          )}
        </div>
      </div>
    </div>

    {/* Mobile Card Actions */}
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <PermissionGate permission={PermissionKey.USER_UPDATE}>
        <Button
          size="middle"
          icon={<EditOutlined />}
          onClick={() => onEdit(user)}
          style={{ flex: 1, borderRadius: 8 }}
        >
          Edit
        </Button>
      </PermissionGate>

      <PermissionGate permission={PermissionKey.FACE_ENROLL}>
        <Button
          size="middle"
          type="primary"
          ghost
          icon={<SmileOutlined />}
          onClick={() => onEnrollFace(user.id)}
          style={{ flex: 1.3, borderRadius: 8 }}
        >
          {user.face_enrolled ? 'Replace Face' : 'Enroll Face'}
        </Button>
      </PermissionGate>

      {currentUserId !== user.id && (
        <Button
          size="middle"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onRemove(user)}
          style={{ borderRadius: 8 }}
        >
          Remove
        </Button>
      )}
    </div>
  </Card>
);

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);
  const { user: currentUser, refreshUser } = useAuth();
  const { forceRefreshOffice } = useLocationWarmup();

  const [activeTab, setActiveTab] = useState<'employees' | 'invitations'>('employees');
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string | undefined>();
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);

  // Filter assignable roles: no SUPER_ADMIN; only COMPANY_ADMIN can assign COMPANY_ADMIN
  const assignableRoles = useMemo(() => {
    return roles.filter((r) => {
      if (r.name === 'SUPER_ADMIN') return false;
      if (r.name === 'COMPANY_ADMIN' && currentUser?.role_name !== 'COMPANY_ADMIN') return false;
      return true;
    });
  }, [roles, currentUser]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<User[]>>('/users', {
        params: {
          search: search || undefined,
          roleId: filterRole || undefined,
        },
      });
      setUsers(res.data.data);
    } catch (err) {
      console.error(err);
      message.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const res = await api.get<ApiResponse<Invitation[]>>('/invitations');
      if (res.data.success && res.data.data) {
        setInvitations(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInvitations(false);
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
    fetchInvitations();
    fetchMeta();
  }, [filterRole]);

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const defaultCompanyId = offices[0]?.company_id;
      const res = await api.post<ApiResponse<User>>('/users', {
        ...values,
        company_id: defaultCompanyId,
      });
      const createdUser = res.data.data;
      message.success('Employee created successfully');
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchUsers();

      if (createdUser?.password_reset_link) {
        Modal.success({
          title: 'Employee Account Created',
          width: 520,
          content: (
            <div style={{ marginTop: 12 }}>
              <Paragraph>
                An initial password setup link has been generated for <strong>{createdUser.name}</strong> ({createdUser.email}):
              </Paragraph>
              <Input.TextArea
                value={createdUser.password_reset_link}
                readOnly
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
              />
              <Button
                type="primary"
                onClick={() => {
                  navigator.clipboard.writeText(createdUser.password_reset_link || '');
                  message.success('Password setup link copied to clipboard!');
                }}
              >
                Copy Setup Link
              </Button>
            </div>
          ),
        });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to create employee');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (values: any) => {
    setInviting(true);
    try {
      await api.post('/invitations', values);
      message.success(`Invitation sent to ${values.email}`);
      setInviteModalVisible(false);
      inviteForm.resetFields();
      fetchInvitations();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      await api.delete(`/invitations/${invitationId}`);
      message.info('Invitation revoked');
      fetchInvitations();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to revoke invitation');
    }
  };

  const handleRemoveUser = (targetUser: User) => {
    Modal.confirm({
      title: `Remove ${targetUser.name} from company?`,
      content: (
        <div>
          <p>This action will immediately:</p>
          <ul>
            <li>Detach the employee from this company.</li>
            <li>Cancel any pending leave requests.</li>
            <li>Safely auto-close any open attendance sessions.</li>
            <li>Delete their face biometric registration.</li>
            <li>Revoke their active sessions and tokens immediately.</li>
          </ul>
        </div>
      ),
      okText: 'Yes, Remove Employee',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.post(`/users/${targetUser.id}/remove`);
          message.success(`${targetUser.name} has been removed from the company`);
          fetchUsers();
        } catch (err: any) {
          message.error(err.response?.data?.error?.message || 'Failed to remove employee');
        }
      },
    });
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
      if (currentUser && editingUser.id === currentUser.id) {
        await refreshUser();
        await forceRefreshOffice(values.office_id);
      }
      broadcastOfficeUpdate();
      setEditModalVisible(false);
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to update employee');
    } finally {
      setUpdating(false);
    }
  };

  const paginatedMobileUsers = useMemo(() => {
    const startIdx = (mobilePage - 1) * mobilePageSize;
    return users.slice(startIdx, startIdx + mobilePageSize);
  }, [users, mobilePage]);

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

          {currentUser?.id !== r.id && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveUser(r)}
            >
              Remove
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const invitationColumns = [
    {
      title: 'Email Address',
      dataIndex: 'email',
      key: 'email',
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: 'Invited Role',
      dataIndex: 'role_name',
      key: 'role_name',
      render: (val: string) => <Tag color="purple">{val}</Tag>,
    },
    {
      title: 'Office',
      dataIndex: 'office_name',
      key: 'office_name',
      render: (val: string) => val ? <Tag color="blue">{val}</Tag> : <Text type="secondary">Company Default</Text>,
    },
    {
      title: 'Department',
      dataIndex: 'department_name',
      key: 'department_name',
      render: (val: string | null) => val || <Text type="secondary">N/A</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        if (val === 'pending') return <Tag color="orange">Pending</Tag>;
        if (val === 'accepted') return <Tag color="green">Accepted</Tag>;
        return <Tag color="default">{val}</Tag>;
      },
    },
    {
      title: 'Expires At',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, inv: Invitation) => (
        inv.status === 'pending' ? (
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleRevokeInvitation(inv.id)}
          >
            Revoke
          </Button>
        ) : null
      ),
    },
  ];

  const pendingCount = invitations.filter((i) => i.status === 'pending').length;

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
            <TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Staff & Employee Directory
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Manage employee credentials, invite members by email, and configure office assignments
          </Text>
        </div>

        <Space wrap>
          <PermissionGate permission={PermissionKey.USER_CREATE}>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => setInviteModalVisible(true)}
              size="middle"
              style={{ borderRadius: 8 }}
            >
              Invite Employee
            </Button>
            <Button
              icon={<UserAddOutlined />}
              onClick={() => setCreateModalVisible(true)}
              size="middle"
              style={{ borderRadius: 8 }}
            >
              Add Manually
            </Button>
          </PermissionGate>
        </Space>
      </div>

      {/* Tabs: Active Employees vs Invitations */}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        items={[
          {
            key: 'employees',
            label: `Employees (${users.length})`,
            children: (
              <>
                {/* ── Filter Bar ── */}
                <Card
                  size="small"
                  style={{ borderRadius: 12, marginBottom: 16 }}
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input
                      placeholder="Search by name, code, or email..."
                      prefix={<SearchOutlined />}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onPressEnter={fetchUsers}
                      allowClear
                      style={{ flex: isMobile ? '1 1 100%' : '1 1 260px' }}
                    />

                    <Select
                      placeholder="Filter by Role"
                      allowClear
                      value={filterRole}
                      onChange={setFilterRole}
                      style={{ flex: isMobile ? '1 1 100%' : '0 0 180px' }}
                    >
                      {assignableRoles.map((r) => (
                        <Select.Option key={r.id} value={r.id}>
                          {r.name}
                        </Select.Option>
                      ))}
                    </Select>

                    <Button
                      type="primary"
                      onClick={fetchUsers}
                      loading={loading}
                      style={{ width: isMobile ? '100%' : 'auto', borderRadius: 8 }}
                    >
                      Apply Filters
                    </Button>
                  </div>
                </Card>

                {/* ── Mobile View: Employee Touch Cards ── */}
                <div className="employee-card-list">
                  {users.length === 0 && !loading ? (
                    <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
                      <Empty description="No employees found" />
                    </Card>
                  ) : (
                    <>
                      {paginatedMobileUsers.map((u) => (
                        <EmployeeCard
                          key={u.id}
                          user={u}
                          currentUserId={currentUser?.id}
                          onEdit={handleEdit}
                          onEnrollFace={(id) => navigate(`/admin/users/${id}/face-enrollment`)}
                          onRemove={handleRemoveUser}
                        />
                      ))}

                      {users.length > mobilePageSize && (
                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                          <Pagination
                            simple
                            current={mobilePage}
                            pageSize={mobilePageSize}
                            total={users.length}
                            onChange={(page) => setMobilePage(page)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── Desktop View: Table ── */}
                <div className="employee-table-desktop">
                  <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
                    <Table
                      dataSource={users}
                      columns={columns}
                      rowKey="id"
                      loading={loading}
                      scroll={{ x: 850 }}
                      pagination={{ pageSize: 10 }}
                      locale={{ emptyText: <Empty description="No employees found" /> }}
                    />
                  </Card>
                </div>
              </>
            ),
          },
          {
            key: 'invitations',
            label: (
              <span>
                Pending Invitations <Badge count={pendingCount} offset={[6, -2]} />
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
                <Table
                  dataSource={invitations}
                  columns={invitationColumns}
                  rowKey="id"
                  loading={loadingInvitations}
                  scroll={{ x: 800 }}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: <Empty description="No invitations sent yet" /> }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Invite Modal */}
      <Modal
        title="Invite Employee via Office Email"
        open={inviteModalVisible}
        onCancel={() => setInviteModalVisible(false)}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '94vw' : 500}
      >
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label="Corporate / Work Email"
            rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
            help="When this employee signs in with Google using this email, they will automatically join your company."
          >
            <Input placeholder="e.g. employee@company.com" size="large" />
          </Form.Item>

          <Form.Item
            name="role_id"
            label="Assigned Role"
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select placeholder="Select role" size="large">
              {assignableRoles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="office_id" label="Office Location (Optional)">
            <Select placeholder="Select office (or default to primary)" allowClear size="large">
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="department_id" label="Department (Optional)">
            <Select placeholder="Select department" allowClear size="large">
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button onClick={() => setInviteModalVisible(false)} size="large" style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={inviting}
              size="large"
              icon={<SendOutlined />}
              style={{ flex: 1.5 }}
            >
              Send Invitation
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Manual Create Modal */}
      <Modal
        title="Create New Employee (Manual)"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '94vw' : 520}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="employee_code"
            label="Employee Code"
            rules={[{ required: true, message: 'Employee code required' }]}
          >
            <Input placeholder="e.g. EMP-104" size="large" />
          </Form.Item>

          <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Rachel Adams" size="large" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Corporate Email"
            rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
          >
            <Input placeholder="e.g. rachel@workforce.com" size="large" />
          </Form.Item>

          <Form.Item
            name="office_id"
            label="Assigned Office (Geofence Target)"
            rules={[{ required: true, message: 'Office assignment is required' }]}
          >
            <Select placeholder="Select office location" size="large">
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name} ({o.radius_meters}m boundary)
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="department_id" label="Department">
            <Select placeholder="Select department (optional)" allowClear size="large">
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="role_id" label="Role & Permissions" rules={[{ required: true }]}>
            <Select placeholder="Select role" size="large">
              {assignableRoles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="password" label="Temporary Password" initialValue="Password123!">
            <Input.Password size="large" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => setCreateModalVisible(false)}
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
              Create Employee
            </Button>
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
        centered
        width={isMobile ? '94vw' : 520}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>

          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input size="large" />
          </Form.Item>

          <Form.Item name="office_id" label="Office">
            <Select size="large">
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="department_id" label="Department">
            <Select allowClear size="large">
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="role_id" label="Role">
            <Select size="large">
              {assignableRoles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="Account Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => setEditModalVisible(false)}
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
export default UsersPage;
