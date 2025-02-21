import { RouteObject } from 'react-router';

const Home = lazy(() => import('@/view/pages/home/Home'));
const HomeMain = lazy(() => import('@/view/pages/home/main/HomeMain'));
const AddStatement = lazy(
	() => import('@/view/pages/home/main/addStatement/AddStatement')
);
const StatementMain = lazy(
	() => import('@/view/pages/statement/StatementMain')
);
const Stage = lazy(() => import('@/view/pages/stage/Stage'));

export const protectedRoutes: RouteObject[] = [
	{
		path: 'home',
		element: withSuspense(Home),
		children: [
			{
				index: true,
				element: withSuspense(HomeMain),
			},
			{
				path: 'addStatement',
				element: withSuspense(AddStatement),
			},
		],
	},
	{
		path: 'statement/:statementId',
		element: withSuspense(StatementMain),
		children: [
			{
				path: ':screen',
				element: withSuspense(StatementMain),
			},
		],
	},
	{
		path: 'stage/:stageId',
		element: withSuspense(Stage),
	},
	// ... other protected routes
];

function lazy(arg0: () => Promise<any>) {
	throw new Error('Function not implemented.');
}

function withSuspense(Home: any) {
	throw new Error('Function not implemented.');
}
