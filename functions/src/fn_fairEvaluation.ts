/**
 * Fair Evaluation Cloud Functions
 *
 * Implements the fair evaluation voting system where users invest "minutes"
 * from their wallet to support answers.
 */

import { logger } from "firebase-functions/v1";
import { Request, Response } from "firebase-functions/v1";
import {
  FirestoreEvent,
  QueryDocumentSnapshot,
  Change,
} from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { parse } from "valibot";
import {
  Collections,
  Role,
  StatementSubscription,
  StatementSubscriptionSchema,
  Statement,
  Evaluation,
  EvaluationSchema,
  FairEvalWallet,
  FairEvalTransaction,
  FairEvalTransactionType,
  FairEvalAnswerMetrics,
  getWalletId,
  DEFAULT_INITIAL_WALLET_BALANCE,
  DEFAULT_ANSWER_COST,
  calculateAnswerMetrics,
  calculateAllPayments,
  calculateCompleteToGoal,
  UserEvaluationData,
} from "@freedi/shared-types";
import { RequestValidator } from "./utils/validation";

const db = getFirestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is admin/creator for a statement
 */
async function isAdmin(
  userId: string,
  statementId: string
): Promise<boolean> {
  const subscriptionId = `${statementId}--${userId}`;
  const subDoc = await db
    .collection(Collections.statementsSubscribe)
    .doc(subscriptionId)
    .get();

  if (!subDoc.exists) return false;

  const subscription = subDoc.data() as StatementSubscription;
  return subscription.role === Role.admin || subscription.role === Role.creator;
}

/**
 * Get all wallets for a group
 */
async function getGroupWallets(
  topParentId: string
): Promise<FairEvalWallet[]> {
  const snapshot = await db
    .collection(Collections.fairEvalWallets)
    .where("topParentId", "==", topParentId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as FairEvalWallet);
}

/**
 * Get all evaluations for an answer with wallet balances
 */
async function getEvaluationsWithBalances(
  statementId: string,
  topParentId: string
): Promise<UserEvaluationData[]> {
  // Get all evaluations for this answer
  const evalSnapshot = await db
    .collection(Collections.evaluations)
    .where("statementId", "==", statementId)
    .get();

  const evaluations = evalSnapshot.docs.map((doc) => {
    const data = doc.data() as Evaluation;
    return {
      userId: data.evaluatorId,
      evaluation: data.evaluation,
    };
  });

  // Get wallet balances for all evaluators
  const result: UserEvaluationData[] = [];
  for (const evaluation of evaluations) {
    const walletId = getWalletId(topParentId, evaluation.userId);
    const walletDoc = await db
      .collection(Collections.fairEvalWallets)
      .doc(walletId)
      .get();

    const walletBalance = walletDoc.exists
      ? (walletDoc.data() as FairEvalWallet).balance
      : 0;

    result.push({
      userId: evaluation.userId,
      evaluation: evaluation.evaluation,
      walletBalance,
    });
  }

  return result;
}

/**
 * Recalculate and update metrics for a single answer
 */
async function recalculateAnswerMetrics(
  statementId: string,
  parentStatementId: string,
  topParentId: string,
  answerCost: number
): Promise<FairEvalAnswerMetrics> {
  const evaluations = await getEvaluationsWithBalances(statementId, topParentId);
  const metrics = calculateAnswerMetrics(answerCost, evaluations);

  const fairEvalMetrics: FairEvalAnswerMetrics = {
    answerStatementId: statementId,
    parentStatementId,
    answerCost,
    weightedSupporters: metrics.weightedSupporters,
    totalContribution: metrics.totalContribution,
    distanceToGoal: metrics.distanceToGoal,
    distancePerSupporter: metrics.distancePerSupporter,
    isAccepted: false,
    lastCalculation: Date.now(),
  };

  // Update statement with metrics
  await db.collection(Collections.statements).doc(statementId).update({
    fairEvalMetrics,
    lastUpdate: Date.now(),
  });

  return fairEvalMetrics;
}

/**
 * Recalculate metrics for all answers under a parent
 */
async function recalculateAllAnswerMetrics(
  parentStatementId: string,
  topParentId: string
): Promise<void> {
  const answersSnapshot = await db
    .collection(Collections.statements)
    .where("parentId", "==", parentStatementId)
    .get();

  const tasks = answersSnapshot.docs.map(async (doc) => {
    const statement = doc.data() as Statement;
    const answerCost = statement.answerCost ?? DEFAULT_ANSWER_COST;

    // Only recalculate if not already accepted
    if (!statement.fairEvalMetrics?.isAccepted) {
      await recalculateAnswerMetrics(
        statement.statementId,
        parentStatementId,
        topParentId,
        answerCost
      );
    }
  });

  await Promise.all(tasks);
}

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Initialize wallet when user joins a group (subscription created)
 *
 * Triggered on: statementsSubscribe document creation
 */
export async function initializeWallet(
  event: FirestoreEvent<QueryDocumentSnapshot | undefined, { subscriptionId: string }>
): Promise<void> {
  if (!event.data) {
    logger.warn("initializeWallet: No data in event");
    return;
  }

  try {
    const subscriptionData = event.data.data();
    const subscription = parse(StatementSubscriptionSchema, subscriptionData);

    // Only create wallet for non-waiting roles
    if (subscription.role === Role.waiting) {
      logger.info("initializeWallet: Skipping waiting role");
      return;
    }

    // Get the statement to find topParentId
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(subscription.statementId)
      .get();

    if (!statementDoc.exists) {
      logger.warn("initializeWallet: Statement not found", {
        statementId: subscription.statementId,
      });
      return;
    }

    const statement = statementDoc.data() as Statement;

    // Check if parent has fair evaluation enabled
    const parentDoc = await db
      .collection(Collections.statements)
      .doc(statement.topParentId)
      .get();

    if (!parentDoc.exists) {
      return;
    }

    const parentStatement = parentDoc.data() as Statement;
    if (!parentStatement.statementSettings?.enableFairEvaluation) {
      logger.info("initializeWallet: Fair evaluation not enabled for group");
      return;
    }

    const topParentId = statement.topParentId;
    const userId = subscription.userId;
    const walletId = getWalletId(topParentId, userId);

    // Check if wallet already exists
    const existingWallet = await db
      .collection(Collections.fairEvalWallets)
      .doc(walletId)
      .get();

    if (existingWallet.exists) {
      logger.info("initializeWallet: Wallet already exists", { walletId });
      return;
    }

    // Get initial balance from settings or use default
    const initialBalance =
      parentStatement.statementSettings?.initialWalletBalance ??
      DEFAULT_INITIAL_WALLET_BALANCE;

    // Create wallet
    const wallet: FairEvalWallet = {
      walletId,
      userId,
      topParentId,
      balance: initialBalance,
      totalReceived: initialBalance,
      totalSpent: 0,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    };

    // Create transaction record
    const transactionRef = db.collection(Collections.fairEvalTransactions).doc();
    const transaction: FairEvalTransaction = {
      transactionId: transactionRef.id,
      topParentId,
      userId,
      type: FairEvalTransactionType.join,
      amount: initialBalance,
      balanceBefore: 0,
      balanceAfter: initialBalance,
      note: "Initial balance on join",
      createdAt: Date.now(),
    };

    // Write both in batch
    const batch = db.batch();
    batch.set(db.collection(Collections.fairEvalWallets).doc(walletId), wallet);
    batch.set(transactionRef, transaction);
    await batch.commit();

    logger.info("initializeWallet: Created wallet", {
      walletId,
      initialBalance,
    });
  } catch (error) {
    logger.error("initializeWallet error:", error);
  }
}

/**
 * Recalculate answer metrics when evaluation changes
 *
 * Triggered on: evaluations document write (create/update/delete)
 */
export async function onFairEvalEvaluationChange(
  event: FirestoreEvent<
    Change<QueryDocumentSnapshot> | undefined,
    { evaluationId: string }
  >
): Promise<void> {
  if (!event.data) {
    logger.warn("onFairEvalEvaluationChange: No data in event");
    return;
  }

  try {
    // Get evaluation data (after or before for deletes)
    const afterData = event.data.after?.data();
    const beforeData = event.data.before?.data();
    const evaluationData = afterData || beforeData;

    if (!evaluationData) {
      logger.warn("onFairEvalEvaluationChange: No evaluation data");
      return;
    }

    const evaluation = parse(EvaluationSchema, evaluationData);
    const statementId = evaluation.statementId;

    // Get the statement being evaluated
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      return;
    }

    const statement = statementDoc.data() as Statement;

    // Get parent to check if fair evaluation is enabled
    const parentDoc = await db
      .collection(Collections.statements)
      .doc(statement.parentId)
      .get();

    if (!parentDoc.exists) {
      return;
    }

    const parentStatement = parentDoc.data() as Statement;

    // Check if fair evaluation is enabled on parent
    if (!parentStatement.statementSettings?.enableFairEvaluation) {
      return;
    }

    // Recalculate metrics for this answer
    const answerCost = statement.answerCost ??
      parentStatement.statementSettings?.defaultAnswerCost ??
      DEFAULT_ANSWER_COST;

    await recalculateAnswerMetrics(
      statementId,
      statement.parentId,
      statement.topParentId,
      answerCost
    );

    logger.info("onFairEvalEvaluationChange: Updated metrics", {
      statementId,
    });
  } catch (error) {
    logger.error("onFairEvalEvaluationChange error:", error);
  }
}

// ============================================================================
// HTTP FUNCTIONS
// ============================================================================

/**
 * Add minutes to all members in a group
 *
 * Admin-only HTTP function
 */
export async function addMinutesToGroup(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const topParentId = req.body.topParentId as string;
    const totalMinutes = req.body.totalMinutes as number;
    const adminId = req.body.adminId as string;

    validator.requireString(topParentId, "topParentId");
    validator.requireString(adminId, "adminId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    if (typeof totalMinutes !== "number" || totalMinutes <= 0) {
      res.status(400).send({
        error: "totalMinutes must be a positive number",
        ok: false,
      });
      return;
    }

    // Verify admin permission
    if (!(await isAdmin(adminId, topParentId))) {
      res.status(403).send({
        error: "Only admins can add minutes",
        ok: false,
      });
      return;
    }

    // Get all wallets for this group
    const wallets = await getGroupWallets(topParentId);

    if (wallets.length === 0) {
      res.status(400).send({
        error: "No wallets found for this group",
        ok: false,
      });
      return;
    }

    const perUser = totalMinutes / wallets.length;
    const batch = db.batch();

    for (const wallet of wallets) {
      // Update wallet
      const walletRef = db
        .collection(Collections.fairEvalWallets)
        .doc(wallet.walletId);

      batch.update(walletRef, {
        balance: FieldValue.increment(perUser),
        totalReceived: FieldValue.increment(perUser),
        lastUpdate: Date.now(),
      });

      // Create transaction record
      const transactionRef = db.collection(Collections.fairEvalTransactions).doc();
      const transaction: FairEvalTransaction = {
        transactionId: transactionRef.id,
        topParentId,
        userId: wallet.userId,
        type: FairEvalTransactionType.admin_add,
        amount: perUser,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance + perUser,
        adminId,
        note: `Admin distributed ${totalMinutes} minutes to ${wallets.length} members`,
        createdAt: Date.now(),
      };

      batch.set(transactionRef, transaction);
    }

    await batch.commit();

    // Recalculate all answer metrics (balances changed)
    // Get all child statements with fair eval enabled
    const childrenSnapshot = await db
      .collection(Collections.statements)
      .where("topParentId", "==", topParentId)
      .where("parentId", "!=", topParentId)
      .get();

    const parentIds = new Set<string>();
    childrenSnapshot.docs.forEach((doc) => {
      const stmt = doc.data() as Statement;
      if (stmt.fairEvalMetrics && !stmt.fairEvalMetrics.isAccepted) {
        parentIds.add(stmt.parentId);
      }
    });

    for (const parentId of parentIds) {
      await recalculateAllAnswerMetrics(parentId, topParentId);
    }

    res.send({
      message: `Added ${perUser} minutes to ${wallets.length} members`,
      perUser,
      totalMembers: wallets.length,
      ok: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("addMinutesToGroup error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}

/**
 * Set/update answer cost
 *
 * Admin-only HTTP function
 */
export async function setAnswerCost(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const statementId = req.body.statementId as string;
    const newCost = req.body.newCost as number;
    const adminId = req.body.adminId as string;

    validator.requireString(statementId, "statementId");
    validator.requireString(adminId, "adminId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    if (typeof newCost !== "number" || newCost < 0) {
      res.status(400).send({
        error: "newCost must be a non-negative number",
        ok: false,
      });
      return;
    }

    // Get statement
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      res.status(404).send({
        error: "Statement not found",
        ok: false,
      });
      return;
    }

    const statement = statementDoc.data() as Statement;

    // Verify admin permission
    if (!(await isAdmin(adminId, statement.topParentId))) {
      res.status(403).send({
        error: "Only admins can set answer cost",
        ok: false,
      });
      return;
    }

    // Check if already accepted
    if (statement.fairEvalMetrics?.isAccepted) {
      res.status(400).send({
        error: "Cannot change cost of accepted answer",
        ok: false,
      });
      return;
    }

    // Update cost and recalculate metrics
    await db.collection(Collections.statements).doc(statementId).update({
      answerCost: newCost,
      lastUpdate: Date.now(),
    });

    // Recalculate metrics
    await recalculateAnswerMetrics(
      statementId,
      statement.parentId,
      statement.topParentId,
      newCost
    );

    res.send({
      message: `Answer cost updated to ${newCost}`,
      ok: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("setAnswerCost error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}

/**
 * Accept an answer and deduct payments from supporters
 *
 * Admin-only HTTP function
 */
export async function acceptFairEvalAnswer(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const statementId = req.body.statementId as string;
    const adminId = req.body.adminId as string;

    validator.requireString(statementId, "statementId");
    validator.requireString(adminId, "adminId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    // Get statement
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      res.status(404).send({
        error: "Statement not found",
        ok: false,
      });
      return;
    }

    const statement = statementDoc.data() as Statement;

    // Verify admin permission
    if (!(await isAdmin(adminId, statement.topParentId))) {
      res.status(403).send({
        error: "Only admins can accept answers",
        ok: false,
      });
      return;
    }

    // Check if already accepted
    if (statement.fairEvalMetrics?.isAccepted) {
      res.status(400).send({
        error: "Answer already accepted",
        ok: false,
      });
      return;
    }

    // Get current metrics
    const answerCost = statement.answerCost ?? DEFAULT_ANSWER_COST;
    const evaluations = await getEvaluationsWithBalances(
      statementId,
      statement.topParentId
    );
    const metrics = calculateAnswerMetrics(answerCost, evaluations);

    // Verify goal is reached
    if (metrics.distanceToGoal > 0) {
      res.status(400).send({
        error: `Answer not at goal. Distance remaining: ${metrics.distanceToGoal}`,
        ok: false,
      });
      return;
    }

    // Calculate payments
    const payments = calculateAllPayments(answerCost, evaluations);

    // Execute payments in transaction
    await db.runTransaction(async (transaction) => {
      // Deduct from each supporter's wallet
      for (const payment of payments) {
        const walletId = getWalletId(statement.topParentId, payment.userId);
        const walletRef = db.collection(Collections.fairEvalWallets).doc(walletId);
        const walletDoc = await transaction.get(walletRef);

        if (!walletDoc.exists) {
          throw new Error(`Wallet not found for user ${payment.userId}`);
        }

        const wallet = walletDoc.data() as FairEvalWallet;

        // Update wallet
        transaction.update(walletRef, {
          balance: wallet.balance - payment.payment,
          totalSpent: wallet.totalSpent + payment.payment,
          lastUpdate: Date.now(),
        });

        // Create transaction record
        const transactionRef = db.collection(Collections.fairEvalTransactions).doc();
        const txn: FairEvalTransaction = {
          transactionId: transactionRef.id,
          topParentId: statement.topParentId,
          userId: payment.userId,
          type: FairEvalTransactionType.payment,
          amount: -payment.payment,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance - payment.payment,
          answerStatementId: statementId,
          answerTitle: statement.statement,
          metadata: {
            answerCost,
            weightedSupporters: metrics.weightedSupporters,
            totalContribution: metrics.totalContribution,
            paymentPerFullSupporter: answerCost / metrics.totalContribution,
            userSupportLevel: payment.positiveRating,
            userPayment: payment.payment,
          },
          createdAt: Date.now(),
        };

        transaction.set(transactionRef, txn);
      }

      // Mark answer as accepted
      const updatedMetrics: FairEvalAnswerMetrics = {
        answerStatementId: statementId,
        parentStatementId: statement.parentId,
        answerCost,
        weightedSupporters: metrics.weightedSupporters,
        totalContribution: metrics.totalContribution,
        distanceToGoal: 0,
        distancePerSupporter: 0,
        isAccepted: true,
        acceptedAt: Date.now(),
        acceptedBy: adminId,
        lastCalculation: Date.now(),
      };

      transaction.update(
        db.collection(Collections.statements).doc(statementId),
        {
          fairEvalMetrics: updatedMetrics,
          lastUpdate: Date.now(),
        }
      );
    });

    // Recalculate all other answer metrics (balances changed)
    await recalculateAllAnswerMetrics(statement.parentId, statement.topParentId);

    res.send({
      message: "Answer accepted successfully",
      paymentsProcessed: payments.length,
      totalDeducted: answerCost,
      ok: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("acceptFairEvalAnswer error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}

/**
 * Add enough minutes to bring an answer to goal, then accept it
 *
 * Admin-only HTTP function
 */
export async function completeToGoal(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const statementId = req.body.statementId as string;
    const adminId = req.body.adminId as string;

    validator.requireString(statementId, "statementId");
    validator.requireString(adminId, "adminId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    // Get statement
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      res.status(404).send({
        error: "Statement not found",
        ok: false,
      });
      return;
    }

    const statement = statementDoc.data() as Statement;

    // Verify admin permission
    if (!(await isAdmin(adminId, statement.topParentId))) {
      res.status(403).send({
        error: "Only admins can complete to goal",
        ok: false,
      });
      return;
    }

    // Get current metrics
    const answerCost = statement.answerCost ?? DEFAULT_ANSWER_COST;
    const evaluations = await getEvaluationsWithBalances(
      statementId,
      statement.topParentId
    );
    const metrics = calculateAnswerMetrics(answerCost, evaluations);

    // Check if there are any supporters
    if (metrics.weightedSupporters === 0) {
      res.status(400).send({
        error: "Cannot complete to goal - no supporters",
        ok: false,
      });
      return;
    }

    // If already at goal, just accept
    if (metrics.distanceToGoal === 0) {
      // Forward to accept function
      req.body.statementId = statementId;
      req.body.adminId = adminId;
      await acceptFairEvalAnswer(req, res);
      return;
    }

    // Get all wallets to calculate total minutes needed
    const wallets = await getGroupWallets(statement.topParentId);
    const completeCalc = calculateCompleteToGoal(
      metrics.distancePerSupporter,
      wallets.length
    );

    // Add minutes to group
    const addMinutesReq = {
      body: {
        topParentId: statement.topParentId,
        totalMinutes: completeCalc.total,
        adminId,
      },
    } as Request;

    // Use a mock response to capture the result
    let addMinutesSuccess = false;
    const mockRes = {
      send: () => {
        addMinutesSuccess = true;
      },
      status: () => mockRes,
    } as unknown as Response;

    await addMinutesToGroup(addMinutesReq, mockRes);

    if (!addMinutesSuccess) {
      res.status(500).send({
        error: "Failed to add minutes",
        ok: false,
      });
      return;
    }

    // Now accept the answer
    await acceptFairEvalAnswer(req, res);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("completeToGoal error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}

/**
 * Get wallet info for a user in a group
 *
 * HTTP function (any authenticated user can view their own wallet)
 */
export async function getWalletInfo(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const topParentId = req.query.topParentId as string;
    const userId = req.query.userId as string;

    validator.requireString(topParentId, "topParentId");
    validator.requireString(userId, "userId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    const walletId = getWalletId(topParentId, userId);
    const walletDoc = await db
      .collection(Collections.fairEvalWallets)
      .doc(walletId)
      .get();

    if (!walletDoc.exists) {
      res.status(404).send({
        error: "Wallet not found",
        ok: false,
      });
      return;
    }

    res.send({
      wallet: walletDoc.data(),
      ok: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("getWalletInfo error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}

/**
 * Get transaction history for a user in a group
 *
 * HTTP function (any authenticated user can view their own history)
 */
export async function getTransactionHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const validator = new RequestValidator();
    const topParentId = req.query.topParentId as string;
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    validator.requireString(topParentId, "topParentId");
    validator.requireString(userId, "userId");

    if (!validator.isValid()) {
      res.status(400).send({
        error: validator.getErrorMessage(),
        ok: false,
      });
      return;
    }

    const snapshot = await db
      .collection(Collections.fairEvalTransactions)
      .where("topParentId", "==", topParentId)
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const transactions = snapshot.docs.map((doc) => doc.data());

    res.send({
      transactions,
      ok: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("getTransactionHistory error:", error);
    res.status(500).send({
      error: errorMessage,
      ok: false,
    });
  }
}
