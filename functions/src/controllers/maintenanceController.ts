import { Request, Response } from 'firebase-functions/v1';
import { MaintenanceService } from '../services/maintenance/maintenanceService';

export class MaintenanceController {
	private maintenanceService: MaintenanceService;

	constructor(maintenanceService?: MaintenanceService) {
		this.maintenanceService = maintenanceService || new MaintenanceService();
	}

	/**
	 * Maintain roles endpoint
	 */
	async maintainRole(_: Request, res: Response): Promise<void> {
		try {
			const result = await this.maintenanceService.updateRoles();
			res.send({ ok: true, ...result });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Migrate deliberative elements endpoint
	 */
	async maintainDeliberativeElement(_: Request, res: Response): Promise<void> {
		try {
			const result = await this.maintenanceService.migrateDeliberativeElements();
			res.send({ ok: true, ...result });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Maintain statement settings endpoint
	 */
	async maintainStatement(_: Request, res: Response): Promise<void> {
		try {
			const result = await this.maintenanceService.updateStatementResultsSettings();
			res.send({ ok: true, count: result.cleared, ...result });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Update subscription token format endpoint
	 */
	async maintainSubscriptionToken(_: Request, res: Response): Promise<void> {
		try {
			const result = await this.maintenanceService.updateSubscriptionTokenFormat();
			res.send({
				ok: true,
				size: result.total,
				changed: result.updated
			});
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Update average evaluation for a specific statement and its children
	 */
	async updateAverageEvaluation(req: Request, res: Response): Promise<void> {
		try {
			const statementId = req.query.statementId as string;

			if (!statementId) {
				res.status(400).send({
					error: 'statementId is required',
					ok: false
				});
				return;
			}

			// Import the migration function
			const { updateStatementAndChildrenAverageEvaluation } = await import('../migrations/updateStatementAverageEvaluation');

			const result = await updateStatementAndChildrenAverageEvaluation(statementId);

			res.send({
				ok: true,
				statementId,
				...result
			});
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Handle errors consistently
	 */
	private handleError(res: Response, error: unknown): void {
		const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
		res.status(500).send({
			error: errorMessage,
			ok: false,
		});
	}
}