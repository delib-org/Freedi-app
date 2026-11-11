'use strict';
/**
 * Preloaded into every Cloud Functions emulator worker (NODE_OPTIONS=--require).
 * Measures, without touching application code, what each trigger invocation
 * really does through the Admin SDK: documents read, documents written (by
 * collection), and whether a write landed after the invocation had returned.
 * Inert anywhere else: it needs both SCALE_TRACE_DIR and FUNCTION_TARGET.
 */
const dir = process.env.SCALE_TRACE_DIR;
const functionName = process.env.FUNCTION_TARGET;
/** `QUESTION_ID` in seed.ts: writes to this document also record their field names. */
const questionPath = 'statements/scale-question';

if (dir && functionName) {
	const fs = require('fs');
	const path = require('path');
	const http = require('http');
	const Module = require('module');
	const { AsyncLocalStorage } = require('async_hooks');

	const context = new AsyncLocalStorage();
	const fd = fs.openSync(path.join(dir, `trace-${process.pid}.ndjson`), 'a');
	let invocationSeq = 0;

	const emit = (record) => {
		fs.writeSync(
			fd,
			`${JSON.stringify({ t: Date.now(), fn: functionName, pid: process.pid, ...record })}\n`,
		);
	};

	const collectionOf = (docPath) => docPath.split('/').slice(0, -1).join('/');
	const inv = () => {
		const store = context.getStore();

		return store ? { inv: store.inv, ended: store.ended } : {};
	};

	// Invocation boundaries: the emulator runs each trigger as one HTTP request.
	const originalEmit = http.Server.prototype.emit;
	http.Server.prototype.emit = function emitWithContext(event, req, res) {
		if (event !== 'request' || !req || !req.url || req.url.startsWith('/__/')) {
			return originalEmit.apply(this, arguments);
		}
		invocationSeq += 1;
		const store = { inv: `${process.pid}-${invocationSeq}`, ended: false };
		emit({ k: 'start', inv: store.inv });
		res.on('finish', () => {
			store.ended = true;
			emit({ k: 'end', inv: store.inv });
		});

		return context.run(store, () => originalEmit.call(this, event, req, res));
	};

	const patchedRoots = new Set();

	function patchSdk(root) {
		if (patchedRoots.has(root)) return;
		patchedRoots.add(root);

		const { Query } = require(path.join(root, 'reference/query.js'));
		const { AggregateQuery } = require(path.join(root, 'reference/aggregate-query.js'));
		const { DocumentReader } = require(path.join(root, 'document-reader.js'));
		const { WriteBatch } = require(path.join(root, 'write-batch.js'));

		const originalQueryGet = Query.prototype._get;
		Query.prototype._get = async function tracedQueryGet(...args) {
			const snapshot = await originalQueryGet.apply(this, args);
			const result = snapshot && snapshot.result ? snapshot.result : snapshot;
			emit({
				k: 'r',
				via: 'query',
				coll: this._queryOptions ? this._queryOptions.collectionId : 'unknown',
				// Firestore bills at least one read for a query that returns nothing.
				n: Math.max(result && typeof result.size === 'number' ? result.size : 0, 1),
				...inv(),
			});

			return snapshot;
		};

		const originalAggregateGet = AggregateQuery.prototype._get;
		AggregateQuery.prototype._get = async function tracedAggregateGet(...args) {
			const result = await originalAggregateGet.apply(this, args);
			emit({ k: 'r', via: 'aggregate', coll: 'aggregate', n: 1, ...inv() });

			return result;
		};

		const originalDocumentGet = DocumentReader.prototype.get;
		DocumentReader.prototype.get = async function tracedDocumentGet(...args) {
			const snapshots = await originalDocumentGet.apply(this, args);
			const byCol = {};
			const docs = [];
			for (const snapshot of snapshots) {
				const docPath = snapshot.ref.path;
				const collection = collectionOf(docPath);
				byCol[collection] = (byCol[collection] || 0) + 1;
				docs.push(docPath);
			}
			emit({ k: 'r', via: 'doc', byCol, n: snapshots.length, docs, ...inv() });

			return snapshots;
		};

		const originalCommit = WriteBatch.prototype._commit;
		WriteBatch.prototype._commit = async function tracedCommit(...args) {
			const paths = this._ops.map((op) => op.docPath);
			const questionFields = this._ops
				.filter((op) => op.docPath === questionPath)
				.map((op) => {
					const proto = op.op();
					const masked = (proto.updateMask && proto.updateMask.fieldPaths) || [];
					const transformed = (proto.updateTransforms || []).map(
						(transform) => transform.fieldPath,
					);
					const fields = [...masked, ...transformed];

					return fields.length > 0 ? fields : ['(whole document)'];
				});
			try {
				const result = await originalCommit.apply(this, args);
				const byCol = {};
				for (const docPath of paths) {
					const collection = collectionOf(docPath);
					byCol[collection] = (byCol[collection] || 0) + 1;
				}
				emit({
					k: 'w',
					byCol,
					n: paths.length,
					docs: paths.filter((docPath) => docPath.startsWith('statements/')),
					...(questionFields.length > 0 ? { qf: questionFields } : {}),
					...inv(),
				});

				return result;
			} catch (error) {
				emit({ k: 'wf', n: paths.length, ...inv() });
				throw error;
			}
		};
	}

	const originalLoad = Module._load;
	Module._load = function loadWithPatch(request, parent, isMain) {
		const loaded = originalLoad.call(this, request, parent, isMain);
		if (request === '@google-cloud/firestore') {
			try {
				patchSdk(path.dirname(Module._resolveFilename(request, parent, isMain)));
			} catch (error) {
				process.stderr.write(`[scale trace-shim] could not patch Firestore: ${error.message}\n`);
			}
		}

		return loaded;
	};
}
