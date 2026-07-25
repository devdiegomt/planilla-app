/**
 * Wrapper mínimo del Classroom REST API v1 (server-side).
 */

import type { OAuth2Client } from 'google-auth-library';

const BASE = 'https://classroom.googleapis.com/v1';

async function callWithAuth<T>(client: OAuth2Client, path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const { token } = await client.getAccessToken();
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Classroom API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface ClassroomProfile {
  id: string;
  name?: { fullName?: string; givenName?: string; familyName?: string };
  emailAddress?: string;
  photoUrl?: string;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  room?: string;
  ownerId?: string;
  courseState?: string;
  alternateLink?: string;
}

export interface CourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  workType?: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION';
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  state?: 'PUBLISHED' | 'DRAFT' | 'DELETED';
  maxPoints?: number;
  creationTime?: string;
  updateTime?: string;
  alternateLink?: string;
  submissionModificationMode?: string;
}

export interface Attachment {
  driveFile?: { id?: string; title?: string; alternateLink?: string; thumbnailUrl?: string };
  youTubeVideo?: { id?: string; title?: string; alternateLink?: string; thumbnailUrl?: string };
  link?: { url?: string; title?: string; thumbnailUrl?: string };
  form?: { formUrl?: string; responseUrl?: string; title?: string; thumbnailUrl?: string };
}

export interface StudentSubmission {
  id: string;
  courseId: string;
  courseWorkId: string;
  userId: string;
  creationTime?: string;
  updateTime?: string;
  state?: 'NEW' | 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT';
  late?: boolean;
  assignedGrade?: number;
  draftGrade?: number;
  alternateLink?: string;
  submissionHistory?: unknown[];
  assignmentSubmission?: { attachments?: Attachment[] };
}

export interface Student {
  userId: string;
  courseId: string;
  profile?: { id?: string; name?: { fullName?: string }; emailAddress?: string; photoUrl?: string };
}

export async function getProfile(client: OAuth2Client): Promise<ClassroomProfile> {
  return callWithAuth<ClassroomProfile>(client, '/userProfiles/me');
}

export async function listCourses(client: OAuth2Client): Promise<ClassroomCourse[]> {
  const data = await callWithAuth<{ courses?: ClassroomCourse[] }>(client, '/courses', {
    teacherId: 'me',
    courseStates: 'ACTIVE',
    pageSize: '100',
  });
  return data.courses ?? [];
}

export async function listCourseWork(client: OAuth2Client, courseId: string): Promise<CourseWork[]> {
  const data = await callWithAuth<{ courseWork?: CourseWork[] }>(
    client,
    `/courses/${courseId}/courseWork`,
    { pageSize: '100', orderBy: 'updateTime desc' },
  );
  return data.courseWork ?? [];
}

export async function listSubmissions(
  client: OAuth2Client,
  courseId: string,
  courseWorkId: string,
): Promise<StudentSubmission[]> {
  const data = await callWithAuth<{ studentSubmissions?: StudentSubmission[] }>(
    client,
    `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions`,
    { pageSize: '200' },
  );
  return data.studentSubmissions ?? [];
}

export async function listStudents(client: OAuth2Client, courseId: string): Promise<Student[]> {
  const data = await callWithAuth<{ students?: Student[] }>(
    client,
    `/courses/${courseId}/students`,
    { pageSize: '200' },
  );
  return data.students ?? [];
}
