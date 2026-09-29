import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Space,
  Tag,
  Typography,
  message,
  Row,
  Col,
  Pagination,
  Empty,
} from 'antd';
import { DownloadOutlined, FilterOutlined, ReloadOutlined, FileTextOutlined, EnvironmentOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { Office, Department, AttendanceReportItem, ApiResponse, PermissionKey } from '@workforce/shared';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { ResponsiveDateRangePicker } from '../../components/common/ResponsiveDateRangePicker.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

/** Mobile Card representation for a report row */
const ReportCard: React.FC<{ r: AttendanceReportItem }> = ({ r }) => {
  const isCompleted = Boolean(r.check_out_at);
  const matchPct = Math.round((r.check_in_face_similarity || 0) * 100);

  return (
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <Text strong style={{ fontSize: 15 }}>{r.employee_name}</Text>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
            {r.employee_code} • {r.department_name || 'No Dept'}
          </Text>
        </div>

        <Tag color={isCompleted ? 'default' : 'processing'} style={{ margin: 0, fontSize: 11 }}>
          {isCompleted ? 'Completed' : 'In Session'}
        </Tag>
      </div>

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
            CHECK-IN
          </Text>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 2 }}>
            {dayjs(r.check_in_at).format('MMM DD, hh:mm A')}
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHECK-OUT
          </Text>
          <div style={{ fontSize: 12, fontWeight: 600, color: isCompleted ? '#111827' : '#1677ff', marginTop: 2 }}>
            {r.check_out_at ? dayjs(r.check_out_at).format('MMM DD, hh:mm A') : 'Currently Active'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tag color="blue" icon={<EnvironmentOutlined />} style={{ margin: 0, fontSize: 11 }}>
          {r.office_name}
        </Tag>
        <Tag color="green" icon={<SafetyCertificateOutlined />} style={{ margin: 0, fontSize: 11 }}>
          Match: {matchPct}%
        </Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>
          📍 {Math.round(r.check_in_distance_meters)}m
        </Text>
        {r.duration_minutes !== null && (
          <Text strong style={{ fontSize: 12, marginLeft: 'auto' }}>
            {Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m
          </Text>
        )}
      </div>
    </Card>
  );
};

export const ReportsPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [reports, setReports] = useState<AttendanceReportItem[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;

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

  const paginatedMobileReports = useMemo(() => {
    const startIdx = (mobilePage - 1) * mobilePageSize;
    return reports.slice(startIdx, startIdx + mobilePageSize);
  }, [reports, mobilePage]);

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
      render: (val: string | null) => (val ? dayjs(val).format('MMM DD, YYYY hh:mm A') : <Tag color="processing">In Progress</Tag>),
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_: any, r: AttendanceReportItem) => {
        if (r.duration_minutes === null) return '--';
        const hrs = Math.floor(r.duration_minutes / 60);
        const mins = r.duration_minutes % 60;
        return `${hrs}h ${mins}m`;
      },
    },
    {
      title: 'Biometrics Match',
      dataIndex: 'face_similarity',
      key: 'face',
      render: (val: number) => <Tag color="green">{(val * 100).toFixed(0)}%</Tag>,
    },
    {
      title: 'Distance',
      dataIndex: 'distance_meters',
      key: 'distance',
      render: (val: number) => `${Math.round(val)}m`,
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
            <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Attendance Reports & CSV Export
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Filter, aggregate, and download corporate time tracking reports
          </Text>
        </div>

        <PermissionGate permission={PermissionKey.REPORTS_EXPORT}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportCsv}
            loading={exporting}
            style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
          >
            Export to CSV
          </Button>
        </PermissionGate>
      </div>

      {/* ── Filter Card ── */}
      <Card
        size="small"
        style={{ borderRadius: 12, marginBottom: 16 }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Date Range</Text>
            <ResponsiveDateRangePicker
              value={dateRange}
              onChange={(val) => setDateRange(val)}
              format="DD MMM YYYY"
              size="middle"
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Office Location</Text>
            <Select
              placeholder="All Offices"
              allowClear
              value={officeId}
              onChange={setOfficeId}
              style={{ width: '100%' }}
              size="middle"
            >
              {offices.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {o.name}
                </Select.Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Department</Text>
            <Select
              placeholder="All Departments"
              allowClear
              value={departmentId}
              onChange={setDepartmentId}
              style={{ width: '100%' }}
              size="middle"
            >
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name}
                </Select.Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Status</Text>
            <Select
              value={status}
              onChange={(val) => setStatus(val)}
              style={{ width: '100%' }}
              size="middle"
            >
              <Select.Option value="ALL">All Statuses</Select.Option>
              <Select.Option value="COMPLETED">Completed Shifts</Select.Option>
              <Select.Option value="ACTIVE">Currently In Session</Select.Option>
            </Select>
          </Col>
        </Row>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={() => { setMobilePage(1); fetchReports(); }}
            loading={loading}
            style={{ borderRadius: 8, flex: isMobile ? 1 : 'none' }}
          >
            Apply Filters
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDateRange(null);
              setOfficeId(undefined);
              setDepartmentId(undefined);
              setStatus('ALL');
              setMobilePage(1);
              fetchReports();
            }}
            style={{ borderRadius: 8, flex: isMobile ? 1 : 'none' }}
          >
            Reset
          </Button>
        </div>
      </Card>

      {/* ── Mobile View: Report Cards ── */}
      <div className="report-card-list">
        {reports.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
            <Empty description="No attendance records match the selected filters" />
          </Card>
        ) : (
          <>
            {paginatedMobileReports.map((r) => (
              <ReportCard key={r.id} r={r} />
            ))}

            {reports.length > mobilePageSize && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Pagination
                  simple
                  current={mobilePage}
                  pageSize={mobilePageSize}
                  total={reports.length}
                  onChange={(page) => setMobilePage(page)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Desktop View: Full Table ── */}
      <div className="report-table-desktop">
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={reports}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 850 }}
            pagination={{ pageSize: 12 }}
            locale={{ emptyText: <Empty description="No attendance records match the selected filters" /> }}
          />
        </Card>
      </div>
    </div>
  );
};
