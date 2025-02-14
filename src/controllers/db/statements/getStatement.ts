import {
	and,
	collection,
	doc,
	getDoc,
	getDocs,
	or,
	query,
	where,
} from 'firebase/firestore';
import { FireStore } from '../config';
import {
	Collections,
	StatementType,
	DeliberativeElement,
} from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/Statement';
import { parse } from 'valibot';

export async function getStatementFromDB(
	statementId: string
): Promise<Statement | undefined> {
	try {
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statementId
		);
		const statementDB = await getDoc(statementRef);

		return statementDB.data() as Statement | undefined;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export async function getStatementDepth(
	statement: Statement,
	subStatements: Statement[],
	depth: number
): Promise<Statement[]> {
	try {
		const statements: Statement[][] = [[statement]];

		// level 1 is already in store
		// find second level
		const levelOneStatements: Statement[] = subStatements.filter(
			(s) =>
				s.parentId === statement.statementId &&
				s.statementType !== StatementType.statement
		);
		statements.push(levelOneStatements);

		// get the next levels
		for (let i = 1; i < depth; i++) {
			const statementPromises = statements[i].map((st: Statement) =>
				getLevelResults(st)
			);

			const nextLevelStatements = await Promise.all(statementPromises);
			const flattenedStatements = nextLevelStatements.flat();

			if (flattenedStatements.length === 0) break;

			statements[i + 1] = flattenedStatements;
		}

		const finalStatements = statements.flat(2);

		return finalStatements;
	} catch (error) {
		console.error(error);

		return [];
	}

	async function getLevelResults(statement: Statement): Promise<Statement[]> {
		try {
			const subStatements: Statement[] = [];
			const statementsRef = collection(FireStore, Collections.statements);
			const q = query(
				statementsRef,
				and(
					or(
						where(
							'deliberativeElement',
							'==',
							DeliberativeElement.option
						),
						where(
							'deliberativeElement',
							'==',
							DeliberativeElement.research
						)
					),
					where('statementType', '!=', 'document'),
					where('parentId', '==', statement.statementId)
				)
			);
			const statementsDB = await getDocs(q);

			statementsDB.forEach((doc) => {
				const statement = parse(StatementSchema, doc.data());

				subStatements.push(statement);
			});

			return subStatements;
		} catch (error) {
			console.error(error);

			return [];
		}
	}
}

export async function getChildStatements(
	statementId: string
): Promise<Statement[]> {
	try {
		const statementsRef = collection(FireStore, Collections.statements);
		const q = query(
			statementsRef,
			and(
				or(
					where(
						'deliberativeElement',
						'==',
						DeliberativeElement.option
					),
					where(
						'deliberativeElement',
						'==',
						DeliberativeElement.research
					)
				),
				where('parents', 'array-contains', statementId)
			)
		);
		const statementsDB = await getDocs(q);

		const subStatements = statementsDB.docs.map((doc) =>
			parse(StatementSchema, doc.data())
		);

		return subStatements;
	} catch (error) {
		console.error(error);

		return [];
	}
}
