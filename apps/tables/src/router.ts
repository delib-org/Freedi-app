import m from 'mithril';
import { DEFAULT_ROUTE, ROUTES } from '@/routes';
import { placeholderView } from '@/views/Placeholder';
import { HostAssignment } from '@/views/host/HostAssignment';
import { HostHome } from '@/views/host/HostHome';
import { HostList } from '@/views/host/HostList';
import { HostParticipants } from '@/views/host/HostParticipants';
import { HostPreview } from '@/views/host/HostPreview';
import { HostSettings } from '@/views/host/HostSettings';
import { HostTopics } from '@/views/host/HostTopics';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { ParticipantMyTable } from '@/views/participant/ParticipantMyTable';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import { ParticipantTopic, ParticipantTopics } from '@/views/participant/ParticipantTopics';

/** Route params arrive as attrs; a screen declares the ones it reads, the router hands them over. */
function routeView<Attrs>(component: m.Component<Attrs>): m.Component {
	return component as unknown as m.Component;
}

/** The real screen of each route; a route without an entry shows the placeholder. */
const VIEWS: Record<string, m.Component> = {
	'/host': routeView(HostList),
	'/host/sessions/:id': routeView(HostHome),
	'/host/sessions/:id/topics': routeView(HostTopics),
	'/host/sessions/:id/settings': routeView(HostSettings),
	'/host/sessions/:id/participants': routeView(HostParticipants),
	'/host/sessions/:id/preview': routeView(HostPreview),
	'/host/sessions/:id/assignment': routeView(HostAssignment),
	'/sessions/:id': routeView(ParticipantHome),
	'/sessions/:id/topics': routeView(ParticipantTopics),
	'/sessions/:id/topics/:topicId': routeView(ParticipantTopic),
	'/sessions/:id/preferences': routeView(ParticipantPreferences),
	'/sessions/:id/my-table': routeView(ParticipantMyTable),
};

/** Mithril route table: every route in ROUTES resolves to its view. */
export function buildRouteTable(): Record<string, m.Component> {
	const table: Record<string, m.Component> = {};

	for (const route of ROUTES) {
		table[route.path] = VIEWS[route.path] ?? placeholderView(route);
	}

	return table;
}

/** Mount the router on `root`; a path no screen owns falls back to the host list. */
export function mountRouter(root: HTMLElement): void {
	m.route.prefix = '';
	m.route(root, DEFAULT_ROUTE, buildRouteTable());
}
