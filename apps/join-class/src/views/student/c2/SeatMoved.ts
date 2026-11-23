import m from 'mithril';
import '@/styles/student-c2.scss';
import '@/styles/night/c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { gateMemory } from '@/lib/classroom/arrivalActions';

/**
 * "הדיון ממשיך במכשיר אחר" (IA tables-class-bridge 7): this registration's seat is
 * now on another device (the latest device holds it). One action, "להיכנס שוב
 * מכאן", opens the name gate and takes the seat back.
 */

export const SeatMoved: m.Component = {
	view() {
		return m(StudentFrame, { headerLine: '' }, [
			m('section.seat-moved', { 'data-testid': 'seat-moved' }, [
				m('h1.seat-moved__title', { role: 'status' }, t('seat.moved.title')),
				m('p.seat-moved__body', t('seat.moved.body')),
				m(
					'button.btn.btn--primary.seat-moved__action',
					{
						type: 'button',
						'data-testid': 'seat-moved-reenter',
						onclick: () => {
							gateMemory.reenter = true;
							m.redraw();
						},
					},
					t('seat.moved.action'),
				),
			]),
		]);
	},
};
