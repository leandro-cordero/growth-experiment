import type { APIRoute } from 'astro';
import { usersHandlers } from '../../../lib/users/deps';

export const prerender = false;

export const GET: APIRoute = ({ request }) => usersHandlers.list(request);
export const POST: APIRoute = ({ request }) => usersHandlers.create(request);
