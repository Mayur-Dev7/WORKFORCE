import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import officesRoutes from './offices.routes.js';
import departmentsRoutes from './departments.routes.js';
import attendanceRoutes from './attendance.routes.js';
import reportsRoutes from './reports.routes.js';
import auditRoutes from './audit.routes.js';
import rolesRoutes from './roles.routes.js';
import leaveRoutes from './leave.routes.js';
import holidaysRoutes from './holidays.routes.js';
import shiftsRoutes from './shifts.routes.js';

const apiV1Router = Router();

apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/users', usersRoutes);
apiV1Router.use('/offices', officesRoutes);
apiV1Router.use('/departments', departmentsRoutes);
apiV1Router.use('/attendance', attendanceRoutes);
apiV1Router.use('/reports', reportsRoutes);
apiV1Router.use('/audit-logs', auditRoutes);
apiV1Router.use('/roles', rolesRoutes);
apiV1Router.use('/leave', leaveRoutes);
apiV1Router.use('/holidays', holidaysRoutes);
apiV1Router.use('/shifts', shiftsRoutes);

export default apiV1Router;
