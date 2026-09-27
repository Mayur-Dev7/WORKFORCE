import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  DatePicker,
  Select,
  Space,
  Tag,
  Typography,
  message,
  Row,
  Col,
} from 'antd';
import { DownloadOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Office, Department, AttendanceReportItem, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<AttendanceReportItem[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [officeId, setOfficeId] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [status, setStatus] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ALL');

  const fetchFilters = async () => {
    try {
      const [officesRes, deptsRes] = await Promise.all([
        api.get<ApiResponse<Office[]>>('/offices'),
        api.get<ApiResponse<Department[]>>('/departments'),
      ]);
      setOffices(officesRes.data.data);
      setDepartments(deptsRes.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const getFilterParams = () => {
    const params: any = {};
    if (dateRange && dateRange[0] && dateRange[1]) {
      params.startDate = dateRange[0].startOf('day').toISOString();
      params.endDate = dateRange[1].endOf('day').toISOString();
    }
    if (officeId) params.officeId = officeId;
    if (departmentId) params.departmentId = departmentId;
    if (status !== 'ALL') params.status = status;
    return params;
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = getFilterParams();
      const res = await api.get<ApiResponse<AttendanceReportItem[]>>('/reports/attendance', { params });
      setReports(res.data.data);
    } catch {
      message.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilters();
    fetchReports();
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = getFilterParams();
      const res = await api.get('/reports/attendance/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workforce-attendance-report-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('Report exported to CSV successfully');
    } catch {
      message.error('Failed to export CSV report');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_: any, r: AttendanceReportItem) => (
        <div>
          <Text strong>{r.employee_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.employee_code}
          </Text>
        </div>
      ),
    },
    {
      title: 'Department',
      dataIndex: 'department_name',
      key: 'dept',
    },
    {
      title: 'Office Location',
      dataIndex: 'office_name',
      key: 'office',
      render: (val: string) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: 'Check-In',
      dataIndex: 'check_in_at',
      key: 'check_in',
      render: (val: string) => dayjs(val).format('MMM DD, YYYY hh:mm A'),
    },
    {
      title: 'Check-Out',
      dataIndex: 'check_out_at',
      key: 'check_out',
      render: (val: string | null) => (val ? dayjs(val).format('MMM DD, YYYY hh:mm A') : <Tag color="processing">In Session</Tag>),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_minutes',
      key: 'duration',
      render: (mins: number | null) => {
        if (mins === null) return '--';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
      },
    },
    {
      title: 'Face Match',
      dataIndex: 'check_in_face_similarity',
      key: 'similarity',
      render: (val: number) => <Tag color="green">{(val * 100).toFixed(0)}%</Tag>,
    },
    {
      title: 'Geofence Distance',
      dataIndex: 'check_in_distance_meters',
      key: 'distance',
      render: (val: number) => `${Math.round(val)}m`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) =>
        val === 'COMPLETED' ? <Tag color="green">Completed</Tag> : <Tag color="processing">Active</Tag>,
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Workforce Attendance Reports & CSV Export
            </Title>
            <Text type="secondary">Query historical biometric sessions and export corporate records</Text>
          </div>

          <PermissionGate permission={PermissionKey.REPORTS_EXPORT}>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExportCsv}
              loading={exporting}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              Export CSV Report
            </Button>
          </PermissionGate>
        </div>

        {/* Filter Controls */}
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          <Col xs={24} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => setDateRange(dates as any)}
            />
          </Col>

          <Col xs={12} md={5}>
            <Select
              placeholder="Office Location"
              allowClear
              value={officeId}
              onChange={setOfficeId}
              style={{ width: '100%' }}
            >
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name}
                </Select.Option>
              ))}
            </Select>
          </Col>

          <Col xs={12} md={5}>
            <Select
              placeholder="Department"
              allowClear
              value={departmentId}
              onChange={setDepartmentId}
              style={{ width: '100%' }}
            >
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Col>

          <Col xs={12} md={4}>
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: '100%' }}
            >
              <Select.Option value="ALL">All States</Select.Option>
              <Select.Option value="ACTIVE">Active (In Session)</Select.Option>
              <Select.Option value="COMPLETED">Completed</Select.Option>
            </Select>
          </Col>

          <Col xs={12} md={4}>
            <Button icon={<FilterOutlined />} type="primary" onClick={fetchReports} block>
              Filter Records
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={reports}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 12 }}
          locale={{ emptyText: 'No attendance records match the chosen filters' }}
        />
      </Card>
    </div>
  );
};
