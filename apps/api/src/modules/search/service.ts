import { db } from '../../core/db.js';
import { SearchQuery, SearchResultItem, SearchResponse, RoleCode } from '@oams/shared';

export class SearchService {
  async search(orgId: string, query: SearchQuery, user: any): Promise<SearchResponse> {
    const rawQ = query.q.trim();
    const pattern = `%${rawQ}%`;
    const limit = query.limit || 20;

    const requestedTypes = query.types
      ? query.types.split(',').map((t) => t.trim().toLowerCase())
      : ['appointment', 'official', 'task', 'visit'];

    const isAdmin =
      user?.roles?.includes(RoleCode.SUPER_ADMIN) ||
      user?.roles?.includes(RoleCode.APPOINTMENT_ADMIN);

    const isReceptionOrSecurity =
      isAdmin || user?.roles?.includes('RECEPTIONIST') || user?.roles?.includes('SECURITY');

    const results: SearchResultItem[] = [];

    // 1. Appointments
    if (requestedTypes.includes('appointment')) {
      const aptQuery = db('appointments')
        .where('org_id', orgId)
        .where((builder) => {
          builder
            .whereILike('subject', pattern)
            .orWhereILike('requester_name', pattern)
            .orWhereILike('requester_email', pattern)
            .orWhereILike('reference_number', pattern);
        });

      // Privacy boundary: non-admins cannot see PERSONAL visibility events of others
      if (!isAdmin) {
        aptQuery.where((builder) => {
          builder
            .whereNot('visibility', 'PERSONAL')
            .orWhere('requester_user_id', user.id)
            .orWhere('official_user_id', user.id);
        });
      }

      const appointments = await aptQuery.limit(limit).select('*');
      for (const apt of appointments) {
        results.push({
          id: apt.id,
          type: 'appointment',
          title: apt.subject || `Appointment #${apt.reference_number || apt.id.slice(0, 8)}`,
          subtitle: `${apt.requester_name || 'Requester'} • ${apt.status}`,
          status: apt.status,
          metadata: {
            referenceNumber: apt.reference_number,
            startTime: apt.start_time,
            officialId: apt.official_user_id,
          },
          url: `/appointments/${apt.id}`,
        });
      }
    }

    // 2. Officials
    if (requestedTypes.includes('official')) {
      const officialsQuery = db('users')
        .leftJoin('officials', 'users.id', 'officials.user_id')
        .where('users.org_id', orgId)
        .where((builder) => {
          builder
            .whereILike('users.full_name', pattern)
            .orWhereILike('users.email', pattern)
            .orWhereILike('officials.department', pattern)
            .orWhereILike('officials.designation', pattern);
        })
        .limit(limit)
        .select(
          'users.id',
          'users.full_name',
          'users.email',
          'users.status',
          'officials.department',
          'officials.designation',
        );

      const officials = await officialsQuery;
      for (const off of officials) {
        results.push({
          id: off.id,
          type: 'official',
          title: off.full_name,
          subtitle: `${off.designation || 'Official'} — ${off.department || 'General'}`,
          status: off.status,
          metadata: {
            email: off.email,
            department: off.department,
          },
          url: `/officials/${off.id}`,
        });
      }
    }

    // 3. Tasks
    if (requestedTypes.includes('task')) {
      const taskQuery = db('tasks')
        .where('org_id', orgId)
        .where((builder) => {
          builder.whereILike('title', pattern).orWhereILike('description', pattern);
        });

      // Privacy boundary: non-admins only see tasks assigned to them or created by them
      if (!isAdmin) {
        taskQuery.where((builder) => {
          builder.where('assignee_id', user.id).orWhere('created_by', user.id);
        });
      }

      const tasks = await taskQuery.limit(limit).select('*');
      for (const t of tasks) {
        results.push({
          id: t.id,
          type: 'task',
          title: t.title,
          subtitle: `Priority: ${t.priority} • Status: ${t.status}`,
          status: t.status,
          metadata: {
            priority: t.priority,
            dueDate: t.due_date,
          },
          url: `/tasks?id=${t.id}`,
        });
      }
    }

    // 4. Visits
    if (requestedTypes.includes('visit') && isReceptionOrSecurity) {
      const visitQuery = db('visits')
        .where('org_id', orgId)
        .where((builder) => {
          builder
            .whereILike('visitor_name', pattern)
            .orWhereILike('visitor_email', pattern)
            .orWhereILike('purpose', pattern)
            .orWhereILike('badge_number', pattern);
        })
        .limit(limit)
        .select('*');

      const visits = await visitQuery;
      for (const v of visits) {
        results.push({
          id: v.id,
          type: 'visit',
          title: `Visitor: ${v.visitor_name}`,
          subtitle: `${v.purpose || 'Official Visit'} • Badge: ${v.badge_number || 'N/A'}`,
          status: v.status,
          metadata: {
            checkInTime: v.check_in_time,
            badgeNumber: v.badge_number,
          },
          url: `/visits/${v.id}`,
        });
      }
    }

    return {
      query: rawQ,
      total: results.length,
      results: results.slice(0, limit),
    };
  }
}

export const searchService = new SearchService();
