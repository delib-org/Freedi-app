import m from 'mithril';
import './styles/global.scss';
import './styles/components.scss';
import { initAuth } from './lib/auth';
import { DashboardView } from './views/DashboardView';
import { StatementsView } from './views/StatementsView';
import { UsersView } from './views/UsersView';
import { AdminsView } from './views/AdminsView';

// Initialize auth before mounting
initAuth();

const root = document.getElementById('app');

if (root) {
	m.route(root, '/', {
		'/': DashboardView,
		'/statements': StatementsView,
		'/users': UsersView,
		'/admins': AdminsView,
	});
}
