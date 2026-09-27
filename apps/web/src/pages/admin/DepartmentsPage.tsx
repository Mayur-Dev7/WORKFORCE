import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, AppstoreOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Department, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';

const { Title, Text } = Typography;

export const DepartmentsPage: React.FC = () => {
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
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Organizational Departments
            </Title>
            <Text type="secondary">Define business units and departmental divisions</Text>
          </div>

          <PermissionGate permission={PermissionKey.DEPARTMENT_CREATE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              New Department
            </Button>
          </PermissionGate>
        </div>

        <Table dataSource={departments} columns={columns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title={editingDept ? 'Edit Department' : 'Create Department'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Department Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Quality Assurance" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Save
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
