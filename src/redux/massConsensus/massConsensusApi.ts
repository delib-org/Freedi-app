
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { getMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus';
import { MassConsensusProcess, StatementSubscription } from 'delib-npm';

export const massConsensusApi = createApi({
    reducerPath: 'massConsensusApi',
    baseQuery: fakeBaseQuery(),
    endpoints: (builder) => ({
        getStatementSubscription: builder.query<StatementSubscription, { statementId: string; userId: string }>({
            queryFn: async ({ statementId, userId }) => {
                const subscriptionId = `${statementId}_${userId}`;
                const subscription = await getStatementSubscriptionFromDB(subscriptionId);
                if (subscription) {
                    return { data: subscription };
                }
                return { error: { message: 'Subscription not found' } };
            },
        }),
        getMassConsensusProcess: builder.query<MassConsensusProcess, string>({
            queryFn: async (statementId) => {
                const process = await getMassConsensusProcess(statementId);
                if (process) {
                    return { data: process };
                }
                return { error: { message: 'Mass consensus process not found' } };
            },
        }),
    }),
});

export const { useGetStatementSubscriptionQuery, useGetMassConsensusProcessQuery } = massConsensusApi;
