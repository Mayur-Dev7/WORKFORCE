import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Checkbox,
  message,
  Typography,
  Row,
  Col,
  Empty,
} from 'antd';
import { SafetyCertificateOutlined, EditOutlined, KeyOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Role, Permission, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Title, Text } = Typography;

/** Mobile card representing a single RBAC role */
const RoleCard: React.FC<{
  role: Role;
  onEdit: (role: Role) => void;
}> = ({ role, onEdit }) => {
  const perms = role.permissions || [];
  const isCompanyAdmin = role.name === 'COMPANY_ADMIN';

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: '14px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <Space>
            <Tag color="purple" style={{ fontSize: 13, padding: '2px 8px', margin: 0, fontWeight: 600 }}>
              {role.name}
            </Tag>
            {isCompanyAdmin && (
              <Tag color="gold" style={{ fontSize: 11, fontWeight: 600 }}>
                Superior Role
              </Tag>
            )}
          </Space>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {isCompanyAdmin
              ? 'Superior administrator with full system capabilities for the company'
              : role.description}
          </div>
        </div>

        <PermissionGate permission={PermissionKey.ROLE_UPDATE}>
          <Button
            size="middle"
            icon={<EditOutlined />}
            disabled={isCompanyAdmin}
            onClick={() => onEdit(role)}
            style={{ borderRadius: 8 }}
          >
            {isCompanyAdmin ? 'Full Access' : 'Edit'}
          </Button>
        </PermissionGate>
      </div>

      {/* Permissions pill list */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
        <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
          ASSIGNED PERMISSIONS ({perms.length})
        </Text>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {perms.length > 0 ? (
            perms.map((p: any) => {
              const key = typeof p === 'string' ? p : p.key;
              return (
                <Tag key={key} style={{ fontSize: 11, margin: 0 }}>
                  {key}
                </Tag>
              );
            })
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>No permissions assigned</Text>
          )}
        </div>
      </div>
    </Card>
  );
};

export const RolesPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get<ApiResponse<Role[]>>('/roles'),
        api.get<ApiResponse<Permission[]>>('/roles/permissions'),
      ]);
      const companyRoles = (rolesRes.data.data || []).filter((r) => r.name !== 'SUPER_ADMIN');
      setRoles(companyRoles);
      setAllPermissions(permsRes.data.data);
    } catch {
      message.error('Failed to load RBAC roles & permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenEdit = (role: Role) => {
    setEditingRole(role);
    setSelectedPermissions(role.permissions?.map((p: any) => (typeof p === 'string' ? p : p.key)) || []);
    setModalVisible(true);
  };

  const handleSavePermissions = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await api.patch(`/roles/${editingRole.id}/permissions`, {
        permissions: selectedPermissions,
      });
      message.success(`Updated permissions for ${editingRole.name}`);
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to update role permissions');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Role Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => (
        <Space>
          <Tag color="purple">{val}</Tag>
          {val === 'COMPANY_ADMIN' && <Tag color="gold">Superior Role</Tag>}
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string, r: Role) =>
        r.name === 'COMPANY_ADMIN'
          ? 'Superior administrator with full system capabilities for the company'
          : desc,
    },
    {
      title: 'Assigned Permissions',
      dataIndex: 'permissions',
      key: 'perms',
      render: (perms: any[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 500 }}>
          {perms && perms.length > 0 ? (
            perms.map((p: any) => {
              const key = typeof p === 'string' ? p : p.key;
              return <Tag key={key}>{key}</Tag>;
            })
          ) : (
            <Text type="secondary">No permissions assigned</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Role) => (
        <PermissionGate permission={PermissionKey.ROLE_UPDATE}>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={r.name === 'COMPANY_ADMIN'}
            onClick={() => handleOpenEdit(r)}
          >
            {r.name === 'COMPANY_ADMIN' ? 'Full Access' : 'Edit Permissions'}
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 22 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Role-Based Access Control (RBAC)
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Granular capabilities and system permissions assigned to each organizational role
        </Text>
      </div>

      {/* ── Mobile View: Role Cards ── */}
      <div className="role-card-list">
        {roles.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
            <Empty description="No roles configured" />
          </Card>
        ) : (
          roles.map((role) => (
            <RoleCard key={role.id} role={role} onEdit={handleOpenEdit} />
          ))
        )}
      </div>

      {/* ── Desktop View: Table ── */}
      <div className="role-table-desktop">
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={roles}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 750 }}
            pagination={false}
            locale={{ emptyText: <Empty description="No roles configured" /> }}
          />
        </Card>
      </div>

      {/* Permissions Modal */}
      <Modal
        title={`Edit Permissions: ${editingRole?.name}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={isMobile ? '94vw' : 720}
        centered
        footer={null}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <Checkbox.Group
            value={selectedPermissions}
            onChange={(checkedValues) => setSelectedPermissions(checkedValues as string[])}
            style={{ width: '100%' }}
          >
            <Row gutter={[12, 12]}>
              {allPermissions.map((p) => (
                <Col xs={24} sm={12} key={p.id}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #f0f0f0',
                      background: '#fafafa',
                    }}
                  >
                    <Checkbox value={p.key}>
                      <Text strong style={{ fontSize: 13 }}>{p.key}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {p.description}
                      </Text>
                    </Checkbox>
                  </div>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <Button
            size="large"
            onClick={() => setModalVisible(false)}
            style={{ flex: 1, borderRadius: 8 }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            size="large"
            loading={saving}
            onClick={handleSavePermissions}
            style={{ flex: 1.5, borderRadius: 8 }}
          >
            Save Permissions
          </Button>
        </div>
      </Modal>
    </div>
  );
};
