// Route /t/:mid/table/:n — the console with one table's side sheet open over it.
import m from 'mithril';
import { TeacherConsole } from './TeacherConsole';

export const TableSheet: m.Component = {
	view() {
		const n = Number(m.route.param('n'));

		return m(TeacherConsole, { sheetN: Number.isInteger(n) && n > 0 ? n : undefined });
	},
};
