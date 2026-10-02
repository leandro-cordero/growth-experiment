import type { APIRoute } from 'astro';
import { usersHandlers } from '../../../lib/users/deps';

export const prerender = false;

export const PATCH: APIRoute = ({ request, params }) => usersHandlers.update(request, params.id);
