import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Typography, Tag, Empty } from 'antd';
import { PlusOutlined, EditOutlined, AppstoreOutlined, TeamOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Department, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Title, Text } = Typography;

/** Mobile card for displaying a single department */
const DepartmentCard: React.FC<{
  dept: Department;
  onEdit: (dept: Department) => void;
}> = ({ dept, onEdit }) => (
  <Card
    size="small"
    style={{
      marginBottom: 10,
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}
    styles={{ body: { padding: '14px 14px' } }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <Text strong style={{ fontSize: 15, color: '#111827' }}>{dept.name}</Text>
        <div style={{ marginTop: 4 }}>
          <Tag color="blue" icon={<TeamOutlined />} style={{ margin: 0, fontSize: 11 }}>
            {dept.employee_count || 0} employees
          </Tag>
        </div>
      </div>

      <PermissionGate permission={PermissionKey.DEPARTMENT_UPDATE}>
        <Button
          size="middle"
          icon={<EditOutlined />}
          onClick={() => onEdit(dept)}
          style={{ borderRadius: 8 }}
        >
          Edit
        </Button>
      </PermissionGate>
    </div>
  </Card>
);

export const DepartmentsPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<Department[]>>('/departments');
      setDepartments(res.data.data);
    } catch {
      message.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleOpenCreate = () => {
    setEditingDept(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    form.setFieldsValue({ name: dept.name });
    setModalVisible(true);
  };

  const handleSubmit = async (values: { name: string }) => {
    setSubmitting(true);
    try {
      if (editingDept) {
        await api.patch(`/departments/${editingDept.id}`, values);
        message.success('Department updated successfully');
      } else {
        const companyId = departments[0]?.company_id || '00000000-0000-0000-0000-000000000000';
        await api.post('/departments', { company_id: companyId, name: values.name });
        message.success('Department created successfully');
      }
      setModalVisible(false);
      fetchDepartments();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'Department Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <strong>{val}</strong>,
    },
    {
      title: 'Active Staff Members',
      dataIndex: 'employee_count',
      key: 'count',
      render: (val?: number) => `${val || 0} employees`,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Department) => (
        <PermissionGate permission={PermissionKey.DEPARTMENT_UPDATE}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(r)}>
            Edit
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 24 }}>
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
            <AppstoreOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Organizational Departments
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Define business units and departmental divisions
          </Text>
        </div>

        <PermissionGate permission={PermissionKey.DEPARTMENT_CREATE}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            size="middle"
            style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
          >
            New Department
          </Button>
        </PermissionGate>
      </div>

      {/* ── Mobile View: Department Cards ── */}
      <div className="department-card-list">
        {departments.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
            <Empty description="No departments created yet" />
          </Card>
        ) : (
          departments.map((dept) => (
            <DepartmentCard key={dept.id} dept={dept} onEdit={handleOpenEdit} />
          ))
        )}
      </div>

      {/* ── Desktop View: Table ── */}
      <div className="department-table-desktop">
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={departments}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={false}
            locale={{ emptyText: <Empty description="No departments created yet" /> }}
          />
        </Card>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editingDept ? 'Edit Department' : 'Create Department'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '92vw' : 480}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Department Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Quality Assurance" size="large" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => setModalVisible(false)}
              size="large"
              style={{ flex: 1, borderRadius: 8 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              size="large"
              style={{ flex: 1.5, borderRadius: 8 }}
            >
              Save Department
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
