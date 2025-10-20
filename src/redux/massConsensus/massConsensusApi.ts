
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { getMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus';
import { MassConsensusProcess, StatementSubscription } from 'delib-npm';

export const massConsensusApi = createApi({
    reducerPath: 'massConsensusApi',
    baseQuery: fakeBaseQuery(),
    endpoints: (builder) => ({
        getStatementSubscription: builder.query<StatementSubscription | undefined, { statementId: string; userId: string }>({
            queryFn: async ({ statementId, userId }) => {
                const subscriptionId = `${statementId}_${userId}`;
                const subscription = await getStatementSubscriptionFromDB(subscriptionId);
                return { data: subscription };
            },
        }),
        getMassConsensusProcess: builder.query<MassConsensusProcess | undefined, string>({
            queryFn: async (statementId) => {
                const process = await getMassConsensusProcess(statementId);
                return { data: process };
            },
        }),
    }),
});

export const { useGetStatementSubscriptionQuery, useGetMassConsensusProcessQuery } = massConsensusApi;
