import { Request, Response } from 'firebase-functions/v1';
import { StatementController } from './controllers/statementController';
import { MaintenanceController } from './controllers/maintenanceController';

// Initialize controllers
const statementController = new StatementController();
const maintenanceController = new MaintenanceController();

// Statement endpoints
export const getUserOptions = (req: Request, res: Response) =>
	statementController.getUserOptions(req, res);

export const getRandomStatements = (req: Request, res: Response) =>
	statementController.getRandomStatements(req, res);

export const getTopStatements = (req: Request, res: Response) =>
	statementController.getTopStatements(req, res);

// Maintenance endpoints
export const maintainRole = (req: Request, res: Response) =>
	maintenanceController.maintainRole(req, res);

export const maintainDeliberativeElement = (req: Request, res: Response) =>
	maintenanceController.maintainDeliberativeElement(req, res);

export const maintainStatement = (req: Request, res: Response) =>
	maintenanceController.maintainStatement(req, res);

export const maintainSubscriptionToken = (req: Request, res: Response) =>
	maintenanceController.maintainSubscriptionToken(req, res);

export const updateAverageEvaluation = (req: Request, res: Response) =>
	maintenanceController.updateAverageEvaluation(req, res);

export const recalculateEvaluations = (req: Request, res: Response) =>
	maintenanceController.recalculateEvaluations(req, res);

export const addRandomSeed = (req: Request, res: Response) =>
	maintenanceController.addRandomSeed(req, res);

export const backfillEvaluationType = (req: Request, res: Response) =>
	maintenanceController.backfillEvaluationType(req, res);