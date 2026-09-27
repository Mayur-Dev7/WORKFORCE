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
} from 'antd';
import { SafetyCertificateOutlined, EditOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Role, Permission, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';

const { Title, Text, Paragraph } = Typography;

export const RolesPage: React.FC = () => {
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
      setRoles(rolesRes.data.data);
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
      render: (val: string) => <Tag color="purple">{val}</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
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
            disabled={r.name === 'SUPER_ADMIN'}
            onClick={() => handleOpenEdit(r)}
          >
            Edit Permissions
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div style={{ marginBottom: 20 }}>
          <Title level={3} style={{ margin: 0 }}>
            Role-Based Access Control (RBAC)
          </Title>
          <Text type="secondary">Granular permissions and capabilities assigned to each role</Text>
        </div>

        <Table dataSource={roles} columns={columns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title={`Edit Permissions for Role: ${editingRole?.name}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={saving}
            onClick={handleSavePermissions}
          >
            Save Permissions
          </Button>,
        ]}
      >
        <div style={{ padding: '10px 0' }}>
          <Checkbox.Group
            value={selectedPermissions}
            onChange={(checkedValues) => setSelectedPermissions(checkedValues as string[])}
            style={{ width: '100%' }}
          >
            <Row gutter={[16, 16]}>
              {allPermissions.map((p) => (
                <Col span={12} key={p.id}>
                  <Checkbox value={p.key}>
                    <Text strong>{p.key}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {p.description}
                    </Text>
                  </Checkbox>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
        </div>
      </Modal>
    </div>
  );
};
