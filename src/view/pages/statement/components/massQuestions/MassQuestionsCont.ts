// import { setStatementToDB } from '@/controllers/db/statements/setStatements';
// import { Statement } from '@/types/statement';

// export async function handleSetAnswersToDB(answers: Statement[]) {
// 	try {
// 		const promises = answers.map((answer) => {
// 			return setStatementToDB({
// 				statement: answer,
// 				parentStatement: 'top',
// 				addSubscription: false,
// 			});
// 		});

// 		await Promise.all(promises);
// 	} catch (error) {
// 		console.error(error);

// 		return undefined;
// 	}
// }
